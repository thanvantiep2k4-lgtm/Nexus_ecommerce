'use strict';

const Joi = require('joi');

// Đẩy job thử để kiểm chứng hàng đợi và hẹn giờ.
const enqueueDemoJob = Joi.object({
  // Thời gian hẹn giờ (ms). Mặc định 60000 = 1 phút; tối đa 1 giờ để tránh quên job treo lâu.
  delayMs: Joi.number().integer().min(0).max(3600000).default(60000),
  // Số lần cố ý lỗi trước khi thành công, để thử cơ chế thử lại (job có tối đa 3 lần chạy).
  failTimes: Joi.number().integer().min(0).max(2).default(0),
}).options({ stripUnknown: true });

module.exports = { enqueueDemoJob };
