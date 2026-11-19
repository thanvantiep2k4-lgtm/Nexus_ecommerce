# Hướng dẫn test các luồng chính — NexusMart

> Làm theo thứ tự từ trên xuống. Mỗi ca test có **bước làm** và **kết quả mong đợi**. Đúng thì tick `[x]`, sai thì ghi lại lỗi ở cột ghi chú (kèm ảnh chụp màn hình).
> Kết quả các lần chạy gần nhất nằm ở [mục 7](#7-kết-quả-các-lần-chạy-và-lỗi-đã-biết).

---

## 0. Chuẩn bị (≈10 phút)

### 0.1 Khởi động hệ thống
```bash
cd D:/DATN/Nexus
# Bật Docker Desktop trước, chờ biểu tượng cá voi chuyển xanh
npm run infra:up        # MongoDB + PostgreSQL + Keycloak
npm run seed            # nạp dữ liệu: 193 sản phẩm, coupon, blog (XOÁ dữ liệu cũ)
npm run dev             # api:4000, store:3001, crm:8081, crm-ui:5173

# (Tuỳ chọn, nên làm trước khi demo) nạp dữ liệu lịch sử để dashboard có số liệu
cd backend && node scripts/seed-demo-history.js
```
Đợi khoảng 1 phút cho tới khi terminal báo `ready` ở cả 4 dịch vụ.

> Nếu bị lỗi cổng: `npm run kill-ports` rồi `npm run dev` lại.

**Dữ liệu demo (`seed-demo-history.js`)** chỉ *thêm* dữ liệu, không xoá gì:
- 454 đơn hàng từ tháng 5 → nay, đủ các trạng thái và phương thức thanh toán
- 45 khách hàng (chỉ có trong DB, không đăng nhập được)
- 5 nhà bán đang hoạt động, mỗi nhà bán 10–16 sản phẩm; 2 đơn đăng ký chờ duyệt; 1 đơn bị từ chối
- Thanh toán định kỳ cho nhà bán hàng tháng

Chạy lần thứ 2 thì script tự bỏ qua. Gỡ sạch: `node scripts/seed-demo-history.js --rollback`.

> ⚠️ `npm run seed` **xoá toàn bộ** dữ liệu, kể cả dữ liệu demo và hồ sơ cửa hàng của `vendor@nexusmart.local` (tài khoản Keycloak vẫn còn). Sau khi seed lại, chạy lại `seed-demo-history.js` rồi duyệt lại nhà bán (luồng N1–N4).

**Keycloak (chỉ cần làm 1 lần trên mỗi máy)**: realm phải có role `vendor`, và client `shofy-crm` phải có scope `basic`, `email`, `profile`, `roles`. Hai cấu hình này đã có trong `keycloak/realm-export.json` mới, nên nếu realm được import lại từ file đó thì không cần làm gì. Nếu dùng realm cũ:
- Role `vendor` sẽ tự được tạo ở lần duyệt nhà bán đầu tiên.
- Scope phải thêm tay: Keycloak admin → realm `shofy` → Clients → `shofy-crm` → Client scopes → Add client scope → chọn `basic`, `email`, `profile`, `roles` (Default).

Thiếu scope thì mọi người dùng CRM bị backend nhận nhầm thành một user khác (ví dụ trang nhà bán hiện "Paul R. Bruns" và 0 sản phẩm).
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
| Nhà bán (đã duyệt, cửa hàng "Demo Tech Store") | CRM → Kênh người bán | `vendor@nexusmart.local` (bắt buộc dùng email) |
| Quản trị Keycloak | http://localhost:8180/admin | `admin` / **`admin123`** |

> Khách, nhà bán và admin dùng chung SSO. Muốn đổi vai trò thì **đăng xuất trước** (CRM: nút Logout; hoặc mở cửa sổ ẩn danh cho vai trò thứ hai).

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
  → Đơn giá là **giá đã giảm**; Tạm tính = đơn giá × số lượng; tổng giỏ khớp tổng các dòng. Tăng/giảm số lượng thì tổng cập nhật.
  → **Vận chuyển:** đơn < 500.000 ₫ **không có** lựa chọn "Miễn phí", mặc định là "Phí cố định 20.000 ₫" và hiện dòng "Mua thêm X ₫ để được miễn phí vận chuyển". Tăng số lượng cho vượt 500.000 ₫ → tự chuyển sang "Miễn phí". Giảm xuống dưới ngưỡng → tự quay về phí cố định. Lựa chọn được giữ khi tải lại trang và khớp với trang thanh toán.
- [ ] **K14 – Mã giảm giá.** Ở thanh toán → "Nhấn để nhập mã" → nhập `TECH30` với giỏ có hàng điện tử ≥ 3.000.000 ₫.
  → Giảm 30% trên hàng điện tử. Thử với giỏ nhỏ hơn 3.000.000 ₫ → báo chưa đủ giá trị tối thiểu.
  > Mã có sẵn: `WELCOME5` (thời trang 5%), `SPORT12`, `HOME10`, `GLOW15`, `SPARKLE20`, `SUMMER25`, `TECH30`.
- [ ] **K15 – Thanh toán COD.** Bấm "Tiến hành thanh toán".
  → Nếu chưa đăng nhập: chuyển sang trang đăng nhập rồi **quay lại đúng trang thanh toán** (không bị lặp đăng nhập).
  → **Lần đầu (chưa có địa chỉ):** họ tên, email, quốc gia (Việt Nam) đã được điền sẵn từ tài khoản. Điền nốt địa chỉ, thành phố, mã bưu điện, SĐT. Bỏ trống ô bắt buộc → báo lỗi tiếng Việt ("Vui lòng nhập...").
  → Khung "Tổng quan đơn hàng" có bộ chọn phương thức vận chuyển (giống trang giỏ) → chọn "Thanh toán khi nhận hàng" → "Đặt hàng".
  → Chuyển sang trang **Chi tiết đơn hàng #xxxx**; tổng tiền (gồm phí vận chuyển) = tổng ở trang thanh toán; giỏ hàng được làm trống.
  → **Lần sau:** thêm hàng rồi vào lại trang thanh toán → mọi ô được tự điền, địa chỉ vừa dùng đã tự lưu vào Sổ địa chỉ và được chọn sẵn làm mặc định.
- [ ] **K16 – Chuyển khoản.** Đặt thêm một đơn, chọn "Chuyển khoản".
  → Hiện thông tin tài khoản demo (Vietcombank, 0123456789, NEXUSMART DEMO) và nội dung chuyển khoản `NEXUS-<mã đơn>`. Đơn ở trạng thái "Chưa thanh toán".
- [ ] **K17 – VNPay.** Chọn VNPay → Đặt hàng.
  → **Hiện chưa chạy được**: cần điền `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET` (đăng ký sandbox tại https://sandbox.vnpayment.vn) vào `backend/.env`. Khi đã có key: chuyển sang cổng VNPay sandbox, thanh toán thẻ test → quay về, đơn chuyển "Đã thanh toán".

### 2.5 Sau khi mua
- [ ] **K18 – Lịch sử đơn.** Mở http://localhost:3001/profile → tab Đơn hàng.
  → Có các đơn vừa đặt với đúng tổng tiền và trạng thái.
- [ ] **K19 – Tra cứu đơn (không cần đăng nhập).** Mở http://localhost:3001/track-order → nhập mã đơn (ví dụ `1001` hoặc `#1001`, hoặc mã dạng `NM...`) + email đặt hàng (không phân biệt hoa thường).
  → Hiện trạng thái đơn, thanh tiến trình, ngày dự kiến giao, đơn vị vận chuyển và dòng thời gian (ngày giờ dạng `HH:mm DD/MM/YYYY`). Đơn đã huỷ hiện khung đỏ "Đơn hàng này đã bị huỷ" thay cho thanh tiến trình. Sai email → "Không tìm thấy đơn hàng".
  > Với dữ liệu demo: lấy mã đơn và email bất kỳ ở trang Đơn hàng của CRM.
- [ ] **K20 – Địa chỉ.** Profile → Sổ địa chỉ → thêm địa chỉ, đặt mặc định.
  → Lần thanh toán sau, địa chỉ đã lưu xuất hiện để chọn nhanh.

### 2.6 Nội dung và chatbot
- [ ] **K21 – Blog.** Mở http://localhost:3001/blog → mở một bài.
  → Danh sách 6 bài; trang chi tiết hiện nội dung.
- [ ] **K22 – Chatbot AI.** Bấm bong bóng chat góc phải dưới → gõ "Tìm tai nghe dưới 3 triệu".
  → **Cần `GEMINI_API_KEY`** trong `backend/.env` (lấy miễn phí ở https://aistudio.google.com/apikey). Khi có key: bot trả lời tiếng Việt kèm thẻ gợi ý sản phẩm; bấm "Thêm vào giỏ" trên thẻ → sản phẩm vào giỏ. Không có key: bot báo "I'm having trouble right now" (đây là hành vi dự kiến).

### 2.7 Giao diện và mobile
- [ ] **K22b – Trang Liên hệ đã ẩn.** Thanh menu, footer và menu mobile không còn mục "Hỗ trợ khách hàng / Trung tâm trợ giúp / Liên hệ" (trang `/contact` chưa hoàn thiện nên tạm ẩn, cũng đã bỏ khỏi sitemap).
- [ ] **K23 – Mobile.** F12 → bật chế độ thiết bị (Ctrl+Shift+M) → iPhone 12/13.
  → Không bị cuộn ngang toàn trang; hero xếp dọc (ảnh trên, chữ dưới); các dải sản phẩm cuộn ngang được bằng tay.

---

## 3. Luồng quản trị (CRM)

> Đăng xuất tài khoản khách trước, hoặc dùng cửa sổ ẩn danh.

- [ ] **Q1 – Phân quyền.** Đang đăng nhập bằng `customer`, mở http://localhost:8081.
  → Chuyển sang trang "Không có quyền" (đúng: khách không vào được CRM).
- [ ] **Q2 – Đăng nhập admin.** Mở http://localhost:8081/logout → đăng nhập `admin` / `123456`.
  → Vào trang Tổng quan, có biểu đồ doanh thu, sản phẩm bán chạy.
- [ ] **Q3 – Đơn hàng.** Menu Đơn hàng.
  → Thấy các đơn vừa đặt ở mục 2 (tên khách, tổng tiền, COD, Chưa thanh toán, Chờ xử lý). Với dữ liệu demo: có hơn 450 đơn, phân trang và lọc theo trạng thái được.
- [ ] **Q4 – Đổi trạng thái.** Ở đơn vừa đặt → Trạng thái → Đang giao. Sau đó chọn Đã giao.
  → Trạng thái đổi ngay. Quay lại storefront (K18/K19) → đơn hiện "Đang giao"/"Đã giao", dòng thời gian cập nhật.
- [ ] **Q5 – Sản phẩm.** Menu Sản phẩm → thêm một sản phẩm mới (có ảnh) → lưu.
  → Sản phẩm xuất hiện trong danh sách, tìm thấy trên storefront. Sửa giá → storefront đổi giá. Xoá → biến mất.
  > Upload ảnh cần cấu hình `CLOUDINARY_*` trong `backend/.env`.
- [ ] **Q6 – Danh mục.** Menu Danh mục → thêm danh mục mới.
  → Hiện trong menu "Tất cả loại sản phẩm" của storefront.
- [ ] **Q7 – Mã giảm giá.** Menu Mã giảm giá → tạo mã `TEST50` giảm 50%.
  → Dùng được ở bước K14.
- [ ] **Q8 – Banner, Blog.** CMS → Banner: sửa tiêu đề một banner hero. CMS → Blog: tạo và xuất bản một bài.
  → Storefront cập nhật banner; bài mới hiện ở /blog.
- [ ] **Q9 – Cài đặt.** Cài đặt → Chung: tắt Trợ lý AI → storefront không còn bong bóng chat. Bật lại.
  Cài đặt → Thanh toán: bỏ "Chuyển khoản" → trang thanh toán chỉ còn COD và VNPay.
- [ ] **Q10 – Người dùng.** Người dùng: thấy `customer` và các khách demo. Có 1 tài khoản demo bị khoá. Vai trò hiện tiếng Việt (Khách hàng, Nhà bán, Quản trị viên...).
  → Phần duyệt nhà bán xem [mục 4](#4-luồng-nhà-bán-vendor).
- [ ] **Q11 – Nhật ký hoạt động.** Menu Nhật ký hoạt động.
  → Có dòng ghi lại thao tác đổi trạng thái ở Q4.
- [ ] **Q12 – Phân quyền staff.** Đăng xuất, đăng nhập `staff`.
  → Xem được Tổng quan và Đơn hàng; các thao tác chỉ dành cho admin/manager (xoá, sửa cài đặt) bị chặn.

- [ ] **Q13 – Giao diện tiếng Việt.** Đi qua tất cả các menu.
  → Menu, tiêu đề, bảng, nút, thông báo, phân trang và lịch chọn ngày đều tiếng Việt. Trạng thái hiện bằng nhãn (Chờ xử lý, Đang giao, Đã giao...), không còn mã tiếng Anh.

---

## 4. Luồng nhà bán (vendor)

Luồng đầy đủ: **khách gửi đơn đăng ký → admin duyệt → nhà bán đăng nhập Kênh người bán → đăng sản phẩm → khách mua → nhà bán xử lý đơn**.

> Nên dùng **tài khoản mới đăng ký ở K9** để gửi đơn. Sau khi được duyệt, tài khoản đó trở thành nhà bán vĩnh viễn, nên đừng dùng `customer@nexusmart.local`.
> Muốn xem nhanh mà không đi lại luồng đăng ký: đăng nhập thẳng CRM bằng `vendor@nexusmart.local` và bắt đầu từ N5.

### 4.1 Đăng ký làm nhà bán (Storefront)
- [ ] **N1 – Form đăng ký.** Đăng nhập storefront bằng tài khoản mới → Tài khoản → tab **"Trở thành nhà bán"** (hoặc mở http://localhost:3001/profile?tab=vendor).
  → Có khung 3 lợi ích, form Tên cửa hàng*, Mô tả, Tài khoản nhận thanh toán (ngân hàng, chi nhánh, số tài khoản, chủ tài khoản).
  - Để trống tên cửa hàng rồi bấm Gửi → báo "Tên cửa hàng phải từ 2–100 ký tự".
- [ ] **N2 – Gửi đơn.** Điền tên cửa hàng (ví dụ `Cửa Hàng Test`) → Gửi đăng ký.
  → Thông báo "Đã gửi đăng ký!". Tab chuyển sang thẻ **"Đang chờ duyệt"** có tên cửa hàng. Tải lại trang thì trạng thái vẫn giữ. Gửi lại lần nữa (qua API) → báo đã có đơn đang chờ.

### 4.2 Admin duyệt (CRM)
- [ ] **N3 – Danh sách chờ duyệt.** Đăng nhập CRM bằng `admin` → menu **Nhà bán**.
  → Thấy `Cửa Hàng Test` ở trạng thái Chờ duyệt. Với dữ liệu demo còn có "Bách Hoá Xanh Mini", "Đồng Hồ Cổ Điển" (chờ duyệt) và "Shop Giá Sốc 99k" (bị từ chối, có lý do). Thống kê đầu trang đếm đúng theo trạng thái.
  → Người dùng thường chưa đăng ký **không** xuất hiện trong danh sách này.
- [ ] **N4 – Duyệt.** Bấm Duyệt ở `Cửa Hàng Test` → xác nhận.
  → Trạng thái chuyển "Đã duyệt". Keycloak admin → Users → tài khoản đó → Role mapping có role `vendor`.
  - Thử thêm: Từ chối một đơn khác (nhập lý do) → storefront của người đó hiện "Bị từ chối" + lý do + nút "Đăng ký lại".

### 4.3 Kênh người bán (CRM)
- [ ] **N5 – Đăng nhập nhà bán.** Ở storefront **đăng xuất rồi đăng nhập lại** (để token có role `vendor`) → tab "Trở thành nhà bán" hiện "Đã duyệt" + nút **"Mở Kênh người bán"** → bấm.
  → Vào CRM với menu riêng gồm 4 mục: Tổng quan cửa hàng, Sản phẩm của tôi, Đơn hàng của tôi, Hồ sơ cửa hàng. Logo ghi "NexusMart Seller", breadcrumb "Kênh người bán". Không thấy các menu của admin.
  - Gõ thẳng http://localhost:5173/orders → tự chuyển về /vendor (nhà bán không vào được trang admin).
- [ ] **N6 – Tổng quan cửa hàng.** Dùng `vendor@nexusmart.local`, có dữ liệu demo.
  → "Chào mừng trở lại, Demo Tech Store". Có 4 thẻ: Doanh thu (đã giao), Đơn hàng, Sản phẩm cần xử lý, Sản phẩm đang bán (≈16). Có bảng 5 đơn gần đây và mục "Bán chạy nhất".
  - Đổi kỳ 7 ngày / 30 ngày / 90 ngày / Tất cả → số liệu thay đổi theo.
  - Tài khoản mới duyệt thì mọi số liệu bằng 0, bảng trống và có nút "Thêm sản phẩm".
- [ ] **N7 – Thêm sản phẩm.** Sản phẩm của tôi → **Thêm sản phẩm**.
  - Bấm Đăng bán khi form trống → báo lỗi ở Ảnh, Tên, Mô tả, Danh mục, Thương hiệu, Giá.
  - Ảnh: tab "Dán URL" → dán `https://cdn.dummyjson.com/product-images/mobile-accessories/apple-airpods/1.webp` → Dùng (hoặc tải ảnh lên nếu đã cấu hình Cloudinary).
  - Điền tên, mô tả, chọn danh mục (danh mục con nếu có), thương hiệu, giá `450000`, tồn kho `40` → **Đăng bán**.
  → Thông báo "Đã đăng sản phẩm lên cửa hàng". Sản phẩm mới đứng đầu danh sách, giá có dấu chấm ngăn cách và ₫.
  → Storefront: tìm theo tên thấy sản phẩm; trang cửa hàng http://localhost:3001/vendor/demo-tech-store có sản phẩm đó.
- [ ] **N8 – Sửa, ngừng bán.** Bấm Sửa → đổi giá, giảm giá 10% → Lưu.
  → Bảng hiện giá mới kèm nhãn `-10%`. Bấm Ngừng bán → xác nhận → trạng thái "Ngừng bán".
  → Storefront: sản phẩm biến mất khỏi trang chủ, cửa hàng, tìm kiếm, sản phẩm liên quan, trang nhà bán và gợi ý của chatbot. Mở link trực tiếp thì trang chi tiết vẫn vào được nhưng hiện "Ngừng kinh doanh", các nút mua bị khoá.
  - Ô tìm kiếm và bộ lọc trạng thái lọc đúng.
- [ ] **N9 – Khách mua hàng của nhà bán.** Đăng nhập storefront bằng `customer` → mua sản phẩm tạo ở N7 (COD).
  → Nhà bán: Đơn hàng của tôi có đơn mới, mã đơn khớp số hoá đơn bên admin (#14xx). Cột "Tổng của bạn" chỉ tính hàng của nhà bán này, không phải tổng cả đơn.
- [ ] **N10 – Xử lý giao hàng.** Bấm dấu `+` ở một đơn → đổi "Xử lý giao hàng" của từng sản phẩm: Chờ xử lý → Đã đóng gói → Đang giao → Đã giao.
  → Thông báo cập nhật thành công. Đơn đã huỷ thì ô chọn bị khoá. Thẻ "Sản phẩm cần xử lý" ở Tổng quan giảm.
- [ ] **N11 – Hồ sơ cửa hàng.** Đổi mô tả, thêm logo/ảnh bìa → Lưu thay đổi.
  → Thông báo đã lưu. Khung Tài khoản hiện Trạng thái "Đã duyệt", Hoa hồng 10%, URL cửa hàng `/vendor/<slug>`. Trang cửa hàng trên storefront cập nhật logo và mô tả.
- [ ] **N12 – Admin xem nhà bán.** Đăng nhập `admin` → Nhà bán → mở chi tiết Demo Tech Store.
  → Thấy sản phẩm, đơn hàng và lịch sử thanh toán của nhà bán (dữ liệu demo có thanh toán hàng tháng: Đã thanh toán / Đang xử lý / Chờ xử lý). Thử đổi hoa hồng hoặc Tạm khoá. Nếu Tạm khoá thì nhớ mở lại để không ảnh hưởng demo.

### 4.4 Phân quyền nhà bán
- [ ] **N13 – Khách thường vào CRM.** Tài khoản chưa được duyệt mở http://localhost:8081.
  → Trang "Không có quyền".
- [ ] **N14 – API nhà bán.** Dùng token của `customer` gọi `GET /api/v1/vendor/products` (Swagger).
  → Trả 403. Dùng token của nhà bán → chỉ thấy sản phẩm của chính mình. Sửa sản phẩm của nhà bán khác (`PATCH /vendor/products/<id>`) → 403.

---

## 5. Luồng bảo mật, lỗi

- [ ] **B1 – API cần đăng nhập.** Mở http://localhost:4000/api/v1/user/orders khi chưa đăng nhập.
  → Trả 401.
- [ ] **B2 – API admin.** Dùng token của `customer` gọi `/api/v1/admin/orders` (Swagger → Authorize).
  → Trả 403.
- [ ] **B3 – Trang không tồn tại.** Mở http://localhost:3001/abc-xyz.
  → Trang 404 có header, footer NexusMart.

---

## 6. Ghi lỗi

Ghi mỗi lỗi một dòng vào bảng sau (hoặc tạo GitHub Issue):

| Mã ca test | Mô tả lỗi | Các bước tái hiện | Ảnh | Người phụ trách (theo PROJECT_PLAN) |
|---|---|---|---|---|
| | | | | |

---

## 7. Kết quả các lần chạy và lỗi đã biết

### 7.1 Kết quả lần chạy 18/11
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

### 7.2 Lỗi đã sửa trong lần chạy 18/11
- Test chatbot dùng tên class cũ (`nexusmart-chat`) → đã đổi sang `nx-chat`.
- Jest fail ngẫu nhiên do chạy quá nhiều MongoDB in-memory song song → giới hạn 2 worker.
- Chi tiết đơn hiện giá gốc ở từng dòng → đã hiện giá đã giảm; "Order status: pending" → "Trạng thái: Chờ xác nhận".
- Tên sản phẩm bị lặp "Laptop ... Laptop" → đã sửa trong seed.
- Thiếu mã giảm giá và bài blog sau khi seed → `npm run seed` giờ nạp cả coupon và blog.
- Thiếu biến `VNPAY_*` trong `backend/.env.example` → đã bổ sung.

### 7.3 Lần chạy 19/11: luồng nhà bán, Việt hoá CRM, dữ liệu demo
| Hạng mục | Kết quả |
|---|---|
| Đăng ký nhà bán → admin duyệt → role `vendor` được gán trong Keycloak | ✅ |
| Nhà bán đăng nhập CRM, chỉ thấy menu Kênh người bán | ✅ |
| Thêm sản phẩm qua form CRM → hiện trong danh sách | ✅ |
| Tổng quan, Đơn hàng, Hồ sơ cửa hàng hiển thị đúng dữ liệu | ✅ |
| Tab "Trở thành nhà bán": form (khách) và trạng thái Đã duyệt (nhà bán) | ✅ |
| CRM Việt hoá, `tsc` không lỗi | ✅ |
| Dashboard admin và nhà bán có dữ liệu 5–11/2026 | ✅ |

Lỗi đã sửa trong lần chạy này:
- Model User mặc định `vendorProfile.verificationStatus = 'pending'`, nên **mọi user mới** đều bị coi là đang chờ duyệt nhà bán: không gửi được đơn, và lẫn vào danh sách Nhà bán của admin. Đã bỏ mặc định; giờ chỉ tính là có đơn khi đã có `storeName`.
- Realm thiếu role `vendor`, nên lúc duyệt việc gán role thất bại mà không báo gì. Giờ backend tự tạo role nếu chưa có, và role đã được thêm vào `realm-export.json`.
- Joi xoá `parent`/`children` mà model Product bắt buộc, nên `POST /vendor/products` luôn lỗi. Đã sửa.
- Client `shofy-crm` thiếu scope `basic`/`email`/`profile`, nên token CRM không có `sub`. Backend tra `keycloakId: undefined` và khớp nhầm vào **user đầu tiên trong DB**. Lỗi này ảnh hưởng cả admin: mọi phiên CRM đều ghi đè role của user "Paul". Đã thêm scope.
- Bảng Ant Design hiểu nhầm trường `children` (danh mục con) của sản phẩm là các dòng con, làm trang sản phẩm nhà bán bị lỗi. Đã sửa.

### 7.4 Lỗi / thiếu sót còn lại
| Mức | Vấn đề | Người phụ trách |
|---|---|---|
| Cao | Backend **tin tổng tiền do client gửi** khi tạo đơn (có thể sửa giá ở trình duyệt) | Tuấn |
| Cao | VNPay chưa có key sandbox, chưa test được trọn luồng; MoMo vẫn là stub | Thái |
| TB | Chatbot chưa chạy thật vì thiếu `GEMINI_API_KEY` | Tiệp |
| TB | Đánh giá sản phẩm tự duyệt, chưa có trang duyệt | Tiệp |
| TB | ESLint CRM còn lỗi luật `react-hooks` / `no-explicit-any` (code cũ) | Tân |
| TB | Giỏ hàng chỉ lưu trên trình duyệt: seed lại dữ liệu thì giỏ cũ trỏ tới sản phẩm không còn (ra trang 404) | Tuấn |
| Thấp | `statusHistory` của đơn không ghi mốc "pending" ban đầu; nhật ký hoạt động ghi `resourceType` = undefined | Thái, Tân |
| Thấp | Tên sản phẩm mới Việt hoá một phần; bài blog tiếng Anh; nhãn "ELECTRONICS" và ngày dạng "18 Nov, 2026" ở chi tiết đơn | Tài |
| Thấp | Đơn mẫu #1000 trong dữ liệu seed cũ có giá USD (290 ₫) | Tân |
| TB | `verifyToken` không từ chối token thiếu `sub`, dễ tái phát lỗi nhận nhầm user nếu client thiếu scope. Nên trả 401 khi thiếu `sub` (động tới luồng Keycloak, cần nhóm duyệt) | Tuấn |
| TB | Nhà bán chưa có màn yêu cầu rút tiền (API `POST /vendor/payouts/request` đã có) | Thái |
| Thấp | Dữ liệu demo: đơn #1000–#1002 có số hoá đơn nhỏ hơn đơn lịch sử; "Doanh thu tháng" trên dashboard so tháng 11 (chưa hết tháng) với cả tháng 10 nên báo giảm | Tân |
| Thấp | Sau khi được duyệt, nhà bán phải đăng xuất rồi đăng nhập lại mới có quyền (token cũ chưa có role `vendor`) | Thái |
| TB | Trang `/contact` (Trung tâm hỗ trợ) chưa hoàn thiện: không có form liên hệ, nhiều link chết, email mặc định không phải của dự án. Đã ẩn khỏi menu/footer; cần làm xong rồi mở lại | Tài |
| Thấp | Bảng "Sản phẩm sắp hết hàng" ở dashboard admin hiện cả sản phẩm tồn kho 40–88 dù ngưỡng là ≤10 | Tân |
