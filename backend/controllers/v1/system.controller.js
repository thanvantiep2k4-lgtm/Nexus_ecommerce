'use strict';

const respond = require('../../utils/respond');
const {
  QUEUES,
  getQueue,
  enqueue,
  QueueUnavailableError,
} = require('../../core/queues');

/**
 * POST /api/v1/admin/system/jobs/demo
 * Đẩy một job thử vào hàng đợi `system`, hẹn giờ `delayMs`. Dùng để kiểm chứng cả đường đi
 * API → Redis → worker. Worker (npm run worker) chạy xong thì kết quả hiện ở GET .../jobs/:id
 * và ở Bull Board.
 */
exports.enqueueDemoJob = async (req, res, next) => {
  try {
    const { delayMs, failTimes } = req.body;
    const job = await enqueue(
      QUEUES.SYSTEM,
      'demo-delay',
      { enqueuedAt: Date.now(), failTimes },
      { delay: delayMs }
    );
    return respond.created(
      res,
      { id: job.id, queue: QUEUES.SYSTEM, delayMs, runAt: new Date(Date.now() + delayMs) },
      'Demo job enqueued'
    );
  } catch (err) {
    // Redis không sẵn sàng: API vẫn sống, chỉ riêng chức năng này tạm thời không dùng được.
    if (err instanceof QueueUnavailableError) {
      return respond.error(res, 'QUEUE_UNAVAILABLE', err.message, 503);
    }
    next(err);
  }
};

/**
 * GET /api/v1/admin/system/jobs/:id
 * Trạng thái một job thử: waiting | delayed | active | completed | failed. `result` có khi đã xong.
 */
exports.getJob = async (req, res, next) => {
  try {
    const job = await getQueue(QUEUES.SYSTEM).getJob(req.params.id);
    if (!job) {
      return respond.notFound(res, 'JOB_NOT_FOUND', 'Job not found (đã bị dọn hoặc không tồn tại)');
    }
    return respond.success(res, {
      id: job.id,
      name: job.name,
      state: await job.getState(),
      attemptsMade: job.attemptsMade,
      data: job.data,
      result: job.returnvalue ?? null,
      failedReason: job.failedReason || null,
    });
  } catch (err) {
    if (err instanceof QueueUnavailableError || /Connection|ECONNREFUSED|closed/i.test(err.message)) {
      return respond.error(res, 'QUEUE_UNAVAILABLE', 'Hàng đợi tạm thời không khả dụng', 503);
    }
    next(err);
  }
};
