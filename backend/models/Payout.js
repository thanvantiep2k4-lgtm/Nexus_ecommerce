'use strict';

const mongoose = require('mongoose');

const payoutSchema = new mongoose.Schema(
  {
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // TIỀN LƯU BẰNG SỐ NGUYÊN ĐỒNG (VND không có phần lẻ). Số thực (float) không biểu diễn chính
    // xác mọi số thập phân (0.1 + 0.2 = 0.30000000000000004) nên cộng nhiều lần sẽ lệch, không
    // chấp nhận được với tiền. Quy ước này cũng được CSDL kiểm tra bằng $jsonSchema
    // (xem scripts/ensure-schema.js).
    amount: {
      type: Number,
      required: true,
      min: [1, 'amount must be at least 1 VND'],
      validate: {
        validator: Number.isInteger,
        message: 'amount must be an integer number of VND (đồng)',
      },
    },

    // TRƯỚC ĐÂY mặc định là 'USD' (di sản của mẫu gốc), trong khi cả hệ thống tính bằng VND:
    // một yêu cầu rút 5.000.000 không ghi đơn vị sẽ bị hiểu là 5 triệu đô. Nay cố định là VND.
    // Muốn hỗ trợ ngoại tệ thì phải thêm cột tỉ giá và dùng kiểu Decimal128, không chỉ đổi enum.
    currency: { type: String, enum: ['VND'], default: 'VND' },

    status: {
      type: String,
      enum: ['pending', 'processing', 'paid', 'rejected'],
      default: 'pending',
    },
    bankDetails: { type: mongoose.Schema.Types.Mixed },
    transactionRef: { type: String },
    requestedAt: { type: Date, default: Date.now },
    processedAt: { type: Date },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    note: { type: String },
  },
  { timestamps: true }
);

payoutSchema.index({ vendor: 1 });
payoutSchema.index({ status: 1 });
payoutSchema.index({ requestedAt: -1 });

module.exports = mongoose.model('Payout', payoutSchema);
