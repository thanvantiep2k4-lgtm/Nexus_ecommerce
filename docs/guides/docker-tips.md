# Docker: tránh chạy nhầm container cũ

Hướng dẫn dành cho thành viên. Gốc của phần lớn lỗi "sửa rồi mà vẫn chạy như cũ" là **container hoặc image cũ vẫn đang chạy**, còn code đã đổi.

## 1. Cái gì chạy bằng Docker, cái gì không

| Thành phần | Cách chạy khi dev (`npm run dev`) |
|---|---|
| MongoDB, Redis, PostgreSQL, Keycloak | **Docker** (`npm run infra:up`) |
| Backend, worker, storefront, CRM | **Chạy trực tiếp bằng Node trên máy bạn**, không qua Docker |

Nghĩa là sửa code backend/frontend/CRM **không cần build lại image**, chỉ cần Node tự nạp lại (nodemon, Next.js). Image của các dịch vụ này chỉ được build khi chạy cả stack trong Docker (`docker compose up`) hoặc khi deploy.

Thay đổi ở **hạ tầng** (`docker-compose.yml`, cấu hình MongoDB/Redis, tên container, mật khẩu) thì cần tạo lại container (mục 3).

## 2. Kiểm tra đang chạy cái gì

```bash
docker compose ps                  # container của dự án, trạng thái, cổng
docker ps -a                       # mọi container, kể cả đã dừng và container tên cũ
docker compose config              # cấu hình compose SAU KHI thay biến, đúng cái sẽ chạy
docker compose images              # image mỗi service đang dùng và thời điểm tạo
docker inspect -f '{{.Created}} {{.Config.Image}}' <tên container>   # container tạo lúc nào, từ image nào
```

Dấu hiệu chạy nhầm bản cũ: tên container khác tên trong `docker-compose.yml` (ví dụ `shofy-*` trong khi file ghi `nexusmart-*`), cổng bị chiếm, hoặc `Created` cũ hơn lần bạn sửa file.

## 3. Khi nào cần làm gì

| Bạn vừa đổi | Lệnh |
|---|---|
| Cấu hình/biến môi trường của dịch vụ trong compose (cổng, mật khẩu, tên) | `docker compose up -d` (tự tạo lại container nào có cấu hình đổi) |
| Nghi ngờ container chưa nhận thay đổi | `docker compose up -d --force-recreate <service>` |
| Code của dịch vụ có `build:` (backend, worker, crm, frontend) | `docker compose up -d --build <service>` |
| `package.json` / dependency, hoặc Dockerfile | `docker compose build --no-cache <service>` rồi `docker compose up -d <service>` |
| Image kéo từ registry (`mongo:7`, `redis:7-alpine`, hoặc tag `latest`) | `docker compose pull` rồi `docker compose up -d` |
| Đổi tên container/service, bỏ một service | `docker compose up -d --remove-orphans` (dọn container thừa của project) |

Nhớ: `docker compose up -d` **không tự build lại image** khi image đã tồn tại. Sửa code mà dùng chế độ chạy trong Docker thì phải thêm `--build`.

## 4. Dọn dẹp an toàn

```bash
docker compose down --remove-orphans   # dừng và xoá container của project, GIỮ dữ liệu (volume)
docker image prune                      # xoá image không còn container nào dùng
```

**Cẩn thận:**
- `docker compose down -v` **xoá cả volume = xoá dữ liệu** (MongoDB, PostgreSQL/Keycloak, Redis). Chỉ dùng khi chủ ý làm lại từ đầu.
- Trước khi xoá volume có dữ liệu cần giữ: sao lưu bằng `mongodump` (xem `scripts/backup.sh`) và đối chiếu số lượng sau khi khôi phục.
- Dùng `MSYS_NO_PATHCONV=1` trước lệnh `docker exec`/`docker cp` trong Git Bash khi đường dẫn bắt đầu bằng `/` (ví dụ `/tmp/...`), vì Git Bash tự đổi thành đường dẫn Windows và lệnh ghi nhầm chỗ.

## 5. Image cho deploy

- **Không deploy bằng tag `latest`**: không biết đang chạy bản nào và không quay lại được. Dùng tag theo commit (xem kế hoạch CI/CD).
- Mỗi image backend/worker cần `backend/.dockerignore` (đã có): nếu thiếu, `node_modules` của máy bạn và file `.env` (chứa bí mật) bị đóng gói vào image.
- Cấu hình `NEXT_PUBLIC_*` của storefront bị **đóng cứng lúc build**: đổi chúng thì phải build lại image storefront, không đủ nếu chỉ khởi động lại container.

## 6. Quy trình sau khi `git pull`

```bash
git pull
npm run infra:up              # idempotent: tạo/cập nhật container hạ tầng nếu cấu hình đổi
docker compose ps             # mọi service đều Up (healthy), tên đúng như trong compose
cd backend && npm run schema:ensure   # nếu có model/ràng buộc mới
```

Nếu `CHANGELOG` (`docs/CHANGELOG.md`) ghi thay đổi **không tương thích** về hạ tầng hoặc biến môi trường, làm theo hướng dẫn trong mục đó trước khi chạy.
