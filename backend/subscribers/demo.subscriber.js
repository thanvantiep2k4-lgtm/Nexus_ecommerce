'use strict';

/**
 * Subscriber THỬ: nhận sự kiện `system.demo` rồi ghi một dòng vào collection `event_demo_effects`.
 * Dùng để kiểm chứng "mỗi sự kiện có đúng MỘT tác dụng dù worker bị tắt đột ngột" (npm run event:demo và
 * các test ở tests/core/events*.test.js). Không có ý nghĩa nghiệp vụ.
 *
 * Dòng được ghi qua `session` nên nằm CÙNG transaction với biên nhận giao sự kiện: hoặc cả hai cùng có,
 * hoặc cả hai cùng không. `payload.delayMs` kéo dài lúc xử lý để test có đủ thời gian tắt worker giữa chừng.
 */

const mongoose = require('mongoose');
const { subscribe } = require('../core/events');

const COLLECTION = 'event_demo_effects';

subscribe('system.demo', 'demo-recorder', async (event, { session }) => {
  const delayMs = Number(event.payload && event.payload.delayMs) || 0;
  if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  await mongoose.connection.collection(COLLECTION).insertOne(
    {
      eventId: event.id,
      seq: event.payload && event.payload.seq,
      pid: process.pid,
      at: new Date(),
    },
    session ? { session } : {}
  );
});

module.exports = { COLLECTION };
