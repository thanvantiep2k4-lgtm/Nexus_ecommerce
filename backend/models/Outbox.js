'use strict';

const mongoose = require('mongoose');

/**
 * HỘP THƯ ĐI (outbox): mỗi sự kiện nghiệp vụ cần phát cho bên khác (thông báo, tìm kiếm, AI…) được ghi
 * thành MỘT dòng ở đây, TRONG CÙNG transaction với việc đổi dữ liệu. Dòng sự kiện và dữ liệu hoặc cùng
 * có hoặc cùng không. Một relay ở worker đọc các dòng chưa xử lý rồi chuyển đi (core/events.js).
 * Hướng dẫn: docs/guides/events-outbox.md.
 *
 * VÌ SAO KHÔNG GỬI THẲNG: gửi email/socket ngay sau khi ghi DB là ghi vào HAI hệ thống không thể cùng
 * thành công. Server sập giữa hai bước thì sự kiện mất vĩnh viễn; gửi trước rồi transaction huỷ thì gửi
 * đi một sự kiện không có thật.
 *
 * Vòng đời `status`:
 *   pending     chờ relay lấy                          (relay lấy nguyên tử → processing)
 *   processing  relay đang chuyển vào hàng đợi          (quá hạn khoá → trả về pending, relay chết giữa chừng)
 *   published   đã vào hàng đợi `events` của BullMQ     (worker đang/sắp chạy các subscriber)
 *   done        mọi subscriber đã xử lý xong            (tự xoá sau 7 ngày nhờ TTL)
 *   dead        hết số lần thử mà vẫn lỗi               (GIỮ LẠI để người xem `lastError` và xử lý tay)
 */
const outboxSchema = new mongoose.Schema(
  {
    // Tên sự kiện, vd 'order.shipping', 'review.published'. Quy ước: <loại>.<việc> viết thường.
    type: { type: String, required: true },
    aggregateType: { type: String }, // loại đối tượng gốc, vd 'order'
    aggregateId: { type: mongoose.Schema.Types.ObjectId },
    // Chỉ chứa id và vài trường chính; subscriber đọc lại MongoDB để lấy dữ liệu mới nhất.
    payload: { type: mongoose.Schema.Types.Mixed },
    status: {
      type: String,
      enum: ['pending', 'processing', 'published', 'done', 'dead'],
      default: 'pending',
      required: true,
    },
    attempts: { type: Number, default: 0 }, // số lần relay đã thử chuyển vào hàng đợi
    nextAttemptAt: { type: Date, default: Date.now },
    lockedAt: { type: Date },
    publishedAt: { type: Date },
    doneAt: { type: Date },
    lastError: { type: String },
  },
  { collection: 'outbox', versionKey: false, timestamps: { createdAt: true, updatedAt: false } }
);

// Truy vấn nóng của relay: lấy dòng pending đến hạn, theo thứ tự.
outboxSchema.index({ status: 1, nextAttemptAt: 1 });
// Tự dọn các sự kiện đã xử lý xong sau 7 ngày. Dòng `dead` KHÔNG có doneAt nên không bao giờ bị xoá.
outboxSchema.index({ doneAt: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });
// Xem các sự kiện của một đối tượng theo thời gian (điều tra sự cố).
outboxSchema.index({ aggregateType: 1, aggregateId: 1, createdAt: 1 });

module.exports = mongoose.models.Outbox || mongoose.model('Outbox', outboxSchema);
