/**
 * Sự kiện + outbox với Redis THẬT, worker THẬT (tiến trình riêng) và tắt đột ngột (SIGKILL).
 * Đây là tiêu chí xong của việc 7: "sự kiện thử được worker nhận đúng 1 lần dù worker restart".
 *
 * Cần Redis thật; chỉ chạy khi đặt REDIS_TEST_URL (xem docs/guides/redis-bullmq.md):
 *   REDIS_TEST_URL=redis://:redis_dev_password@localhost:6379 npm test -- tests/core/events-e2e
 * Test dùng database số 15 của Redis (bỏ qua số database trong URL) và FLUSHDB khi xong; MongoDB là một
 * replica set trong bộ nhớ, tiến trình worker kết nối vào đó, nên không đụng dữ liệu thật.
 */
const path = require('path');
const { spawn } = require('child_process');
const mongoose = require('mongoose');
const IORedis = require('ioredis');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const TEST_URL = process.env.REDIS_TEST_URL
  ? (() => {
      const u = new URL(process.env.REDIS_TEST_URL);
      u.pathname = '/15';
      return u.toString();
    })()
  : null;
const maybe = TEST_URL ? describe : describe.skip;

jest.setTimeout(300000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeout, label, interval = 150) {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() - start > timeout) throw new Error(`quá ${timeout}ms: ${label}`);
    await sleep(interval);
  }
}

maybe('outbox với Redis và worker thật', () => {
  let repl;
  let redis;
  let events;
  let queues;
  let Outbox;
  let EventDelivery;
  let effects;
  const children = [];

  /** Chạy `node worker.js` thành tiến trình riêng, trỏ vào MongoDB trong bộ nhớ và Redis test. */
  function spawnWorker() {
    const child = spawn(process.execPath, ['worker.js'], {
      cwd: path.join(__dirname, '..', '..'),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        MONGO_URI: repl.getUri('events_e2e'),
        REDIS_URL: TEST_URL,
        WORKER_CONCURRENCY: '5',
        // Rút ngắn thời gian phát hiện "worker chết": job đang chạy mà worker bị giết được giao lại sau ~2s.
        WORKER_LOCK_DURATION_MS: '2000',
        WORKER_STALLED_INTERVAL_MS: '1000',
        OUTBOX_LOCK_TIMEOUT_MS: '3000',
        BULL_BOARD_USER: '',
        BULL_BOARD_PASS: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.logs = '';
    child.stdout.on('data', (d) => (child.logs += d));
    child.stderr.on('data', (d) => (child.logs += d));
    children.push(child);
    return child;
  }
  const ready = (child) =>
    waitFor(() => child.logs.includes('[worker] đang chạy') && child.logs.includes('đã đăng ký job lặp'), 30000, `worker khởi động\n${'logs: '}`);

  const emitDemo = async (count, delayMs) => {
    const ids = [];
    for (let seq = 0; seq < count; seq++) {
      const doc = await events.emit('system.demo', { seq, delayMs }, { aggregateType: 'demo' });
      ids.push(doc._id);
    }
    return ids;
  };
  const effectsPerEvent = async (ids) => {
    const grouped = await effects
      .aggregate([{ $match: { eventId: { $in: ids } } }, { $group: { _id: '$eventId', n: { $sum: 1 } } }])
      .toArray();
    return new Map(grouped.map((g) => [String(g._id), g.n]));
  };

  beforeAll(async () => {
    repl = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    process.env.REDIS_URL = TEST_URL;
    await mongoose.connect(repl.getUri('events_e2e'));
    events = require('../../core/events');
    queues = require('../../core/queues');
    Outbox = require('../../models/Outbox');
    EventDelivery = require('../../models/EventDelivery');
    for (const M of [Outbox, EventDelivery]) {
      await M.createCollection();
      await M.createIndexes();
    }
    await mongoose.connection.createCollection('event_demo_effects');
    effects = mongoose.connection.collection('event_demo_effects');
    redis = new IORedis(TEST_URL);
  });

  beforeEach(async () => {
    await redis.flushdb();
    await Promise.all([Outbox.deleteMany({}), EventDelivery.deleteMany({}), effects.deleteMany({})]);
  });

  afterEach(async () => {
    for (const c of children.splice(0)) {
      if (c.exitCode === null) c.kill('SIGKILL');
    }
    await sleep(300);
  });

  afterAll(async () => {
    await redis.flushdb();
    await redis.quit();
    await queues.closeQueues();
    await require('../../core/redis').closeRedis();
    await mongoose.disconnect();
    await repl.stop();
  });

  test('chạy bình thường: 30 sự kiện, mỗi sự kiện đúng một tác dụng, tất cả done', async () => {
    const worker = spawnWorker();
    await ready(worker);
    const ids = await emitDemo(30, 0);
    await events.nudge();

    await waitFor(async () => (await Outbox.countDocuments({ status: 'done' })) === 30, 30000, `30 sự kiện done\n${worker.logs}`);
    const per = await effectsPerEvent(ids);
    expect(per.size).toBe(30);
    expect([...per.values()].every((n) => n === 1)).toBe(true);
    expect(await EventDelivery.countDocuments({})).toBe(30);
  });

  test('KHÔNG cần "gõ cửa": relay định kỳ (2 giây) vẫn phát mọi sự kiện đang chờ', async () => {
    const worker = spawnWorker();
    await ready(worker);
    await emitDemo(5, 0); // cố ý KHÔNG gọi nudge()
    await waitFor(async () => (await Outbox.countDocuments({ status: 'done' })) === 5, 20000, `relay định kỳ phát đủ 5\n${worker.logs}`);
  });

  test('SỰ KIỆN ĐÃ GHI KHI WORKER ĐANG TẮT: không mất, bật worker lên là được xử lý', async () => {
    const ids = await emitDemo(10, 0); // chưa có worker nào chạy
    await sleep(500);
    expect(await Outbox.countDocuments({ status: 'pending' })).toBe(10);
    const worker = spawnWorker();
    await ready(worker);
    await waitFor(async () => (await Outbox.countDocuments({ status: 'done' })) === 10, 30000, `10 sự kiện done\n${worker.logs}`);
    expect((await effectsPerEvent(ids)).size).toBe(10);
  });

  test('WORKER BỊ GIẾT ĐỘT NGỘT (SIGKILL) GIỮA CHỪNG rồi bật lại: mỗi sự kiện đúng MỘT tác dụng, không mất cái nào', async () => {
    const TOTAL = 100;
    const first = spawnWorker();
    await ready(first);
    const ids = await emitDemo(TOTAL, 60); // mỗi sự kiện xử lý mất 60ms để có thời gian giết giữa chừng
    await events.nudge();

    // Chờ worker xử lý được một phần rồi GIẾT NGAY (không có cơ hội tắt êm, tương đương mất điện).
    await waitFor(async () => (await effects.countDocuments({})) >= 20, 30000, `worker xử lý được 20 sự kiện\n${first.logs}`);
    first.kill('SIGKILL');
    await waitFor(() => first.exitCode !== null || first.signalCode !== null, 10000, 'worker đã chết');
    const doneAtKill = await effects.countDocuments({});
    expect(doneAtKill).toBeGreaterThanOrEqual(20);
    expect(doneAtKill).toBeLessThan(TOTAL); // đúng là giết GIỮA CHỪNG, chưa xong hết

    // Bật worker thay thế: các job đang dở được giao lại, các sự kiện còn lại được xử lý tiếp.
    const second = spawnWorker();
    await ready(second);
    await waitFor(
      async () => (await effects.countDocuments({ eventId: { $in: ids } })) >= TOTAL,
      120000,
      `đủ ${TOTAL} tác dụng sau khi bật lại worker\nworker 2: ${second.logs.slice(-1500)}`
    );
    await waitFor(async () => (await Outbox.countDocuments({ status: 'done' })) === TOTAL, 60000, 'mọi sự kiện done');

    const per = await effectsPerEvent(ids);
    const missing = ids.filter((id) => !per.has(String(id))).length;
    const duplicated = [...per.values()].filter((n) => n > 1).length;
    expect({ missing, duplicated, total: per.size }).toEqual({ missing: 0, duplicated: 0, total: TOTAL });
    expect(await EventDelivery.countDocuments({})).toBe(TOTAL); // đúng một biên nhận cho mỗi sự kiện
    expect(await Outbox.countDocuments({ status: { $in: ['dead', 'pending', 'processing'] } })).toBe(0);
  });
});
