'use strict';

const mongoose = require('mongoose');

/**
 * Nhật ký chuyển trạng thái của MỌI đối tượng có máy trạng thái (đơn hàng, trả hàng, hồ sơ nhà
 * bán…). Mỗi lần `transition()` (core/stateMachine.js) thành công ghi đúng MỘT dòng ở đây, TRONG
 * CÙNG transaction với việc đổi trạng thái: trạng thái đổi mà không có dòng sự kiện (hoặc ngược lại)
 * là không thể xảy ra. Đây chính là timeline hiển thị cho người mua, người bán và admin.
 *
 * Một collection chung cho mọi loại đối tượng (phân biệt bằng `entityType`) để chỉ phải đánh chỉ
 * mục, đặt validator và viết giao diện timeline một lần. Timeline của đơn = lọc `entityType: 'order'`.
 *
 * Dòng sự kiện chỉ được THÊM, không được sửa hay xoá (sai thì ghi sự kiện bù, không ghi đè).
 *
 * VẤN ĐỀ ĐÃ BIẾT: tính "chỉ thêm" hiện chỉ do quy ước trong code; user ứng dụng vẫn có quyền
 * update/remove collection này. Muốn bảo đảm ở tầng CSDL như sổ cái thì phải chuyển sang database
 * riêng với quyền find+insert (xem scripts/mongo/users.config.js).
 */
const stateEventSchema = new mongoose.Schema(
  {
    // Loại đối tượng = tên máy trạng thái ('order', 'return'…).
    entityType: { type: String, required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
    // null khi là sự kiện KHỞI TẠO (đối tượng vừa được tạo, chưa có trạng thái trước đó).
    from: { type: String, default: null },
    to: { type: String, required: true },
    action: { type: String, required: true },
    actor: {
      type: { type: String, required: true }, // 'user' | 'system' | ...
      id: { type: String },
      roles: [{ type: String }],
    },
    reason: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed },
    at: { type: Date, default: Date.now, required: true },
  },
  { collection: 'state_events', versionKey: false }
);

// Truy vấn chính: lịch sử của một đối tượng theo thời gian.
stateEventSchema.index({ entityType: 1, entityId: 1, at: 1 });

module.exports = mongoose.models.StateEvent || mongoose.model('StateEvent', stateEventSchema);
