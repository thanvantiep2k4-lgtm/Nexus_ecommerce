# Hướng dẫn test các luồng chính — NexusMart

> Làm theo thứ tự từ trên xuống. Mỗi ca test có **bước làm** và **kết quả mong đợi**. Đúng thì tick `[x]`, sai thì ghi lại lỗi ở cột ghi chú (kèm ảnh chụp màn hình).
> Kết quả lần chạy gần nhất (18/11/2026) nằm ở [mục 6](#6-kết-quả-lần-chạy-1811-và-lỗi-đã-biết).

---

## 0. Chuẩn bị (≈10 phút)

### 0.1 Khởi động hệ thống
```bash
cd D:/DATN/Nexus
# Bật Docker Desktop trước, chờ biểu tượng cá voi chuyển xanh
npm run infra:up        # MongoDB + PostgreSQL + Keycloak
npm run seed            # nạp dữ liệu: 193 sản phẩm, coupon, blog (XOÁ dữ liệu cũ)
npm run dev             # api:4000, store:3001, crm:8081, crm-ui:5173
```
Đợi khoảng 1 phút cho tới khi terminal báo `ready` ở cả 4 dịch vụ.

> Nếu bị lỗi cổng: `npm run kill-ports` rồi `npm run dev` lại.
> Sau khi `npm run seed` lại, hãy **xoá giỏ hàng cũ** (giỏ đang trỏ tới sản phẩm đã bị xoá). Cách xoá: trình duyệt → F12 → Application → Local Storage → `localhost:3001` → xoá `cart_products`.

### 0.2 Kiểm tra nhanh mọi thứ đã chạy
| Mở | Mong đợi |
|---|---|
| http://localhost:3001 | Trang chủ NexusMart, logo chữ N 4 màu, tiếng Việt |
| http://localhost:4000/health | `{"ok":true,...}` |
| http://localhost:4000/api-docs | Swagger hiện danh sách API |
| http://localhost:8180 | Trang Keycloak |
| http://localhost:8081 | Chuyển sang trang đăng nhập "NexusMart CRM" |

### 0.3 Tài khoản test (mật khẩu chung `123456`)
| Vai trò | Đăng nhập ở đâu | Tên đăng nhập |
|---|---|---|
| Khách hàng | Storefront (form bắt buộc **email**) | `customer@nexusmart.local` |
| Quản trị | CRM | `admin` (hoặc `admin@nexusmart.local`) |
| Quản lý | CRM | `manager` |
| Nhân viên | CRM | `staff` |
| Quản trị Keycloak | http://localhost:8180/admin | `admin` / **`admin123`** |

> Khách và admin dùng chung SSO. Muốn đổi vai trò thì **đăng xuất trước** (CRM: nút Logout; hoặc mở cửa sổ ẩn danh cho vai trò thứ hai).

---

## 1. Test tự động (≈5 phút)

| # | Lệnh | Mong đợi |
|---|---|---|
| A1 | `cd backend && npm test` | `Tests: 94 passed, 94 total` |
| A2 | `cd crm/crm-ui && npx tsc -b --noEmit` | Không in lỗi |
| A3 | `cd frontend && npx playwright test` (cần `npm run dev` đang chạy) | 16–17 passed. Test "chatbot sends a message" chỉ pass khi có `GEMINI_API_KEY` |
| A4 | `npm run format:check` (thư mục gốc) | Không có file nào sai định dạng |

> A1 chạy 2 worker để tránh lỗi timeout chập chờn của MongoDB in-memory. Nếu một bộ test fail ngẫu nhiên, chạy riêng file đó: `npx jest tests/<tên-file>`.

---

## 2. Luồng khách hàng (Storefront)

### 2.1 Duyệt và tìm kiếm
- [ ] **K1 – Trang chủ.** Mở http://localhost:3001.
  → Hero lớn có mũi tên tròn trái/phải và chấm phân trang, tự chuyển slide sau ~5 giây; cột phải là thẻ "Deal hôm nay". Có mục "Ưu Đãi Tốt Nhất", "Mua Sắm Theo Danh Mục" (icon tròn), sản phẩm nhiều ngành (mỹ phẩm, đồ ăn, nội thất, đồng hồ...). Không có ảnh vỡ, không có giá âm.
- [ ] **K2 – Đổi ngôn ngữ.** Thanh trên cùng → "Tiếng Việt" → chọn English, rồi tải lại trang.
  → Giao diện chuyển tiếng Anh và giữ nguyên sau khi tải lại. Đổi lại Tiếng Việt.
- [ ] **K3 – Tìm kiếm.** Gõ `laptop` vào ô tìm kiếm → Enter.
  → Trang kết quả có các laptop (MacBook, Dell XPS, Asus Zenbook...).
- [ ] **K4 – Danh mục.** Bấm "Tất cả loại sản phẩm" → chọn một danh mục (ví dụ Giày nam).
  → Chỉ hiện sản phẩm thuộc danh mục đó.
- [ ] **K5 – Bộ lọc cửa hàng.** Mở http://localhost:3001/shop.
  - Chọn mức giá "1.000.000 ₫ đến 5.000.000 ₫" → mọi giá nằm trong khoảng này.
  - Bấm một thương hiệu ở "Thương hiệu nổi bật" → chỉ sản phẩm của thương hiệu đó.
  - Bấm "Thời trang" ở "Nhóm sản phẩm" → chỉ sản phẩm thời trang.
  - Đổi "Sắp xếp" sang "Giá: thấp đến cao" → giá tăng dần.
- [ ] **K6 – Chi tiết sản phẩm.** Bấm vào một sản phẩm.
  → Ảnh rõ nét, có ảnh phụ; giá đã giảm + giá gốc gạch ngang + nhãn `-X%`; các tab Mô tả / Thông tin thêm / Thông số / Đánh giá; khối "Sản phẩm liên quan".

### 2.2 Đăng nhập, đăng ký
- [ ] **K7 – Đăng nhập.** Bấm icon người dùng → Đăng nhập → nhập `customer@nexusmart.local` / `123456`.
  → Quay lại storefront, icon người dùng hiện menu tài khoản.
- [ ] **K8 – Nhập sai.** Đăng xuất, đăng nhập lại với mật khẩu sai.
  → Báo lỗi bằng tiếng Việt, không vào được.
- [ ] **K9 – Đăng ký.** Trang đăng nhập → "Đăng ký ngay" → tạo tài khoản mới bằng email bất kỳ.
  → Tạo được tài khoản và đăng nhập được.

### 2.3 Yêu thích, so sánh
- [ ] **K10 – Yêu thích.** Ở trang chi tiết bấm "Thêm vào yêu thích" → mở http://localhost:3001/wishlist.
  → Sản phẩm có trong danh sách. Bấm xoá → biến mất.
- [ ] **K11 – So sánh.** Thêm 2 sản phẩm vào so sánh → mở http://localhost:3001/compare.
  → Hiện bảng so sánh 2 sản phẩm.

### 2.4 Giỏ hàng và thanh toán (luồng quan trọng nhất)
- [ ] **K12 – Thêm vào giỏ.** Ở trang chi tiết, chỉnh số lượng 2 → "Thêm vào giỏ".
  → Số trên icon giỏ tăng; mini-cart hiện sản phẩm.
- [ ] **K13 – Trang giỏ hàng.** Mở http://localhost:3001/cart.
  → Đơn giá là **giá đã giảm**; Tạm tính = đơn giá × số lượng; tổng giỏ khớp tổng các dòng. Tăng/giảm số lượng thì tổng cập nhật. Đơn ≥ 500.000 ₫ hiện "đủ điều kiện miễn phí vận chuyển".
- [ ] **K14 – Mã giảm giá.** Ở thanh toán → "Nhấn để nhập mã" → nhập `TECH30` với giỏ có hàng điện tử ≥ 3.000.000 ₫.
  → Giảm 30% trên hàng điện tử. Thử với giỏ nhỏ hơn 3.000.000 ₫ → báo chưa đủ giá trị tối thiểu.
  > Mã có sẵn: `WELCOME5` (thời trang 5%), `SPORT12`, `HOME10`, `GLOW15`, `SPARKLE20`, `SUMMER25`, `TECH30`.
- [ ] **K15 – Thanh toán COD.** Bấm "Tiến hành thanh toán".
  → Nếu chưa đăng nhập: chuyển sang trang đăng nhập rồi **quay lại đúng trang thanh toán** (không bị lặp đăng nhập).
  → Điền họ tên, địa chỉ, quốc gia, khu vực, thành phố, mã bưu điện, email, SĐT → chọn "Thanh toán khi nhận hàng" → "Đặt hàng".
  → Chuyển sang trang **Chi tiết đơn hàng #10xx**; tổng tiền = tổng ở trang thanh toán; giỏ hàng được làm trống.
- [ ] **K16 – Chuyển khoản.** Đặt thêm một đơn, chọn "Chuyển khoản".
  → Hiện thông tin tài khoản demo (Vietcombank, 0123456789, NEXUSMART DEMO) và nội dung chuyển khoản `NEXUS-<mã đơn>`. Đơn ở trạng thái "Chưa thanh toán".
- [ ] **K17 – VNPay.** Chọn VNPay → Đặt hàng.
  → **Hiện chưa chạy được**: cần điền `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET` (đăng ký sandbox tại https://sandbox.vnpayment.vn) vào `backend/.env`. Khi đã có key: chuyển sang cổng VNPay sandbox, thanh toán thẻ test → quay về, đơn chuyển "Đã thanh toán".

### 2.5 Sau khi mua
- [ ] **K18 – Lịch sử đơn.** Mở http://localhost:3001/profile → tab Đơn hàng.
  → Có các đơn vừa đặt với đúng tổng tiền và trạng thái.
- [ ] **K19 – Tra cứu đơn (không cần đăng nhập).** Mở http://localhost:3001/track-order → nhập mã đơn (ví dụ `1001`) + email.
  → Hiện trạng thái đơn và dòng thời gian.
- [ ] **K20 – Địa chỉ.** Profile → Sổ địa chỉ → thêm địa chỉ, đặt mặc định.
  → Lần thanh toán sau, địa chỉ đã lưu xuất hiện để chọn nhanh.

### 2.6 Nội dung và chatbot
- [ ] **K21 – Blog.** Mở http://localhost:3001/blog → mở một bài.
  → Danh sách 6 bài; trang chi tiết hiện nội dung.
- [ ] **K22 – Chatbot AI.** Bấm bong bóng chat góc phải dưới → gõ "Tìm tai nghe dưới 3 triệu".
  → **Cần `GEMINI_API_KEY`** trong `backend/.env` (lấy miễn phí ở https://aistudio.google.com/apikey). Khi có key: bot trả lời tiếng Việt kèm thẻ gợi ý sản phẩm; bấm "Thêm vào giỏ" trên thẻ → sản phẩm vào giỏ. Không có key: bot báo "I'm having trouble right now" (đây là hành vi dự kiến).

### 2.7 Giao diện và mobile
- [ ] **K23 – Mobile.** F12 → bật chế độ thiết bị (Ctrl+Shift+M) → iPhone 12/13.
  → Không bị cuộn ngang toàn trang; hero xếp dọc (ảnh trên, chữ dưới); các dải sản phẩm cuộn ngang được bằng tay.

---

## 3. Luồng quản trị (CRM)

> Đăng xuất tài khoản khách trước, hoặc dùng cửa sổ ẩn danh.

- [ ] **Q1 – Phân quyền.** Đang đăng nhập bằng `customer`, mở http://localhost:8081.
  → Chuyển sang trang "Không có quyền" (đúng: khách không vào được CRM).
- [ ] **Q2 – Đăng nhập admin.** Mở http://localhost:8081/logout → đăng nhập `admin` / `123456`.
  → Vào Dashboard có biểu đồ doanh thu, sản phẩm bán chạy.
- [ ] **Q3 – Đơn hàng.** Menu Orders.
  → Thấy các đơn vừa đặt ở mục 2 (tên khách, tổng tiền, COD, Unpaid, Pending).
- [ ] **Q4 – Đổi trạng thái.** Ở đơn vừa đặt → Status → Shipped. Sau đó Delivered.
  → Trạng thái đổi ngay. Quay lại storefront (K18/K19) → đơn hiện "Đang giao"/"Đã giao", dòng thời gian cập nhật.
- [ ] **Q5 – Sản phẩm.** Menu Products → thêm một sản phẩm mới (có ảnh) → lưu.
  → Sản phẩm xuất hiện trong danh sách, tìm thấy trên storefront. Sửa giá → storefront đổi giá. Xoá → biến mất.
  > Upload ảnh cần cấu hình `CLOUDINARY_*` trong `backend/.env`.
- [ ] **Q6 – Danh mục.** Menu Categories → thêm danh mục mới.
  → Hiện trong menu "Tất cả loại sản phẩm" của storefront.
- [ ] **Q7 – Mã giảm giá.** Menu Coupons → tạo mã `TEST50` giảm 50%.
  → Dùng được ở bước K14.
- [ ] **Q8 – Banner, Blog.** CMS → Banners: sửa tiêu đề một banner hero. CMS → Blog: tạo và xuất bản một bài.
  → Storefront cập nhật banner; bài mới hiện ở /blog.
- [ ] **Q9 – Cài đặt.** Settings → General: tắt AI Chatbot → storefront không còn bong bóng chat. Bật lại.
  Settings → Payment: bỏ "Chuyển khoản" → trang thanh toán chỉ còn COD và VNPay.
- [ ] **Q10 – Người dùng, nhà bán.** Users: thấy `customer`. Vendors: xem danh sách và chi tiết nhà bán.
- [ ] **Q11 – Nhật ký hoạt động.** Activity Log.
  → Có dòng ghi lại thao tác đổi trạng thái ở Q4.
- [ ] **Q12 – Phân quyền staff.** Đăng xuất, đăng nhập `staff`.
  → Xem được Dashboard, Orders; các thao tác chỉ dành cho admin/manager (xoá, sửa cài đặt) bị chặn.

---

## 4. Luồng bảo mật, lỗi

- [ ] **B1 – API cần đăng nhập.** Mở http://localhost:4000/api/v1/user/orders khi chưa đăng nhập.
  → Trả 401.
- [ ] **B2 – API admin.** Dùng token của `customer` gọi `/api/v1/admin/orders` (Swagger → Authorize).
  → Trả 403.
- [ ] **B3 – Trang không tồn tại.** Mở http://localhost:3001/abc-xyz.
  → Trang 404 có header, footer NexusMart.

---

## 5. Ghi lỗi

Ghi mỗi lỗi một dòng vào bảng sau (hoặc tạo GitHub Issue):

| Mã ca test | Mô tả lỗi | Các bước tái hiện | Ảnh | Người phụ trách (theo PROJECT_PLAN) |
|---|---|---|---|---|
| | | | | |

---

## 6. Kết quả lần chạy 18/11 và lỗi đã biết

### 6.1 Kết quả
| Hạng mục | Kết quả |
|---|---|
| Backend Jest | ✅ 94/94 |
| CRM TypeScript | ✅ không lỗi |
| CRM ESLint | ⚠️ 26 lỗi luật `react-hooks` (code cũ, chưa ảnh hưởng chạy) |
| E2E Playwright | ✅ 16/17 (1 test chatbot cần Gemini key) |
| Tìm kiếm → chi tiết → giỏ → thanh toán COD → đơn #1001 | ✅ tổng tiền đúng (giá đã giảm) |
| Admin đổi trạng thái đơn → khách tra cứu thấy cập nhật | ✅ |
| Mã giảm giá (đủ / không đủ điều kiện) | ✅ |
| Khách vào CRM bị chặn | ✅ |
| Tất cả trang storefront trả 200 | ✅ |

### 6.2 Lỗi đã sửa trong lần chạy này
- Test chatbot dùng tên class cũ (`shofy-chat`) → đã đổi sang `nx-chat`.
- Jest fail ngẫu nhiên do chạy quá nhiều MongoDB in-memory song song → giới hạn 2 worker.
- Chi tiết đơn hiện giá gốc ở từng dòng → đã hiện giá đã giảm; "Order status: pending" → "Trạng thái: Chờ xác nhận".
- Tên sản phẩm bị lặp "Laptop ... Laptop" → đã sửa trong seed.
- Thiếu mã giảm giá và bài blog sau khi seed → `npm run seed` giờ nạp cả coupon và blog.
- Thiếu biến `VNPAY_*` trong `backend/.env.example` → đã bổ sung.

### 6.3 Lỗi / thiếu sót còn lại
| Mức | Vấn đề | Người phụ trách |
|---|---|---|
| Cao | Backend **tin tổng tiền do client gửi** khi tạo đơn (có thể sửa giá ở trình duyệt) | Tuấn |
| Cao | VNPay chưa có key sandbox, chưa test được trọn luồng; MoMo vẫn là stub | Thái |
| Cao | Chưa có giao diện nhà bán hàng và form đăng ký nhà bán | Thái, Tài |
| TB | Chatbot chưa chạy thật vì thiếu `GEMINI_API_KEY` | 505 |
| TB | Đánh giá sản phẩm tự duyệt, chưa có trang duyệt | 505 |
| TB | CRM giao diện còn tiếng Anh; ESLint 26 lỗi | Tân |
| TB | Giỏ hàng chỉ lưu trên trình duyệt: seed lại dữ liệu thì giỏ cũ trỏ tới sản phẩm không còn (ra trang 404) | Tuấn |
| Thấp | `statusHistory` của đơn không ghi mốc "pending" ban đầu; nhật ký hoạt động ghi `resourceType` = undefined | Thái, Tân |
| Thấp | Tên sản phẩm mới Việt hoá một phần; bài blog tiếng Anh; nhãn "ELECTRONICS" và ngày dạng "18 Nov, 2026" ở chi tiết đơn | Tài |
| Thấp | Đơn mẫu #1000 trong dữ liệu seed cũ có giá USD (290 ₫) | Tân |
