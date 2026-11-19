const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const Product = require('../../models/Products');
const { withTransaction } = require('../../core/withTransaction');
const { deductStock, InsufficientStockError } = require('../../services/stock.service');

jest.setTimeout(180000);

let repl;
const col = () => mongoose.connection.collection('txn_probe');
const oid = () => new mongoose.Types.ObjectId();
const qtyOf = async (id) => (await Product.collection.findOne({ _id: id })).quantity;

beforeAll(async () => {
  repl = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(repl.getUri(), { dbName: 'txn_test' });
  // Tạo sẵn collection để transaction không phải tạo collection ngầm.
  await mongoose.connection.createCollection('txn_probe');
  await Product.createCollection();
});

afterAll(async () => {
  await mongoose.disconnect();
  await repl.stop();
});

describe('withTransaction', () => {
  test('commit: mọi thao tác được giữ lại', async () => {
    await withTransaction(async (session) => {
      await col().insertOne({ k: 'a' }, { session });
      await col().insertOne({ k: 'b' }, { session });
    });
    expect(await col().countDocuments({ k: { $in: ['a', 'b'] } })).toBe(2);
  });

  test('rollback: ném lỗi thì không thao tác nào được giữ lại', async () => {
    await expect(
      withTransaction(async (session) => {
        await col().insertOne({ k: 'c' }, { session });
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    expect(await col().countDocuments({ k: 'c' })).toBe(0);
  });
});

describe('deductStock (trừ kho có điều kiện)', () => {
  test('đủ hàng: trừ đúng số lượng', async () => {
    const _id = oid();
    await Product.collection.insertOne({ _id, quantity: 5 });
    await withTransaction((session) => deductStock([{ _id, orderQuantity: 2 }], session));
    expect(await qtyOf(_id)).toBe(3);
  });

  test('thiếu hàng: ném InsufficientStockError và HOÀN TÁC cả các dòng đã trừ trước đó', async () => {
    const a = oid();
    const b = oid();
    await Product.collection.insertMany([
      { _id: a, quantity: 5 },
      { _id: b, quantity: 1 },
    ]);
    const cart = [
      { _id: a, orderQuantity: 2 },
      { _id: b, orderQuantity: 2 }, // vượt tồn kho
    ];
    let err;
    try {
      await withTransaction((session) => deductStock(cart, session));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(InsufficientStockError);
    expect(err.details).toEqual([{ productId: String(b), sku: null, requested: 2 }]);
    expect(await qtyOf(a)).toBe(5); // dòng A đã trừ trong transaction nhưng bị hoàn tác
    expect(await qtyOf(b)).toBe(1);
  });

  test('biến thể: trừ variants.$.stock, không đụng quantity, kho không âm', async () => {
    const _id = oid();
    await Product.collection.insertOne({
      _id,
      quantity: 10,
      variants: [
        { sku: 'RED-M', stock: 1 },
        { sku: 'RED-L', stock: 4 },
      ],
    });
    await withTransaction((session) =>
      deductStock([{ _id, orderQuantity: 1, selectedVariant: { sku: 'RED-M' } }], session)
    );
    await expect(
      withTransaction((session) =>
        deductStock([{ _id, orderQuantity: 1, selectedVariant: { sku: 'RED-M' } }], session)
      )
    ).rejects.toBeInstanceOf(InsufficientStockError);
    const doc = await Product.collection.findOne({ _id });
    expect(doc.quantity).toBe(10);
    expect(doc.variants.find((v) => v.sku === 'RED-M').stock).toBe(0);
    expect(doc.variants.find((v) => v.sku === 'RED-L').stock).toBe(4);
  });

  test('đồng thời: 20 người mua món còn 5 cái -> đúng 5 thành công, kho = 0, không âm', async () => {
    const _id = oid();
    await Product.collection.insertOne({ _id, quantity: 5 });
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        withTransaction((session) => deductStock([{ _id, orderQuantity: 1 }], session))
      )
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(ok).toBe(5);
    expect(rejected).toHaveLength(15);
    rejected.forEach((r) => expect(r.reason).toBeInstanceOf(InsufficientStockError));
    expect(await qtyOf(_id)).toBe(0);
  });
});
