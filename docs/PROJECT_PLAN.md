# PROJECT_PLAN.md — Kế hoạch thống nhất NexusMart

> **BẮT BUỘC: mọi thành viên (và mọi AI/Claude Code dùng trong repo này) phải đọc hết file này trước khi viết code.**
> Khi file này mâu thuẫn với `phancong.md` hoặc các file `CLAUDE.md` cũ, **file này thắng**.
> Muốn đổi kế hoạch: sửa file này bằng một PR riêng và báo cả nhóm. Không tự đổi port, tên biến môi trường, cấu trúc API.
> **Phạm vi nghiệp vụ và phân công (v2):** xem [`KE_HOACH_NGHIEP_VU.md`](../KE_HOACH_NGHIEP_VU.md) ở gốc repo. Về phạm vi tính năng và phân công, file đó thay cho mục 5–7 bên dưới; các quy ước kỹ thuật trong file này vẫn giữ nguyên.

Đề tài: **Xây dựng sàn thương mại điện tử NexusMart tích hợp trợ lý AI**. CSDL: MongoDB.
(Tên cũ trong code là "Shofy". Repo được fork từ một template, đang trong quá trình đổi tên.)

---

## 1. Nguyên tắc quyết định

Khi kế hoạch gốc (`phancong.md`) và code hiện tại khác nhau, **chọn bên chuẩn kỹ thuật hơn**:

| Hạng mục | Quyết định | Lý do |
|---|---|---|
| Xác thực | **Giữ Keycloak** (SSO, RBAC, Google, MFA) | Chuẩn OIDC/OAuth2, hơn JWT tự viết |
| Model AI | **Giữ Gemini 2.5 Flash-Lite + gemini-embedding-001** | 2.0 đã cũ. Sửa chữ trong văn bản đề tài |
| Trang chủ, menu, theme (CMS) | **Làm theo kế hoạch**: homepage builder + menu editor + theme tối thiểu | Đã bị xoá khỏi code, phải làm lại |
| Mẫu email | **Làm theo kế hoạch**: UI sửa template, merge tag, preview, gửi thử | Backend đã có model + renderer, chỉ thiếu UI |
| Duyệt đánh giá | **Làm theo kế hoạch**: review mới vào `pending`, admin duyệt/từ chối | Chuẩn của sàn TMĐT |
| Giỏ hàng | **Làm theo kế hoạch**: CRUD API giỏ hàng phía server | Đồng bộ thiết bị, kiểm tồn kho, giá do server tính |
| Thanh toán | COD + chuyển khoản/VietQR + **VNPay (test E2E)** + **MoMo (sandbox)**. Stripe tuỳ chọn | MoMo phổ biến ở VN |
| Vận chuyển | **Tích hợp GHN/GHTK sandbox** (tính phí, tạo vận đơn, nhận trạng thái) | Đề tài ghi "tích hợp nhà vận chuyển" |

---

## 2. Kiến trúc và chuẩn kỹ thuật (KHÔNG tự đổi)

### 2.1 Port chuẩn

| Dịch vụ | Thư mục | Port |
|---|---|---|
| Backend API (Express) | `backend/` | **4000** (Swagger: `/api-docs`) |
| Storefront (Next.js) | `frontend/` | **3001** |
| CRM server proxy (Express) | `crm/` | **8081** |
| CRM UI dev (Vite) | `crm/crm-ui/` | **5173** (proxy `/api` → 8081) |
| Keycloak | `keycloak/` | **8180** |
| PostgreSQL (cho Keycloak) | — | 5433 |
| MongoDB (replica set 1 node, có xác thực) | — | 27017 |
| Redis (hàng đợi job, dữ liệu tạm) | — | 6379 |
| Worker (BullMQ) + Bull Board | `backend/worker.js`; Bull Board tại `:4000/admin/queues` | — |

Luồng gọi: `Storefront → Backend`, `CRM UI → CRM server (8081) → Backend`, mọi người dùng đăng nhập qua `Keycloak` và gửi `Authorization: Bearer <JWT>`.

### 2.2 Công nghệ

- **Backend:** Node 20, Express 4, Mongoose 7, Joi, Socket.io, Swagger, Jest + Supertest + mongodb-memory-server.
- **Storefront:** Next.js 13 (Pages Router), React 18, Redux Toolkit + RTK Query, Bootstrap 5/SCSS, i18next (EN/VI).
- **CRM:** React 19 + TypeScript + Vite + Ant Design 6 + TanStack Query + Zustand + Recharts.
- **AI:** `@google/generative-ai`, agent loop + 11 tool trong `backend/services/chatbot/`.
- **Hạ tầng:** Docker Compose, Nginx, GitHub Actions.

### 2.3 Quy tắc API
- Chỉ dùng `/api/v1/*`: `store` (công khai), `user` (đã đăng nhập), `vendor` (role vendor), `admin` (admin/manager/staff/shipper).
- Route mới: `backend/routes/v1/<nhóm>/index.js`. Controller: `backend/controllers/v1/`. Validate: `backend/validations/`. Trả kết quả bằng `utils/respond.js`.
- Mọi endpoint mới phải có chú thích Swagger (JSDoc) và ít nhất 1 test Jest.

### 2.4 Cấu trúc thư mục và quy ước code (thống nhất, không tự đổi)

- **Tài liệu** chỉ nằm trong `docs/` (mục lục: `docs/README.md`). Không để file `.md` rải rác trong code, ngoại lệ `README.md`/`CLAUDE.md`/`AGENTS.md`/`KE_HOACH_NGHIEP_VU.md`/`THU_TU_TRIEN_KHAI.md`.
- **Backend:** thư mục số nhiều `controllers/`, `models/`. Mỗi resource một file: `controllers/v1/<resource>.controller.js`, `models/<Resource>.js`, `validations/<resource>.validation.js`. Dữ liệu seed ở `seeds/data/`, runner `seeds/index.js`. Không đặt logic nghiệp vụ trong `routes/`.
- **Frontend:** component theo tính năng trong `src/components/<feature>/`, trang trong `src/pages/`, gọi API qua RTK Query trong `src/redux/features/`. Import dùng alias `@/`.
- **CRM UI:** mỗi tính năng một thư mục `src/features/<tên>/`, gọi API qua `src/services/api.ts`, import dùng alias `@/`.
- **Dọn code:** xoá code thừa ngay (đừng comment-out code cũ, Git đã lưu lịch sử). Không `console.log` debug trong code commit (dùng logger/`console.warn|error` khi cần). Không commit file sinh ra (`dist`, `.next`, `node_modules`), file tạm, ảnh/asset không dùng.
- **Định dạng:** theo `.editorconfig` (UTF-8, LF, 2 space). Commit chỉ gồm thay đổi liên quan; commit dọn dẹp ghi rõ `chore: dọn code thừa (...)`.
- **Tên:** file backend `camelCase.js` hoặc `<resource>.<loại>.js`; component React `PascalCase.jsx|tsx`; hook `useXxx`; biến môi trường `UPPER_SNAKE_CASE` và phải có trong `.env.example`.

---

## 3. Cách chạy dự án (làm đúng thứ tự)

Yêu cầu: Node 20, Docker Desktop, Git. Cần Cloudinary (ảnh) và Gemini API key (miễn phí tại aistudio.google.com).

```bash
git clone <repo> && cd Nexus

npm run setup          # tạo .env từ .env.example + cài dependency cho cả 5 package
npm run infra:up       # MongoDB + Redis + PostgreSQL + Keycloak (TỰ import realm "shofy")
# sửa backend/.env: CLOUDINARY_*, GEMINI_API_KEY  (MONGO_URI, KEYCLOAK_* đã đúng sẵn)

(cd backend && npm run schema:ensure)   # 1 lần: gắn ràng buộc + chỉ mục vào MongoDB; chạy lại sau khi thêm model
npm run seed           # CẢNH BÁO: xoá sạch mọi collection rồi nạp dữ liệu mẫu
npm run dev            # chạy cùng lúc: api:4000, worker, store:3001, crm:8081, crm-ui:5173
```

| Mở | Địa chỉ |
|---|---|
| Storefront | http://localhost:3001 |
| CRM | http://localhost:8081 (đăng nhập Keycloak, dev tự chuyển sang http://localhost:5173; sau `npm run build` thì 8081 phục vụ luôn giao diện) |
| Swagger | http://localhost:4000/api-docs |
| Keycloak admin | http://localhost:8180 (admin / admin123) |

**Tài khoản dev** (từ realm import, chỉ dùng local): `admin`, `manager`, `staff`, `customer` — mật khẩu chung `123456`.

Chạy full bằng Docker: `docker compose up -d --build` (cần đủ 3 file `.env`).

Chatbot với Atlas Vector Search: làm theo `docs/guides/atlas-vector-index.md`, rồi `node backend/scripts/backfill-embeddings.js`. Không có Atlas thì chatbot tự fallback `$text`.

Kiểm tra trước khi push (hướng dẫn test thủ công đầy đủ: `docs/guides/huong-dan-test.md`):
```bash
npm test                          # Jest backend
cd frontend && npx playwright test   # E2E (cần app đang chạy)
cd crm/crm-ui && npx tsc --noEmit    # kiểm tra kiểu CRM
```

### Sự cố thường gặp
| Lỗi | Cách xử lý |
|---|---|
| Port bị chiếm | `npm run kill-ports` |
| 401 khi gọi API | Chưa đăng nhập Keycloak, hoặc secret trong `.env` khác `keycloak/realm-export.json` |
| Keycloak không có realm | Xoá volume: `docker compose down -v` rồi `npm run infra:up` (realm chỉ import khi DB Keycloak trống) |
| Mongo báo `Authentication failed` / backend không kết nối được MongoDB sau khi pull | Volume MongoDB cũ được tạo trước khi có xác thực nên không có user. Xoá riêng volume đó (mất dữ liệu local, nạp lại bằng `npm run seed`): `docker compose rm -sf mongodb` rồi `docker volume ls` tìm volume tên có `mongodata` và `docker volume rm <tên>`, sau đó `npm run infra:up`. Cập nhật `MONGO_URI` trong `backend/.env` và `crm/.env` theo `backend/.env.example` |
| Redis báo `NOAUTH`/không kết nối được | `REDIS_URL` trong `backend/.env` phải khớp mật khẩu Redis (`REDIS_PASS`, mặc định dev `redis_dev_password`). Worker/API vẫn chạy khi Redis tắt nhưng không xử lý được job; xem `docs/guides/redis-bullmq.md` mục 6 |
| Trang web toàn lỗi `500` (`buffering timed out after 10000ms`), `/user/profile` trả `401`, chậm ~10 giây | **Backend không kết nối được MongoDB** (không phải lỗi chậm của Express): mỗi truy vấn chờ 10 giây rồi lỗi. Kiểm tra `MONGO_URI` trong `backend/.env` có khớp container đang chạy không: `docker ps` xem container MongoDB, `docker exec <tên container> mongosh --eval "db.runCommand({ping:1})"`. Đúng cặp: MongoDB mới (có xác thực) dùng `MONGO_URI` có `nexus_app:...@...?authSource=admin&directConnection=true`; MongoDB cũ không xác thực dùng `mongodb://localhost:27017/<tên DB>`. `401` kèm `reason: "MongooseError"` cũng là lỗi DB, không phải token |
| Chatbot im lặng | Thiếu `GEMINI_API_KEY` hoặc công tắc AI Chatbot ở CRM → Settings đang tắt |

---

## 4. Quy ước làm việc nhóm

1. **Mỗi người làm trên nhánh riêng**: `feat/<tên>/<việc>` (vd. `feat/tan/menu-editor`). Mở Pull Request vào `main`, **ít nhất 1 người khác review** rồi mới merge. Đây vừa là kiểm soát chất lượng, vừa là **bằng chứng đóng góp cá nhân khi bảo vệ**.
2. Commit nhỏ, đúng một việc. Message dạng `feat(cms): ...`, `fix(cart): ...`, `docs: ...`, `test: ...`.
3. `main` luôn phải chạy được (`npm run dev` không lỗi, `npm test` xanh). Không commit `.env`, secret, `node_modules`.
4. Mỗi người chỉ sửa trong phần việc của mình. Cần sửa chỗ của người khác → nhắn người đó hoặc tạo issue.
5. Đụng vào **model Mongoose dùng chung** (`User`, `Order`, `Products`, `SiteSetting`) → báo cả nhóm trước, vì ảnh hưởng nhiều phần.
6. Chữ hiển thị trên storefront phải dùng `t("...")`, thêm key vào cả `en` và `vi`. Không hardcode ký hiệu tiền tệ.
7. **Code AI sinh ra vẫn là code của bạn.** Mỗi người phải tự đọc hiểu và giải thích được từng file mình phụ trách (xem mục 8).

---

## 5. Hiện trạng (ngày 18/11/2026)

Đã có sẵn và chạy tốt:
- Sản phẩm + biến thể, lọc/tìm kiếm phía server, wishlist, sổ địa chỉ, so sánh, đa tiền tệ.
- Checkout, coupon (10 điều kiện), COD, chuyển khoản + VietQR, VNPay (code có, chưa test E2E).
- Đơn hàng: `statusHistory`, `trackingNumber/carrier/trackingUrl`, email theo trạng thái.
- API nhà bán hàng đầy đủ: `/api/v1/vendor/*` (sản phẩm, đơn, fulfillment từng item, analytics, payouts) và admin duyệt nhà bán, hoa hồng, xử lý payout.
- CRM: Dashboard (analytics), Products, Categories, Orders, Users, Vendors, Coupons, Blog, Banners, Settings (General/Payment/Shipping/Tax), Activity Log, AI Chatbot analytics.
- Chatbot AI hoàn chỉnh (agent loop, RAG, 11 tool, guardrails, stream Socket.io, EN/VI, công tắc tắt).

**Còn thiếu / đã bị xoá, cần làm lại** (cơ sở của kế hoạch bên dưới):

| Thiếu | Hiện còn gì để tận dụng |
|---|---|
| Page/Menu: route admin + store, UI CRM, `BlockRenderer`, `DynamicMenu` | Model `Page`, `Menu`; 15 block component ở `frontend/src/components/cms/blocks/` (chưa có nơi nào render chúng) |
| UI mẫu email (list/edit/preview/test send) + route admin | Model `EmailTemplate`, `backend/utils/emailRenderer.js`, `emailTemplates/`, seed EN/VI |
| Duyệt đánh giá: route admin + trang CRM | Model `Review` (có `status`), `review.controller.getApprovedProductReviews`. Hiện đánh giá **tự duyệt** (`user.controller.addReview` đặt `status:'approved'`) |
| CRUD thương hiệu trong CRM | Model `Brand`, API đọc `/store/brands` |
| Cart API phía server | Model chưa có. Giỏ nằm ở `frontend/src/redux/features/cartSlice.js` (localStorage) |
| Vendor Dashboard UI + form đăng ký nhà bán | API `/vendor/*` và `POST /user/vendor/apply`; trang công khai `frontend/src/pages/vendor/[slug].jsx` |
| MoMo, tích hợp GHN/GHTK | `backend/services/paymentService.js` (stub MoMo/Stripe), model Order đã có trường tracking |
| UI phân quyền staff trong CRM | API `/admin/staff`, middleware `authorization.js` |

---

## 6. Phân công và checklist từng người

Ký hiệu: **P0** bắt buộc · **P1** nên làm · **P2** làm nếu còn thời gian. Mỗi mục xong phải có PR + test + Swagger. Tick `[x]` vào đây khi xong (sửa file này trong PR của chính việc đó).

### 6.1 Phạm Ngọc Tân — Admin Panel & CMS
Phạm vi: `crm/`, `backend/controllers/v1/cms.controller.js`, `admin.controller.js`.

- [ ] **P0** CRUD **thương hiệu**: route `/api/v1/admin/brands`, Joi, trang `crm-ui/src/features/brands/BrandsPage.tsx` (upload logo qua Cloudinary).
- [ ] **P0** **Menu editor**: route admin `/menus` (CRUD) + store `GET /store/menus/:location`; trang CRM dạng cây (kéo-thả); storefront `DynamicMenu` đọc menu, fallback sang danh mục. Model: `backend/model/Menu.js`.
- [ ] **P0** **Homepage builder**: route admin `/pages` (CRUD, publish) + store `GET /store/pages/:slug`; trang CRM: thêm/xoá/sắp xếp/bật-tắt block, sửa cấu hình từng block; storefront `BlockRenderer` map `blockType` → component trong `components/cms/blocks/`, trang chủ SSR dùng nó (fallback layout cứng nếu chưa có page). Model: `backend/model/Page.js`.
- [ ] **P0** **UI mẫu email**: route admin `/email-templates` (list/get/update/preview/test-send); trang CRM có editor, danh sách merge tag, preview EN/VI, gửi thử. Dùng `utils/emailRenderer.js`.
- [ ] **P1** **Theme tối thiểu**: màu chủ đạo, logo, favicon lưu trong `SiteSetting`, storefront đọc qua `/store/settings`.
- [ ] **P1** **Phân quyền CRM**: ẩn menu/nút theo role (admin/manager/staff/shipper), trang quản lý staff (API `/admin/staff` đã có).
- [ ] **P1** Viết `docs/guides/admin-guide.md` (có ảnh chụp màn hình).

### 6.2 Tài — Client: User & Product
Phạm vi: `frontend/` (trang chủ, danh mục, chi tiết SP, auth, profile, search, wishlist).

- [ ] **P0** **Rebrand Shofy → NexusMart** trên toàn repo: logo, title/meta SEO, i18n, footer, JSON-LD, tên package/container Docker, theme Keycloak (`keycloak/themes/`), realm name và client id nếu đổi (đổi cả `.env.example`, realm-export, CI). Phần hạ tầng (DB, container, image CI) đã đổi sang `nexusmart`; realm, client và theme Keycloak giữ tên `shofy`; còn lại là giao diện (logo, chữ hiển thị, SEO).
- [ ] **P0** **Form "Trở thành nhà bán hàng"** trong trang profile (gọi `POST /api/v1/user/vendor/apply`; hiển thị pending/rejected/approved) và hoàn thiện trang shop nhà bán `pages/vendor/[slug].jsx`.
- [ ] **P0** Rà luồng đăng ký/đăng nhập/quên mật khẩu/Google qua Keycloak, sửa lỗi.
- [ ] **P1** Trang danh mục: lọc theo biến thể (màu/size), filter lưu trên URL, phân trang server, skeleton loading.
- [ ] **P1** Lighthouse ≥ 85 (ảnh Cloudinary responsive, lazy load), kiểm tra mobile.
- [ ] **P1** Playwright E2E: đăng ký, đăng nhập, tìm kiếm, lọc, wishlist.

### 6.3 Tuấn Đặng — Client: Cart & Checkout
Phạm vi: giỏ hàng, checkout, coupon; `frontend/src/redux/features/cartSlice.js`, `components/checkout/`, `backend` (cart).

- [ ] **P0** **Cart API phía server**: model `Cart` (`userId`, `items[{product, variantId, quantity, priceSnapshot}]`), `GET/POST/PATCH/DELETE /api/v1/user/cart`, kiểm tra tồn kho và trạng thái sản phẩm.
- [ ] **P0** Storefront: khi đã đăng nhập dùng RTK Query cho giỏ; **merge giỏ localStorage → server** khi login; khách vãng lai vẫn dùng localStorage.
- [ ] **P0** **Server tính tổng tiền**: tạm tính, giảm giá coupon, phí ship theo Shipping Settings, thuế theo Tax Settings. Client không được gửi giá lên để tin.
- [ ] **P1** Coupon: hiển thị rõ lý do không áp dụng; hết lượt; nhiều điều kiện.
- [ ] **P1** Chatbot `proposeAddToCart` gọi Cart API thật (phối hợp Tiệp).
- [ ] **P1** Hỗ trợ Thái: trang **Đơn hàng** và **Rút tiền** của Vendor Dashboard (mục 6.4).
- [ ] **P1** Jest cho cart + checkout; Playwright: thêm giỏ → checkout → đặt hàng COD.

### 6.4 Thái — Client: Order, Payment & Vendor
Phạm vi: đơn hàng, thanh toán, nhà bán; `backend/services/paymentService.js`, `utils/vnpay.js`, `routes/v1/vendor`, `routes/v1/payment.js`.

- [ ] **P0** **Vendor Dashboard UI**. Làm trong `crm/crm-ui` cho role `vendor` (tái sử dụng Ant Design): Tổng quan (`/vendor/analytics/*`), Sản phẩm (CRUD), Đơn hàng (cập nhật fulfillment từng item) — Tuấn hỗ trợ, Rút tiền + lịch sử payout — Tuấn hỗ trợ, Hồ sơ shop. CRM server cần proxy `/api/vendor/*`.
- [ ] **P0** **VNPay sandbox E2E**: tạo URL → return → IPN cập nhật `paymentStatus`; xử lý sai checksum, huỷ, hết hạn. Script thử: `backend/scripts/test-vnpay-flow.js`.
- [ ] **P0** Trang lịch sử đơn hàng + theo dõi vận chuyển trên storefront chạy đúng với mọi trạng thái.
- [ ] **P1** **MoMo sandbox** (thay stub trong `paymentService.js`, thêm webhook IPN, bật nút trên checkout).
- [ ] **P1** **Tích hợp GHN hoặc GHTK sandbox**: tính phí khi checkout, tạo vận đơn khi admin xác nhận, nhận webhook cập nhật `statusHistory`.
- [ ] **P2** Stripe (chỉ nếu còn thời gian). Test đơn nhiều nhà bán (tách đơn con, tính hoa hồng).

### 6.5 Tiệp — Client: AI Chatbot & Review
Phạm vi: `backend/services/chatbot/`, `frontend/src/components/chatbot/`, review.

- [ ] **P0** **Duyệt đánh giá**: `user.controller.addReview` đặt `status:'pending'`; route admin `/reviews` (list lọc status/rating, approve, reject kèm lý do, reply, delete); trang CRM `features/reviews/ReviewsPage.tsx` (thống kê + bulk action); storefront chỉ hiện review `approved`, giữ huy hiệu "đã mua hàng", báo "đang chờ duyệt" cho người gửi.
- [ ] **P0** Dựng **Atlas Vector Search** thật + chạy `backfill-embeddings.js`; đo chất lượng tìm kiếm.
- [ ] **P0** **Bộ kiểm thử chatbot có số liệu**: ≥ 30 kịch bản EN/VI (tìm SP, tra đơn, coupon, chính sách, ngoài phạm vi, prompt injection). Ghi kết quả (đúng/sai, độ trễ) vào `docs/report/chatbot-eval.md` để đưa vào báo cáo.
- [ ] **P1** Chuyển rate-limit + embed queue sang Redis/BullMQ (Redis, BullMQ và worker đã có sẵn, xem `docs/guides/redis-bullmq.md`).
- [ ] **P1** Gemini tự đánh dấu review có nội dung xấu để admin ưu tiên duyệt.
- [ ] **P2** Gợi ý sản phẩm dựa trên lịch sử xem/wishlist.

---

## 7. Lộ trình

| Tuần | Mục tiêu |
|---|---|
| **1** | Cả nhóm chạy được hệ thống trên máy mình (mục 3). Tạo nhánh. Tài rebrand. Tân bắt đầu Brand + Menu. Tuấn bắt đầu Cart API. Thái bắt đầu Vendor UI + VNPay. Tiệp làm duyệt review + Atlas |
| **2** | Cart API xong + merge giỏ. Form nhà bán (Tài). Menu editor xong. Vendor UI: Tổng quan + Sản phẩm |
| **3** | Homepage builder. UI mẫu email. Vendor UI: Đơn + Rút tiền. VNPay E2E xong. Chatbot eval |
| **4** | MoMo, GHN/GHTK. Server tính tổng tiền. Theme + phân quyền CRM. Playwright E2E |
| **5** | Hoàn thiện, sửa lỗi, tối ưu, tài liệu (`ADMIN_GUIDE`, cập nhật báo cáo + sơ đồ), quay video demo, tập vấn đáp |

Cuối mỗi tuần: họp 30 phút, mỗi người demo phần mình trên nhánh `main`.

---

## 8. Hoàn thành một việc nghĩa là gì (Definition of Done)

- Chạy được trên `main` sau `npm run setup` + `npm run seed` + `npm run dev`.
- Có validate Joi, chú thích Swagger, test Jest cho backend; `tsc --noEmit` sạch cho CRM.
- Có i18n EN/VI cho chữ mới; không hardcode tiền tệ.
- Có PR đã được ít nhất 1 người review. Đã tick mục tương ứng trong file này.

## 9. Chuẩn bị bảo vệ

- Hội đồng sẽ hỏi **từng người** về phần của mình: luồng gọi API, middleware xác thực JWT, schema MongoDB, vì sao thiết kế như vậy.
- Repo fork từ template và có hỗ trợ AI. Hãy sẵn sàng nói rõ **phần nào là template, phần nào nhóm tự làm** (bảng mục 5 và các mục P0 ở mục 6 là phần tự làm). Lịch sử Git theo nhánh/PR của từng người là bằng chứng.
- Mỗi người chuẩn bị: sơ đồ luồng chính của mình (đã có 17 sơ đồ ở `docs/report/diagrams/`), số liệu test, và 3 điểm khó nhất đã gặp.
- Văn bản đề tài (`phancong.md`) cần sửa cho khớp mục 1: Gemini 2.5, Keycloak.

## 10. Tài liệu liên quan

Mục lục toàn bộ tài liệu: [docs/README.md](README.md). Tài liệu chỉ nằm trong thư mục `docs/` (trừ `README.md`, `CLAUDE.md`, `AGENTS.md` ở gốc và `CLAUDE.md` trong từng package).
