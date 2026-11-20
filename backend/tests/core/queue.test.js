/**
 * Kiểm thử hàng đợi job (Redis + BullMQ): hẹn giờ, thử lại, huỷ, chống trùng, bền vững khi worker
 * tắt, API sống khi worker/Redis chết, Bull Board.
 *
 * CẦN MỘT REDIS THẬT (BullMQ không có bản giả trong bộ nhớ). Test chỉ chạy khi đặt REDIS_TEST_URL,
 * nếu không các test Redis bị bỏ qua (hiện "skipped"), phần không cần Redis vẫn chạy:
 *
 *   REDIS_TEST_URL=redis://:redis_dev_password@localhost:6379 npm test -- tests/core/queue
 *
 * AN TOÀN DỮ LIỆU: test luôn dùng database số 15 của Redis (bỏ qua số database trong URL) và
 * FLUSHDB database 15 khi xong. Dữ liệu thật của ứng dụng nằm ở database 0 nên không bị đụng tới.
 */

const express = require('express');
const request = require('supertest');
const IORedis = require('ioredis');

const TEST_URL = process.env.REDIS_TEST_URL
  ? (() => {
      const u = new URL(process.env.REDIS_TEST_URL);
      u.pathname = '/15';
      return u.toString();
    })()
  : null;
const maybe = TEST_URL ? describe : describe.skip;

jest.setTimeout(60000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Chờ đến khi `fn()` trả giá trị truthy, tối đa `timeout` ms. */
async function waitFor(fn, timeout = 15000, interval = 100) {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() - start > timeout) throw new Error(`waitFor quá ${timeout}ms`);
    await sleep(interval);
  }
}

// ── Phần KHÔNG cần Redis ────────────────────────────────────────────────────────────────────
describe('parseRedisUrl', () => {
  const { parseRedisUrl } = require('../../core/redis');

  test('tách host, port, mật khẩu, database', () => {
    expect(parseRedisUrl('redis://:secret@cache.local:6380/3')).toMatchObject({
      host: 'cache.local',
      port: 6380,
      password: 'secret',
      db: 3,
    });
  });

  test('mặc định cổng 6379, database 0; giải mã ký tự đặc biệt trong mật khẩu', () => {
    const o = parseRedisUrl('redis://:p%40ss%2Fw%3Ard@localhost');
    expect(o).toMatchObject({ host: 'localhost', port: 6379, db: 0, password: 'p@ss/w:rd' });
  });

  test('rediss:// bật TLS; giao thức lạ bị từ chối', () => {
    expect(parseRedisUrl('rediss://:x@h:6379').tls).toBeDefined();
    expect(() => parseRedisUrl('http://localhost:6379')).toThrow(/redis:\/\//);
  });

  test('forProducer thất bại nhanh, forWorker kiên nhẫn', () => {
    const { forProducer, forWorker } = require('../../core/redis');
    expect(forProducer('redis://h:1').enableOfflineQueue).toBe(false);
    expect(forWorker('redis://h:1').maxRetriesPerRequest).toBeNull();
  });
});

describe('assertValidJobId: quy tắc jobId của BullMQ', () => {
  const { assertValidJobId } = require('../../core/queues');

  test('jobId hợp lệ: không có, gạch ngang/gạch dưới, hoặc đúng 3 đoạn có ":"', () => {
    expect(() => assertValidJobId(undefined)).not.toThrow();
    expect(() => assertValidJobId('evt-6aff196d580d37f355934379')).not.toThrow();
    expect(() => assertValidJobId('order_abc_expire')).not.toThrow();
    expect(() => assertValidJobId('order:abc:expire')).not.toThrow(); // 3 đoạn: BullMQ còn chấp nhận
  });

  test('jobId có ":" (không đúng 3 đoạn) hoặc toàn số bị từ chối với thông báo rõ ràng', () => {
    expect(() => assertValidJobId('evt:abc')).toThrow(/không được chứa dấu ':'/);
    expect(() => assertValidJobId('a:b:c:d')).toThrow(TypeError);
    expect(() => assertValidJobId('12345')).toThrow(/toàn số/);
  });
});

describe('Redis không sẵn sàng: API vẫn sống, chỉ chức năng hàng đợi trả 503', () => {
  const DEAD_URL = 'redis://127.0.0.1:6399'; // không có gì lắng nghe ở cổng này
  let queues;
  let system;
  let app;

  const originalUrl = process.env.REDIS_URL;

  beforeAll(() => {
    // REDIS_URL được đọc lúc GỌI (getQueue), không phải lúc require, nên phải giữ nguyên giá trị này
    // suốt các test bên dưới rồi mới khôi phục. (Gán `undefined` vào process.env sẽ thành chuỗi "undefined".)
    process.env.REDIS_URL = DEAD_URL;
    jest.isolateModules(() => {
      queues = require('../../core/queues');
      system = require('../../controllers/v1/system.controller');
    });
    app = express();
    app.use(express.json());
    app.get('/health', (req, res) => res.json({ status: 'ok' }));
    app.post('/demo', (req, res, next) => {
      req.body = { delayMs: 1000, failTimes: 0 };
      return system.enqueueDemoJob(req, res, next);
    });
  });

  afterAll(async () => {
    await queues.closeQueues();
    if (originalUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = originalUrl;
  });

  test('REDIS_URL hỏng: báo lỗi cấu hình rõ ràng, không lộ mật khẩu', () => {
    const { parseRedisUrl } = require('../../core/redis');
    expect(() => parseRedisUrl('khong phai url')).toThrow(/REDIS_URL không hợp lệ/);
    expect(() => parseRedisUrl('khong phai url')).not.toThrow(/khong phai url/);
  });

  test('enqueue thất bại nhanh với QueueUnavailableError (không treo request)', async () => {
    const started = Date.now();
    await expect(queues.enqueue(queues.QUEUES.SYSTEM, 'demo-delay', {})).rejects.toBeInstanceOf(
      queues.QueueUnavailableError
    );
    expect(Date.now() - started).toBeLessThan(5000);
  });

  test('LỖI LẬP TRÌNH (jobId sai) ném ngay TypeError, KHÔNG bị gán nhãn "Redis không sẵn sàng", kể cả khi Redis chết', async () => {
    const started = Date.now();
    const err = await queues.enqueue(queues.QUEUES.SYSTEM, 'x', {}, { jobId: 'evt:abc' }).catch((e) => e);
    expect(err).toBeInstanceOf(TypeError);
    expect(err).not.toBeInstanceOf(queues.QueueUnavailableError);
    expect(Date.now() - started).toBeLessThan(1000); // không phải chờ 3 giây của kết nối
  });

  test('endpoint trả 503 QUEUE_UNAVAILABLE, còn /health vẫn 200', async () => {
    const res = await request(app).post('/demo').send({});
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('QUEUE_UNAVAILABLE');
    expect((await request(app).get('/health')).status).toBe(200);
  });
});

// ── Phần CẦN Redis thật ─────────────────────────────────────────────────────────────────────
maybe('hàng đợi với Redis thật', () => {
  let queues;
  let jobsModule;
  let workerModule;
  let redis;
  let workers = [];

  const system = () => queues.getQueue(queues.QUEUES.SYSTEM);
  const startWorker = () => {
    workers = workerModule.startWorkers({
      concurrency: 2,
      log: { log: () => {}, warn: () => {} },
    });
  };
  const stopWorker = async () => {
    await Promise.all(workers.map((w) => w.close()));
    workers = [];
  };

  beforeAll(async () => {
    process.env.REDIS_URL = TEST_URL;
    queues = require('../../core/queues');
    jobsModule = require('../../jobs');
    workerModule = require('../../worker');
    redis = new IORedis(TEST_URL);
    await redis.flushdb(); // database 15 riêng của test
  });

  afterEach(async () => {
    await stopWorker();
  });

  afterAll(async () => {
    await stopWorker();
    await redis.flushdb();
    await redis.quit();
    await queues.closeQueues();
    await require('../../core/redis').closeRedis();
  });

  test('job hẹn giờ KHÔNG chạy sớm, chạy đúng sau thời gian hẹn', async () => {
    startWorker();
    const enqueuedAt = Date.now();
    const job = await queues.enqueue(queues.QUEUES.SYSTEM, 'demo-delay', { enqueuedAt }, { delay: 1500 });

    expect(await job.getState()).toBe('delayed');
    await sleep(700);
    expect(await job.getState()).toBe('delayed'); // chưa tới giờ nên chưa chạy

    await waitFor(async () => (await job.getState()) === 'completed');
    const fresh = await system().getJob(job.id);
    expect(fresh.returnvalue.elapsedMs).toBeGreaterThanOrEqual(1500);
    expect(fresh.returnvalue.elapsedMs).toBeLessThan(4000); // đúng giờ, không trễ quá nhiều
  });

  test('worker tắt: job KHÔNG mất, nằm chờ trong Redis; worker bật lại thì xử lý tiếp', async () => {
    // Không có worker nào đang chạy. API (enqueue) vẫn đẩy được job.
    const job = await queues.enqueue(queues.QUEUES.SYSTEM, 'demo-delay', { enqueuedAt: Date.now() });
    await sleep(500);
    expect(['waiting', 'delayed']).toContain(await job.getState()); // vẫn chờ, chưa ai xử lý

    startWorker(); // "worker bật lại"
    await waitFor(async () => (await job.getState()) === 'completed');
  });

  test('thử lại khi lỗi: lỗi 2 lần rồi thành công ở lần thứ 3', async () => {
    startWorker();
    const job = await queues.enqueue(
      queues.QUEUES.SYSTEM,
      'demo-delay',
      { enqueuedAt: Date.now(), failTimes: 2 },
      { backoff: { type: 'fixed', delay: 100 } } // ghi đè backoff mặc định (5s) cho test nhanh
    );
    await waitFor(async () => (await job.getState()) === 'completed', 20000);
    const fresh = await system().getJob(job.id);
    expect(fresh.returnvalue.attemptsMade).toBe(3);
  });

  test('lỗi vượt số lần thử thì job ở trạng thái failed', async () => {
    startWorker();
    const job = await queues.enqueue(
      queues.QUEUES.SYSTEM,
      'demo-delay',
      { enqueuedAt: Date.now(), failTimes: 2 },
      { attempts: 2, backoff: { type: 'fixed', delay: 50 } } // cho phép 2 lần nhưng cần 3
    );
    await waitFor(async () => (await job.getState()) === 'failed', 20000);
    expect((await system().getJob(job.id)).failedReason).toMatch(/Lỗi cố ý/);
  });

  test('tên job lạ: UnrecoverableError, KHÔNG thử lại', async () => {
    startWorker();
    const job = await queues.enqueue(queues.QUEUES.SYSTEM, 'khong-ton-tai', {});
    await waitFor(async () => (await job.getState()) === 'failed');
    expect((await system().getJob(job.id)).attemptsMade).toBe(1);
  });

  test('jobId chống trùng: đẩy hai lần cùng jobId chỉ có một job', async () => {
    const opts = { delay: 60000, jobId: 'order:abc:expire' };
    await queues.enqueue(queues.QUEUES.SYSTEM, 'demo-delay', { enqueuedAt: 1 }, opts);
    await queues.enqueue(queues.QUEUES.SYSTEM, 'demo-delay', { enqueuedAt: 2 }, opts);
    const delayed = await system().getDelayed();
    expect(delayed.filter((j) => j.id === 'order:abc:expire')).toHaveLength(1);
    // Giữ dữ liệu của lần đẩy ĐẦU TIÊN (lần sau bị bỏ qua).
    expect((await system().getJob('order:abc:expire')).data.enqueuedAt).toBe(1);
  });

  test('cancelJob huỷ job đang hẹn giờ; job đã huỷ không bao giờ chạy', async () => {
    startWorker();
    const jobId = 'order:def:expire';
    await queues.enqueue(queues.QUEUES.SYSTEM, 'demo-delay', { enqueuedAt: Date.now() }, { delay: 800, jobId });
    expect(await queues.cancelJob(queues.QUEUES.SYSTEM, jobId)).toBe(true);
    await sleep(1500);
    expect(await system().getJob(jobId)).toBeUndefined();
    expect(await queues.cancelJob(queues.QUEUES.SYSTEM, jobId)).toBe(false); // không còn gì để huỷ
  });

  test('job xong được dọn theo removeOnComplete (Redis không đầy dần)', () => {
    expect(queues.DEFAULT_JOB_OPTIONS.removeOnComplete).toMatchObject({ age: 3600, count: 1000 });
    expect(queues.DEFAULT_JOB_OPTIONS.removeOnFail).toBeDefined();
  });

  test('job heartbeat ghi dấu "worker còn sống" vào Redis', async () => {
    startWorker();
    await redis.del('worker:heartbeat');
    await queues.enqueue(queues.QUEUES.SYSTEM, 'heartbeat', {});
    const raw = await waitFor(() => redis.get('worker:heartbeat'));
    expect(JSON.parse(raw).pid).toBe(process.pid);
    expect(await redis.ttl('worker:heartbeat')).toBeGreaterThan(0); // tự hết hạn
  });

  test('job lặp: upsert nhiều lần vẫn chỉ có MỘT scheduler (chạy lại worker không nhân đôi)', async () => {
    await jobsModule.registerSchedulers();
    await jobsModule.registerSchedulers();
    const schedulers = await system().getJobSchedulers();
    expect(schedulers.filter((s) => s.key === 'heartbeat' || s.id === 'heartbeat')).toHaveLength(1);
  });

  test('API vẫn trả 201 và job được lưu dù KHÔNG có worker nào chạy', async () => {
    const system_ctrl = require('../../controllers/v1/system.controller');
    const app = express();
    app.use(express.json());
    app.post('/demo', (req, res, next) => {
      req.body = { delayMs: 60000, failTimes: 0 };
      return system_ctrl.enqueueDemoJob(req, res, next);
    });
    const res = await request(app).post('/demo').send({});
    expect(workers).toHaveLength(0); // đúng là không có worker
    expect(res.status).toBe(201);
    const job = await system().getJob(res.body.data.id);
    expect(await job.getState()).toBe('delayed');
  });
});

maybe('Bull Board', () => {
  let app;
  let queues;
  const auth = (u, p) => ({ Authorization: `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}` });

  beforeAll(() => {
    process.env.REDIS_URL = TEST_URL;
    process.env.BULL_BOARD_USER = 'admin_test';
    process.env.BULL_BOARD_PASS = 'pass_test';
    queues = require('../../core/queues');
    const { mountBullBoard } = require('../../config/bullBoard');
    app = express();
    expect(mountBullBoard(app)).toBe(true);
  });

  afterAll(async () => {
    delete process.env.BULL_BOARD_USER;
    delete process.env.BULL_BOARD_PASS;
    await queues.closeQueues();
  });

  test('không đăng nhập hoặc sai mật khẩu: 401', async () => {
    expect((await request(app).get('/admin/queues/')).status).toBe(401);
    expect((await request(app).get('/admin/queues/').set(auth('admin_test', 'sai'))).status).toBe(401);
    expect((await request(app).get('/admin/queues/').set(auth('sai', 'pass_test'))).status).toBe(401);
  });

  test('đăng nhập đúng: 200 và thấy hàng đợi system qua API của Bull Board', async () => {
    const page = await request(app).get('/admin/queues/').set(auth('admin_test', 'pass_test'));
    expect(page.status).toBe(200);
    const api = await request(app).get('/admin/queues/api/queues').set(auth('admin_test', 'pass_test'));
    expect(api.status).toBe(200);
    expect(JSON.stringify(api.body)).toContain('system');
  });

  test('thiếu BULL_BOARD_USER/PASS: Bull Board TẮT (không mở trang vô tình)', () => {
    const user = process.env.BULL_BOARD_USER;
    delete process.env.BULL_BOARD_USER;
    const { mountBullBoard } = require('../../config/bullBoard');
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    expect(mountBullBoard(express())).toBe(false);
    log.mockRestore();
    process.env.BULL_BOARD_USER = user;
  });
});
