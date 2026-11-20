'use strict';

/**
 * KHUNG MÁY TRẠNG THÁI dùng chung cho mọi đối tượng có vòng đời (đơn hàng, trả hàng, hồ sơ nhà bán,
 * sản phẩm, rút tiền, nội dung CMS…). Hướng dẫn đầy đủ: docs/guides/state-machine.md.
 *
 * VÌ SAO CẦN: trước đây trạng thái được gán thẳng (`order.status = ...`) ở nhiều nơi mà không nơi nào
 * kiểm tra đường đi hợp lệ: admin đổi được đơn `delivered` về `pending`; IPN thanh toán đặt `confirmed`
 * cho cả đơn đã huỷ (đơn đã hoàn kho lại sống dậy mà kho không bị trừ lại). Máy trạng thái gom mọi
 * thay đổi trạng thái vào MỘT hàm `transition()` có kiểm tra, để các lỗi đó không thể xảy ra.
 *
 * CÁCH DÙNG:
 *   const machine = defineMachine({
 *     name: 'order', model: Order, field: 'status', initial: 'UNPAID', final: ['COMPLETED', 'CANCELLED'],
 *     transitions: [
 *       { from: 'TO_CONFIRM', to: 'TO_SHIP', action: 'SELLER_CONFIRM', permission: 'shop.order.process',
 *         guard: (order, ctx) => order.shopId.equals(ctx.actor.shopId),
 *         effects: async (order, ctx) => { ...đổi dữ liệu liên quan, truyền { session: ctx.session }... },
 *         afterCommit: async (order) => { ...hẹn job, gửi thông báo... } },
 *     ],
 *   });
 *   await transition(machine, orderId, 'SELLER_CONFIRM', actor, { reason });
 *
 * Mỗi dòng của bảng chuyển trạng thái:
 *   from        trạng thái xuất phát (chuỗi hoặc mảng chuỗi: một hành động đi được từ nhiều trạng thái)
 *   to          trạng thái đích
 *   action      tên hành động kích hoạt
 *   permission  quyền cần có theo VAI TRÒ (chuỗi, vd 'shop.order.process'); bỏ trống = không đòi quyền
 *   actors      loại tác nhân được phép (vd ['system'] cho webhook/job); bỏ trống = mọi loại
 *   guard       điều kiện THEO TỪNG ĐỐI TƯỢNG (async được): "đơn này có đúng của shop bạn không?".
 *               Trả false/ném GuardFailedError để chặn. Khác `permission` ở chỗ permission là quyền chung
 *               của vai trò, guard xét đối tượng cụ thể.
 *   set         trả về các trường bổ sung ghi cùng lúc với trạng thái (vd { shippedAt: new Date() })
 *   effects     việc phải làm kèm theo, CHẠY TRONG transaction (đổi dữ liệu khác; lỗi thì huỷ tất cả)
 *   afterCommit việc có tác dụng phụ ra ngoài (hẹn job, thông báo), CHỈ chạy sau khi commit
 *   event       tên sự kiện phát ra outbox (vd 'order.shipped'); mặc định `<tên máy>.<trạng thái đích viết thường>`
 *
 * transition() chạy trong MỘT transaction theo thứ tự: tải đối tượng → kiểm tra đường đi → tác nhân →
 * quyền → guard → đổi trạng thái CÓ ĐIỀU KIỆN → effects → ghi sự kiện (models/StateEvent) → commit →
 * afterCommit. Đổi trạng thái có điều kiện (`{_id, [field]: from}`) nên hai yêu cầu đồng thời chỉ một
 * cái thắng, cái còn lại bị từ chối, effects không chạy hai lần (hết lỗi hoàn kho hai lần).
 *
 * QUY TẮC cho người viết `effects` / `guard` / `set`:
 *  1. Mọi lệnh DB trong `effects` phải truyền `{ session: ctx.session }`, nếu không nó chạy NGOÀI
 *     transaction và không được hoàn tác. `ctx.session` có thể là null (xem withTransaction.js),
 *     truyền `{ session: null }` vẫn hợp lệ.
 *  2. Driver có thể gọi lại cả khối khi gặp lỗi tạm thời, nên `effects` không được có tác dụng phụ ra
 *     ngoài (gửi email, gọi API, đẩy job). Những việc đó đặt trong `afterCommit`.
 *  3. `guard` có thể được gọi ở chế độ dò (`ctx.dryRun === true`) từ availableActions để hiện nút,
 *     lúc đó `ctx.payload` rỗng: guard không được ghi dữ liệu và nên chịu được thiếu payload.
 *
 * VẤN ĐỀ ĐÃ BIẾT:
 *  1. `afterCommit` chạy SAU commit nên có thể thất bại (vd Redis chết khi hẹn job) trong khi trạng thái
 *     đã đổi. Lỗi được ghi log và trả về trong `result.afterCommitErrors`, KHÔNG làm transition thất bại.
 *     Việc bù nằm ở job đối soát quá hạn quét MongoDB (bước 8 trong THU_TU_TRIEN_KHAI): MongoDB mới là
 *     nguồn sự thật, job chỉ giúp đúng giờ.
 *  2. Quyền hiện kiểm tra bằng `actor.permissions` (xem defaultCan). Phân quyền chi tiết theo vai trò
 *     (bước 11) sẽ thay bằng `setPermissionChecker`.
 *  3. Sự kiện được ghi vào `state_events`; `core/events.js` (installStateMachineSink) cắm vào `setEventSink` để
 *     ghi thêm một dòng outbox cùng transaction, nhờ đó mọi transition() tự phát sự kiện cho các subscriber.
 */

const StateEvent = require('../models/StateEvent');
const { withTransaction } = require('./withTransaction');

// ── Lỗi ──────────────────────────────────────────────────────────────────────────────────────
// Mỗi lỗi mang sẵn `code` (máy đọc) và `status` (HTTP) để controller chuyển thẳng thành response.

class StateMachineError extends Error {
  constructor(code, status, message, details) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
/** Không có đường đi nào cho (trạng thái hiện tại, hành động) này. */
class InvalidTransitionError extends StateMachineError {
  constructor(details, message = 'Hành động không hợp lệ với trạng thái hiện tại') {
    super('INVALID_TRANSITION', 409, message, details);
  }
}
/** Tác nhân không được phép (sai loại tác nhân hoặc thiếu quyền). */
class ForbiddenTransitionError extends StateMachineError {
  constructor(details, message = 'Không có quyền thực hiện hành động này') {
    super('FORBIDDEN_TRANSITION', 403, message, details);
  }
}
/** Guard từ chối: điều kiện của đối tượng cụ thể không thỏa. */
class GuardFailedError extends StateMachineError {
  constructor(message = 'Điều kiện chuyển trạng thái không thỏa', details) {
    super('GUARD_FAILED', 409, message, details);
  }
}
/** Người khác vừa đổi trạng thái của đối tượng trước (hai yêu cầu đua nhau). */
class ConcurrentTransitionError extends StateMachineError {
  constructor(details) {
    super('CONCURRENT_TRANSITION', 409, 'Trạng thái vừa bị thay đổi bởi yêu cầu khác, hãy tải lại', details);
  }
}
class EntityNotFoundError extends StateMachineError {
  constructor(details) {
    super('ENTITY_NOT_FOUND', 404, 'Không tìm thấy đối tượng', details);
  }
}
/** Bảng chuyển trạng thái khai báo sai. Ném ngay lúc defineMachine (lúc khởi động), không phải lúc chạy. */
class MachineDefinitionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MachineDefinitionError';
  }
}

/** Chuyển lỗi của máy trạng thái thành { code, status, message, details }; lỗi khác trả null. */
function toApiError(err) {
  if (!(err instanceof StateMachineError)) return null;
  return { code: err.code, status: err.status, message: err.message, details: err.details };
}

// ── Quyền ────────────────────────────────────────────────────────────────────────────────────

/**
 * Kiểm tra quyền mặc định: tác nhân `system` luôn được (job/webhook; giới hạn bằng `actors` ở dòng
 * chuyển nếu cần); người dùng phải có `actor.permissions` chứa quyền đó (hoặc '*').
 * Thay bằng cơ chế thật bằng setPermissionChecker khi có phân quyền theo vai trò (bước 11).
 */
function defaultCan(actor, permission) {
  if (actor.type === 'system') return true;
  const perms = actor.permissions;
  return Array.isArray(perms) && (perms.includes(permission) || perms.includes('*'));
}

let permissionChecker = defaultCan;
/** Đặt hàm kiểm tra quyền toàn cục: (actor, permission, entity) => boolean | Promise<boolean>. */
function setPermissionChecker(fn) {
  permissionChecker = fn || defaultCan;
}

// Nơi gắn outbox (core/events.js): gọi TRONG transaction với (event, session, { eventName }) sau khi ghi
// sự kiện; có thể trả về một hàm để chạy sau commit.
let eventSink = null;
function setEventSink(fn) {
  eventSink = fn || null;
}

// ── Khai báo ─────────────────────────────────────────────────────────────────────────────────

const key = (from, action) => `${from}\u0000${action}`;

/**
 * Khai báo một máy trạng thái và KIỂM TRA bảng ngay lập tức. Ném MachineDefinitionError khi:
 * trùng (from, action), trạng thái không có trong `states`, trạng thái cuối còn đường ra, trạng
 * thái không có đường ra mà chưa khai báo `final` (thường là gõ sai tên), hoặc (khi có `initial`)
 * có trạng thái không thể đến được từ trạng thái khởi đầu.
 *
 * @param {object} cfg  { name, model, field='status', states?, initial?, final=[], transitions[], can? }
 */
function defineMachine(cfg) {
  const { name, model, field = 'status', states, initial, final = [], transitions, can } = cfg || {};
  const fail = (msg) => {
    throw new MachineDefinitionError(`[máy trạng thái "${name}"] ${msg}`);
  };

  if (!name || typeof name !== 'string') throw new MachineDefinitionError('Thiếu `name`');
  if (!model || typeof model.updateOne !== 'function' || typeof model.findById !== 'function') {
    fail('`model` phải là một Mongoose model');
  }
  if (!Array.isArray(transitions) || !transitions.length) fail('`transitions` không được rỗng');

  const rows = [];
  const index = new Map();
  for (const t of transitions) {
    if (!t || typeof t.action !== 'string' || !t.action) fail('mỗi dòng cần `action` là chuỗi');
    if (typeof t.to !== 'string' || !t.to) fail(`action ${t.action}: thiếu \`to\``);
    const froms = Array.isArray(t.from) ? t.from : [t.from];
    if (!froms.length || froms.some((f) => typeof f !== 'string' || !f)) {
      fail(`action ${t.action}: \`from\` phải là chuỗi hoặc mảng chuỗi`);
    }
    if (t.permission != null && typeof t.permission !== 'string') fail(`action ${t.action}: \`permission\` phải là chuỗi`);
    if (t.actors != null && (!Array.isArray(t.actors) || !t.actors.length)) fail(`action ${t.action}: \`actors\` phải là mảng không rỗng`);
    if (t.event != null && (typeof t.event !== 'string' || !t.event)) fail(`action ${t.action}: `+'`event` phải là chuỗi');
    for (const fn of ['guard', 'set', 'effects', 'afterCommit']) {
      if (t[fn] != null && typeof t[fn] !== 'function') fail(`action ${t.action}: \`${fn}\` phải là hàm`);
    }
    for (const from of froms) {
      const k = key(from, t.action);
      if (index.has(k)) fail(`trùng đường đi: ${from} --${t.action}-->`);
      const row = Object.freeze({ ...t, from });
      rows.push(row);
      index.set(k, row);
    }
  }

  const stateSet = new Set(states || []);
  for (const r of rows) {
    if (states && (!stateSet.has(r.from) || !stateSet.has(r.to))) {
      fail(`trạng thái ngoài danh sách \`states\`: ${!stateSet.has(r.from) ? r.from : r.to} (action ${r.action})`);
    }
    stateSet.add(r.from);
    stateSet.add(r.to);
  }
  if (initial && !stateSet.has(initial)) fail(`\`initial\` không phải trạng thái đã khai báo: ${initial}`);

  const outgoing = new Set(rows.map((r) => r.from));
  for (const f of final) {
    if (!stateSet.has(f)) fail(`\`final\` chứa trạng thái không tồn tại: ${f}`);
    if (outgoing.has(f)) fail(`trạng thái cuối "${f}" vẫn còn đường đi ra`);
  }
  for (const s of stateSet) {
    if (!outgoing.has(s) && !final.includes(s)) {
      fail(`trạng thái "${s}" không có đường đi ra mà chưa khai báo trong \`final\` (gõ sai tên?)`);
    }
  }
  if (initial) {
    const seen = new Set([initial]);
    const queue = [initial];
    while (queue.length) {
      const cur = queue.shift();
      for (const r of rows) {
        if (r.from === cur && !seen.has(r.to)) {
          seen.add(r.to);
          queue.push(r.to);
        }
      }
    }
    const unreachable = [...stateSet].filter((s) => !seen.has(s));
    if (unreachable.length) fail(`không thể đến được từ "${initial}": ${unreachable.join(', ')}`);
  }

  const byAction = new Map();
  for (const r of rows) {
    if (!byAction.has(r.action)) byAction.set(r.action, []);
    byAction.get(r.action).push(r);
  }

  return Object.freeze({
    name,
    model,
    field,
    states: [...stateSet],
    initial: initial || null,
    final: [...final],
    rows,
    index,
    byAction,
    can: typeof can === 'function' ? can : null,
  });
}

// ── Thực thi ─────────────────────────────────────────────────────────────────────────────────

function assertActor(actor) {
  if (!actor || typeof actor.type !== 'string' || !actor.type) {
    throw new TypeError('actor phải có `type` (vd { type: "user", id, permissions } hoặc { type: "system" })');
  }
}

const actorForEvent = (actor) => ({
  type: actor.type,
  id: actor.id != null ? String(actor.id) : undefined,
  roles: Array.isArray(actor.roles) ? actor.roles : undefined,
});

/**
 * Thực hiện một chuyển trạng thái. Xem mô tả luồng ở đầu file.
 *
 * @param {object} machine  kết quả của defineMachine
 * @param {*} entityId      _id của đối tượng
 * @param {string} action   tên hành động
 * @param {object} actor    { type: 'user'|'system'|..., id?, roles?, permissions? }
 * @param {object} [payload]  { reason?, metadata?, ...dữ liệu riêng cho guard/effects }
 * @returns {Promise<{ entity, from, to, action, event, idempotent, afterCommitErrors }>}
 *
 * Tác nhân `system` gọi lại một hành động mà đối tượng ĐÃ Ở trạng thái đích của hành động đó (vd job
 * chạy lại vì BullMQ giao "ít nhất một lần", IPN thanh toán gửi hai lần) được coi là THÀNH CÔNG và
 * bỏ qua (`idempotent: true`, không ghi sự kiện, không chạy effects). Tác nhân khác gọi lại thì nhận
 * InvalidTransitionError.
 */
async function transition(machine, entityId, action, actor, payload = {}) {
  assertActor(actor);
  const { model, field } = machine;
  let afterCommitTasks = [];

  const result = await withTransaction(async (session) => {
    // withTransaction có thể gọi lại khối này khi gặp lỗi tạm thời: bỏ việc afterCommit của lần trước.
    afterCommitTasks = [];
    const opts = session ? { session } : {};

    const entity = await model.findById(entityId, null, opts);
    if (!entity) throw new EntityNotFoundError({ machine: machine.name, entityId: String(entityId) });

    const from = entity[field];
    const candidates = machine.byAction.get(action);
    if (!candidates) {
      throw new InvalidTransitionError(
        { machine: machine.name, action, reason: 'unknown_action' },
        `Hành động không tồn tại: ${action}`
      );
    }

    const row = machine.index.get(key(from, action));
    if (!row) {
      if (actor.type === 'system' && candidates.some((r) => r.to === from)) {
        return { entity, from, to: from, action, event: null, idempotent: true, afterCommitErrors: [] };
      }
      throw new InvalidTransitionError({
        machine: machine.name,
        action,
        from,
        allowedActions: machine.rows.filter((r) => r.from === from).map((r) => r.action),
      });
    }

    const to = row.to;
    const ctx = { actor, payload, session, machine, action, from, to, dryRun: false };

    if (row.actors && !row.actors.includes(actor.type)) {
      throw new ForbiddenTransitionError({ machine: machine.name, action, allowedActors: row.actors });
    }
    if (row.permission) {
      const can = machine.can || permissionChecker;
      if (!(await can(actor, row.permission, entity))) {
        throw new ForbiddenTransitionError({ machine: machine.name, action, permission: row.permission });
      }
    }
    if (row.guard && !(await row.guard(entity, ctx))) {
      throw new GuardFailedError(row.guardMessage, { machine: machine.name, action, from });
    }

    const extra = row.set ? (await row.set(entity, ctx)) || {} : {};
    if (field in extra) {
      throw new MachineDefinitionError(`[máy "${machine.name}"] \`set\` không được ghi đè trường trạng thái "${field}"`);
    }

    // Đổi trạng thái CÓ ĐIỀU KIỆN: chỉ khớp khi trạng thái vẫn là `from`. Hai yêu cầu đồng thời: một
    // cái khớp, cái còn lại matchedCount = 0. Trong transaction, MongoDB còn tự phát hiện xung đột ghi
    // và cho chạy lại, nên điều kiện này là lớp bảo vệ thứ hai (cần khi chạy không transaction).
    const res = await model.updateOne(
      { _id: entity._id, [field]: from },
      { $set: { [field]: to, ...extra } },
      opts
    );
    if (res.matchedCount !== 1) {
      throw new ConcurrentTransitionError({ machine: machine.name, action, expectedFrom: from });
    }

    if (row.effects) await row.effects(entity, ctx);

    const [event] = await StateEvent.create(
      [
        {
          entityType: machine.name,
          entityId: entity._id,
          from,
          to,
          action,
          actor: actorForEvent(actor),
          reason: payload.reason,
          metadata: payload.metadata,
          at: new Date(),
        },
      ],
      opts
    );
    if (eventSink) {
      // Sink nhận (sự kiện đã ghi, session, { eventName }) và chạy TRONG transaction. Nếu trả về một HÀM
      // thì hàm đó chạy sau commit (vd "gõ cửa" relay outbox để phát sự kiện ngay).
      const eventName = row.event || `${machine.name}.${String(to).toLowerCase()}`;
      const post = await eventSink(event.toObject(), session, { eventName, machine: machine.name });
      if (typeof post === 'function') afterCommitTasks.push(post);
    }

    // Phản ánh trạng thái mới trên bản sao trả về (KHÔNG lưu: DB đã được cập nhật ở trên).
    entity.set({ [field]: to, ...extra });
    if (row.afterCommit) afterCommitTasks.push(() => row.afterCommit(entity, ctx));

    return { entity, from, to, action, event, idempotent: false, afterCommitErrors: [] };
  });

  // Việc có tác dụng phụ ra ngoài chạy SAU commit. Lỗi ở đây không được làm transition thất bại vì
  // trạng thái đã đổi thật; xem "VẤN ĐỀ ĐÃ BIẾT" số 1 ở đầu file.
  for (const task of afterCommitTasks) {
    try {
      await task();
    } catch (err) {
      console.warn(`[stateMachine:${machine.name}] afterCommit(${action}) lỗi: ${err.message}`);
      result.afterCommitErrors.push(err);
    }
  }
  return result;
}

/**
 * Ghi sự kiện KHỞI TẠO (đối tượng vừa được tạo, `from = null`) để timeline có dòng đầu tiên.
 * Gọi trong cùng transaction với việc tạo đối tượng: recordCreated(machine, id, 'UNPAID', actor, { session }).
 */
async function recordCreated(machine, entityId, to, actor, { session = null, reason, metadata } = {}) {
  assertActor(actor);
  if (!machine.states.includes(to)) {
    throw new MachineDefinitionError(`[máy "${machine.name}"] trạng thái khởi tạo không tồn tại: ${to}`);
  }
  const [event] = await StateEvent.create(
    [
      {
        entityType: machine.name,
        entityId,
        from: null,
        to,
        action: 'CREATE',
        actor: actorForEvent(actor),
        reason,
        metadata,
        at: new Date(),
      },
    ],
    session ? { session } : {}
  );
  // Sự kiện khởi tạo phát ra tên `<máy>.created`. Giá trị trả về của sink (hàm chạy sau commit) bị bỏ qua vì
  // recordCreated chạy trong transaction của NGƯỜI GỌI; relay định kỳ vẫn sẽ phát sự kiện (chậm tối đa vài giây).
  if (eventSink) await eventSink(event.toObject(), session, { eventName: `${machine.name}.created`, machine: machine.name });
  return event;
}

/**
 * Danh sách hành động `actor` làm được lúc này với `entity`, để giao diện chỉ hiện đúng các nút.
 * Kiểm tra tác nhân, quyền và guard (ở chế độ dò, ctx.dryRun = true). Chỉ là gợi ý cho giao diện:
 * nơi thực sự bảo đảm là transition().
 */
async function availableActions(machine, entity, actor) {
  assertActor(actor);
  const from = entity[machine.field];
  const out = [];
  for (const row of machine.rows) {
    if (row.from !== from) continue;
    if (row.actors && !row.actors.includes(actor.type)) continue;
    if (row.permission && !(await (machine.can || permissionChecker)(actor, row.permission, entity))) continue;
    if (row.guard) {
      try {
        const ctx = { actor, payload: {}, session: null, machine, action: row.action, from, to: row.to, dryRun: true };
        if (!(await row.guard(entity, ctx))) continue;
      } catch {
        continue;
      }
    }
    out.push({ action: row.action, to: row.to });
  }
  return out;
}

/** Sơ đồ Mermaid sinh từ chính bảng chuyển trạng thái (dán vào docs/specs, không bao giờ lệch code). */
function toMermaid(machine) {
  const lines = ['stateDiagram-v2'];
  if (machine.initial) lines.push(`    [*] --> ${machine.initial}`);
  for (const r of machine.rows) lines.push(`    ${r.from} --> ${r.to}: ${r.action}`);
  for (const f of machine.final) lines.push(`    ${f} --> [*]`);
  return lines.join('\n');
}

/** Bảng Markdown sinh từ bảng chuyển trạng thái, cho đặc tả M06/M08… */
function toMarkdownTable(machine) {
  const lines = ['| Từ | Hành động | Đến | Quyền | Tác nhân |', '|---|---|---|---|---|'];
  for (const r of machine.rows) {
    lines.push(
      `| ${r.from} | ${r.action} | ${r.to} | ${r.permission ? `\`${r.permission}\`` : ''} | ${
        r.actors ? r.actors.join(', ') : ''
      } |`
    );
  }
  return lines.join('\n');
}

module.exports = {
  defineMachine,
  transition,
  recordCreated,
  availableActions,
  toMermaid,
  toMarkdownTable,
  toApiError,
  setPermissionChecker,
  setEventSink,
  StateMachineError,
  InvalidTransitionError,
  ForbiddenTransitionError,
  GuardFailedError,
  ConcurrentTransitionError,
  EntityNotFoundError,
  MachineDefinitionError,
};
