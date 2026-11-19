'use strict';

const mongoose = require('mongoose');

/**
 * Chạy `fn(session)` trong MỘT transaction MongoDB: hoặc mọi thao tác trong `fn` thành công,
 * hoặc không thao tác nào được giữ lại.
 *
 * VÌ SAO CẦN: trước đây các luồng như tạo đơn → trừ kho → trừ lượt coupon chạy thành nhiều lệnh
 * rời nhau. Server lỗi giữa chừng thì có đơn mà kho chưa trừ (hoặc ngược lại). Transaction gom
 * chúng thành một khối nguyên tử.
 *
 * ĐIỀU KIỆN: MongoDB phải chạy ở chế độ replica set (xem docker-compose.yml, `--replSet rs0`).
 * MongoDB đơn lẻ (standalone) không hỗ trợ transaction.
 *
 * QUY TẮC KHI VIẾT `fn`:
 *  1. MỌI lệnh đọc/ghi cần nằm trong transaction phải truyền `{ session }` (nhận từ tham số).
 *     Lệnh không truyền session sẽ chạy NGOÀI transaction và không được hoàn tác.
 *  2. Driver có thể tự gọi lại `fn` khi gặp lỗi tạm thời (TransientTransactionError), nên `fn`
 *     không được có tác dụng phụ ra bên ngoài (gửi email, gọi cổng thanh toán, phát socket).
 *     Làm các việc đó SAU khi `withTransaction` trả về.
 *  3. Muốn huỷ transaction thì ném lỗi trong `fn`; lỗi được ném tiếp ra cho nơi gọi.
 *
 * FALLBACK (chỉ ngoài production): nếu MongoDB là standalone (ví dụ bộ test dùng
 * mongodb-memory-server bản đơn) thì chạy `fn(null)` không có transaction và in cảnh báo, để các
 * test cũ không phải sửa. Ở production lỗi được ném ra, tuyệt đối không âm thầm bỏ transaction.
 * Vì vậy `fn` phải chấp nhận `session === null` (truyền `{ session: null }` vào Mongoose là hợp lệ).
 */
async function withTransaction(fn, options = {}) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(
      async () => {
        result = await fn(session);
      },
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        ...options,
      }
    );
    return result;
  } catch (err) {
    if (isTransactionUnsupported(err) && process.env.NODE_ENV !== 'production') {
      warnOnce();
      return fn(null);
    }
    throw err;
  } finally {
    await session.endSession();
  }
}

/** MongoDB standalone trả lỗi IllegalOperation (code 20) khi dùng transaction. */
function isTransactionUnsupported(err) {
  return (
    err?.code === 20 ||
    err?.codeName === 'IllegalOperation' ||
    /Transaction numbers are only allowed on a replica set member or mongos/i.test(
      err?.message || ''
    )
  );
}

let warned = false;
function warnOnce() {
  if (warned) return;
  warned = true;
  console.warn(
    '[withTransaction] MongoDB không hỗ trợ transaction (standalone). Chạy KHÔNG có transaction. ' +
      'Chỉ chấp nhận ở môi trường dev/test; hãy chạy MongoDB replica set (docker compose up -d mongodb).'
  );
}

module.exports = { withTransaction };
