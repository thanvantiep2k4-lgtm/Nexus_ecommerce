'use strict';

/**
 * Kiểm chứng outbox end-to-end: phát N sự kiện `system.demo`, chờ worker xử lý, rồi kiểm tra MỖI sự kiện
 * có ĐÚNG MỘT tác dụng (không mất, không lặp).
 *
 *   npm run event:demo                       # 20 sự kiện
 *   npm run event:demo -- --count=100        # 100 sự kiện
 *   npm run event:demo -- --count=100 --delay=100   # mỗi sự kiện xử lý mất 100ms (dễ thử tắt worker giữa chừng)
 *
 * Cần: MongoDB, Redis và worker đang chạy (`npm run worker` ở terminal khác). Thử độ bền: trong lúc script
 * đang chờ, TẮT ĐỘT NGỘT worker (đóng cửa sổ terminal) rồi bật lại: kết quả vẫn phải là "đúng một lần".
 * Mã thoát 0 = mỗi sự kiện đúng một tác dụng; 1 = thiếu, lặp, hoặc quá thời gian chờ.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { emit, nudge } = require('../core/events');
const { closeQueues } = require('../core/queues');
const { closeRedis } = require('../core/redis');
const { COLLECTION } = require('../subscribers/demo.subscriber');

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};

async function main() {
  const count = arg('count', 20);
  const delayMs = arg('delay', 0);
  const timeoutMs = 120000;

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });

  const ids = [];
  for (let seq = 0; seq < count; seq++) {
    const doc = await emit('system.demo', { seq, delayMs }, { aggregateType: 'demo' });
    ids.push(doc._id);
  }
  await nudge();
  console.log(`Đã phát ${count} sự kiện. Đang chờ worker xử lý (tối đa ${timeoutMs / 1000}s)…`);

  const effects = mongoose.connection.collection(COLLECTION);
  const started = Date.now();
  let done = 0;
  while (Date.now() - started < timeoutMs) {
    done = await effects.countDocuments({ eventId: { $in: ids } });
    process.stdout.write(`\r  đã xử lý ${done}/${count}   `);
    if (done >= count) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log('');

  // Mỗi sự kiện phải có đúng một tác dụng. $group theo eventId để tìm lặp.
  const perEvent = await effects
    .aggregate([{ $match: { eventId: { $in: ids } } }, { $group: { _id: '$eventId', n: { $sum: 1 } } }])
    .toArray();
  const duplicated = perEvent.filter((e) => e.n > 1).length;
  const missing = count - perEvent.length;
  console.log(`Kết quả: ${perEvent.length}/${count} sự kiện có tác dụng, thiếu ${missing}, lặp ${duplicated}.`);
  if (missing === 0 && duplicated === 0) {
    console.log('ĐÚNG MỘT LẦN CHO MỌI SỰ KIỆN ✔');
    return 0;
  }
  if (missing) console.error('Có sự kiện chưa được xử lý. Worker đã chạy chưa? npm run worker');
  return 1;
}

main()
  .catch((err) => {
    console.error('Lỗi:', err.message);
    return 1;
  })
  .then(async (code) => {
    await closeQueues();
    await closeRedis();
    await mongoose.disconnect().catch(() => {});
    process.exit(code);
  });
