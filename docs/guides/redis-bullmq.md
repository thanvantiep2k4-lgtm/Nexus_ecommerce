# Redis, BullMQ, worker và Bull Board

Hướng dẫn dành cho thành viên: các thành phần này là gì, chạy và kiểm tra thế nào, thêm một job mới ra sao.

## 1. Tóm tắt

| Thành phần | Là gì | Ở đâu trong repo |
|---|---|---|
| **Redis** | Kho key-value trong RAM, rất nhanh. Dùng cho hàng đợi job, sau này cả cache, rate limit, session, khoá | service `redis` trong `docker-compose.yml`; kết nối ở `backend/core/redis.js` |
| **BullMQ** | Thư viện Node dùng Redis làm hàng đợi job: hẹn giờ, thử lại, chạy lặp, chống trùng | đẩy job: `backend/core/queues.js`; xử lý: `backend/jobs/` |
| **Worker** | Tiến trình Node **riêng** lấy job từ Redis ra xử lý, không nhận HTTP | `backend/worker.js` (`npm run worker`) |
| **Bull Board** | Trang web quản trị hàng đợi: xem job, lỗi, thử lại, xoá | `backend/config/bullBoard.js`, địa chỉ `/admin/queues` |

```
API ──ghi──► MongoDB   (NGUỒN SỰ THẬT)
 │
 └─ enqueue(delay 15 phút) ──► Redis ◄──── Bull Board (xem)
                                │
                  worker  ◄─────┘  đến giờ lấy job, kiểm tra MongoDB rồi làm
```

Nguyên tắc: **MongoDB là nguồn sự thật, Redis chỉ giúp xử lý đúng giờ.** Redis không thay thế MongoDB và không được là nơi duy nhất giữ dữ liệu quan trọng.

## 2. Chạy ở máy dev

```bash
npm run infra:up          # MongoDB + Redis + PostgreSQL + Keycloak
npm run dev               # api, worker, store, crm, crm-ui (worker nằm trong lệnh này)
```

Hoặc chạy riêng: `cd backend && npm run worker` (hoặc `npm run worker:dev` để tự khởi động lại khi sửa code).

Biến môi trường (`backend/.env`, mẫu ở `backend/.env.example`):

| Biến | Ý nghĩa |
|---|---|
| `REDIS_URL` | `redis://:matkhau@host:6379/0`. `rediss://` = có TLS. Ký tự đặc biệt trong mật khẩu (`@ : / ? # %`) phải mã hoá URL |
| `WORKER_CONCURRENCY` | Số job một worker xử lý song song (mặc định 5) |
| `BULL_BOARD_USER`, `BULL_BOARD_PASS` | Đăng nhập Bull Board. Bỏ trống một trong hai thì Bull Board **tắt** |
| `BULL_BOARD_READONLY` | `true` = chỉ xem, không cho thử lại/xoá job |

## 3. Kiểm tra nhanh

**Job hẹn giờ 1 phút** (cần worker đang chạy ở terminal khác):

```bash
cd backend && npm run job:demo                 # hẹn 60 giây
npm run job:demo -- --delay=5000               # hẹn 5 giây
npm run job:demo -- --fail=2                   # lỗi 2 lần rồi thành công (thử cơ chế thử lại)
```

In ra `Hẹn 60000 ms, thực tế chạy sau 60068 ms` và `ĐÚNG GIỜ ✔` (lệch tối đa 5 giây thì mới tính là đúng).

**Worker tắt thì API vẫn sống:** tắt worker rồi gọi `GET http://localhost:4000/health`, vẫn `200`. Đẩy job lúc đó vẫn được, job nằm chờ trong Redis (xem ở Bull Board), bật lại worker thì được xử lý.

**Bull Board:** mở `http://localhost:4000/admin/queues`, đăng nhập bằng `BULL_BOARD_USER`/`BULL_BOARD_PASS`.

**Xem trực tiếp trong Redis:**

```bash
docker exec -it nexusmart-redis redis-cli -a redis_dev_password
> KEYS bull:system:*       # các key của hàng đợi system
> GET worker:heartbeat     # dấu "worker còn sống" (tự hết hạn sau 120 giây)
> INFO memory              # Redis đang dùng bao nhiêu RAM
```

**Qua API (role admin):** `POST /api/v1/admin/system/jobs/demo` đẩy job thử, `GET /api/v1/admin/system/jobs/{id}` xem trạng thái.

**Chạy test Redis** (cần một Redis thật; test dùng database số 15 và tự dọn):

```bash
cd backend
REDIS_TEST_URL=redis://:redis_dev_password@localhost:6379 npm test -- tests/core/queue
```

Không đặt `REDIS_TEST_URL` thì các test cần Redis hiện "skipped".

## 4. Thêm một job mới

1. Khai báo hàng đợi trong `backend/core/queues.js` (`QUEUES`) nếu chưa có.
2. Viết processor ở `backend/jobs/<tên>.processor.js`, thêm vào `processors` ở `backend/jobs/index.js`.
3. Nơi cần đẩy việc:

```js
const { enqueue, cancelJob, QUEUES } = require('../core/queues');

// hẹn 15 phút để huỷ đơn chưa thanh toán; jobId giúp chống trùng và huỷ về sau
await enqueue(QUEUES.ORDERS, 'expire-unpaid', { orderId }, {
  delay: 15 * 60 * 1000,
  jobId: `order-${orderId}-expire`,   // KHÔNG dùng ':' (BullMQ từ chối), dùng '-' hoặc '_'
});

// khi đơn được thanh toán
await cancelJob(QUEUES.ORDERS, `order-${orderId}-expire`);
```

Job chạy lặp theo lịch (thay `node-cron`) đăng ký trong `registerSchedulers()` ở `backend/jobs/index.js`.

## 5. Quy tắc bắt buộc khi viết processor

0. **`jobId` không được chứa dấu `:`** (BullMQ từ chối, trừ đúng 3 đoạn như `a:b:c`) và không được toàn số. Dùng `-` hoặc `_`. `enqueue` kiểm tra ngay và ném `TypeError` rõ ràng; lỗi kiểu này **không** bị báo là "Redis không sẵn sàng".
1. **Phải idempotent.** BullMQ bảo đảm job chạy **ít nhất một lần**, không phải đúng một lần (worker chết giữa chừng thì job chạy lại). Chạy hai lần vẫn phải đúng: đọc trạng thái hiện tại trong MongoDB trước khi làm ("nếu đơn đã huỷ rồi thì thôi").
2. **Chỉ đưa id vào dữ liệu job**, không đưa cả document. Processor đọc lại MongoDB để có dữ liệu mới nhất.
3. **Đừng dựa vào `cancelJob` để bảo đảm đúng.** Job đang chạy (`active`) không huỷ được; cái bảo đảm đúng là tính idempotent của processor. Huỷ chỉ là tối ưu.
4. **Lỗi tạm thời thì ném lỗi** (BullMQ thử lại 3 lần, cách nhau 5s, 10s, 20s). **Lỗi vĩnh viễn thì ném `UnrecoverableError`** để không thử lại vô ích.
5. **Không cho Redis đầy.** Redis chạy `maxmemory-policy noeviction`: hết RAM thì Redis báo lỗi ghi, KHÔNG tự xoá. Vì vậy job xong và job lỗi cũ phải được dọn (cấu hình sẵn ở `DEFAULT_JOB_OPTIONS`). Đừng đẩy dữ liệu lớn vào job.
6. **Đừng dùng Redis làm nơi duy nhất giữ dữ liệu quan trọng.** Nếu Redis mất dữ liệu, job hẹn giờ sẽ không chạy. Cần một job định kỳ quét MongoDB tìm việc quá hạn bị sót (kế hoạch ở bước 8 của `THU_TU_TRIEN_KHAI`).

## 6. Hành vi khi có sự cố

| Tình huống | Điều xảy ra |
|---|---|
| Worker tắt | API vẫn chạy; job nằm chờ trong Redis, worker bật lại thì xử lý tiếp |
| Redis tắt | API vẫn chạy; endpoint cần hàng đợi trả `503 QUEUE_UNAVAILABLE` sau tối đa ~3 giây (không treo); Redis sống lại thì tự dùng được, không cần khởi động lại API |
| Worker bị tắt đột ngột (kill -9, mất điện) | Job đang chạy bị đánh dấu "stalled" và được chạy lại: lý do cần idempotent |
| Tắt worker bằng `SIGTERM`/Ctrl+C | Worker ngừng nhận job mới, chờ job đang chạy xong rồi thoát (tối đa 30 giây) |
| MongoDB chưa sẵn sàng lúc worker khởi động | Worker vẫn chạy được ngay; job không cần Mongo xử lý bình thường |

## 7. Production

- Redis đặt mật khẩu riêng (`REDIS_PASS` bắt buộc trong `docker-compose.prod.yml`) và **không publish cổng ra ngoài**.
- Bull Board cho phép xoá và thử lại job nên **không được mở ra Internet**: chỉ vào qua mạng riêng (VPN/Tailscale) hoặc chặn bằng reverse proxy, đặt mật khẩu mạnh, chỉ dùng qua HTTPS.
- Chạy `worker` như một service riêng (đã có trong compose); có thể chạy nhiều worker.
