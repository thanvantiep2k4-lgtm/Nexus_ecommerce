'use strict';

/**
 * Bull Board: trang web quản trị hàng đợi (xem job theo trạng thái, dữ liệu, lỗi; thử lại hoặc xoá).
 * Địa chỉ: http://localhost:4000/admin/queues
 *
 * BẬT/TẮT: chỉ chạy khi đặt BULL_BOARD_USER và BULL_BOARD_PASS (không có giá trị mặc định, để không
 * vô tình mở trang này). Đặt BULL_BOARD_READONLY=true để chỉ xem, không cho thử lại/xoá job.
 *
 * XÁC THỰC: dùng HTTP Basic, không dùng token Keycloak như /api/v1/admin vì đây là trang HTML mở
 * bằng trình duyệt, trình duyệt không tự gửi được header Authorization: Bearer. Bull Board cho phép
 * XOÁ và THỬ LẠI job nên KHÔNG được mở ra Internet; ở staging/production chỉ vào qua mạng riêng
 * (VPN/Tailscale) hoặc chặn bằng reverse proxy.
 *
 * VẤN ĐỀ ĐÃ BIẾT:
 *  1. Basic Auth dùng chung một tài khoản, không biết ai đã thao tác và không theo quyền. Kế hoạch:
 *     chuyển vào CRM Admin sau đăng nhập Keycloak với quyền `system.config.edit`.
 *  2. Basic Auth gửi mật khẩu dạng base64 (không mã hoá) nên chỉ an toàn qua HTTPS.
 */

const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');
const { QUEUES, getQueue } = require('../core/queues');

/** So sánh hai chuỗi trong thời gian không phụ thuộc nội dung (chống dò mật khẩu qua thời gian trả lời). */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function basicAuth(user, pass) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    if (header.startsWith('Basic ')) {
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
      const i = decoded.indexOf(':');
      const u = i >= 0 ? decoded.slice(0, i) : decoded;
      const p = i >= 0 ? decoded.slice(i + 1) : '';
      // Tính cả hai phép so sánh (không dùng && ngắn mạch) để thời gian không lộ user đúng hay sai.
      const okUser = safeEqual(u, user);
      const okPass = safeEqual(p, pass);
      if (okUser && okPass) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="NexusMart Queues"');
    return res.status(401).send('Authentication required');
  };
}

/**
 * Gắn Bull Board vào app Express. Trả `true` nếu đã bật.
 * Gọi TRƯỚC các rate limiter toàn cục (trang tự gọi API liên tục để làm mới, dễ chạm giới hạn).
 */
function mountBullBoard(app, { basePath = '/admin/queues' } = {}) {
  const user = process.env.BULL_BOARD_USER;
  const pass = process.env.BULL_BOARD_PASS;
  if (!user || !pass) {
    console.log('[bull-board] tắt (chưa đặt BULL_BOARD_USER và BULL_BOARD_PASS)');
    return false;
  }

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(basePath);
  const readOnlyMode = process.env.BULL_BOARD_READONLY === 'true';
  createBullBoard({
    queues: Object.values(QUEUES).map((name) => new BullMQAdapter(getQueue(name), { readOnlyMode })),
    serverAdapter,
  });

  // Chặn dò mật khẩu: chỉ đếm các lần SAI, tối đa 20 lần / 15 phút / IP.
  const failedAuthLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many failed attempts',
  });

  app.use(basePath, failedAuthLimiter, basicAuth(user, pass), serverAdapter.getRouter());
  console.log(`[bull-board] bật tại ${basePath}${readOnlyMode ? ' (chỉ xem)' : ''}`);
  return true;
}

module.exports = { mountBullBoard, basicAuth, safeEqual };
