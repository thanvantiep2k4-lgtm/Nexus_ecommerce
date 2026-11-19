/**
 * Máy trạng thái trên MongoDB ĐƠN LẺ (không có transaction): chế độ dự phòng ngoài production của
 * withTransaction (session = null). Ở chế độ này không có transaction để chặn đua, nên tính đúng
 * dựa vào việc đổi trạng thái CÓ ĐIỀU KIỆN `{_id, status: from}` chạy TRƯỚC effects: yêu cầu thua
 * cuộc dừng ngay ở bước đó, effects không bao giờ chạy hai lần.
 */
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const sm = require('../../core/stateMachine');
const StateEvent = require('../../models/StateEvent');

jest.setTimeout(120000);

const Demo = mongoose.model(
  'SmStandaloneDemo',
  new mongoose.Schema({ status: String }, { collection: 'sm_standalone_demo' })
);

let mongo;
let effects;
const machine = sm.defineMachine({
  name: 'standalone-demo',
  model: Demo,
  initial: 'NEW',
  final: ['DONE'],
  transitions: [
    {
      from: 'NEW',
      to: 'DONE',
      action: 'FINISH',
      effects: async (doc) => {
        await effects.insertOne({ entityId: doc._id });
      },
    },
  ],
});

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  mongo = await MongoMemoryServer.create(); // standalone
  await mongoose.connect(mongo.getUri());
  effects = mongoose.connection.collection('sm_standalone_effects');
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

test('chuyển hợp lệ vẫn chạy khi không có transaction', async () => {
  const doc = await Demo.create({ status: 'NEW' });
  const res = await sm.transition(machine, doc._id, 'FINISH', { type: 'system' });
  expect(res).toMatchObject({ from: 'NEW', to: 'DONE' });
  expect((await Demo.findById(doc._id)).status).toBe('DONE');
  expect(await StateEvent.countDocuments({ entityType: 'standalone-demo', entityId: doc._id })).toBe(1);
});

test('đồng thời: điều kiện {status: from} bảo vệ, effects chỉ chạy đúng một lần', async () => {
  const doc = await Demo.create({ status: 'NEW' });
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, () => sm.transition(machine, doc._id, 'FINISH', { type: 'user', permissions: ['*'] }))
  );
  const ok = results.filter((r) => r.status === 'fulfilled' && !r.value.idempotent);
  expect(ok).toHaveLength(1);
  results
    .filter((r) => r.status === 'rejected')
    .forEach((r) => expect(r.reason).toBeInstanceOf(sm.StateMachineError));
  expect(await effects.countDocuments({ entityId: doc._id })).toBe(1);
});
