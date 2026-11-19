'use strict';

const Product = require('../models/Products');

/** Ném khi một dòng giỏ hàng vượt quá tồn kho (hoặc sản phẩm/biến thể không còn tồn tại). */
class InsufficientStockError extends Error {
  constructor(details) {
    super('Một hoặc nhiều sản phẩm không đủ tồn kho');
    this.name = 'InsufficientStockError';
    this.details = details; // [{ productId, sku, requested }]
  }
}

/**
 * Trừ tồn kho cho các dòng giỏ hàng, CÓ ĐIỀU KIỆN "còn đủ hàng mới trừ".
 *
 * VÌ SAO CÓ ĐIỀU KIỆN: trước đây dùng `$inc: -qty` không kiểm tra, nên hai người mua cùng lúc món
 * chỉ còn 1 cái đều thành công và kho thành -1 (bán vượt). Bây giờ điều kiện `stock >= qty` nằm
 * ngay trong câu lệnh cập nhật nên MongoDB kiểm tra và trừ trong một bước nguyên tử; lệnh không
 * khớp điều kiện thì không trừ gì và ta ném InsufficientStockError.
 *
 * Gọi hàm này TRONG `withTransaction` để khi một dòng thiếu hàng thì các dòng đã trừ trước đó
 * (và đơn hàng vừa tạo) cùng bị hoàn tác. Truyền `session` nhận từ withTransaction.
 *
 * Quy ước kho (giữ đúng như code cũ): sản phẩm CÓ biến thể chọn sku → trừ `variants.$.stock`;
 * còn lại → trừ `quantity` của sản phẩm.
 *
 * @param {Array} cart  các dòng giỏ: { _id, orderQuantity, selectedVariant?: { sku } }
 * @param {ClientSession|null} session
 */
async function deductStock(cart, session) {
  const opts = session ? { session } : {};
  const failed = [];

  for (const item of cart) {
    const qty = Number(item.orderQuantity) || 1;
    const sku = item.selectedVariant && item.selectedVariant.sku;

    const result = sku
      ? await Product.updateOne(
          { _id: item._id, variants: { $elemMatch: { sku, stock: { $gte: qty } } } },
          { $inc: { 'variants.$.stock': -qty } },
          opts
        )
      : await Product.updateOne(
          { _id: item._id, quantity: { $gte: qty } },
          { $inc: { quantity: -qty } },
          opts
        );

    if (result.modifiedCount !== 1) {
      failed.push({ productId: String(item._id), sku: sku || null, requested: qty });
    }
  }

  // Gom tất cả dòng lỗi rồi mới ném, để người dùng thấy đủ các món hết hàng trong một lần.
  if (failed.length) throw new InsufficientStockError(failed);
}

module.exports = { deductStock, InsufficientStockError };
