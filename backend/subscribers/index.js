'use strict';

/**
 * Nạp mọi subscriber để chúng đăng ký với core/events.js. Chỉ worker cần gọi (subscriber chạy ở worker).
 *
 * THÊM SUBSCRIBER MỚI: tạo `subscribers/<tên>.subscriber.js` gọi `subscribe(type, name, handler)` rồi
 * `require` ở đây. Đọc quy tắc viết subscriber ở đầu core/events.js (idempotent, truyền `session`,
 * không giả định thứ tự, tên subscriber là khoá biên nhận nên đừng đổi tên khi đã chạy thật).
 */

require('./demo.subscriber');
