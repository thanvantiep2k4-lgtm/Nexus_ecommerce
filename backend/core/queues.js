'use strict';

/**
 * Hàng đợi job (BullMQ) — phía NGƯỜI ĐẨY việc (API, script). Việc xử lý nằm ở worker.js.
 *
 * Khái niệm: Queue = hàng đợi có tên; Job = một việc (tên + dữ liệu); Worker = hàm xử lý job, chạy
 * ở tiến trình riêng (worker.js). API chỉ đẩy job vào Redis rồi trả lời ngay, nên API không phụ
 * thuộc việc worker đang chạy hay không: worker tắt thì job nằm chờ trong Redis, worker bật lại thì
 * xử lý tiếp. Xem docs/guides/redis-bullmq.md.
 */

const { Queue } = require('bullmq');
const { forProducer, warnThrottled } = require('./redis');

/** Tên các hàng đợi. Thêm hàng đợi mới ở đây rồi đăng ký processor ở jobs/index.js. */
const QUEUES = Object.freeze({
  // Việc hệ thống: heartbeat, job thử. Các hàng đợi nghiệp vụ (orders, notifications…) sẽ thêm sau.
  SYSTEM: 'system',
  // Phát sự kiện từ outbox: job `relay` (chuyển dòng outbox vào hàng đợi) và `dispatch` (chạy subscriber).
  EVENTS: 'events',
});

/**
 * Tuỳ chọn mặc định cho mọi job.
 *
 * QUAN TRỌNG: Redis chạy `maxmemory-policy noeviction` (xem docker-compose.yml): đầy bộ nhớ thì Redis
 * báo lỗi GHI chứ không xoá job. Nếu job đã xong cứ nằm lại mãi, Redis sẽ đầy dần và một ngày
 * KHÔNG đẩy được job mới. Vì vậy phải dọn job xong (removeOnComplete) và job lỗi cũ (removeOnFail).
 */
const DEFAULT_JOB_OPTIONS = Object.freeze({
  attempts: 3, // thử tối đa 3 lần khi processor ném lỗi
  backoff: { type: 'exponential', delay: 5000 }, // chờ 5s, 10s, 20s… giữa các lần thử
  removeOnComplete: { age: 3600, count: 1000 }, // giữ tối đa 1 giờ / 1000 job xong gần nhất (để xem trong Bull Board)
  removeOnFail: { age: 7 * 24 * 3600 }, // giữ job lỗi 7 ngày để còn điều tra
});

const queues = new Map();

/** Lấy (hoặc tạo) Queue theo tên. Mỗi tên chỉ tạo một lần cho mỗi tiến trình. */
function getQueue(name) {
  if (!Object.values(QUEUES).includes(name)) {
    throw new Error(`Hàng đợi không tồn tại: ${name}. Khai báo trong core/queues.js (QUEUES).`);
  }
  if (!queues.has(name)) {
    const queue = new Queue(name, {
      connection: forProducer(),
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
    // Không có handler thì lỗi kết nối của Queue (Redis chết) có thể làm sập tiến trình API.
    queue.on('error', (err) => warnThrottled(`queue:${name}`, err.message));
    queues.set(name, queue);
  }
  return queues.get(name);
}

/** Ném khi không đẩy được job vì Redis không sẵn sàng. API nên đổi thành HTTP 503. */
class QueueUnavailableError extends Error {
  constructor(cause) {
    super('Hàng đợi tạm thời không khả dụng (không kết nối được Redis)');
    this.name = 'QueueUnavailableError';
    this.cause = cause;
  }
}

/**
 * Đẩy một job vào hàng đợi.
 *
 * @param {string} queueName  một giá trị của QUEUES
 * @param {string} jobName    tên loại job, để processor phân biệt
 * @param {object} data       dữ liệu job (chỉ nên chứa id, không chứa cả document: xử lý sẽ đọc lại DB)
 * @param {object} [opts]     tuỳ chọn BullMQ. Hay dùng:
 *   - delay (ms): hẹn giờ, job nằm ở trạng thái `delayed` đến khi đủ thời gian
 *   - jobId: mã tự đặt; (a) CHỐNG TẠO TRÙNG: đẩy lại cùng jobId khi job còn tồn tại thì bị bỏ qua,
 *     (b) cho phép HUỶ về sau bằng cancelJob(). Nên đặt dạng `loai-idĐốiTượng-viec`.
 *     QUY TẮC CỦA BULLMQ: jobId KHÔNG được chứa dấu ':' (trừ đúng 3 đoạn như `a:b:c`, chỉ để tương thích
 *     cũ) và không được là chuỗi toàn số. Dùng '-' hoặc '_' để khỏi dính quy tắc này (xem assertValidJobId).
 *
 * LƯU Ý (at-least-once): BullMQ bảo đảm job chạy ÍT NHẤT một lần, không phải đúng một lần (ví dụ
 * worker chết giữa chừng thì job được chạy lại). Processor PHẢI idempotent: chạy hai lần vẫn đúng
 * (kiểm tra trạng thái hiện tại trong DB trước khi làm).
 *
 * @throws {QueueUnavailableError} nếu Redis không sẵn sàng (lỗi KẾT NỐI hoặc quá 3 giây).
 * Mọi lỗi khác (jobId sai quy tắc, tuỳ chọn không hợp lệ…) là LỖI LẬP TRÌNH và được ném nguyên vẹn,
 * KHÔNG được gán nhãn "Redis không sẵn sàng" (trước đây làm việc chẩn đoán đi sai hướng).
 */
async function enqueue(queueName, jobName, data = {}, opts = {}) {
  assertValidJobId(opts.jobId);
  const queue = getQueue(queueName);
  try {
    // Chờ kết nối sẵn sàng tối đa 3 giây; Redis chết thì thất bại nhanh thay vì treo request.
    await withTimeout(queue.waitUntilReady(), 3000);
    return await queue.add(jobName, data, opts);
  } catch (err) {
    if (isConnectionError(err)) throw new QueueUnavailableError(err);
    throw err;
  }
}

/**
 * Huỷ một job đang chờ (delayed/waiting). Ví dụ: đơn đã thanh toán thì huỷ job "tự huỷ sau 15 phút".
 * Trả `true` nếu đã huỷ, `false` nếu không còn job để huỷ.
 *
 * LƯU Ý: job đang chạy (`active`) KHÔNG huỷ được; processor phải tự kiểm tra trạng thái đối tượng.
 * Vì vậy việc huỷ chỉ là tối ưu, cái bảo đảm đúng là tính idempotent của processor.
 */
async function cancelJob(queueName, jobId) {
  const queue = getQueue(queueName);
  try {
    await withTimeout(queue.waitUntilReady(), 3000);
    // Phải kiểm tra tồn tại trước: `queue.remove` trả 1 (thành công) ngay cả khi job KHÔNG tồn tại
    // (đã chạy xong và bị dọn, hoặc đã huỷ rồi), nên không dùng được làm tín hiệu "có huỷ thật".
    const job = await queue.getJob(jobId);
    if (!job) return false;
    return (await queue.remove(jobId)) === 1;
  } catch (err) {
    // `remove` ném lỗi khi job đang bị khoá bởi worker (đang chạy): coi như không huỷ được.
    if (/locked|active/i.test(err.message || '')) return false;
    if (isConnectionError(err)) throw new QueueUnavailableError(err);
    throw err;
  }
}

/** Lỗi kết nối Redis (hoặc hết giờ chờ), khác với lỗi lập trình. Chỉ loại này mới đổi thành QueueUnavailableError. */
function isConnectionError(err) {
  if (err && err.isTimeout) return true;
  return /ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE|Connection is closed|Stream isn't writeable|enableOfflineQueue|Command timed out|NOAUTH|WRONGPASS|LOADING|MaxRetriesPerRequest/i.test(
    (err && err.message) || ''
  );
}

/**
 * Kiểm tra jobId theo đúng quy tắc BullMQ NGAY khi gọi enqueue, kể cả lúc Redis đang chết (lỗi lập trình phải
 * lộ ra ngay, không phải đợi tới khi Redis sống). BullMQ từ chối jobId toàn số và jobId có ':' (trừ đúng 3 đoạn).
 */
function assertValidJobId(jobId) {
  if (jobId == null) return;
  const id = String(jobId);
  if (`${parseInt(id, 10)}` === id) {
    throw new TypeError(`jobId không được là chuỗi toàn số: "${id}" (BullMQ dành số cho id tự sinh)`);
  }
  if (id.includes(':') && id.split(':').length !== 3) {
    throw new TypeError(
      `jobId không được chứa dấu ':' (BullMQ từ chối): "${id}". Dùng '-' hoặc '_', ví dụ "order-${'<id>'}-expire".`
    );
  }
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`quá ${ms}ms`);
      err.isTimeout = true;
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function closeQueues() {
  await Promise.all([...queues.values()].map((q) => q.close().catch(() => {})));
  queues.clear();
}

module.exports = {
  assertValidJobId,
  QUEUES,
  DEFAULT_JOB_OPTIONS,
  getQueue,
  enqueue,
  cancelJob,
  closeQueues,
  QueueUnavailableError,
};
