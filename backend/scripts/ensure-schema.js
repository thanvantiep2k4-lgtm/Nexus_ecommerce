'use strict';

/**
 * ensure-schema.js — đặt các RÀNG BUỘC DỮ LIỆU ngay trong MongoDB và tạo chỉ mục.
 *
 * Chạy:  cd backend && npm run schema:ensure
 *   (dùng MONGO_ADMIN_URI nếu có, ngược lại dùng MONGO_URI; cần quyền tạo collection/chỉ mục)
 *
 * IDEMPOTENT: chạy bao nhiêu lần cũng được, chạy trong bước deploy và sau mỗi lần thêm model.
 *
 * VÌ SAO CẦN: trước đây mọi ràng buộc (kho không âm, tiền hợp lệ, đánh giá 1–5 sao…) chỉ nằm trong
 * Mongoose. Mongoose chỉ chặn được khi ghi qua nó; một script ghi thẳng vào DB, công cụ như
 * MongoDB Compass, hay một bug bỏ qua model đều ghi được dữ liệu sai (kho = -1). `$jsonSchema`
 * validator đặt luật NGAY TRONG collection nên chặn mọi đường ghi, giống ràng buộc CHECK của CSDL
 * quan hệ.
 *
 * Quy ước chọn mức kiểm tra:
 *  - validationAction 'error': ghi sai thì bị từ chối (không chỉ cảnh báo).
 *  - validationLevel 'moderate': chỉ áp cho lệnh INSERT và UPDATE trên document đã hợp lệ; document
 *    cũ đang sai (dữ liệu lịch sử) không bị chặn khi bị cập nhật, nên bật validator không làm
 *    hỏng dữ liệu hiện có. Dữ liệu cũ nên được dọn riêng.
 *
 * TIỀN là SỐ NGUYÊN ĐỒNG: bsonType 'number' + minimum + multipleOf: 1. Không dùng bsonType 'int'
 * vì driver Node lưu số nguyên > 2^31 (≥ 2,1 tỉ đồng) dưới dạng double, 'int' sẽ từ chối oan.
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const MAIN_DB = process.env.MONGO_DB_NAME || 'nexusmart';
// Sổ cái nằm ở database RIÊNG để cấp quyền "chỉ thêm + đọc" cho user ứng dụng (xem
// scripts/mongo/init-users.js). Giao dịch (transaction) vẫn chạy xuyên 2 database cùng lúc được.
const LEDGER_DB = process.env.MONGO_LEDGER_DB_NAME || 'nexusmart_ledger';

const money = (min = 0) => ({ bsonType: 'number', minimum: min, multipleOf: 1 });

/**
 * Định nghĩa validator và chỉ mục cho từng collection.
 * Thêm collection mới (skus, orders v2…) bằng cách thêm một mục vào đây.
 */
const COLLECTIONS = [
  {
    db: MAIN_DB,
    name: 'products',
    // Chỉ chặn số âm. Giá sản phẩm KHÔNG ép số nguyên ở đây vì dữ liệu hiện có còn lẫn giá USD thập
    // phân (xem trang kiểm tra tiền tệ trong CRM); sẽ ép khi chuyển sang mô hình SKU (giá nguyên VND).
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        properties: {
          quantity: { bsonType: 'number', minimum: 0, description: 'tồn kho không được âm' },
          variants: {
            bsonType: 'array',
            items: {
              bsonType: 'object',
              properties: { stock: { bsonType: 'number', minimum: 0 } },
            },
          },
        },
      },
    },
  },
  {
    db: MAIN_DB,
    name: 'orders',
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        properties: {
          subTotal: { bsonType: 'number', minimum: 0 },
          shippingCost: { bsonType: 'number', minimum: 0 },
          discount: { bsonType: 'number', minimum: 0 },
          totalAmount: { bsonType: 'number', minimum: 0 },
        },
      },
    },
  },
  {
    db: MAIN_DB,
    name: 'payouts',
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        properties: {
          amount: { ...money(1), description: 'số nguyên đồng, tối thiểu 1' },
          currency: { enum: ['VND'] },
        },
      },
    },
  },
  {
    db: MAIN_DB,
    name: 'reviews',
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        properties: { rating: { bsonType: 'number', minimum: 1, maximum: 5 } },
      },
    },
  },

  {
    db: MAIN_DB,
    name: 'state_events',
    // Nhật ký chuyển trạng thái do core/stateMachine.js ghi (models/StateEvent.js). `from` là null ở
    // sự kiện khởi tạo. Chỉ mục chính (entityType, entityId, at) cho truy vấn timeline.
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['entityType', 'entityId', 'to', 'action', 'actor', 'at'],
        properties: {
          entityType: { bsonType: 'string' },
          entityId: { bsonType: 'objectId' },
          from: { bsonType: ['string', 'null'] },
          to: { bsonType: 'string' },
          action: { bsonType: 'string' },
          actor: {
            bsonType: 'object',
            required: ['type'],
            properties: { type: { bsonType: 'string' } },
          },
          at: { bsonType: 'date' },
        },
      },
    },
    indexes: [{ key: { entityType: 1, entityId: 1, at: 1 }, options: {} }],
  },

  {
    db: MAIN_DB,
    name: 'outbox',
    // Hộp thư đi của sự kiện (models/Outbox.js, core/events.js). Chỉ mục (kể cả TTL 7 ngày cho dòng done)
    // do model khai báo, ensure-schema tạo qua createIndexes nên không khai báo lại ở đây.
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['type', 'status'],
        properties: {
          type: { bsonType: 'string' },
          status: { enum: ['pending', 'processing', 'published', 'done', 'dead'] },
          attempts: { bsonType: 'number', minimum: 0 },
        },
      },
    },
  },
  {
    db: MAIN_DB,
    name: 'event_deliveries',
    // Biên nhận giao sự kiện (models/EventDelivery.js): chỉ mục duy nhất (eventId, subscriber) chống xử lý lặp.
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['eventId', 'subscriber', 'at'],
        properties: {
          eventId: { bsonType: 'objectId' },
          subscriber: { bsonType: 'string' },
          at: { bsonType: 'date' },
        },
      },
    },
  },

  // ── Collection sẽ dùng ở bước Sổ cái / Ví (tạo sẵn để user và quyền đã đúng từ đầu) ──
  {
    db: LEDGER_DB,
    name: 'ledger_entries',
    // Sổ cái KÉP: mỗi bút toán chỉ có Nợ HOẶC Có (một bên > 0, bên kia = 0).
    // "Chỉ thêm, không sửa/xoá" được bảo đảm bằng QUYỀN của user ứng dụng, không phải bằng validator.
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['txnId', 'account', 'debit', 'credit', 'refType', 'refId', 'createdAt'],
        properties: {
          txnId: { bsonType: 'string' },
          account: { bsonType: 'string' },
          debit: money(0),
          credit: money(0),
          refType: { bsonType: 'string' },
          refId: { bsonType: 'string' },
          createdAt: { bsonType: 'date' },
        },
        oneOf: [
          { properties: { debit: { minimum: 1 }, credit: { maximum: 0 } } },
          { properties: { debit: { maximum: 0 }, credit: { minimum: 1 } } },
        ],
      },
    },
    indexes: [
      // Chống ghi trùng bút toán khi một job bị chạy lại.
      { key: { txnId: 1, account: 1, refId: 1 }, options: { unique: true } },
      { key: { account: 1, createdAt: 1 }, options: {} },
    ],
  },
  {
    db: MAIN_DB,
    name: 'wallet_balances',
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['shopId'],
        properties: {
          available: money(0),
          pending: money(0),
          inTransit: money(0),
        },
      },
    },
    indexes: [{ key: { shopId: 1 }, options: { unique: true } }],
  },
];

/** Tạo collection nếu chưa có, rồi gắn (hoặc cập nhật) validator. */
async function applyValidator(client, def, log) {
  const db = client.db(def.db);
  const exists = (await db.listCollections({ name: def.name }, { nameOnly: true }).toArray())
    .length;
  const validation = { validator: def.validator, validationLevel: 'moderate', validationAction: 'error' };

  if (!exists) {
    await db.createCollection(def.name, validation);
    log(`  + tạo collection ${def.db}.${def.name} (kèm validator)`);
  } else {
    await db.command({ collMod: def.name, ...validation });
    log(`  ~ cập nhật validator ${def.db}.${def.name}`);
  }

  for (const idx of def.indexes || []) {
    await db.collection(def.name).createIndex(idx.key, idx.options);
    log(`    chỉ mục ${JSON.stringify(idx.key)}${idx.options.unique ? ' (unique)' : ''}`);
  }
}

/**
 * Nạp mọi model trong thư mục models/ rồi tạo chỉ mục đã khai báo trong schema.
 * Ở production `autoIndex` bị tắt (config/db.js) nên đây là NƠI DUY NHẤT tạo chỉ mục.
 * Không xoá chỉ mục nào (dùng createIndexes, không dùng syncIndexes) nên an toàn với dữ liệu thật.
 */
async function ensureModelIndexes(log) {
  const dir = path.join(__dirname, '..', 'models');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    require(path.join(dir, file));
  }
  const failures = [];
  for (const Model of Object.values(mongoose.models)) {
    try {
      await Model.createIndexes();
      log(`  chỉ mục model ${Model.modelName}: ok`);
    } catch (err) {
      // Thường do dữ liệu hiện có đã trùng giá trị mà chỉ mục unique cấm. Phải dọn dữ liệu rồi chạy lại.
      failures.push({ model: Model.modelName, message: err.message });
      log(`  ! chỉ mục model ${Model.modelName}: LỖI ${err.message}`);
    }
  }
  return failures;
}

async function ensureSchema({ log = console.log } = {}) {
  const client = mongoose.connection.getClient();
  log('[schema:ensure] gắn validator…');
  for (const def of COLLECTIONS) await applyValidator(client, def, log);
  log('[schema:ensure] tạo chỉ mục model…');
  const failures = await ensureModelIndexes(log);
  return { failures };
}

module.exports = { ensureSchema, COLLECTIONS, MAIN_DB, LEDGER_DB };

if (require.main === module) {
  (async () => {
    // Nạp .env giống các script khác (config/secret đọc .env ở thư mục đang chạy).
    const { secret } = require('../config/secret');
    const uri = process.env.MONGO_ADMIN_URI || secret.db_url;
    if (!uri) {
      console.error('Thiếu MONGO_ADMIN_URI hoặc MONGO_URI');
      process.exit(1);
    }
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000, autoIndex: false });
    let exitCode = 0;
    try {
      const { failures } = await ensureSchema();
      if (failures.length) exitCode = 1;
    } catch (err) {
      console.error('[schema:ensure] thất bại:', err.message);
      exitCode = 1;
    } finally {
      await mongoose.disconnect();
    }
    process.exit(exitCode);
  })();
}
