/**
 * Kiểm thử khung máy trạng thái (core/stateMachine.js) bằng một máy MẪU "demo", không đụng tới code
 * đơn hàng thật. Chạy trên MongoDB replica set trong bộ nhớ để transaction hoạt động như thật.
 */
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const sm = require('../../core/stateMachine');
const StateEvent = require('../../models/StateEvent');

jest.setTimeout(180000);

const {
  InvalidTransitionError,
  ForbiddenTransitionError,
  GuardFailedError,
  MachineDefinitionError,
} = sm;

let repl;
// Model chỉ cần định nghĩa (không cần kết nối) nên đặt ở cấp module: các máy trạng thái khai báo
// trong describe() được tạo ở pha thu thập test, trước beforeAll.
const Demo = mongoose.model(
  'SmDemo',
  new mongoose.Schema(
    { status: String, owner: String, shippedAt: Date },
    { timestamps: true, collection: 'sm_demo' }
  )
);
let effects; // collection ghi lại các effect đã chạy
const afterCommitCalls = [];

const user = (id, permissions = []) => ({ type: 'user', id, permissions });
const admin = (id = 'admin') => user(id, ['*']);
const system = { type: 'system' };

const demoRows = [
  {
    from: 'NEW',
    to: 'PENDING',
    action: 'SUBMIT',
    permission: 'demo.submit',
    effects: async (doc, ctx) => {
      await effects.insertOne({ type: 'submit', entityId: doc._id }, ctx.session ? { session: ctx.session } : {});
    },
    afterCommit: async (doc) => {
      afterCommitCalls.push(String(doc._id));
    },
  },
  {
    from: 'PENDING',
    to: 'APPROVED',
    action: 'APPROVE',
    permission: 'demo.approve',
    // Phân tách người tạo - người duyệt (maker-checker): người duyệt không được là người gửi.
    guard: (doc, ctx) => doc.owner !== String(ctx.actor.id),
    guardMessage: 'Người duyệt không được là người gửi',
  },
  { from: 'PENDING', to: 'REJECTED', action: 'REJECT', permission: 'demo.approve' },
  { from: ['NEW', 'PENDING'], to: 'CANCELLED', action: 'CANCEL', permission: 'demo.cancel' },
  {
    from: 'APPROVED',
    to: 'SHIPPED',
    action: 'SHIP',
    actors: ['system'],
    set: () => ({ shippedAt: new Date('2026-01-01T00:00:00Z') }),
  },
];

const buildDemo = (rows = demoRows) =>
  sm.defineMachine({
    name: 'demo',
    model: Demo,
    initial: 'NEW',
    final: ['REJECTED', 'CANCELLED', 'SHIPPED'],
    transitions: rows,
  });

let machine;
const newDoc = (status = 'NEW', owner = 'u1') => Demo.create({ status, owner });
const reload = (id) => Demo.findById(id).lean();
const eventsOf = (id) => StateEvent.find({ entityType: 'demo', entityId: id }).sort({ at: 1 }).lean();

beforeAll(async () => {
  repl = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(repl.getUri(), { dbName: 'sm_test' });
  await Demo.createCollection();
  await StateEvent.createCollection();
  await mongoose.connection.createCollection('sm_effects');
  effects = mongoose.connection.collection('sm_effects');
  machine = buildDemo();
});

afterAll(async () => {
  await mongoose.disconnect();
  await repl.stop();
});

afterEach(() => {
  sm.setPermissionChecker(null);
  sm.setEventSink(null);
});

// ── Khai báo bảng ───────────────────────────────────────────────────────────────────────────
describe('defineMachine kiểm tra bảng ngay lúc khai báo', () => {
  const base = { name: 'x', model: Demo };
  const t = (extra) => ({ ...base, transitions: [{ from: 'A', to: 'B', action: 'GO' }], final: ['B'], ...extra });

  test('bảng hợp lệ được chấp nhận và mở rộng `from` dạng mảng thành nhiều dòng', () => {
    expect(machine.rows.filter((r) => r.action === 'CANCEL').map((r) => r.from)).toEqual(['NEW', 'PENDING']);
    expect(machine.states.sort()).toEqual(['APPROVED', 'CANCELLED', 'NEW', 'PENDING', 'REJECTED', 'SHIPPED']);
  });

  test.each([
    ['trùng (from, action)', t({ transitions: [{ from: 'A', to: 'B', action: 'GO' }, { from: 'A', to: 'C', action: 'GO' }], final: ['B', 'C'] }), /trùng/],
    ['trạng thái ngoài `states`', t({ states: ['A'] }), /ngoài danh sách/],
    ['trạng thái cuối còn đường ra', t({ transitions: [{ from: 'A', to: 'B', action: 'GO' }, { from: 'B', to: 'A', action: 'BACK' }], final: ['B'] }), /còn đường đi ra/],
    ['trạng thái cụt chưa khai báo final (gõ sai tên)', t({ final: [] }), /chưa khai báo/],
    ['final không tồn tại', t({ final: ['B', 'Z'] }), /không tồn tại/],
    ['initial không tồn tại', t({ initial: 'Q' }), /initial/],
    ['trạng thái không đến được từ initial', t({ initial: 'A', transitions: [{ from: 'A', to: 'B', action: 'GO' }, { from: 'C', to: 'B', action: 'X' }] }), /không thể đến được/],
    ['guard không phải hàm', t({ transitions: [{ from: 'A', to: 'B', action: 'GO', guard: 'x' }] }), /guard/],
    ['thiếu action', t({ transitions: [{ from: 'A', to: 'B' }] }), /action/],
    ['transitions rỗng', t({ transitions: [] }), /không được rỗng/],
  ])('từ chối: %s', (_label, cfg, message) => {
    expect(() => sm.defineMachine(cfg)).toThrow(MachineDefinitionError);
    expect(() => sm.defineMachine(cfg)).toThrow(message);
  });

  test('model không phải Mongoose model bị từ chối', () => {
    expect(() => sm.defineMachine({ name: 'x', model: {}, transitions: [{ from: 'A', to: 'B', action: 'G' }], final: ['B'] })).toThrow(/Mongoose model/);
  });
});

// ── Chuyển trạng thái ───────────────────────────────────────────────────────────────────────
describe('transition: chuyển hợp lệ', () => {
  test('đổi trạng thái, chạy effects, ghi sự kiện đúng, chạy afterCommit sau commit', async () => {
    const doc = await newDoc();
    afterCommitCalls.length = 0;
    const res = await sm.transition(machine, doc._id, 'SUBMIT', user('u1', ['demo.submit']), { reason: 'gửi duyệt' });

    expect(res).toMatchObject({ from: 'NEW', to: 'PENDING', action: 'SUBMIT', idempotent: false });
    expect(res.entity.status).toBe('PENDING'); // bản sao trả về phản ánh trạng thái mới
    expect((await reload(doc._id)).status).toBe('PENDING');

    const events = await eventsOf(doc._id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      entityType: 'demo',
      from: 'NEW',
      to: 'PENDING',
      action: 'SUBMIT',
      reason: 'gửi duyệt',
      actor: { type: 'user', id: 'u1' },
    });
    expect(await effects.countDocuments({ entityId: doc._id })).toBe(1);
    expect(afterCommitCalls).toEqual([String(doc._id)]);
  });

  test('`set` ghi thêm trường cùng lúc với trạng thái', async () => {
    const doc = await newDoc('APPROVED');
    await sm.transition(machine, doc._id, 'SHIP', system);
    const fresh = await reload(doc._id);
    expect(fresh.status).toBe('SHIPPED');
    expect(fresh.shippedAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  test('`from` dạng mảng: CANCEL đi được từ cả NEW và PENDING', async () => {
    for (const status of ['NEW', 'PENDING']) {
      const doc = await newDoc(status);
      const res = await sm.transition(machine, doc._id, 'CANCEL', user('u1', ['demo.cancel']));
      expect(res).toMatchObject({ from: status, to: 'CANCELLED' });
    }
  });
});

describe('transition: chuyển sai bị từ chối và KHÔNG để lại dấu vết', () => {
  test('sai trạng thái: InvalidTransitionError kèm danh sách hành động hợp lệ', async () => {
    const doc = await newDoc('NEW');
    const err = await sm.transition(machine, doc._id, 'APPROVE', admin()).catch((e) => e);
    expect(err).toBeInstanceOf(InvalidTransitionError);
    expect(err.status).toBe(409);
    expect(err.details.allowedActions.sort()).toEqual(['CANCEL', 'SUBMIT']);
    expect((await reload(doc._id)).status).toBe('NEW');
    expect(await eventsOf(doc._id)).toHaveLength(0);
  });

  test('hành động không tồn tại', async () => {
    const doc = await newDoc();
    const err = await sm.transition(machine, doc._id, 'BAY_LUON', admin()).catch((e) => e);
    expect(err).toBeInstanceOf(InvalidTransitionError);
    expect(err.details.reason).toBe('unknown_action');
  });

  test('đối tượng không tồn tại: 404', async () => {
    const err = await sm.transition(machine, new mongoose.Types.ObjectId(), 'SUBMIT', admin()).catch((e) => e);
    expect(err.code).toBe('ENTITY_NOT_FOUND');
    expect(err.status).toBe(404);
  });

  test('thiếu quyền: ForbiddenTransitionError, không đổi gì, effects không chạy', async () => {
    const doc = await newDoc();
    const err = await sm.transition(machine, doc._id, 'SUBMIT', user('u1', ['demo.cancel'])).catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenTransitionError);
    expect(err.status).toBe(403);
    expect(err.details.permission).toBe('demo.submit');
    expect((await reload(doc._id)).status).toBe('NEW');
    expect(await eventsOf(doc._id)).toHaveLength(0);
    expect(await effects.countDocuments({ entityId: doc._id })).toBe(0);
  });

  test('sai loại tác nhân: người dùng không gọi được hành động chỉ dành cho system', async () => {
    const doc = await newDoc('APPROVED');
    const err = await sm.transition(machine, doc._id, 'SHIP', admin()).catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenTransitionError);
    expect(err.details.allowedActors).toEqual(['system']);
  });

  test('guard từ chối (người duyệt = người gửi), người khác thì được', async () => {
    const doc = await newDoc('PENDING', 'u1');
    const err = await sm.transition(machine, doc._id, 'APPROVE', user('u1', ['demo.approve'])).catch((e) => e);
    expect(err).toBeInstanceOf(GuardFailedError);
    expect(err.message).toBe('Người duyệt không được là người gửi');
    expect((await reload(doc._id)).status).toBe('PENDING');

    const ok = await sm.transition(machine, doc._id, 'APPROVE', user('u2', ['demo.approve']));
    expect(ok.to).toBe('APPROVED');
  });

  test('actor thiếu `type` bị từ chối ngay (lỗi lập trình)', async () => {
    const doc = await newDoc();
    await expect(sm.transition(machine, doc._id, 'SUBMIT', { id: 'x' })).rejects.toThrow(TypeError);
  });
});

describe('bảng sự thật sinh từ chính bảng chuyển trạng thái', () => {
  // Với MỌI cặp (trạng thái, hành động): kết quả phải đúng như bảng quy định, không cần viết tay từng case.
  const pairs = [];
  beforeAll(() => {
    for (const state of machine.states) for (const action of machine.byAction.keys()) pairs.push([state, action]);
  });

  test('mọi cặp: có trong bảng thì chuyển đúng; không có thì từ chối (hoặc bỏ qua êm với system)', async () => {
    expect(pairs.length).toBe(6 * 5);
    for (const [state, action] of pairs) {
      const doc = await newDoc(state);
      const row = machine.index.get(`${state}\u0000${action}`);
      const alreadyThere = machine.byAction.get(action).some((r) => r.to === state);
      const res = await sm.transition(machine, doc._id, action, system).catch((e) => e);
      const after = (await reload(doc._id)).status;

      if (row) {
        expect(res).toMatchObject({ from: state, to: row.to, idempotent: false });
        expect(after).toBe(row.to);
      } else if (alreadyThere) {
        // system gọi lại hành động đã hoàn tất: thành công êm, không đổi gì, không ghi sự kiện mới
        expect(res).toMatchObject({ idempotent: true });
        expect(after).toBe(state);
        expect(await eventsOf(doc._id)).toHaveLength(0);
      } else {
        expect(res).toBeInstanceOf(InvalidTransitionError);
        expect(after).toBe(state);
        expect(await eventsOf(doc._id)).toHaveLength(0);
      }
    }
  });
});

describe('tác nhân system gọi lại (idempotent)', () => {
  test('SHIP lần hai bởi system: thành công, bỏ qua, không ghi sự kiện, không chạy lại effects', async () => {
    const doc = await newDoc('APPROVED');
    await sm.transition(machine, doc._id, 'SHIP', system);
    const again = await sm.transition(machine, doc._id, 'SHIP', system);
    expect(again.idempotent).toBe(true);
    expect(again.event).toBeNull();
    expect(await eventsOf(doc._id)).toHaveLength(1);
  });

  test('người dùng gọi lại thì nhận lỗi (không êm)', async () => {
    const doc = await newDoc('NEW');
    const u = user('u1', ['demo.submit']);
    await sm.transition(machine, doc._id, 'SUBMIT', u);
    await expect(sm.transition(machine, doc._id, 'SUBMIT', u)).rejects.toBeInstanceOf(InvalidTransitionError);
  });
});

// ── Toàn vẹn ────────────────────────────────────────────────────────────────────────────────
describe('nguyên tử: effect lỗi giữa chừng thì không có gì thay đổi', () => {
  const failing = sm.defineMachine({
    name: 'demo',
    model: Demo,
    initial: 'NEW',
    final: ['PENDING'],
    transitions: [
      {
        from: 'NEW',
        to: 'PENDING',
        action: 'SUBMIT',
        effects: async (doc, ctx) => {
          await effects.insertOne({ type: 'before-failure', entityId: doc._id }, ctx.session ? { session: ctx.session } : {});
          throw new Error('effect nổ giữa chừng');
        },
        afterCommit: async () => {
          afterCommitCalls.push('KHÔNG ĐƯỢC CHẠY');
        },
      },
    ],
  });

  test('trạng thái, effect đã ghi và sự kiện đều được hoàn tác; afterCommit không chạy', async () => {
    const doc = await newDoc();
    afterCommitCalls.length = 0;
    await expect(sm.transition(failing, doc._id, 'SUBMIT', system)).rejects.toThrow('effect nổ giữa chừng');
    expect((await reload(doc._id)).status).toBe('NEW');
    expect(await effects.countDocuments({ entityId: doc._id })).toBe(0); // effect ghi trước khi nổ cũng mất
    expect(await eventsOf(doc._id)).toHaveLength(0);
    expect(afterCommitCalls).toEqual([]);
  });

  test('event sink (nơi gắn outbox) lỗi thì cả chuyển trạng thái bị huỷ', async () => {
    const doc = await newDoc();
    sm.setEventSink(async () => {
      throw new Error('sink hỏng');
    });
    await expect(sm.transition(machine, doc._id, 'SUBMIT', user('u1', ['demo.submit']))).rejects.toThrow('sink hỏng');
    expect((await reload(doc._id)).status).toBe('NEW');
    expect(await eventsOf(doc._id)).toHaveLength(0);
  });

  test('event sink được gọi TRONG transaction với (event, session)', async () => {
    const doc = await newDoc();
    const seen = [];
    sm.setEventSink(async (event, session) => seen.push({ action: event.action, hasSession: !!session }));
    await sm.transition(machine, doc._id, 'SUBMIT', user('u1', ['demo.submit']));
    expect(seen).toEqual([{ action: 'SUBMIT', hasSession: true }]);
  });
});

describe('afterCommit', () => {
  test('lỗi ở afterCommit KHÔNG làm transition thất bại; trạng thái đã đổi, lỗi được trả về', async () => {
    const m = sm.defineMachine({
      name: 'demo',
      model: Demo,
      initial: 'NEW',
      final: ['PENDING'],
      transitions: [
        {
          from: 'NEW',
          to: 'PENDING',
          action: 'SUBMIT',
          afterCommit: async () => {
            throw new Error('Redis chết');
          },
        },
      ],
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const doc = await newDoc();
    const res = await sm.transition(m, doc._id, 'SUBMIT', system);
    warn.mockRestore();
    expect(res.afterCommitErrors).toHaveLength(1);
    expect(res.afterCommitErrors[0].message).toBe('Redis chết');
    expect((await reload(doc._id)).status).toBe('PENDING');
  });
});

describe('đồng thời: chỉ một yêu cầu thắng', () => {
  test('20 yêu cầu SUBMIT cùng lúc trên một đối tượng: đúng 1 thành công, effects và sự kiện đúng 1 lần', async () => {
    const doc = await newDoc();
    const u = user('u1', ['demo.submit']);
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => sm.transition(machine, doc._id, 'SUBMIT', u))
    );
    const ok = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(rejected).toHaveLength(19);
    rejected.forEach((r) => expect(r.reason).toBeInstanceOf(sm.StateMachineError));
    expect((await reload(doc._id)).status).toBe('PENDING');
    expect(await effects.countDocuments({ entityId: doc._id })).toBe(1); // hết lỗi "hoàn kho hai lần"
    expect(await eventsOf(doc._id)).toHaveLength(1);
  });
});

// ── Quyền và tiện ích ───────────────────────────────────────────────────────────────────────
describe('kiểm tra quyền có thể thay thế', () => {
  test('setPermissionChecker toàn cục thay cách kiểm tra mặc định (bước 11 sẽ cắm vào đây)', async () => {
    const doc = await newDoc();
    const calls = [];
    sm.setPermissionChecker(async (actor, permission, entity) => {
      calls.push({ permission, status: entity.status });
      return actor.id === 'duoc-phep';
    });
    await expect(sm.transition(machine, doc._id, 'SUBMIT', user('khac'))).rejects.toBeInstanceOf(ForbiddenTransitionError);
    await expect(sm.transition(machine, doc._id, 'SUBMIT', user('duoc-phep'))).resolves.toMatchObject({ to: 'PENDING' });
    expect(calls[0]).toEqual({ permission: 'demo.submit', status: 'NEW' });
  });

  test('`can` riêng của máy ưu tiên hơn bộ kiểm tra toàn cục', async () => {
    const m = sm.defineMachine({
      name: 'demo',
      model: Demo,
      can: () => true,
      final: ['PENDING'],
      transitions: [{ from: 'NEW', to: 'PENDING', action: 'SUBMIT', permission: 'bat-ky' }],
    });
    sm.setPermissionChecker(() => false);
    const doc = await newDoc();
    await expect(sm.transition(m, doc._id, 'SUBMIT', user('x'))).resolves.toMatchObject({ to: 'PENDING' });
  });
});

describe('availableActions (cho giao diện hiện đúng nút)', () => {
  test('lọc theo trạng thái, quyền, loại tác nhân và guard', async () => {
    const doc = await newDoc('PENDING', 'u1');
    const owner = user('u1', ['demo.submit', 'demo.approve', 'demo.cancel']);
    const other = user('u2', ['demo.approve', 'demo.cancel']);
    const nobody = user('u3', []);

    const names = async (actor) => (await sm.availableActions(machine, doc, actor)).map((a) => a.action).sort();
    expect(await names(owner)).toEqual(['CANCEL', 'REJECT']); // APPROVE bị guard chặn vì là người gửi
    expect(await names(other)).toEqual(['APPROVE', 'CANCEL', 'REJECT']);
    expect(await names(nobody)).toEqual([]);

    const shipping = await newDoc('APPROVED');
    expect(await sm.availableActions(machine, shipping, admin())).toEqual([]); // SHIP chỉ cho system
    expect((await sm.availableActions(machine, shipping, system)).map((a) => a.action)).toEqual(['SHIP']);
  });
});

describe('recordCreated: sự kiện khởi tạo', () => {
  test('ghi from=null, action=CREATE; trạng thái không tồn tại bị từ chối', async () => {
    const doc = await newDoc();
    const event = await sm.recordCreated(machine, doc._id, 'NEW', user('u1'));
    expect(event).toMatchObject({ from: null, to: 'NEW', action: 'CREATE' });
    await expect(sm.recordCreated(machine, doc._id, 'KHONG_CO', user('u1'))).rejects.toBeInstanceOf(MachineDefinitionError);
  });
});

describe('sinh tài liệu từ bảng', () => {
  test('toMermaid ra đúng các cạnh, trạng thái đầu và cuối', () => {
    const m = sm.toMermaid(machine);
    expect(m.startsWith('stateDiagram-v2')).toBe(true);
    expect(m).toContain('[*] --> NEW');
    expect(m).toContain('NEW --> PENDING: SUBMIT');
    expect(m).toContain('PENDING --> CANCELLED: CANCEL');
    expect(m).toContain('SHIPPED --> [*]');
  });

  test('toMarkdownTable ra đủ cột quyền và tác nhân', () => {
    const md = sm.toMarkdownTable(machine);
    expect(md).toContain('| NEW | SUBMIT | PENDING | `demo.submit` |  |');
    expect(md).toContain('| APPROVED | SHIP | SHIPPED |  | system |');
  });
});

describe('toApiError', () => {
  test('chuyển lỗi máy trạng thái thành { code, status, message, details }; lỗi khác trả null', () => {
    expect(sm.toApiError(new ForbiddenTransitionError({ a: 1 }))).toMatchObject({
      code: 'FORBIDDEN_TRANSITION',
      status: 403,
      details: { a: 1 },
    });
    expect(sm.toApiError(new Error('x'))).toBeNull();
  });
});
