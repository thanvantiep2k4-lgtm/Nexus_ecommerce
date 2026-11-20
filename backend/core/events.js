'use strict';

/**
 * SỰ KIỆN + OUTBOX: phát sự kiện nghiệp vụ cho các bên quan tâm (thông báo, đồng bộ tìm kiếm, AI…) mà
 * KHÔNG BAO GIỜ MẤT, dù server sập lúc nào. Hướng dẫn: docs/guides/events-outbox.md.
 *
 * LUỒNG:
 *   1. Nơi đổi dữ liệu gọi emit() (hoặc transition() tự gọi) TRONG transaction: ghi một dòng `outbox`
 *      cùng transaction với dữ liệu. Dữ liệu đổi mà sự kiện không ghi (hay ngược lại) là không thể xảy ra.
 *   2. relayOnce() (chạy ở worker, lặp mỗi 2 giây và được "gõ cửa" ngay sau commit) lấy các dòng pending
 *      bằng thao tác NGUYÊN TỬ rồi chuyển vào hàng đợi BullMQ `events` (jobId = `evt-<id>` chống trùng).
 *   3. dispatch() (worker) chạy từng subscriber đã đăng ký cho loại sự kiện đó.
 *
 * BẢO ĐẢM: giao ÍT NHẤT MỘT LẦN + subscriber idempotent = TÁC DỤNG xảy ra ĐÚNG MỘT LẦN. "Đúng một lần"
 * tuyệt đối không có trong hệ phân tán (worker có thể chết sau khi làm xong nhưng trước khi ghi nhận), nên
 * mỗi (sự kiện, subscriber) có một biên nhận trong `event_deliveries` với chỉ mục duy nhất: lần giao thứ
 * hai bị bỏ qua.
 *   - Subscriber ghi MongoDB (mặc định): tác dụng và biên nhận nằm cùng transaction, nên đúng một lần
 *     tuyệt đối, kể cả khi hai worker xử lý cùng một sự kiện cùng lúc.
 *   - Subscriber có tác dụng NGOÀI DB (gửi email, gọi API): khai báo `{ external: true }`. Hàm chạy NGOÀI
 *     transaction rồi mới ghi biên nhận. KHE HỞ: worker chết giữa lúc gửi xong và lúc ghi biên nhận thì
 *     lần giao lại sẽ gửi lần hai. Khe hở rất hẹp; giảm tối đa bằng cách truyền khoá idempotency của
 *     nhà cung cấp (nếu có) dựa trên event.id.
 *
 * QUY TẮC cho subscriber:
 *  1. Phải chịu được bị gọi lại (idempotent). Đừng giả định thứ tự: sự kiện KHÔNG được bảo đảm theo
 *     thứ tự (kể cả cùng một đối tượng); event.at cho phép so sánh thời điểm.
 *  2. Mặc định hàm chạy TRONG transaction: mọi lệnh DB phải truyền `{ session }` nhận từ tham số thứ hai,
 *     và KHÔNG được có tác dụng phụ ra ngoài (driver có thể gọi lại cả khối khi gặp lỗi tạm thời).
 *  3. Sự kiện chỉ mang id và vài trường chính; hãy đọc lại MongoDB để có dữ liệu mới nhất.
 *
 * VẤN ĐỀ ĐÃ BIẾT:
 *  1. Không bảo đảm thứ tự giao (xem trên). Nếu sau này cần thứ tự theo từng đối tượng thì phải bổ sung
 *     số phiên bản đối tượng và hàng đợi theo khoá.
 *  2. Subscriber chạy tuần tự trong một job dispatch; một subscriber chậm làm chậm các subscriber sau nó
 *     của CÙNG sự kiện (không ảnh hưởng sự kiện khác). Lỗi một subscriber không chặn các subscriber khác.
 *  3. Quy ước tên sự kiện (`<loại>.<việc>`) chưa có danh mục tập trung; thêm khi số sự kiện đủ nhiều.
 */

const Outbox = require('../models/Outbox');
const EventDelivery = require('../models/EventDelivery');
const { withTransaction } = require('./withTransaction');
const { QUEUES, enqueue } = require('./queues');
const { warnThrottled } = require('./redis');
const stateMachine = require('./stateMachine');

const TYPE_RE = /^[a-z0-9_-]+(\.[a-z0-9_-]+)+$/;
const MAX_PUBLISH_ATTEMPTS = 10;
const DISPATCH_ATTEMPTS = 8;
// Dòng `processing` quá lâu nghĩa là relay đã chết giữa chừng: trả về pending để xử lý lại.
const LOCK_TIMEOUT_MS = () => Number(process.env.OUTBOX_LOCK_TIMEOUT_MS) || 60 * 1000;

// ── Đăng ký người nhận ───────────────────────────────────────────────────────────────────────

const subscribers = new Map(); // name -> { name, type, handler, external }

/**
 * Đăng ký một subscriber.
 * @param {string} type     tên sự kiện chính xác ('order.shipping'), hoặc tiền tố ('order.*'), hoặc '*'
 * @param {string} name     tên duy nhất của subscriber (là khoá của biên nhận; ĐỔI TÊN = bị giao lại sự
 *                          kiện cũ như người nhận mới, nên đừng đổi tên khi đã chạy thật)
 * @param {Function} handler async (event, { session }) => void
 * @param {object} [opts]   { external: true } nếu hàm có tác dụng ngoài DB (xem mô tả đầu file)
 */
function subscribe(type, name, handler, { external = false } = {}) {
  if (typeof type !== 'string' || !type) throw new TypeError('subscribe: thiếu `type`');
  if (typeof name !== 'string' || !name) throw new TypeError('subscribe: thiếu `name`');
  if (typeof handler !== 'function') throw new TypeError('subscribe: `handler` phải là hàm');
  if (subscribers.has(name)) throw new Error(`Subscriber trùng tên: ${name}`);
  subscribers.set(name, { name, type, handler, external });
}

/** Xoá toàn bộ subscriber (dùng trong test). */
function clearSubscribers() {
  subscribers.clear();
}

function matches(pattern, type) {
  if (pattern === '*') return true;
  if (pattern.endsWith('.*')) return type.startsWith(pattern.slice(0, -1));
  return pattern === type;
}

// ── Phát sự kiện ─────────────────────────────────────────────────────────────────────────────

/**
 * Ghi một sự kiện vào outbox. GỌI TRONG transaction của việc đổi dữ liệu (truyền `session`) để sự kiện
 * và dữ liệu cùng có hoặc cùng không. Gọi ngoài transaction vẫn ghi được nhưng mất bảo đảm đó.
 *
 * Sau khi transaction commit, gọi `events.nudge()` để relay phát ngay (không bắt buộc: relay định kỳ
 * sẽ phát trong tối đa vài giây; nudge chỉ giảm độ trễ).
 *
 * @param {string} type  vd 'review.published'
 * @param {object} payload  chỉ id và vài trường chính
 */
async function emit(type, payload = {}, { session = null, aggregateType, aggregateId } = {}) {
  if (!TYPE_RE.test(type)) {
    throw new TypeError(`Tên sự kiện không hợp lệ: "${type}" (dạng đúng: loai.viec, chữ thường)`);
  }
  const [doc] = await Outbox.create(
    [{ type, payload, aggregateType, aggregateId }],
    session ? { session } : {}
  );
  return doc;
}

/**
 * "Gõ cửa" relay để phát sự kiện ngay thay vì đợi lượt định kỳ. Best-effort: lỗi (Redis chết…) chỉ ghi
 * log, KHÔNG làm gì hỏng vì relay định kỳ vẫn phát mọi sự kiện đang chờ.
 * jobId cố định nên nhiều lần gõ liên tiếp gộp thành một.
 */
async function nudge() {
  try {
    await enqueue(QUEUES.EVENTS, 'relay', {}, {
      jobId: 'relay-now',
      removeOnComplete: true,
      removeOnFail: true,
      attempts: 1,
    });
  } catch (err) {
    warnThrottled('events:nudge', err.message);
  }
}

// ── Relay: outbox -> hàng đợi ────────────────────────────────────────────────────────────────

async function defaultPublish(doc) {
  await enqueue(
    QUEUES.EVENTS,
    'dispatch',
    { outboxId: String(doc._id) },
    {
      // jobId theo id sự kiện: relay đẩy lại cùng sự kiện (sau khi chết giữa chừng) bị BullMQ bỏ qua.
      // Dùng dấu gạch ngang, KHÔNG dùng ':' (BullMQ từ chối jobId có ':', xem assertValidJobId ở queues.js).
      jobId: `evt-${doc._id}`,
      attempts: DISPATCH_ATTEMPTS,
      backoff: { type: 'exponential', delay: 2000 },
    }
  );
}

/** Thời gian chờ trước lần thử lại thứ n của relay: 2s, 4s, 8s… tối đa 5 phút. */
const retryDelayMs = (attempts) => Math.min(2 ** attempts * 1000, 5 * 60 * 1000);

/**
 * Một lượt của relay: lấy tối đa `limit` dòng pending ĐẾN HẠN rồi chuyển cho `publish`.
 *
 * AN TOÀN KHI CHẠY SONG SONG: mỗi dòng được lấy bằng một `findOneAndUpdate` nguyên tử (pending → processing),
 * nên nhiều relay/worker chạy cùng lúc không bao giờ lấy trùng một dòng.
 * AN TOÀN KHI CHẾT GIỮA CHỪNG: dòng `processing` quá hạn khoá (OUTBOX_LOCK_TIMEOUT_MS, mặc định 60s) được trả
 * về pending ở đầu mỗi lượt. Nếu relay chết SAU khi đã đẩy vào hàng đợi mà trước khi đánh dấu published thì
 * lần đẩy lại bị chặn bởi jobId, và nếu vẫn lọt thì biên nhận ở dispatch chặn lần xử lý thứ hai.
 *
 * @param {object} [opts]  { limit=100, publish (để test), now }
 * @returns {Promise<{ claimed: number, published: number, failed: number }>}
 */
async function relayOnce({ limit = 100, publish = defaultPublish, now = () => new Date() } = {}) {
  const t = now();
  await Outbox.updateMany(
    { status: 'processing', lockedAt: { $lt: new Date(t.getTime() - LOCK_TIMEOUT_MS()) } },
    { $set: { status: 'pending', nextAttemptAt: t } }
  );

  let claimed = 0;
  let published = 0;
  let failed = 0;
  while (claimed < limit) {
    const doc = await Outbox.findOneAndUpdate(
      { status: 'pending', nextAttemptAt: { $lte: t } },
      { $set: { status: 'processing', lockedAt: new Date() }, $inc: { attempts: 1 } },
      { sort: { nextAttemptAt: 1, _id: 1 }, new: true }
    );
    if (!doc) break;
    claimed++;
    try {
      await publish(doc);
      // Điều kiện status:'processing' để không ghi đè nếu dòng đã bị relay khác thu hồi trong lúc này.
      await Outbox.updateOne(
        { _id: doc._id, status: 'processing' },
        { $set: { status: 'published', publishedAt: new Date() }, $unset: { lockedAt: 1 } }
      );
      published++;
    } catch (err) {
      failed++;
      const dead = doc.attempts >= MAX_PUBLISH_ATTEMPTS;
      await Outbox.updateOne(
        { _id: doc._id },
        {
          $set: {
            status: dead ? 'dead' : 'pending',
            nextAttemptAt: new Date(t.getTime() + retryDelayMs(doc.attempts)),
            lastError: String(err.message).slice(0, 1000),
          },
          $unset: { lockedAt: 1 },
        }
      );
    }
  }
  return { claimed, published, failed };
}

// ── Dispatch: chạy subscriber ────────────────────────────────────────────────────────────────

class DispatchError extends Error {
  constructor(errors) {
    super(`Subscriber lỗi: ${errors.map((e) => `${e.subscriber} (${e.message})`).join('; ')}`);
    this.name = 'DispatchError';
    this.errors = errors;
  }
}

const isDuplicateKey = (err) => err && err.code === 11000;

/** Giao sự kiện cho MỘT subscriber, chống giao lặp bằng biên nhận. Trả 'delivered' hoặc 'skipped'. */
async function deliver(sub, view) {
  const key = { eventId: view.id, subscriber: sub.name };
  if (await EventDelivery.exists(key)) return 'skipped';

  if (sub.external) {
    await sub.handler(view, { session: null });
    try {
      await EventDelivery.create([key]);
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
    }
    return 'delivered';
  }

  try {
    await withTransaction(async (session) => {
      await sub.handler(view, { session });
      // Biên nhận cùng transaction với tác dụng của subscriber: cả hai cùng có hoặc cùng không. Nếu
      // một worker khác vừa giao xong thì lệnh này vi phạm chỉ mục duy nhất, toàn bộ transaction (kể cả
      // tác dụng vừa làm) bị huỷ và ta coi như đã giao.
      await EventDelivery.create([key], session ? { session } : {});
    });
  } catch (err) {
    if (isDuplicateKey(err)) return 'skipped';
    throw err;
  }
  return 'delivered';
}

/**
 * Chạy mọi subscriber khớp với sự kiện `outboxId`. Gọi lại nhiều lần an toàn (idempotent): subscriber đã
 * xong được bỏ qua nhờ biên nhận. Một subscriber lỗi KHÔNG chặn các subscriber khác; sau khi chạy hết,
 * nếu có lỗi thì ném DispatchError để BullMQ thử lại (lần thử lại chỉ chạy lại subscriber chưa xong).
 */
async function dispatch(outboxId) {
  const ev = await Outbox.findById(outboxId).lean();
  if (!ev) return { skipped: 'not_found' }; // đã bị TTL dọn
  if (ev.status === 'done') return { skipped: 'already_done' };

  const view = {
    id: ev._id,
    type: ev.type,
    aggregateType: ev.aggregateType,
    aggregateId: ev.aggregateId,
    payload: ev.payload,
    at: ev.createdAt,
  };
  const targets = [...subscribers.values()].filter((s) => matches(s.type, ev.type));

  const errors = [];
  const delivered = [];
  for (const sub of targets) {
    try {
      if ((await deliver(sub, view)) === 'delivered') delivered.push(sub.name);
    } catch (err) {
      errors.push({ subscriber: sub.name, message: err.message });
    }
  }

  if (errors.length) {
    await Outbox.updateOne({ _id: ev._id }, { $set: { lastError: JSON.stringify(errors).slice(0, 2000) } });
    throw new DispatchError(errors);
  }
  await Outbox.updateOne(
    { _id: ev._id },
    { $set: { status: 'done', doneAt: new Date() }, $unset: { lockedAt: 1, lastError: 1 } }
  );
  return { delivered };
}

/** Đánh dấu sự kiện là `dead` (hết số lần thử). GIỮ LẠI để người xem `lastError` và xử lý tay. */
async function markDead(outboxId, err) {
  await Outbox.updateOne(
    { _id: outboxId, status: { $ne: 'done' } },
    { $set: { status: 'dead', lastError: String(err && err.message).slice(0, 2000) } }
  );
}

// ── Nối với máy trạng thái ───────────────────────────────────────────────────────────────────

/**
 * Cắm outbox vào máy trạng thái: từ giờ MỖI transition() thành công tự ghi một dòng outbox CÙNG
 * transaction, rồi "gõ cửa" relay sau commit. Gọi một lần lúc khởi động (API và worker).
 * Tên sự kiện: dòng chuyển có `event` thì dùng, không thì `<máy>.<trạng thái đích viết thường>`.
 */
function installStateMachineSink() {
  stateMachine.setEventSink(async (stateEvent, session, meta = {}) => {
    const type = meta.eventName || `${stateEvent.entityType}.${String(stateEvent.to).toLowerCase()}`;
    await module.exports.emit(
      type,
      {
        stateEventId: stateEvent._id,
        entityType: stateEvent.entityType,
        entityId: stateEvent.entityId,
        from: stateEvent.from,
        to: stateEvent.to,
        action: stateEvent.action,
        actor: stateEvent.actor,
        reason: stateEvent.reason,
        metadata: stateEvent.metadata,
        at: stateEvent.at,
      },
      { session, aggregateType: stateEvent.entityType, aggregateId: stateEvent.entityId }
    );
    // Chạy sau commit. Gọi qua module.exports để test có thể thay nudge bằng hàm giả.
    return () => module.exports.nudge();
  });
}

module.exports = {
  subscribe,
  clearSubscribers,
  emit,
  nudge,
  relayOnce,
  dispatch,
  markDead,
  installStateMachineSink,
  DispatchError,
  TYPE_RE,
};
