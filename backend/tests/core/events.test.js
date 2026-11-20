/**
 * Kiểm thử sự kiện + outbox (core/events.js) trên MongoDB replica set trong bộ nhớ. Không cần Redis:
 * relayOnce nhận hàm `publish` tiêm vào, dispatch gọi trực tiếp.
 * Kịch bản có Redis và worker thật: events-pipeline.test.js, events-e2e.test.js.
 */
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { UnrecoverableError } = require('bullmq');
const events = require('../../core/events');
const sm = require('../../core/stateMachine');
const Outbox = require('../../models/Outbox');
const EventDelivery = require('../../models/EventDelivery');
const StateEvent = require('../../models/StateEvent');
const { withTransaction } = require('../../core/withTransaction');
const { eventsProcessor } = require('../../jobs/events.processor');

jest.setTimeout(180000);

let repl;
let effects;
const EvDemo = mongoose.model(
  'EvDemo',
  new mongoose.Schema({ status: String }, { collection: 'ev_demo' })
);
const system = { type: 'system' };
const newDemo = (status = 'NEW') => EvDemo.create({ status });
const outboxOf = (filter = {}) => Outbox.find(filter).sort({ createdAt: 1 }).lean();
const seed = (n, extra = {}) =>
  Outbox.insertMany(Array.from({ length: n }, (_, i) => ({ type: 'a.b', payload: { i }, ...extra })));

// Subscriber ghi một dòng vào ev_effects BẰNG session (cùng transaction với biên nhận).
const recorder = (name = 'recorder') => async (event, { session }) => {
  await effects.insertOne({ name, eventId: event.id }, session ? { session } : {});
};
const effectCount = (eventId, name) => effects.countDocuments({ eventId, ...(name && { name }) });

beforeAll(async () => {
  repl = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(repl.getUri(), { dbName: 'events_test' });
  for (const M of [Outbox, EventDelivery, StateEvent, EvDemo]) {
    await M.createCollection();
    await M.createIndexes(); // chỉ mục duy nhất của EventDelivery là chốt chặn chống giao lặp
  }
  await mongoose.connection.createCollection('ev_effects');
  effects = mongoose.connection.collection('ev_effects');
});

afterAll(async () => {
  await mongoose.disconnect();
  await repl.stop();
});

beforeEach(async () => {
  await Promise.all([Outbox.deleteMany({}), EventDelivery.deleteMany({}), effects.deleteMany({})]);
  events.clearSubscribers();
  sm.setEventSink(null);
  sm.setPermissionChecker(null);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ── Ghi sự kiện ─────────────────────────────────────────────────────────────────────────────
describe('emit: ghi sự kiện cùng transaction', () => {
  test('tên sự kiện sai dạng bị từ chối', async () => {
    await expect(events.emit('KhongHopLe', {})).rejects.toThrow(TypeError);
    await expect(events.emit('mot_tu', {})).rejects.toThrow(TypeError);
    await expect(events.emit('review.published', {})).resolves.toMatchObject({ status: 'pending' });
  });

  test('commit: dữ liệu và sự kiện cùng có', async () => {
    const demo = await newDemo();
    await withTransaction(async (session) => {
      await EvDemo.updateOne({ _id: demo._id }, { $set: { status: 'PAID' } }, { session });
      await events.emit('demo.paid', { id: demo._id }, { session, aggregateType: 'demo', aggregateId: demo._id });
    });
    expect((await EvDemo.findById(demo._id)).status).toBe('PAID');
    expect(await outboxOf({ type: 'demo.paid' })).toHaveLength(1);
  });

  test('rollback: transaction huỷ thì KHÔNG có sự kiện (và dữ liệu cũng không đổi)', async () => {
    const demo = await newDemo();
    await expect(
      withTransaction(async (session) => {
        await EvDemo.updateOne({ _id: demo._id }, { $set: { status: 'PAID' } }, { session });
        await events.emit('demo.paid', { id: demo._id }, { session });
        throw new Error('lỗi sau khi ghi sự kiện');
      })
    ).rejects.toThrow('lỗi sau khi ghi sự kiện');
    expect((await EvDemo.findById(demo._id)).status).toBe('NEW');
    expect(await outboxOf()).toHaveLength(0); // không có "sự kiện ma" về một việc chưa từng xảy ra
  });
});

// ── Nối với máy trạng thái ──────────────────────────────────────────────────────────────────
describe('nối với máy trạng thái (việc 6): mỗi transition() tự phát sự kiện', () => {
  const machine = sm.defineMachine({
    name: 'ev-demo',
    model: EvDemo,
    initial: 'NEW',
    final: ['PAID', 'CANCELLED', 'BROKEN'],
    transitions: [
      { from: 'NEW', to: 'PAID', action: 'PAY' },
      { from: 'NEW', to: 'CANCELLED', action: 'CANCEL', event: 'ev-demo.cancelled_by_rule' },
      {
        from: 'NEW',
        to: 'BROKEN',
        action: 'BREAK',
        effects: async () => {
          throw new Error('effect nổ');
        },
      },
    ],
  });

  beforeEach(() => {
    events.installStateMachineSink();
    jest.spyOn(events, 'nudge').mockResolvedValue(undefined);
  });

  test('tên mặc định <máy>.<trạng thái đích>, payload đủ trường, nudge chạy SAU commit', async () => {
    const demo = await newDemo();
    await sm.transition(machine, demo._id, 'PAY', { type: 'user', id: 'u1', permissions: ['*'] }, { reason: 'trả tiền' });
    const rows = await outboxOf();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: 'ev-demo.paid',
      status: 'pending',
      aggregateType: 'ev-demo',
      payload: { entityType: 'ev-demo', from: 'NEW', to: 'PAID', action: 'PAY', reason: 'trả tiền' },
    });
    expect(String(rows[0].aggregateId)).toBe(String(demo._id));
    expect(String(rows[0].payload.entityId)).toBe(String(demo._id));
    expect(events.nudge).toHaveBeenCalledTimes(1);
  });

  test('dòng chuyển có `event` thì dùng tên đó', async () => {
    const demo = await newDemo();
    await sm.transition(machine, demo._id, 'CANCEL', system);
    expect((await outboxOf())[0].type).toBe('ev-demo.cancelled_by_rule');
  });

  test('chuyển sai hoặc effect lỗi: KHÔNG có sự kiện, nudge không chạy', async () => {
    const demo = await newDemo('PAID');
    await expect(sm.transition(machine, demo._id, 'PAY', system)).resolves.toMatchObject({ idempotent: true });
    const fresh = await newDemo();
    await expect(sm.transition(machine, fresh._id, 'BREAK', system)).rejects.toThrow('effect nổ');
    expect(await outboxOf()).toHaveLength(0);
    expect(await StateEvent.countDocuments({ entityId: fresh._id })).toBe(0);
    expect(events.nudge).not.toHaveBeenCalled();
  });

  test('recordCreated phát <máy>.created', async () => {
    const demo = await newDemo();
    await sm.recordCreated(machine, demo._id, 'NEW', system);
    expect((await outboxOf())[0].type).toBe('ev-demo.created');
  });
});

// ── Relay ───────────────────────────────────────────────────────────────────────────────────
describe('relayOnce: outbox -> hàng đợi', () => {
  test('chuyển dòng pending cho publish rồi đánh dấu published', async () => {
    await seed(3);
    const seen = [];
    const res = await events.relayOnce({ publish: async (doc) => seen.push(String(doc._id)) });
    expect(res).toEqual({ claimed: 3, published: 3, failed: 0 });
    const rows = await outboxOf();
    expect(rows.every((r) => r.status === 'published' && r.publishedAt && r.attempts === 1)).toBe(true);
    expect(seen).toHaveLength(3);
  });

  test('tôn trọng `limit` và bỏ qua dòng chưa đến hạn (nextAttemptAt ở tương lai)', async () => {
    await seed(5);
    await seed(2, { nextAttemptAt: new Date(Date.now() + 60000) });
    const res = await events.relayOnce({ limit: 3, publish: async () => {} });
    expect(res.claimed).toBe(3);
    expect(await Outbox.countDocuments({ status: 'pending' })).toBe(4); // 2 còn lại + 2 chưa đến hạn
  });

  test('publish lỗi: dòng quay lại pending với thời điểm thử lại ở tương lai, KHÔNG thử lại ngay', async () => {
    await seed(1);
    const fail = jest.fn().mockRejectedValue(new Error('Redis chết'));
    const res = await events.relayOnce({ publish: fail });
    expect(res).toEqual({ claimed: 1, published: 0, failed: 1 });
    const [row] = await outboxOf();
    expect(row).toMatchObject({ status: 'pending', attempts: 1, lastError: 'Redis chết' });
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

    expect((await events.relayOnce({ publish: fail })).claimed).toBe(0); // chưa đến hạn
    const later = () => new Date(Date.now() + 10 * 60 * 1000);
    const ok = await events.relayOnce({ publish: async () => {}, now: later });
    expect(ok.published).toBe(1);
  });

  test('quá số lần thử thì thành `dead` và được GIỮ LẠI kèm lastError', async () => {
    await seed(1, { attempts: 9 });
    await events.relayOnce({ publish: async () => Promise.reject(new Error('hỏng mãi')) });
    expect(await outboxOf()).toEqual([expect.objectContaining({ status: 'dead', lastError: 'hỏng mãi', attempts: 10 })]);
    // dòng dead không bao giờ được lấy lại
    const res = await events.relayOnce({ publish: async () => {}, now: () => new Date(Date.now() + 3600000) });
    expect(res.claimed).toBe(0);
  });

  test('ba relay chạy SONG SONG không bao giờ lấy trùng một dòng', async () => {
    await seed(60);
    const seen = [];
    const publish = async (doc) => {
      await new Promise((r) => setTimeout(r, 5));
      seen.push(String(doc._id));
    };
    await Promise.all([events.relayOnce({ publish }), events.relayOnce({ publish }), events.relayOnce({ publish })]);
    expect(seen).toHaveLength(60);
    expect(new Set(seen).size).toBe(60); // không trùng
    expect(await Outbox.countDocuments({ status: 'published' })).toBe(60);
  });

  test('relay chết giữa chừng: dòng `processing` quá hạn khoá được thu hồi và phát lại; dòng mới thì không bị đụng', async () => {
    const [stale, fresh] = await seed(2);
    await Outbox.updateOne({ _id: stale._id }, { status: 'processing', lockedAt: new Date(Date.now() - 2 * 3600 * 1000) });
    await Outbox.updateOne({ _id: fresh._id }, { status: 'processing', lockedAt: new Date() });
    const seen = [];
    await events.relayOnce({ publish: async (d) => seen.push(String(d._id)) });
    expect(seen).toEqual([String(stale._id)]);
    expect((await Outbox.findById(fresh._id)).status).toBe('processing'); // relay khác đang xử lý, không giành
  });
});

// ── Dispatch ────────────────────────────────────────────────────────────────────────────────
describe('dispatch: chạy subscriber, chống giao lặp', () => {
  const emitOne = async (type = 'order.paid', payload = { n: 1 }) => events.emit(type, payload, { aggregateType: 'order' });

  test('subscriber nhận đúng dữ liệu; có biên nhận; sự kiện thành done', async () => {
    let received;
    events.subscribe('order.paid', 'capture', async (event) => {
      received = event;
    });
    const ev = await emitOne();
    expect(await events.dispatch(ev._id)).toEqual({ delivered: ['capture'] });
    expect(received).toMatchObject({ type: 'order.paid', payload: { n: 1 }, aggregateType: 'order' });
    expect(String(received.id)).toBe(String(ev._id));
    expect(await EventDelivery.countDocuments({ eventId: ev._id, subscriber: 'capture' })).toBe(1);
    expect((await Outbox.findById(ev._id)).status).toBe('done');
  });

  test('GIAO LẶP (worker chết rồi giao lại): tác dụng chỉ xảy ra MỘT lần', async () => {
    events.subscribe('order.paid', 'recorder', recorder());
    const ev = await emitOne();
    await events.dispatch(ev._id);
    // Giả lập: relay/BullMQ giao lại cùng sự kiện (trạng thái bị đưa về published như thể chưa kịp ghi done)
    await Outbox.updateOne({ _id: ev._id }, { status: 'published', $unset: { doneAt: 1 } });
    const again = await events.dispatch(ev._id);
    expect(again).toEqual({ delivered: [] }); // bỏ qua nhờ biên nhận
    expect(await effectCount(ev._id)).toBe(1);
  });

  test('10 dispatch ĐỒNG THỜI cùng một sự kiện: tác dụng vẫn đúng một lần', async () => {
    events.subscribe('order.paid', 'recorder', recorder());
    const ev = await emitOne();
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => events.dispatch(ev._id)));
    results.forEach((r) => expect(r.status).toBe('fulfilled'));
    expect(await effectCount(ev._id)).toBe(1);
    expect(await EventDelivery.countDocuments({ eventId: ev._id })).toBe(1);
  });

  test('subscriber ghi DB rồi lỗi: tác dụng bị hoàn tác và KHÔNG có biên nhận (lần sau được thử lại)', async () => {
    events.subscribe('order.paid', 'flaky', async (event, { session }) => {
      await effects.insertOne({ name: 'flaky', eventId: event.id }, session ? { session } : {});
      throw new Error('lỗi sau khi ghi');
    });
    const ev = await emitOne();
    await expect(events.dispatch(ev._id)).rejects.toBeInstanceOf(events.DispatchError);
    expect(await effectCount(ev._id)).toBe(0);
    expect(await EventDelivery.countDocuments({ eventId: ev._id })).toBe(0);
  });

  test('một subscriber lỗi KHÔNG chặn subscriber khác; lần thử lại chỉ chạy lại subscriber lỗi', async () => {
    let healthyCalls = 0;
    let failing = true;
    let flakyCalls = 0;
    events.subscribe('order.paid', 'healthy', async () => {
      healthyCalls++;
    });
    events.subscribe('order.paid', 'flaky', async () => {
      flakyCalls++;
      if (failing) throw new Error('chưa được');
    });
    const ev = await emitOne();

    const err = await events.dispatch(ev._id).catch((e) => e);
    expect(err).toBeInstanceOf(events.DispatchError);
    expect(err.errors).toEqual([{ subscriber: 'flaky', message: 'chưa được' }]);
    expect(healthyCalls).toBe(1); // vẫn được giao dù flaky lỗi
    const stuck = await Outbox.findById(ev._id);
    expect(stuck.status).not.toBe('done');
    expect(stuck.lastError).toContain('flaky');

    failing = false;
    await events.dispatch(ev._id); // BullMQ thử lại
    expect(healthyCalls).toBe(1); // KHÔNG chạy lại subscriber đã xong
    expect(flakyCalls).toBe(2);
    const done = await Outbox.findById(ev._id);
    expect(done.status).toBe('done');
    expect(done.lastError).toBeUndefined();
  });

  test('khớp theo tên chính xác, tiền tố `order.*` và `*`', async () => {
    const got = [];
    events.subscribe('order.paid', 'exact', async () => got.push('exact'));
    events.subscribe('order.*', 'prefix', async () => got.push('prefix'));
    events.subscribe('*', 'all', async () => got.push('all'));
    events.subscribe('return.*', 'other', async () => got.push('other'));
    await events.dispatch((await emitOne('order.paid'))._id);
    expect(got.sort()).toEqual(['all', 'exact', 'prefix']);
  });

  test('không có subscriber nào: vẫn thành done (không treo)', async () => {
    const ev = await emitOne('nobody.listens');
    await events.dispatch(ev._id);
    expect((await Outbox.findById(ev._id)).status).toBe('done');
  });

  test('subscriber `external`: chạy NGOÀI transaction (session null), có biên nhận, giao lại thì bỏ qua', async () => {
    let calls = 0;
    let sessionSeen = 'chưa gọi';
    events.subscribe(
      'order.paid',
      'email',
      async (event, { session }) => {
        calls++;
        sessionSeen = session;
      },
      { external: true }
    );
    const ev = await emitOne();
    await events.dispatch(ev._id);
    await Outbox.updateOne({ _id: ev._id }, { status: 'published', $unset: { doneAt: 1 } });
    await events.dispatch(ev._id);
    expect(calls).toBe(1);
    expect(sessionSeen).toBeNull();
  });

  test('sự kiện không tồn tại (đã bị TTL dọn) hoặc đã done: bỏ qua êm', async () => {
    expect(await events.dispatch(new mongoose.Types.ObjectId())).toEqual({ skipped: 'not_found' });
    const ev = await emitOne('nobody.listens');
    await events.dispatch(ev._id);
    expect(await events.dispatch(ev._id)).toEqual({ skipped: 'already_done' });
  });

  test('đăng ký trùng tên hoặc sai kiểu bị từ chối', () => {
    events.subscribe('a.b', 'x', async () => {});
    expect(() => events.subscribe('a.b', 'x', async () => {})).toThrow(/trùng tên/);
    expect(() => events.subscribe('a.b', 'y', 'khong-phai-ham')).toThrow(TypeError);
  });
});

// ── Processor của BullMQ ────────────────────────────────────────────────────────────────────
describe('eventsProcessor', () => {
  const failingSub = () =>
    events.subscribe('order.paid', 'always-fails', async () => {
      throw new Error('hỏng mãi');
    });
  const job = (id, attemptsMade, attempts) => ({
    name: 'dispatch',
    data: { outboxId: String(id) },
    attemptsMade,
    opts: { attempts },
  });

  test('lần chạy CUỐI mà vẫn lỗi: sự kiện thành `dead` (giữ lại để xử lý tay)', async () => {
    failingSub();
    const ev = await events.emit('order.paid', {});
    await expect(eventsProcessor(job(ev._id, 7, 8))).rejects.toBeInstanceOf(events.DispatchError);
    expect(await outboxOf({ _id: ev._id })).toEqual([expect.objectContaining({ status: 'dead' })]);
  });

  test('chưa phải lần cuối: KHÔNG đánh dead (BullMQ sẽ thử lại)', async () => {
    failingSub();
    const ev = await events.emit('order.paid', {});
    await expect(eventsProcessor(job(ev._id, 2, 8))).rejects.toBeInstanceOf(events.DispatchError);
    expect((await Outbox.findById(ev._id)).status).not.toBe('dead');
  });

  test('tên job lạ: UnrecoverableError (không thử lại)', async () => {
    await expect(eventsProcessor({ name: 'khong-co', data: {}, attemptsMade: 0, opts: {} })).rejects.toBeInstanceOf(
      UnrecoverableError
    );
  });
});
