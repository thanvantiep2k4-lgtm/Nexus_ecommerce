'use strict';

/**
 * Kết nối Redis dùng chung cho cả API và worker.
 *
 * Redis là kho key-value trong RAM: dùng cho hàng đợi job (BullMQ), cache, khoá chống xử lý trùng,
 * rate limit dùng chung. Xem docs/guides/redis-bullmq.md.
 *
 * CẤU HÌNH: biến môi trường REDIS_URL, dạng `redis://:matkhau@host:6379/0`
 *   - `rediss://` (hai chữ s) là kết nối có mã hoá TLS (dùng với Redis đặt ở dịch vụ ngoài).
 *   - phần `/0` cuối là số database logic (Redis có 16 database đánh số 0..15).
 *
 * HAI LOẠI KẾT NỐI, vì hai nhu cầu trái ngược:
 *  - `forProducer`: dùng ở API để ĐẨY job. Phải THẤT BẠI NHANH khi Redis chết (enableOfflineQueue =
 *    false) để request trả lỗi 503 ngay, không treo. Nếu để mặc định, ioredis xếp lệnh vào hàng đợi
 *    nội bộ chờ Redis sống lại, request treo, và khi Redis sống lại job bị đẩy vào MUỘN, làm người
 *    dùng bấm thử lại thành hai job.
 *  - `forWorker`: dùng ở worker để CHỜ job. Phải kiên nhẫn: thử kết nối lại mãi (không bỏ cuộc) và
 *    `maxRetriesPerRequest: null` (BullMQ bắt buộc cho lệnh chờ job kiểu blocking).
 */

const IORedis = require('ioredis');

const DEFAULT_URL = 'redis://localhost:6379';

/** Tách REDIS_URL thành tuỳ chọn kết nối (host, port, mật khẩu, db, tls). */
function parseRedisUrl(url = process.env.REDIS_URL || DEFAULT_URL) {
  let u;
  try {
    u = new URL(url);
  } catch {
    // Không đưa nguyên `url` vào thông báo vì nó có thể chứa mật khẩu.
    throw new Error('REDIS_URL không hợp lệ. Dạng đúng: redis://:matkhau@host:6379/0');
  }
  if (u.protocol !== 'redis:' && u.protocol !== 'rediss:') {
    throw new Error(`REDIS_URL phải bắt đầu bằng redis:// hoặc rediss:// (nhận: ${u.protocol})`);
  }
  const options = {
    host: u.hostname,
    port: u.port ? Number(u.port) : 6379,
    // Mật khẩu có thể chứa ký tự đặc biệt; trong URL chúng phải được mã hoá (percent-encode).
    password: u.password ? decodeURIComponent(u.password) : undefined,
    username: u.username ? decodeURIComponent(u.username) : undefined,
    db: u.pathname && u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0,
  };
  if (u.protocol === 'rediss:') options.tls = {};
  return options;
}

/** Thử kết nối lại với khoảng chờ tăng dần, tối đa 5 giây. */
const retryStrategy = (times) => Math.min(times * 200, 5000);

/** Tuỳ chọn cho Queue ở API: thất bại nhanh khi Redis chết. */
function forProducer(url) {
  return {
    ...parseRedisUrl(url),
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy,
    connectionName: 'nexusmart-api',
  };
}

/** Tuỳ chọn cho Worker/QueueEvents: kiên nhẫn, không bỏ cuộc. */
function forWorker(url) {
  return {
    ...parseRedisUrl(url),
    maxRetriesPerRequest: null,
    retryStrategy,
    connectionName: 'nexusmart-worker',
  };
}

/**
 * Ghi cảnh báo nhưng KHÔNG lặp liên tục: khi Redis chết, ioredis báo lỗi ở MỖI lần thử kết nối lại
 * (vài giây một lần) và sẽ làm tràn log. Chỉ in lần đầu và sau đó tối đa 1 lần / 30 giây cho mỗi nguồn.
 * Khi kết nối phục hồi (gọi với message = null) thì xoá mốc để lần lỗi sau in ngay.
 */
const lastWarn = new Map();
function warnThrottled(source, message) {
  if (message === null) {
    lastWarn.delete(source);
    return;
  }
  const now = Date.now();
  if (now - (lastWarn.get(source) || 0) >= 30000) {
    lastWarn.set(source, now);
    console.warn(`[${source}] lỗi Redis: ${message}`);
  }
}

// Client dùng chung cho lệnh Redis thông thường (GET/SET/INCR…), tạo khi cần.
let shared = null;

/**
 * Client Redis dùng chung cho cache, khoá, đếm… (KHÔNG dùng cho BullMQ, BullMQ tự tạo kết nối).
 * Dùng ở nơi có thể chấp nhận chờ khi Redis chập chờn; ở nơi cần thất bại nhanh hãy bọc timeout.
 */
function getRedis() {
  if (!shared) {
    shared = new IORedis({
      ...parseRedisUrl(),
      retryStrategy,
      maxRetriesPerRequest: 2,
      connectionName: 'nexusmart-shared',
    });
    // Không có handler 'error' thì ioredis in lỗi mỗi lần thử kết nối lại và có thể làm sập tiến trình.
    shared.on('error', (err) => warnThrottled('redis', err.message));
    shared.on('ready', () => warnThrottled('redis', null));
  }
  return shared;
}

async function closeRedis() {
  if (shared) {
    const client = shared;
    shared = null;
    await client.quit().catch(() => client.disconnect());
  }
}

module.exports = { parseRedisUrl, forProducer, forWorker, getRedis, closeRedis, warnThrottled };
