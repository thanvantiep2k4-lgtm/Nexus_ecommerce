'use strict';

/**
 * TIẾN TRÌNH WORKER: chương trình riêng (chạy cạnh API, không nhận HTTP) lấy job từ Redis ra xử lý.
 *
 *   npm run worker        # chạy một lần
 *   npm run worker:dev    # tự khởi động lại khi sửa code
 *
 * VÌ SAO TÁCH KHỎI API: việc nặng và việc hẹn giờ không chiếm luồng của API; worker sập thì web vẫn
 * chạy (API chỉ đẩy job vào Redis); job nằm yên trong Redis chờ worker bật lại. Có thể chạy nhiều
 * worker cùng lúc, mỗi job vẫn chỉ được một worker lấy. Xem docs/guides/redis-bullmq.md.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { Worker } = require('bullmq');
const connectDB = require('./config/db');
const { forWorker, closeRedis, warnThrottled } = require('./core/redis');
const { closeQueues } = require('./core/queues');
const { processors, registerSchedulers } = require('./jobs');

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY) || 5;
const SHUTDOWN_TIMEOUT_MS = 30 * 1000;

/** Tạo một Worker cho mỗi hàng đợi đã đăng ký processor. */
function startWorkers({ concurrency = CONCURRENCY, log = console } = {}) {
  return Object.entries(processors).map(([queueName, processor]) => {
    const worker = new Worker(queueName, processor, {
      connection: forWorker(),
      concurrency, // số job xử lý song song trong một worker
    });
    worker.on('completed', (job) => log.log(`[worker:${queueName}] xong ${job.name} #${job.id}`));
    worker.on('failed', (job, err) =>
      log.warn(
        `[worker:${queueName}] lỗi ${job?.name} #${job?.id} (lần ${job?.attemptsMade}/${job?.opts?.attempts}): ${err.message}`
      )
    );
    // Không có handler 'error' thì lỗi kết nối Redis có thể làm sập tiến trình worker.
    worker.on('error', (err) => warnThrottled(`worker:${queueName}`, err.message));
    return worker;
  });
}

/** Đăng ký job lặp; Redis chưa sẵn sàng (ví dụ vừa bật cùng lúc) thì thử lại mỗi 5 giây. */
async function registerSchedulersWithRetry(log = console, delayMs = 5000) {
  for (;;) {
    try {
      await registerSchedulers();
      log.log('[worker] đã đăng ký job lặp (heartbeat mỗi 30 giây)');
      return;
    } catch (err) {
      log.warn(`[worker] chưa đăng ký được job lặp (${err.message}), thử lại sau ${delayMs / 1000}s`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

/**
 * Tắt êm: ngừng nhận job mới và CHỜ job đang chạy làm xong (Worker.close), rồi đóng kết nối.
 * Tắt đột ngột (kill -9, mất điện) thì job đang chạy bị đánh dấu "stalled" và BullMQ cho chạy
 * lại, nên processor idempotent là bắt buộc.
 */
async function shutdown(workers, signal) {
  console.log(`[worker] nhận ${signal}, đang tắt êm…`);
  const force = setTimeout(() => {
    console.error('[worker] quá hạn tắt êm, thoát cưỡng bức');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  force.unref();
  await Promise.allSettled(workers.map((w) => w.close()));
  await closeQueues();
  await closeRedis();
  await mongoose.disconnect().catch(() => {});
  clearTimeout(force);
  console.log('[worker] đã tắt');
}

async function main() {
  // Processor nghiệp vụ sau này sẽ cần MongoDB. KHÔNG await: nếu MongoDB chưa sẵn sàng, connectDB chờ
  // tới ~30 giây, và worker không được bị chặn trong lúc đó (job không cần Mongo vẫn phải chạy).
  // Lệnh Mongoose gọi trước khi kết nối xong được xếp hàng chờ (tối đa 10 giây rồi báo lỗi và job thử lại).
  connectDB();
  const workers = startWorkers();
  registerSchedulersWithRetry();

  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, async () => {
      if (stopping) return;
      stopping = true;
      await shutdown(workers, signal);
      process.exit(0);
    });
  }
  console.log(`[worker] đang chạy (pid ${process.pid}), hàng đợi: ${Object.keys(processors).join(', ')}`);
}

module.exports = { startWorkers, registerSchedulersWithRetry };

if (require.main === module) {
  main().catch((err) => {
    console.error('[worker] không khởi động được:', err);
    process.exit(1);
  });
}
