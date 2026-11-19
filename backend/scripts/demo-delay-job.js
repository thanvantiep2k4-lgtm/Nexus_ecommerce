'use strict';

/**
 * Kiểm chứng hẹn giờ end-to-end: đẩy một job `demo-delay` rồi chờ worker chạy nó, in ra thời gian
 * thực tế so với thời gian hẹn.
 *
 *   npm run job:demo                       # hẹn 60 giây (1 phút)
 *   npm run job:demo -- --delay=5000       # hẹn 5 giây
 *   npm run job:demo -- --fail=2           # lỗi 2 lần rồi mới thành công (thử cơ chế thử lại)
 *
 * Cần: Redis đang chạy và worker đang chạy (`npm run worker` ở terminal khác).
 * Mã thoát 0 = job chạy đúng giờ (lệch không quá 5 giây); 1 = sai giờ, lỗi, hoặc không có worker.
 */

require('dotenv').config();
const { QueueEvents } = require('bullmq');
const { QUEUES, enqueue, closeQueues } = require('../core/queues');
const { forWorker, closeRedis } = require('../core/redis');

const TOLERANCE_MS = 5000;

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
}

async function main() {
  const delayMs = arg('delay', 60000);
  const failTimes = arg('fail', 0);

  // Nghe sự kiện TRƯỚC khi đẩy job để không bỏ lỡ sự kiện hoàn thành.
  const events = new QueueEvents(QUEUES.SYSTEM, { connection: forWorker() });
  events.on('error', (e) => console.warn('[events] lỗi Redis:', e.message));
  await events.waitUntilReady();

  const enqueuedAt = Date.now();
  const job = await enqueue(QUEUES.SYSTEM, 'demo-delay', { enqueuedAt, failTimes }, { delay: delayMs });
  console.log(`Đã đẩy job #${job.id}, hẹn ${delayMs / 1000}s (lỗi cố ý ${failTimes} lần).`);
  console.log(`Dự kiến chạy lúc ${new Date(enqueuedAt + delayMs).toLocaleTimeString()}. Đang chờ worker…`);

  // Chờ đủ thời gian hẹn + thời gian cho các lần thử lại (5s + 10s) + dự phòng.
  const timeout = delayMs + 40000;
  let result;
  try {
    result = await job.waitUntilFinished(events, timeout);
  } catch (err) {
    console.error(`\nKHÔNG xong trong ${timeout / 1000}s: ${err.message}`);
    console.error('Worker đã chạy chưa? Mở terminal khác và chạy: npm run worker');
    return 1;
  }

  const lateBy = result.elapsedMs - delayMs;
  console.log('\nKết quả từ worker:', result);
  console.log(`Hẹn ${delayMs} ms, thực tế chạy sau ${result.elapsedMs} ms (lệch ${lateBy} ms).`);
  if (failTimes) console.log(`Đã chạy ${result.attemptsMade} lần (${failTimes} lần lỗi + 1 lần thành công).`);

  // Với job có lỗi cố ý, thời gian cộng thêm do backoff nên chỉ kiểm tra khi không lỗi.
  if (!failTimes && Math.abs(lateBy) > TOLERANCE_MS) {
    console.error(`SAI GIỜ: lệch quá ${TOLERANCE_MS} ms`);
    return 1;
  }
  console.log('ĐÚNG GIỜ ✔');
  await events.close();
  return 0;
}

main()
  .then((code) => code)
  .catch((err) => {
    console.error('Lỗi:', err.message);
    return 1;
  })
  .then(async (code) => {
    await closeQueues();
    await closeRedis();
    process.exit(code);
  });
