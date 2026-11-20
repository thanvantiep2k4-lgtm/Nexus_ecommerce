'use strict';

const mongoose = require('mongoose');

/**
 * BIÊN NHẬN GIAO SỰ KIỆN: mỗi dòng nghĩa là "subscriber X đã xử lý xong sự kiện Y". Đây là thứ làm cho
 * việc xử lý sự kiện IDEMPOTENT: BullMQ và relay bảo đảm giao ÍT NHẤT MỘT LẦN (worker chết giữa chừng
 * thì giao lại), nên subscriber có thể nhận cùng một sự kiện hai lần; biên nhận này khiến lần thứ hai bị
 * bỏ qua. Chỉ mục duy nhất (eventId, subscriber) là chốt chặn cuối cùng, kể cả khi hai worker xử lý
 * cùng một sự kiện cùng lúc.
 *
 * Với subscriber ghi MongoDB, biên nhận được ghi CÙNG transaction với tác dụng của subscriber, nên
 * tác dụng xảy ra đúng một lần (tuyệt đối). Với subscriber có tác dụng NGOÀI DB (gửi email), xem
 * tuỳ chọn `external` ở core/events.js: có một khe hở rất hẹp có thể giao lặp.
 */
const eventDeliverySchema = new mongoose.Schema(
  {
    eventId: { type: mongoose.Schema.Types.ObjectId, required: true },
    subscriber: { type: String, required: true },
    at: { type: Date, default: Date.now, required: true },
  },
  { collection: 'event_deliveries', versionKey: false }
);

eventDeliverySchema.index({ eventId: 1, subscriber: 1 }, { unique: true });
// Giữ biên nhận 30 ngày: LÂU HƠN thời gian giữ sự kiện (7 ngày) để cửa sổ chống lặp luôn bao trùm sự kiện.
eventDeliverySchema.index({ at: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });

module.exports =
  mongoose.models.EventDelivery || mongoose.model('EventDelivery', eventDeliverySchema);
