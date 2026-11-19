'use strict';

/**
 * Processor cho hàng đợi `system`: các job hạ tầng, không thuộc nghiệp vụ nào.
 *
 *  - `heartbeat`   : worker ghi "tôi còn sống" vào Redis (khoá `worker:heartbeat`, tự hết hạn sau 120s).
 *                    Chạy lặp mỗi 30 giây nhờ job scheduler (xem jobs/index.js). Sau này /readyz của API
 *                    đọc khoá này để biết worker có đang chạy không.
 *  - `demo-delay`  : job THỬ để kiểm chứng hẹn giờ. Ghi lại thời điểm thực sự chạy so với lúc đẩy vào.
 *                    `data.failTimes` = số lần cố ý lỗi trước khi thành công, để thử cơ chế thử lại.
 *
 * Mỗi processor nhận `job` và trả về giá trị (lưu làm kết quả job, xem trong Bull Board) hoặc ném lỗi
 * (BullMQ thử lại theo attempts/backoff). Nhớ: processor phải idempotent, xem core/queues.js.
 */

const os = require('os');
const { UnrecoverableError } = require('bullmq');
const { getRedis } = require('../core/redis');

const HEARTBEAT_KEY = 'worker:heartbeat';
const HEARTBEAT_TTL_SECONDS = 120;

async function systemProcessor(job) {
  switch (job.name) {
    case 'heartbeat': {
      const beat = { at: new Date().toISOString(), pid: process.pid, host: os.hostname() };
      await getRedis().set(HEARTBEAT_KEY, JSON.stringify(beat), 'EX', HEARTBEAT_TTL_SECONDS);
      return beat;
    }

    case 'demo-delay': {
      const failTimes = Number(job.data.failTimes) || 0;
      // `attemptsMade` là số lần đã chạy xong (thất bại) trước lần này; lần chạy đầu tiên là 0.
      if (job.attemptsMade < failTimes) {
        throw new Error(`Lỗi cố ý lần ${job.attemptsMade + 1}/${failTimes} (để thử cơ chế thử lại)`);
      }
      const ranAt = Date.now();
      return {
        enqueuedAt: job.data.enqueuedAt,
        ranAt: new Date(ranAt).toISOString(),
        elapsedMs: ranAt - job.data.enqueuedAt, // gồm cả thời gian hẹn giờ (delay)
        attemptsMade: job.attemptsMade + 1,
        pid: process.pid,
      };
    }

    default:
      // Tên job lạ là lỗi lập trình, thử lại bao nhiêu lần cũng vẫn lỗi: bỏ ngay, không retry.
      throw new UnrecoverableError(`Job không được hỗ trợ ở hàng đợi system: ${job.name}`);
  }
}

module.exports = { systemProcessor, HEARTBEAT_KEY, HEARTBEAT_TTL_SECONDS };
