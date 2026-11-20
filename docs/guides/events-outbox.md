# Sự kiện và outbox (`core/events.js`)

Cách phát sự kiện nghiệp vụ (thông báo, đồng bộ tìm kiếm, AI…) mà **không bao giờ mất sự kiện**, dù server sập lúc nào.

## 1. Vì sao có

Code cũ ghi MongoDB xong rồi phát thông báo ngay trong tiến trình API:

```js
await Order.create(...)                      // 1. ghi MongoDB
emitOrderCreated(order);                     // 2. phát socket
sendTemplatedEmail('order-confirmation', …)  // 3. gửi email, fire-and-forget
```

MongoDB và email/socket là hai hệ thống khác nhau, không thể "cùng thành công hoặc cùng thất bại":

| Tình huống | Hậu quả |
|---|---|
| Server sập sau bước 1, trước bước 3 | Đơn đã lưu nhưng **email không bao giờ được gửi**, không ai biết |
| Gửi email trước rồi transaction bị huỷ | Khách nhận email về một đơn **không tồn tại** |
| Email lỗi tạm thời | `.catch(console.error)` rồi mất, không thử lại |

**Outbox** giải quyết bằng cách: thay vì gửi ngay, **ghi một dòng sự kiện vào MongoDB cùng transaction** với việc đổi dữ liệu. Dòng sự kiện và dữ liệu hoặc cùng có, hoặc cùng không. Worker đọc các dòng chưa xử lý và phát đi, có thử lại. Server sập lúc nào thì sự kiện vẫn nằm đó.

## 2. Bảo đảm cung cấp

> **Giao ít nhất một lần (at-least-once) + người nhận idempotent = tác dụng xảy ra đúng một lần.**

"Đúng một lần" tuyệt đối không có trong hệ phân tán (worker có thể chết sau khi làm xong nhưng trước khi ghi nhận). Vì vậy một sự kiện có thể được **giao hai lần** trong tình huống hiếm, nhưng mỗi cặp (sự kiện, subscriber) có một **biên nhận** trong `event_deliveries` với chỉ mục duy nhất: lần giao thứ hai bị bỏ qua.

| Loại subscriber | Bảo đảm |
|---|---|
| **Ghi MongoDB (mặc định)** | Tác dụng và biên nhận nằm **cùng transaction** nên đúng một lần **tuyệt đối**, kể cả khi hai worker xử lý cùng sự kiện cùng lúc |
| **Tác dụng ngoài DB** (`{ external: true }`: gửi email, gọi API) | Hàm chạy ngoài transaction rồi mới ghi biên nhận. **Khe hở rất hẹp:** worker chết giữa lúc gửi xong và lúc ghi biên nhận thì lần giao lại sẽ gửi lần hai. Giảm bằng khoá idempotency của nhà cung cấp (dựa trên `event.id`) nếu có |

## 3. Luồng

```
API:    transition() / emit()  ──cùng transaction──►  MongoDB: dữ liệu + dòng outbox (pending)
                                                          │  (sau commit: "gõ cửa" relay)
Worker: relay (lặp 2 giây)  ──lấy nguyên tử──► BullMQ queue `events` (jobId = evt-<id>) ──► outbox: published
Worker: dispatch  ──► từng subscriber ──► biên nhận event_deliveries ──► outbox: done
```

Vòng đời một dòng `outbox`:

| `status` | Ý nghĩa |
|---|---|
| `pending` | Chờ relay lấy |
| `processing` | Relay đang chuyển vào hàng đợi (quá 60 giây thì coi là relay chết, trả về `pending`) |
| `published` | Đã vào hàng đợi BullMQ, worker đang/sắp chạy subscriber |
| `done` | Mọi subscriber xong; **tự xoá sau 7 ngày** (TTL) |
| `dead` | Hết số lần thử mà vẫn lỗi; **giữ lại** để xem `lastError` và xử lý tay |

Các cơ chế bảo vệ:

1. **Lấy dòng nguyên tử:** relay lấy từng dòng bằng `findOneAndUpdate` (pending → processing), nên nhiều worker chạy cùng lúc không bao giờ lấy trùng.
2. **Chết giữa chừng tự hồi phục:** dòng `processing` quá hạn khoá được trả về `pending`. Đẩy lại cùng `jobId` bị BullMQ chặn; nếu vẫn lọt thì biên nhận ở `dispatch` chặn lần xử lý thứ hai. Job đang chạy mà worker bị giết được BullMQ giao lại (sau `lockDuration`, mặc định 30 giây).
3. **"Gõ cửa" để nhanh:** sau commit, `nudge()` bảo relay chạy ngay (độ trễ gần 0). Nếu lỗi (Redis chết thoáng chốc) thì relay định kỳ 2 giây vẫn phát, nên **không bao giờ mất sự kiện**, chỉ chậm tối đa vài giây.
4. **Thử lại và dead-letter:** subscriber lỗi thì BullMQ thử lại tối đa 8 lần (2s, 4s, 8s…), chỉ chạy lại subscriber chưa xong. Quá số lần thì sự kiện thành `dead`.
5. **Một subscriber lỗi không chặn subscriber khác** của cùng sự kiện.

## 4. Phát sự kiện

### Tự động từ máy trạng thái

Mỗi `transition()` thành công (xem `docs/guides/state-machine.md`) tự ghi một dòng outbox cùng transaction, không cần làm gì thêm. Tên sự kiện mặc định `<tên máy>.<trạng thái đích viết thường>` (vd `order.shipping`, `return.refunded`); sự kiện khởi tạo từ `recordCreated` là `<máy>.created`. Đặt tên riêng bằng trường `event` của dòng chuyển trạng thái:

```js
{ from: 'TO_SHIP', to: 'SHIPPING', action: 'PICKED_UP', event: 'order.shipped' }
```

Payload gồm: `stateEventId, entityType, entityId, from, to, action, actor, reason, metadata, at`.

### Thủ công cho sự kiện không phải đổi trạng thái

```js
const { emit, nudge } = require('../core/events');

await withTransaction(async (session) => {
  await Review.updateOne({ _id }, { $set: { status: 'approved' } }, { session });
  await emit('review.published', { reviewId: _id, productId }, {
    session,                                  // BẮT BUỘC để cùng transaction với dữ liệu
    aggregateType: 'review', aggregateId: _id,
  });
});
await nudge();   // tuỳ chọn: giảm độ trễ; relay định kỳ vẫn phát nếu bỏ qua
```

Quy ước tên sự kiện: `loai.viec` chữ thường (`review.published`, `payout.paid`). **Chỉ đưa id và vài trường chính vào payload**; subscriber đọc lại MongoDB để có dữ liệu mới nhất.

## 5. Nhận sự kiện (subscriber)

Tạo `backend/subscribers/<tên>.subscriber.js` rồi `require` ở `backend/subscribers/index.js`:

```js
const { subscribe } = require('../core/events');

// Ghi MongoDB: chạy TRONG transaction cùng biên nhận
subscribe('order.shipping', 'notify-buyer-in-app', async (event, { session }) => {
  await Notification.create([{ userId, title: '…', refId: event.aggregateId }], { session });
});

// Tác dụng ngoài DB: chạy NGOÀI transaction
subscribe('order.shipping', 'email-buyer-shipped', async (event) => {
  await sendTemplatedEmail('order-shipped', email, data);
}, { external: true });
```

`event` có: `id`, `type`, `aggregateType`, `aggregateId`, `payload`, `at`. Tên sự kiện nhận khớp chính xác (`order.shipping`), theo tiền tố (`order.*`) hoặc tất cả (`*`).

### Quy tắc bắt buộc

1. **Idempotent và không giả định thứ tự.** Sự kiện có thể giao lặp (xem mục 2) và **không được bảo đảm theo thứ tự**, kể cả cùng một đối tượng. `event.at` cho phép so sánh thời điểm.
2. **Subscriber mặc định chạy trong transaction:** mọi lệnh DB phải truyền `{ session }`, và **không được có tác dụng phụ ra ngoài** (driver có thể gọi lại cả khối khi gặp lỗi tạm thời). Việc có tác dụng ngoài DB phải khai báo `{ external: true }`.
3. **Tên subscriber là khoá của biên nhận.** Đổi tên khi đã chạy thật = bị coi là người nhận mới và nhận lại sự kiện cũ. Đừng đổi tên.
4. **Một subscriber chậm làm chậm các subscriber sau nó của cùng sự kiện** (chạy tuần tự); không ảnh hưởng sự kiện khác.

## 6. Kiểm tra nhanh

```bash
npm run worker                                 # terminal 1
cd backend && npm run event:demo               # terminal 2: 20 sự kiện
npm run event:demo -- --count=100 --delay=100  # 100 sự kiện, mỗi cái xử lý 100ms
```

Kết quả: `Kết quả: 100/100 sự kiện có tác dụng, thiếu 0, lặp 0.` và `ĐÚNG MỘT LẦN CHO MỌI SỰ KIỆN ✔`.

**Thử độ bền:** trong lúc `event:demo --count=100 --delay=100` đang chờ, **tắt đột ngột worker** (đóng cửa sổ terminal), chờ vài giây rồi `npm run worker` lại. Kết quả vẫn phải là đúng một lần cho mọi sự kiện. Job đang chạy dở được BullMQ giao lại sau tối đa 30 giây (`lockDuration`).

**Xem trực tiếp:**
- Bull Board (`/admin/queues`) có hàng đợi `events`.
- Sự kiện lỗi: `db.outbox.find({ status: 'dead' })` (có `lastError`).
- Sự kiện kẹt: `db.outbox.find({ status: { $in: ['pending','processing','published'] } })` có `createdAt` cũ.

**Test tự động:**

```bash
cd backend
npx jest tests/core/events.test.js          # logic outbox, không cần Redis (26 test)
REDIS_TEST_URL=redis://:redis_dev_password@localhost:6379 npx jest tests/core/events-e2e
```

Bộ `events-e2e` chạy **worker thật trong tiến trình riêng** trên Redis thật; kịch bản chính sinh 100 sự kiện, `SIGKILL` worker giữa chừng, bật lại, rồi kiểm tra mỗi sự kiện có đúng một tác dụng và không mất cái nào.

## 7. Biến môi trường

| Biến | Ý nghĩa |
|---|---|
| `OUTBOX_LOCK_TIMEOUT_MS` | Sau bao lâu dòng `processing` được coi là relay đã chết (mặc định 60000) |
| `WORKER_LOCK_DURATION_MS`, `WORKER_STALLED_INTERVAL_MS` | Thời gian BullMQ phát hiện worker chết và giao lại job (mặc định 30000). Chỉ rút ngắn khi test |

## 8. Giới hạn đã biết

1. **Không bảo đảm thứ tự giao.** Nếu sau này cần thứ tự theo từng đối tượng thì phải bổ sung số phiên bản và hàng đợi theo khoá.
2. **Subscriber tuần tự trong một job** (mục 5, quy tắc 4).
3. Chưa có danh mục tập trung các tên sự kiện; thêm khi số sự kiện đủ nhiều.
4. Các chỗ `global.io.emit` và `sendTemplatedEmail` hiện có (khoảng 20 nơi) **chưa chuyển sang outbox**; chuyển dần khi làm máy trạng thái đơn hàng (bước 32) và bộ thông báo (bước 38).
