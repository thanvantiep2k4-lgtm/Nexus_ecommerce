'use strict';

/**
 * Sổ đăng ký job: hàng đợi nào do processor nào xử lý, và job nào chạy lặp theo lịch.
 *
 * THÊM JOB MỚI:
 *  1. Khai báo tên hàng đợi trong core/queues.js (QUEUES) nếu chưa có.
 *  2. Viết processor ở jobs/<tên>.processor.js (idempotent!) rồi thêm vào `processors` dưới đây.
 *  3. Nơi cần đẩy việc gọi `enqueue(QUEUES.X, 'tên-job', { id }, { delay, jobId })`.
 */

const { QUEUES, getQueue } = require('../core/queues');
const { systemProcessor } = require('./system.processor');
const { eventsProcessor } = require('./events.processor');

/** hàng đợi -> hàm xử lý. worker.js tạo một Worker cho mỗi mục. */
const processors = {
  [QUEUES.SYSTEM]: systemProcessor,
  [QUEUES.EVENTS]: eventsProcessor,
};

/**
 * Job chạy LẶP theo lịch (thay cho node-cron). Khác node-cron: lịch nằm trong Redis nên chạy ĐÚNG
 * MỘT LẦN dù có nhiều worker, và không mất khi khởi động lại. `upsert` nên gọi nhiều lần vẫn an
 * toàn (cập nhật nếu đã có).
 */
async function registerSchedulers() {
  await getQueue(QUEUES.SYSTEM).upsertJobScheduler(
    'heartbeat',
    { every: 30 * 1000 },
    { name: 'heartbeat', opts: { removeOnComplete: true, removeOnFail: { count: 20 } } }
  );

  // Relay outbox: chuyển sự kiện đang chờ vào hàng đợi mỗi 2 giây. Đây là LƯỚI AN TOÀN bảo đảm không mất
  // sự kiện: kể cả khi "gõ cửa" sau commit thất bại (Redis chết thoáng chốc), lượt định kỳ này vẫn phát.
  // Scheduler nằm trong Redis nên toàn hệ thống chỉ sinh MỘT job mỗi lượt dù có bao nhiêu worker.
  await getQueue(QUEUES.EVENTS).upsertJobScheduler(
    'outbox-relay',
    { every: 2000 },
    { name: 'relay', opts: { removeOnComplete: true, removeOnFail: { count: 20 }, attempts: 1 } }
  );
}

module.exports = { processors, registerSchedulers };
