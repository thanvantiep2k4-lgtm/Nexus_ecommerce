'use strict';

/**
 * Processor cho hàng đợi `events` (xem core/events.js và docs/guides/events-outbox.md):
 *  - `relay`    : chuyển các dòng outbox đang chờ vào hàng đợi. Chạy lặp mỗi 2 giây (job scheduler) và
 *                 được "gõ cửa" ngay sau commit.
 *  - `dispatch` : chạy các subscriber của một sự kiện. Idempotent (biên nhận ở event_deliveries).
 */

const { UnrecoverableError } = require('bullmq');
const { relayOnce, dispatch, markDead } = require('../core/events');

async function eventsProcessor(job) {
  switch (job.name) {
    case 'relay':
      return relayOnce();

    case 'dispatch':
      try {
        return await dispatch(job.data.outboxId);
      } catch (err) {
        // `attemptsMade` chưa tính lần chạy hiện tại. Lần này là lần cuối thì sự kiện thành `dead` để
        // người xem lastError và xử lý tay (không để nó treo ở trạng thái published mãi mãi).
        const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts || 1);
        if (lastAttempt) await markDead(job.data.outboxId, err).catch(() => {});
        throw err;
      }

    default:
      throw new UnrecoverableError(`Job không được hỗ trợ ở hàng đợi events: ${job.name}`);
  }
}

module.exports = { eventsProcessor };
