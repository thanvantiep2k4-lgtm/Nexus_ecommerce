const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

jest.setTimeout(180000);

let repl;
const main = () => mongoose.connection.useDb('nexusmart').db;
const ledger = () => mongoose.connection.useDb('nexusmart_ledger').db;
const rejectedByValidator = async (promise) => {
  await expect(promise).rejects.toMatchObject({ code: 121 }); // DocumentValidationFailure
};

beforeAll(async () => {
  repl = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(repl.getUri(), { autoIndex: false });
  const { ensureSchema } = require('../../scripts/ensure-schema');
  const { failures } = await ensureSchema({ log: () => {} });
  expect(failures).toEqual([]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await repl.stop();
});

describe('ensure-schema: ràng buộc ngay trong CSDL', () => {
  test('chạy lại nhiều lần vẫn an toàn (idempotent)', async () => {
    const { ensureSchema } = require('../../scripts/ensure-schema');
    const { failures } = await ensureSchema({ log: () => {} });
    expect(failures).toEqual([]);
  });

  test('kho âm bị từ chối, kho hợp lệ được chấp nhận', async () => {
    const products = main().collection('products');
    await rejectedByValidator(products.insertOne({ title: 'x', quantity: -1 }));
    await rejectedByValidator(
      products.insertOne({ title: 'x', quantity: 1, variants: [{ sku: 'A', stock: -2 }] })
    );
    await expect(products.insertOne({ title: 'ok', quantity: 3 })).resolves.toBeDefined();
  });

  test('ghi thẳng vào DB (bỏ qua Mongoose) vẫn không làm kho âm', async () => {
    const products = main().collection('products');
    const { insertedId } = await products.insertOne({ title: 'p', quantity: 1 });
    await rejectedByValidator(products.updateOne({ _id: insertedId }, { $inc: { quantity: -5 } }));
  });

  test('payout: số lẻ và đơn vị sai bị từ chối; số nguyên VND được chấp nhận', async () => {
    const payouts = main().collection('payouts');
    await rejectedByValidator(payouts.insertOne({ amount: 1.5, currency: 'VND' }));
    await rejectedByValidator(payouts.insertOne({ amount: 0, currency: 'VND' }));
    await rejectedByValidator(payouts.insertOne({ amount: 1000, currency: 'USD' }));
    await expect(payouts.insertOne({ amount: 5000000, currency: 'VND' })).resolves.toBeDefined();
    // Số nguyên lớn hơn 2^31 (hơn 2,1 tỉ đồng) vẫn phải hợp lệ.
    await expect(payouts.insertOne({ amount: 5000000000, currency: 'VND' })).resolves.toBeDefined();
  });

  test('review: rating ngoài 1..5 bị từ chối', async () => {
    const reviews = main().collection('reviews');
    await rejectedByValidator(reviews.insertOne({ rating: 6 }));
    await rejectedByValidator(reviews.insertOne({ rating: 0 }));
    await expect(reviews.insertOne({ rating: 5 })).resolves.toBeDefined();
  });

  test('sổ cái: mỗi bút toán chỉ Nợ HOẶC Có, số nguyên, không trùng', async () => {
    const entries = ledger().collection('ledger_entries');
    const base = {
      txnId: 't1',
      account: 'PLATFORM_ESCROW',
      refType: 'order',
      refId: 'o1',
      createdAt: new Date(),
    };
    await rejectedByValidator(entries.insertOne({ ...base, debit: 100, credit: 100 })); // cả hai bên
    await rejectedByValidator(entries.insertOne({ ...base, debit: 0, credit: 0 })); // rỗng
    await rejectedByValidator(entries.insertOne({ ...base, debit: 10.5, credit: 0 })); // số lẻ
    await expect(entries.insertOne({ ...base, debit: 100, credit: 0 })).resolves.toBeDefined();
    // Cùng (txnId, account, refId) -> unique index chặn ghi trùng khi job chạy lại.
    await expect(entries.insertOne({ ...base, debit: 100, credit: 0 })).rejects.toMatchObject({
      code: 11000,
    });
  });

  test('state_events: thiếu trường bắt buộc bị từ chối; sự kiện khởi tạo (from = null) được chấp nhận', async () => {
    const events = main().collection('state_events');
    const base = {
      entityType: 'order',
      entityId: new mongoose.Types.ObjectId(),
      to: 'UNPAID',
      action: 'CREATE',
      actor: { type: 'user' },
      at: new Date(),
    };
    const { action, ...noAction } = base;
    await rejectedByValidator(events.insertOne(noAction));
    await rejectedByValidator(events.insertOne({ ...base, actor: {} })); // actor thiếu type
    await rejectedByValidator(events.insertOne({ ...base, entityId: 'khong-phai-objectid' }));
    await expect(events.insertOne({ ...base, from: null })).resolves.toBeDefined();
    await expect(events.insertOne({ ...base, from: 'UNPAID', to: 'TO_CONFIRM', action: 'PAID' })).resolves.toBeDefined();
  });

  test('ví: số dư âm bị từ chối, mỗi shop một ví', async () => {
    const wallets = main().collection('wallet_balances');
    await rejectedByValidator(wallets.insertOne({ shopId: 's1', available: -1 }));
    await expect(wallets.insertOne({ shopId: 's1', available: 100 })).resolves.toBeDefined();
    await expect(wallets.insertOne({ shopId: 's1', available: 5 })).rejects.toMatchObject({
      code: 11000,
    });
  });
});
