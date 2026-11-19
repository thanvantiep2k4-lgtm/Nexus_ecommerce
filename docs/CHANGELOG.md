# CHANGELOG

Ghi các thay đổi ảnh hưởng API, mô hình dữ liệu hoặc cách chạy hệ thống. Mới nhất ở trên.
Quy tắc cập nhật: xem mục "Cập nhật tài liệu khi thay đổi API" trong `CLAUDE.md`.

## [Chưa phát hành]

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
