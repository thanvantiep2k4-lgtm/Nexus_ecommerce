const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { withTransaction } = require('../../core/withTransaction');

jest.setTimeout(120000);

let mongo;
beforeAll(async () => {
  mongo = await MongoMemoryServer.create(); // standalone: KHÔNG hỗ trợ transaction
  await mongoose.connect(mongo.getUri());
  await mongoose.connection.createCollection('probe');
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('withTransaction trên MongoDB standalone', () => {
  const OLD_ENV = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = OLD_ENV;
  });

  test('ngoài production: chạy fn với session = null (không transaction) để test cũ không gãy', async () => {
    process.env.NODE_ENV = 'test';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    let received = 'unset';
    await withTransaction(async (session) => {
      received = session;
      await mongoose.connection.collection('probe').insertOne({ ok: 1 }, session ? { session } : {});
    });
    expect(received).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test('production: KHÔNG được âm thầm bỏ transaction, phải ném lỗi', async () => {
    process.env.NODE_ENV = 'production';
    await expect(
      withTransaction(async (session) => {
        await mongoose.connection.collection('probe').insertOne({ ok: 2 }, { session });
      })
    ).rejects.toBeDefined();
  });
});
