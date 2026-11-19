/*
 * users.config.js — ĐỊNH NGHĨA user và quyền MongoDB (dữ liệu thuần, không kết nối gì).
 *
 * Dùng ở hai nơi:
 *  - scripts/mongo/init-users.js  : chạy trong container MongoDB lần khởi tạo đầu (mongosh)
 *  - backend/tests/core/mongo-roles.test.js : kiểm thử các quyền này trên MongoDB thật
 * Viết bằng JS thuần (ES5, không import) để mongosh và Node cùng đọc được.
 *
 * NGUYÊN TẮC QUYỀN TỐI THIỂU: mỗi chương trình chỉ có quyền nó thật sự cần, để lộ mật khẩu hay
 * bug trong code chỉ gây thiệt hại giới hạn.
 *
 *  user            quyền                                              dùng bởi
 *  ──────────────  ─────────────────────────────────────────────────  ───────────────────────
 *  nexus_app       đọc/ghi DB chính + CHỈ THÊM/ĐỌC sổ cái             backend, worker, crm
 *  nexus_backup    quyền sao lưu                                      job mongodump
 *  nexus_readonly  chỉ đọc cả DB chính và sổ cái                      thành viên xem dữ liệu
 *
 * SỔ CÁI "CHỈ THÊM": sổ cái nằm ở database riêng (mặc định `nexusmart_ledger`) và user ứng dụng chỉ
 * được `find` + `insert` ở đó (không update, không remove, không drop). Bút toán ghi nhầm không
 * sửa được bằng cách ghi đè mà phải ghi bút toán đảo. Lý do tách database mà không tách USER:
 * một transaction chỉ chạy dưới MỘT user. Việc "đổi trạng thái đơn + ghi bút toán" cần nằm trong
 * cùng transaction, nên cùng một user ứng dụng phải ghi được cả hai; quyền khác nhau được đặt theo
 * database. Transaction vẫn chạy xuyên được nhiều database trong cùng replica set.
 *
 * Không có user `root` ở đây: root do biến MONGO_INITDB_ROOT_* của image tạo, chỉ dùng để quản trị
 * và chạy `npm run schema:ensure`, ứng dụng không dùng.
 */

function buildUserCommands(env) {
  env = env || {};
  var mainDb = env.MONGO_DB_NAME || 'nexusmart';
  var ledgerDb = env.MONGO_LEDGER_DB_NAME || 'nexusmart_ledger';

  function need(name) {
    if (!env[name]) throw new Error('Thiếu biến môi trường ' + name);
    return env[name];
  }

  return [
    {
      db: 'admin',
      command: {
        createRole: 'nexusLedgerAppend',
        // find + insert; thêm createIndex/listIndexes/listCollections/collStats cho việc đọc
        // metadata và tạo chỉ mục. Cố ý KHÔNG có update, remove, dropCollection.
        privileges: [
          {
            resource: { db: ledgerDb, collection: '' },
            actions: ['find', 'insert', 'createIndex', 'listIndexes', 'listCollections', 'collStats'],
          },
        ],
        roles: [],
      },
    },
    {
      db: 'admin',
      command: {
        createUser: env.MONGO_APP_USER || 'nexus_app',
        pwd: need('MONGO_APP_PASS'),
        roles: [
          { role: 'readWrite', db: mainDb },
          { role: 'nexusLedgerAppend', db: 'admin' },
        ],
      },
    },
    {
      db: 'admin',
      command: {
        createUser: env.MONGO_BACKUP_USER || 'nexus_backup',
        pwd: need('MONGO_BACKUP_PASS'),
        roles: [{ role: 'backup', db: 'admin' }],
      },
    },
    {
      db: 'admin',
      command: {
        createUser: env.MONGO_READONLY_USER || 'nexus_readonly',
        pwd: need('MONGO_READONLY_PASS'),
        roles: [
          { role: 'read', db: mainDb },
          { role: 'read', db: ledgerDb },
        ],
      },
    },
  ];
}

/** Chuyển lệnh tạo thành lệnh cập nhật, để chạy lại script trên DB đã có user vẫn an toàn. */
function toUpdateCommand(command) {
  var out = {};
  Object.keys(command).forEach(function (k) {
    if (k === 'createRole') out.updateRole = command[k];
    else if (k === 'createUser') out.updateUser = command[k];
    else out[k] = command[k];
  });
  return out;
}

if (typeof module !== 'undefined') {
  module.exports = { buildUserCommands: buildUserCommands, toUpdateCommand: toUpdateCommand };
}
