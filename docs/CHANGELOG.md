# CHANGELOG

Ghi các thay đổi ảnh hưởng API, mô hình dữ liệu hoặc cách chạy hệ thống. Mới nhất ở trên.
Quy tắc cập nhật: xem mục "Cập nhật tài liệu khi thay đổi API" trong `CLAUDE.md`.

## [Chưa phát hành]

### Sự kiện + outbox
- Thêm `backend/core/events.js`: `emit` (ghi sự kiện vào collection `outbox` **cùng transaction** với dữ liệu), `subscribe`, `relayOnce` (relay lặp mỗi 2 giây ở worker, lấy dòng nguyên tử, tự thu hồi khi relay chết), `dispatch` (chạy subscriber, chống giao lặp bằng biên nhận `event_deliveries`), `nudge`. Thêm hàng đợi `events`, thư mục `subscribers/` (kèm subscriber thử `system.demo`). Hướng dẫn: `docs/guides/events-outbox.md`.
- **Mọi `transition()` của máy trạng thái tự phát một sự kiện outbox** (`installStateMachineSink`, cài ở `index.js` và `worker.js`). Tên mặc định `<máy>.<trạng thái đích>`; dòng chuyển có thể đặt tên riêng bằng trường `event`; `recordCreated` phát `<máy>.created`.
- Bảo đảm: giao ít nhất một lần + chống lặp = **tác dụng xảy ra đúng một lần** (subscriber ghi DB: tuyệt đối vì cùng transaction với biên nhận; subscriber `external`: có khe hở rất hẹp khi worker chết giữa lúc gửi và lúc ghi biên nhận). Không bảo đảm thứ tự giao.
- Thêm collection `outbox` (dòng `done` tự xoá sau 7 ngày, dòng `dead` giữ lại) và `event_deliveries` (giữ 30 ngày); `npm run schema:ensure` gắn validator. Thêm `npm run event:demo` để tự kiểm chứng.
- **Sửa lỗi `enqueue`/`cancelJob` (core/queues.js):** trước đây mọi lỗi đều bị gán nhãn "Redis không sẵn sàng" (`QueueUnavailableError`/`503`), kể cả lỗi lập trình như `jobId` sai quy tắc. Nay chỉ lỗi kết nối thật mới thành `QueueUnavailableError`; lỗi khác ném nguyên vẹn. Thêm `assertValidJobId`: BullMQ **từ chối `jobId` chứa dấu `:`** (trừ đúng 3 đoạn) và `jobId` toàn số, nên dùng `-` hoặc `_` (vd `order-<id>-expire`).
- **Không có thay đổi API.** Chưa chuyển các chỗ `global.io.emit` và `sendTemplatedEmail` hiện có sang outbox (làm ở bước 32 và 38).
- Biến môi trường tuỳ chọn: `OUTBOX_LOCK_TIMEOUT_MS`, `WORKER_LOCK_DURATION_MS`, `WORKER_STALLED_INTERVAL_MS`.

### Máy trạng thái (khung dùng chung)
- Thêm `backend/core/stateMachine.js`: `defineMachine` (kiểm tra bảng chuyển trạng thái ngay lúc khởi động), `transition()` (một hàm duy nhất đổi trạng thái, chạy trong một transaction: kiểm tra đường đi, loại tác nhân, quyền, guard; đổi trạng thái có điều kiện; effects; ghi sự kiện; afterCommit), `availableActions`, `toMermaid`/`toMarkdownTable` (sinh tài liệu từ bảng). Hướng dẫn: `docs/guides/state-machine.md`.
- Thêm collection `state_events` (model `StateEvent`): nhật ký chuyển trạng thái chung cho mọi loại đối tượng, ghi cùng transaction với việc đổi trạng thái. Timeline đơn hàng = lọc `entityType: 'order'` (thay cho `order_events` trong kế hoạch). `npm run schema:ensure` gắn validator và chỉ mục cho collection này.
- **Không có thay đổi API và chưa áp vào code đơn hàng thật** (làm ở bước 32). Hiện trạng thái đơn vẫn bị gán trực tiếp ở `admin.order.controller.js` và `routes/v1/payment.js`; các chỗ đó sẽ chuyển sang `transition()` khi làm máy trạng thái đơn hàng.
- Tác nhân `system` (job, webhook) gọi lại hành động đã hoàn tất được coi là thành công và bỏ qua (`idempotent: true`), người dùng gọi lại thì nhận `409 INVALID_TRANSITION`.

### Hàng đợi job (Redis + BullMQ + worker + Bull Board)
- Thêm service `redis` (AOF, `noeviction`, có mật khẩu) và `worker` vào `docker-compose.yml` / `docker-compose.prod.yml`; `npm run infra:up` nay bật cả Redis, `npm run dev` nay chạy cả worker. Production bắt buộc đặt `REDIS_PASS` và Redis không publish cổng. Hướng dẫn: `docs/guides/redis-bullmq.md`.
- ⚠️ **Không tương thích (biến môi trường):** thêm `REDIS_URL`, `WORKER_CONCURRENCY`, `BULL_BOARD_USER`, `BULL_BOARD_PASS`, `BULL_BOARD_READONLY` vào `backend/.env` (mẫu ở `backend/.env.example`); compose thêm `REDIS_PASS`, `REDIS_PORT`. Thiếu `REDIS_URL` thì mặc định `redis://localhost:6379` (không mật khẩu) nên sẽ không kết nối được Redis có mật khẩu.
- Thêm `backend/core/redis.js`, `core/queues.js` (`enqueue`, `cancelJob`), `jobs/`, `worker.js`; scripts `npm run worker`, `worker:dev`, `job:demo`. API chỉ đẩy job vào Redis nên **worker tắt thì API vẫn chạy**; **Redis tắt** thì endpoint cần hàng đợi trả `503 QUEUE_UNAVAILABLE` (không treo) và tự dùng lại được khi Redis sống lại.
- **Mới:** `POST /api/v1/admin/system/jobs/demo` (role admin) đẩy job thử `demo-delay` hẹn `delayMs` (mặc định 60000, tối đa 3600000), `failTimes` (0–2) để thử cơ chế thử lại; trả `201`, `503` khi Redis không sẵn sàng. `GET /api/v1/admin/system/jobs/{id}` xem trạng thái (`404` nếu job đã bị dọn, job xong được giữ tối đa 1 giờ).
- **Mới:** Bull Board tại `/admin/queues` (HTTP Basic, chỉ bật khi đặt `BULL_BOARD_USER`/`BULL_BOARD_PASS`); không mở ra Internet.
- Sửa `services/exchangeRateService.js`: lỗi MongoDB khi đánh dấu `stale` không còn làm sập cả tiến trình API (trước đây là unhandled rejection).
- Thêm `backend/.dockerignore`: trước đây `node_modules` của máy dev và file `.env` (chứa bí mật) bị đóng gói vào image backend.

### Hạ tầng dữ liệu (MongoDB)
- ⚠️ **Không tương thích:** MongoDB chạy **replica set 1 node có xác thực** (`docker-compose.yml`). `MONGO_URI` phải có user và mật khẩu, ví dụ `mongodb://nexus_app:…@localhost:27017/nexusmart?authSource=admin&directConnection=true` (xem `backend/.env.example`). Volume MongoDB cũ (không xác thực) phải xoá một lần; cách làm ở `docs/PROJECT_PLAN.md` mục 3. Ảnh hưởng: mọi thành viên, `backend/.env`, `crm/.env`.
- Thêm user theo quyền tối thiểu: `nexus_app` (đọc/ghi DB `nexusmart`, chỉ `find` + `insert` ở DB sổ cái `nexusmart_ledger`), `nexus_backup`, `nexus_readonly`. Định nghĩa: `scripts/mongo/users.config.js`.
- Thêm `npm run schema:ensure` (`backend/scripts/ensure-schema.js`): gắn `$jsonSchema` validator (kho không âm, `payouts.amount` số nguyên ≥ 1 và `currency` = VND, `rating` 1–5, số dư ví không âm, sổ cái chỉ Nợ hoặc Có) và tạo chỉ mục. Production tắt `autoIndex` (`config/db.js`), nên chạy lệnh này khi deploy.
- Thêm `core/withTransaction.js` (transaction MongoDB; ngoài production tự chạy không transaction nếu MongoDB là standalone).
- `scripts/backup.sh` sao lưu thêm DB sổ cái và dùng chuỗi kết nối có xác thực (user `nexus_backup`).

### Đơn hàng
- Sửa `POST /api/v1/user/orders`: tạo đơn, ghi nhận lượt coupon và trừ tồn kho nay nằm trong **một transaction**; trừ kho có điều kiện `stock >= số lượng`.
  - **Mới:** trả `409` khi không đủ tồn kho, body `{ status: 'fail', error, details: [{ productId, sku, requested }] }`. Đơn không được tạo, kho và coupon không đổi. Trước đây vẫn trả `200` và kho có thể thành số âm. ⚠️ Không tương thích: storefront (`frontend/src/hooks/use-checkout-submit.js`) hiện chỉ tắt nút khi API lỗi mà không báo gì, nên 409 trông như "bấm không phản ứng"; cần hiển thị thông báo hết hàng.
  - Lượt dùng coupon chỉ bị trừ khi đơn tạo thành công (trước đây bị trừ trước, đơn lỗi vẫn mất lượt).

### Rút tiền (Payout)
- `POST /api/v1/vendor/payouts/request`: `amount` phải là **số nguyên đồng** (Joi `.integer()`), số lẻ bị từ chối `422`.
- Model `Payout`: bỏ mặc định `currency: 'USD'`, cố định `VND`; `amount` số nguyên ≥ 1.
