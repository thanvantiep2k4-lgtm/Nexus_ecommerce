# Máy trạng thái (`core/stateMachine.js`)

Khung dùng chung để quản lý vòng đời của mọi đối tượng có trạng thái: đơn hàng, trả hàng, hồ sơ nhà bán, sản phẩm, rút tiền, nội dung CMS.

## 1. Vì sao có

Trước đây trạng thái được gán thẳng (`order.status = ...`) ở nhiều nơi và không nơi nào kiểm tra đường đi hợp lệ:

- Admin đổi được đơn `delivered` về `pending`, đơn `cancelled` sang `shipped`.
- IPN thanh toán đặt `confirmed` cho cả đơn đã huỷ: đơn đã hoàn kho sống lại mà kho không bị trừ lại.
- Hai yêu cầu huỷ đồng thời cùng hoàn kho, cộng đôi.

Máy trạng thái gom mọi thay đổi trạng thái vào **một hàm `transition()`** có kiểm tra, chạy trong **một transaction**. **Quy tắc: không được gán trực tiếp trường trạng thái của một đối tượng đã có máy trạng thái.** Mọi thay đổi đi qua `transition()`.

## 2. Khai báo một máy

```js
const { defineMachine } = require('../core/stateMachine');

const returnMachine = defineMachine({
  name: 'return',                 // tên loại đối tượng, lưu vào state_events.entityType
  model: ReturnRequest,           // Mongoose model
  field: 'status',                // trường lưu trạng thái (mặc định 'status')
  initial: 'REQUESTED',
  final: ['REFUNDED', 'REJECTED', 'CANCELLED'],   // trạng thái cuối, không có đường đi ra
  transitions: [
    {
      from: 'REQUESTED',
      to: 'AWAITING_RETURN',
      action: 'SELLER_ACCEPT',
      permission: 'shop.return.respond',                       // quyền theo VAI TRÒ
      guard: (ret, ctx) => ret.shopId.equals(ctx.actor.shopId), // điều kiện theo ĐỐI TƯỢNG
      guardMessage: 'Yêu cầu này không thuộc shop của bạn',
      set: () => ({ respondedAt: new Date() }),                 // ghi thêm trường cùng lúc
      effects: async (ret, ctx) => {                            // đổi dữ liệu khác, TRONG transaction
        await Something.updateOne({ _id: ret.orderId }, { $set: { hasActiveReturn: true } }, { session: ctx.session });
      },
      afterCommit: async (ret) => {                             // tác dụng phụ ra ngoài, SAU commit
        await enqueue(QUEUES.RETURNS, 'return-buyer-ship-deadline', { id: ret._id }, { delay: 7 * DAY, jobId: `return:${ret._id}:ship` });
      },
    },
    // `from` có thể là mảng: một hành động đi được từ nhiều trạng thái
    { from: ['REQUESTED', 'AWAITING_RETURN'], to: 'CANCELLED', action: 'BUYER_CANCEL', permission: 'buyer.return.cancel' },
    // hành động chỉ dành cho job/webhook
    { from: 'RETURN_SHIPPING', to: 'RETURN_RECEIVED', action: 'CARRIER_DELIVERED', actors: ['system'] },
  ],
});
```

| Trường | Ý nghĩa |
|---|---|
| `from` | Trạng thái xuất phát (chuỗi hoặc mảng chuỗi) |
| `to` | Trạng thái đích |
| `action` | Tên hành động kích hoạt |
| `permission` | Quyền cần có theo vai trò (vd `shop.order.process`). Bỏ trống = không đòi quyền |
| `actors` | Loại tác nhân được phép (vd `['system']`). Bỏ trống = mọi loại |
| `guard` | Điều kiện theo từng đối tượng cụ thể (async được). Trả `false` hoặc ném `GuardFailedError` để chặn |
| `guardMessage` | Thông báo khi guard từ chối |
| `set` | Trả về các trường ghi thêm cùng lúc với trạng thái. Không được ghi đè trường trạng thái |
| `effects` | Việc kèm theo, **chạy trong transaction** |
| `afterCommit` | Việc có tác dụng phụ ra ngoài, **chỉ chạy sau khi commit** |

**`permission` khác `guard`:** permission là quyền chung của vai trò ("nhân viên shop có làm được loại việc này không"), guard là điều kiện của đối tượng cụ thể ("đơn này có đúng của shop bạn không").

`defineMachine` **kiểm tra bảng ngay lúc khởi động** và ném `MachineDefinitionError` khi: trùng `(from, action)`; trạng thái ngoài danh sách `states` (nếu có khai báo); trạng thái cuối còn đường ra; trạng thái không có đường ra mà chưa khai báo `final` (thường là gõ sai tên); trạng thái không thể đến được từ `initial`. Lỗi trong bảng được phát hiện khi chạy server, không đợi tới lúc có người bấm.

## 3. Gọi `transition()`

```js
const { transition, toApiError } = require('../core/stateMachine');

try {
  const result = await transition(returnMachine, returnId, 'SELLER_ACCEPT', actor, { reason, metadata });
  // result = { entity, from, to, action, event, idempotent, afterCommitErrors }
  return respond.success(res, result.entity);
} catch (err) {
  const apiError = toApiError(err);     // lỗi của máy trạng thái -> { code, status, message, details }
  if (apiError) return respond.error(res, apiError.code, apiError.message, apiError.status, apiError.details);
  next(err);
}
```

`actor` bắt buộc có `type`: `{ type: 'user', id, roles, permissions, shopId… }` hoặc `{ type: 'system' }` (job, webhook).

Luồng bên trong, trong **một transaction**:

```
1. Tải đối tượng
2. Có đường đi cho (trạng thái hiện tại, hành động) không?   → không: InvalidTransitionError (409)
3. Loại tác nhân hợp lệ?                                       → không: ForbiddenTransitionError (403)
4. Có quyền?                                                   → không: ForbiddenTransitionError (403)
5. guard                                                       → sai: GuardFailedError (409)
6. Đổi trạng thái CÓ ĐIỀU KIỆN  updateOne({_id, status: from}) → không khớp: ConcurrentTransitionError (409)
7. effects
8. Ghi sự kiện vào state_events
9. commit, rồi mới chạy afterCommit
```

| Lỗi | HTTP | Khi nào |
|---|---|---|
| `InvalidTransitionError` | 409 | Hành động không có trong bảng cho trạng thái hiện tại (`details.allowedActions` liệt kê các hành động hợp lệ) |
| `ForbiddenTransitionError` | 403 | Sai loại tác nhân hoặc thiếu quyền |
| `GuardFailedError` | 409 | Điều kiện của đối tượng không thỏa |
| `ConcurrentTransitionError` | 409 | Yêu cầu khác vừa đổi trạng thái trước |
| `EntityNotFoundError` | 404 | Không có đối tượng |

**Hai yêu cầu đồng thời chỉ một cái thắng.** Bước 6 chặn việc hai yêu cầu cùng huỷ một đơn rồi cùng hoàn kho. Điều kiện `status = from` chạy **trước** effects, nên yêu cầu thua cuộc dừng ngay và effects không chạy hai lần, kể cả khi MongoDB không có transaction.

### Tác nhân `system` gọi lại là êm

Job và webhook có thể chạy lại (BullMQ bảo đảm "ít nhất một lần", cổng thanh toán gửi IPN hai lần). Nếu tác nhân `system` gọi một hành động mà đối tượng **đã ở trạng thái đích** của hành động đó thì được coi là thành công và bỏ qua: `idempotent: true`, không ghi sự kiện, không chạy effects. Tác nhân khác (người dùng) gọi lại sẽ nhận `InvalidTransitionError`.

## 4. Quy tắc cho `effects`, `guard`, `set`

1. **Mọi lệnh DB trong `effects` phải truyền `{ session: ctx.session }`.** Thiếu thì lệnh đó chạy ngoài transaction và không được hoàn tác. `ctx.session` có thể là `null` (chế độ dự phòng ngoài production, xem `core/withTransaction.js`); `{ session: null }` vẫn hợp lệ.
2. **`effects` không được có tác dụng phụ ra ngoài** (gửi email, gọi API, đẩy job, phát socket): driver có thể gọi lại cả khối khi gặp lỗi tạm thời. Những việc đó đặt trong `afterCommit`.
3. **`guard` không được ghi dữ liệu và phải chịu được thiếu payload**: `availableActions` gọi guard ở chế độ dò (`ctx.dryRun === true`, `ctx.payload` rỗng) để biết nên hiện nút nào.
4. **Lỗi trong `effects` huỷ tất cả:** trạng thái, mọi thứ effects đã ghi và sự kiện đều được hoàn tác, `afterCommit` không chạy.
5. **`afterCommit` lỗi không làm transition thất bại** (trạng thái đã đổi thật). Lỗi được ghi log và trả về trong `result.afterCommitErrors`. Vì thế **không được dựa vào `afterCommit` để bảo đảm đúng**: cần job định kỳ quét MongoDB tìm việc quá hạn bị sót (kế hoạch ở bước 8).

## 5. Nhật ký sự kiện (`state_events`)

Mỗi `transition()` thành công ghi **đúng một dòng** vào collection `state_events` (model `StateEvent`) **trong cùng transaction**. Trạng thái đổi mà thiếu sự kiện (hoặc ngược lại) là không thể xảy ra. Đây là timeline hiển thị cho người mua, người bán và admin.

| Trường | Ý nghĩa |
|---|---|
| `entityType`, `entityId` | Tên máy (`'order'`) và `_id` đối tượng |
| `from`, `to`, `action` | Chuyển trạng thái; `from = null` ở sự kiện khởi tạo |
| `actor` | `{ type, id, roles }` người/hệ thống thực hiện |
| `reason`, `metadata` | Lý do và dữ liệu kèm theo từ `payload` |
| `at` | Thời điểm |

Lịch sử của một đối tượng: `StateEvent.find({ entityType: 'order', entityId }).sort({ at: 1 })`.

Khi **tạo** đối tượng, ghi sự kiện khởi tạo trong cùng transaction với việc tạo:
`await recordCreated(machine, entity._id, 'UNPAID', actor, { session })`.

Sự kiện chỉ được thêm, không sửa hay xoá (sai thì ghi sự kiện bù).

## 6. Tiện ích

- `availableActions(machine, entity, actor)`: danh sách hành động `actor` làm được lúc này (lọc theo trạng thái, loại tác nhân, quyền, guard) để giao diện chỉ hiện đúng các nút. Chỉ là gợi ý cho giao diện; nơi bảo đảm thật là `transition()`.
- `toMermaid(machine)` và `toMarkdownTable(machine)`: **sinh sơ đồ và bảng từ chính bảng chuyển trạng thái**, dán vào `docs/specs/M06-don-hang.md` để tài liệu không bao giờ lệch với code.
- `setPermissionChecker(fn)`: đặt hàm kiểm tra quyền toàn cục `(actor, permission, entity) => boolean`. Mặc định: `system` luôn được; người dùng phải có `actor.permissions` chứa quyền đó (hoặc `'*'`). Phân quyền theo vai trò (bước 11) sẽ cắm vào đây. Máy nào cũng có thể có `can` riêng.
- `setEventSink(fn)`: hàm gọi **trong transaction** với `(event, session)` ngay sau khi ghi sự kiện; nơi cắm outbox/thông báo (bước 7).

## 7. Kiểm thử

```bash
cd backend
npx jest tests/core/stateMachine
```

Bộ test dùng một máy mẫu "demo" (không đụng code đơn hàng) trên MongoDB replica set trong bộ nhớ, gồm:

- chuyển hợp lệ (đổi trạng thái, effects, sự kiện, `afterCommit`);
- chuyển sai trạng thái, hành động không tồn tại, thiếu quyền, sai loại tác nhân, guard từ chối: **không đổi gì và không để lại sự kiện**;
- **bảng sự thật sinh từ chính bảng chuyển trạng thái:** với mọi cặp (trạng thái, hành động), kết quả đúng như bảng quy định, không cần viết tay từng trường hợp;
- effect lỗi giữa chừng thì trạng thái, effects đã ghi và sự kiện đều được hoàn tác;
- 20 yêu cầu đồng thời: đúng một thành công, effects và sự kiện đúng một lần;
- `system` gọi lại thì bỏ qua êm, người dùng gọi lại thì báo lỗi;
- cả đường chạy không có transaction (`stateMachine-standalone.test.js`).

Khi thêm máy mới nên có test tương tự, đặc biệt **bảng sự thật sinh từ bảng**.
