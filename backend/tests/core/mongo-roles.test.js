/**
 * Kiểm thử MÔ HÌNH QUYỀN MongoDB (scripts/mongo/users.config.js) trên một MongoDB thật có bật
 * xác thực: user nào làm được gì, và đặc biệt là sổ cái "chỉ thêm, không sửa/xoá".
 */
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { MongoClient } = require('mongodb');
const { buildUserCommands, toUpdateCommand } = require('../../../scripts/mongo/users.config.js');

jest.setTimeout(180000);

const ENV = {
  MONGO_APP_PASS: 'app_pw',
  MONGO_BACKUP_PASS: 'backup_pw',
  MONGO_READONLY_PASS: 'ro_pw',
};
const MAIN = 'nexusmart';
const LEDGER = 'nexusmart_ledger';
const UNAUTHORIZED = 13;

let repl;
let root;
let hostPort;
const clients = [];

async function connectAs(user, pass) {
  const c = new MongoClient(
    `mongodb://${user}:${pass}@${hostPort}/?authSource=admin&replicaSet=${repl.replSetOpts?.name || 'testset'}`
  );
  await c.connect();
  clients.push(c);
  return c;
}

beforeAll(async () => {
  repl = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      storageEngine: 'wiredTiger',
      auth: { enable: true, customRootName: 'root', customRootPwd: 'root_pw' },
    },
  });
  const uri = new URL(repl.getUri());
  hostPort = uri.host;
  root = new MongoClient(
    `mongodb://root:root_pw@${hostPort}/?authSource=admin&replicaSet=${uri.searchParams.get('replicaSet')}`
  );
  await root.connect();
  clients.push(root);

  for (const step of buildUserCommands(ENV)) {
    await root.db(step.db).command(step.command);
  }
  // Collection tạo sẵn (giống scripts/ensure-schema.js) để transaction không phải tạo ngầm.
  await root.db(LEDGER).createCollection('ledger_entries');
  await root.db(MAIN).createCollection('orders');
  await root.db(MAIN).createCollection('products');
});

afterAll(async () => {
  await Promise.all(clients.map((c) => c.close().catch(() => {})));
  await repl.stop();
});

describe('nexus_app (ứng dụng)', () => {
  let app;
  beforeAll(async () => {
    app = await connectAs('nexus_app', ENV.MONGO_APP_PASS);
  });

  test('đọc/ghi/xoá tự do trong DB chính', async () => {
    const products = app.db(MAIN).collection('products');
    const { insertedId } = await products.insertOne({ title: 'a', quantity: 1 });
    await expect(products.updateOne({ _id: insertedId }, { $inc: { quantity: 1 } })).resolves.toBeDefined();
    await expect(products.deleteOne({ _id: insertedId })).resolves.toBeDefined();
  });

  test('sổ cái: THÊM và ĐỌC được', async () => {
    const entries = app.db(LEDGER).collection('ledger_entries');
    await expect(entries.insertOne({ txnId: 't1', account: 'A', debit: 10, credit: 0 })).resolves.toBeDefined();
    expect(await entries.countDocuments({ txnId: 't1' })).toBe(1);
  });

  test('sổ cái: SỬA bị từ chối', async () => {
    const entries = app.db(LEDGER).collection('ledger_entries');
    await expect(entries.updateOne({ txnId: 't1' }, { $set: { debit: 999 } })).rejects.toMatchObject({
      code: UNAUTHORIZED,
    });
  });

  test('sổ cái: XOÁ và DROP bị từ chối', async () => {
    const entries = app.db(LEDGER).collection('ledger_entries');
    await expect(entries.deleteOne({ txnId: 't1' })).rejects.toMatchObject({ code: UNAUTHORIZED });
    await expect(entries.deleteMany({})).rejects.toMatchObject({ code: UNAUTHORIZED });
    await expect(entries.drop()).rejects.toMatchObject({ code: UNAUTHORIZED });
  });

  test('không ghi được vào database khác', async () => {
    await expect(app.db('another_db').collection('x').insertOne({ a: 1 })).rejects.toMatchObject({
      code: UNAUTHORIZED,
    });
  });

  test('MỘT transaction ghi được cả DB chính (đơn) lẫn sổ cái dưới cùng một user, và hoàn tác cùng nhau', async () => {
    const orders = app.db(MAIN).collection('orders');
    const entries = app.db(LEDGER).collection('ledger_entries');

    const ok = app.startSession();
    await ok.withTransaction(async () => {
      await orders.insertOne({ code: 'o-ok' }, { session: ok });
      await entries.insertOne({ txnId: 'tx-ok', account: 'A', debit: 5, credit: 0 }, { session: ok });
    });
    await ok.endSession();
    expect(await orders.countDocuments({ code: 'o-ok' })).toBe(1);
    expect(await entries.countDocuments({ txnId: 'tx-ok' })).toBe(1);

    const bad = app.startSession();
    await expect(
      bad.withTransaction(async () => {
        await orders.insertOne({ code: 'o-bad' }, { session: bad });
        await entries.insertOne({ txnId: 'tx-bad', account: 'A', debit: 5, credit: 0 }, { session: bad });
        throw new Error('lỗi giữa chừng');
      })
    ).rejects.toThrow('lỗi giữa chừng');
    await bad.endSession();
    expect(await orders.countDocuments({ code: 'o-bad' })).toBe(0);
    expect(await entries.countDocuments({ txnId: 'tx-bad' })).toBe(0);
  });
});

describe('nexus_readonly (xem dữ liệu)', () => {
  test('đọc được cả hai database, ghi bị từ chối', async () => {
    const ro = await connectAs('nexus_readonly', ENV.MONGO_READONLY_PASS);
    await expect(ro.db(MAIN).collection('orders').countDocuments({})).resolves.toBeGreaterThanOrEqual(0);
    await expect(ro.db(LEDGER).collection('ledger_entries').countDocuments({})).resolves.toBeGreaterThanOrEqual(0);
    await expect(ro.db(MAIN).collection('orders').insertOne({ a: 1 })).rejects.toMatchObject({
      code: UNAUTHORIZED,
    });
    await expect(
      ro.db(LEDGER).collection('ledger_entries').insertOne({ a: 1 })
    ).rejects.toMatchObject({ code: UNAUTHORIZED });
  });
});

describe('nexus_backup (sao lưu)', () => {
  test('không ghi được dữ liệu', async () => {
    const bk = await connectAs('nexus_backup', ENV.MONGO_BACKUP_PASS);
    await expect(bk.db(MAIN).collection('orders').insertOne({ a: 1 })).rejects.toMatchObject({
      code: UNAUTHORIZED,
    });
  });
});

describe('chạy lại script khởi tạo (idempotent)', () => {
  test('tạo lần 2 báo lỗi "đã tồn tại", chuyển sang cập nhật thì thành công', async () => {
    for (const step of buildUserCommands(ENV)) {
      let code;
      try {
        await root.db(step.db).command(step.command);
      } catch (e) {
        code = e.code;
      }
      expect([51002, 51003]).toContain(code); // RoleAlreadyExists / UserAlreadyExists
      await expect(root.db(step.db).command(toUpdateCommand(step.command))).resolves.toBeDefined();
    }
  });
});
