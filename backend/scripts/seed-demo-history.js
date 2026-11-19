'use strict';

/**
 * Demo data enrichment — NON-destructive.
 *
 * Adds (never deletes existing data):
 *   - ~45 customers (Mongo-only, cannot log in) spread over 2026
 *   - 4 extra approved vendors + 2 pending + 1 rejected applicants
 *   - assigns vendor-less products to vendors (incl. existing Demo Tech Store)
 *   - ~450 historical orders May → Nov 2026 with realistic statuses/payments
 *   - monthly vendor payouts
 *
 * Every inserted document carries `_demoSeed: true`; products assigned to a
 * vendor carry `_demoVendorSeed: true`, so the whole thing can be undone:
 *
 *   node scripts/seed-demo-history.js            # seed (refuses to run twice)
 *   node scripts/seed-demo-history.js --rollback # remove everything it added
 */

require('dotenv').config();
const mongoose = require('mongoose');

const { ObjectId } = mongoose.Types;
const NOW = new Date();
const DEMO_VENDOR_EMAIL = 'vendor@nexusmart.local';
const DEMO_CUSTOMER_EMAIL = 'customer@nexusmart.local';

// ---------------------------------------------------------------------------
// Deterministic RNG so reruns (after rollback) produce the same data
// ---------------------------------------------------------------------------
let seed = 20261119;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (a, b) => a + Math.floor(rand() * (b - a + 1));
const weighted = (pairs) => {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of pairs) {
    if ((r -= w) <= 0) return v;
  }
  return pairs[pairs.length - 1][0];
};
const roundK = (n) => Math.round(n / 1000) * 1000;
const addHours = (d, h) => new Date(d.getTime() + h * 3600 * 1000);

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------
const LAST = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý'];
const MIDDLE = ['Văn', 'Thị', 'Minh', 'Hoàng', 'Thanh', 'Ngọc', 'Quang', 'Thu', 'Đức', 'Hải', 'Bảo', 'Gia'];
const FIRST = ['An', 'Bình', 'Châu', 'Dũng', 'Giang', 'Hà', 'Hạnh', 'Hiếu', 'Hùng', 'Khánh', 'Lan', 'Linh', 'Long', 'Mai', 'Nam', 'Nga', 'Phúc', 'Phương', 'Quân', 'Quỳnh', 'Sơn', 'Tâm', 'Thảo', 'Trang', 'Trung', 'Tú', 'Tuấn', 'Vy', 'Yến', 'Khoa'];
const CITIES = [
  ['Hà Nội', ['Cầu Giấy', 'Đống Đa', 'Hai Bà Trưng', 'Thanh Xuân', 'Hoàn Kiếm', 'Long Biên'], '100000', 30],
  ['TP. Hồ Chí Minh', ['Quận 1', 'Quận 3', 'Quận 7', 'Bình Thạnh', 'Phú Nhuận', 'Thủ Đức'], '700000', 34],
  ['Đà Nẵng', ['Hải Châu', 'Sơn Trà', 'Thanh Khê'], '550000', 9],
  ['Hải Phòng', ['Lê Chân', 'Ngô Quyền'], '180000', 6],
  ['Cần Thơ', ['Ninh Kiều', 'Cái Răng'], '900000', 5],
  ['Huế', ['Phú Hội', 'Vĩnh Ninh'], '530000', 4],
  ['Nha Trang', ['Lộc Thọ', 'Vĩnh Hải'], '650000', 4],
  ['Biên Hoà', ['Tân Phong', 'Trảng Dài'], '810000', 4],
  ['Thái Nguyên', ['Phan Đình Phùng', 'Quang Trung'], '250000', 4],
];
const STREETS = ['Lê Lợi', 'Nguyễn Trãi', 'Trần Hưng Đạo', 'Hai Bà Trưng', 'Lý Thường Kiệt', 'Nguyễn Huệ', 'Phan Chu Trinh', 'Võ Văn Tần', 'Điện Biên Phủ', 'Cách Mạng Tháng 8', 'Xuân Thuỷ', 'Kim Mã'];

const NEW_VENDORS = [
  { name: 'Lê Thu Hà', storeName: 'Thời Trang Sài Gòn', types: ['fashion'], take: 12, rate: 12, desc: 'Thời trang nam nữ phong cách trẻ trung, cập nhật xu hướng mỗi tuần.' },
  { name: 'Phạm Ngọc Lan', storeName: 'Mỹ Phẩm Hoa Sen', types: ['beauty'], take: 10, rate: 10, desc: 'Mỹ phẩm chính hãng, cam kết hoàn tiền nếu phát hiện hàng giả.' },
  { name: 'Trần Quang Huy', storeName: 'Nhà Xinh Decor', types: ['home'], take: 12, rate: 9, maxPrice: 10000000, desc: 'Nội thất và đồ trang trí cho tổ ấm hiện đại.' },
  { name: 'Võ Đức Thắng', storeName: 'Thể Thao Năng Động', types: ['sports'], take: 10, rate: 8, desc: 'Dụng cụ và trang phục thể thao cho mọi lứa tuổi.' },
];
const APPLICANTS = [
  { name: 'Đỗ Minh Khang', storeName: 'Bách Hoá Xanh Mini', status: 'pending', desc: 'Thực phẩm sạch, rau củ hữu cơ giao trong ngày.', daysAgo: 2 },
  { name: 'Ngô Bảo Châu', storeName: 'Đồng Hồ Cổ Điển', status: 'pending', desc: 'Đồng hồ cơ, đồng hồ vintage sưu tầm.', daysAgo: 5 },
  { name: 'Lý Văn Tèo', storeName: 'Shop Giá Sốc 99k', status: 'rejected', desc: 'Đồng giá 99k mọi mặt hàng.', daysAgo: 20, reason: 'Thông tin cửa hàng chưa đầy đủ, không cung cấp giấy phép kinh doanh.' },
];
const DEMO_STORE_TYPES = ['electronics'];

// Orders per month (index = month number, 2026)
const MONTH_VOLUME = { 5: 38, 6: 48, 7: 58, 8: 66, 9: 78, 10: 96, 11: 74 };

const slugify = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const randomPerson = () => {
  const name = `${pick(LAST)} ${pick(MIDDLE)} ${pick(FIRST)}`;
  const [city, districts, zip] = weighted(CITIES.map((c) => [c, c[3]]));
  return {
    name,
    phone: `09${between(10000000, 99999999)}`,
    address: `${between(1, 299)} ${pick(STREETS)}, ${pick(districts)}`,
    city,
    zipCode: zip,
  };
};

// ---------------------------------------------------------------------------
// Rollback
// ---------------------------------------------------------------------------
async function rollback(db) {
  const r1 = await db.collection('orders').deleteMany({ _demoSeed: true });
  const r2 = await db.collection('payouts').deleteMany({ _demoSeed: true });
  const r3 = await db.collection('users').deleteMany({ _demoSeed: true });
  const r4 = await db
    .collection('products')
    .updateMany({ _demoVendorSeed: true }, { $unset: { vendor: '', _demoVendorSeed: '' } });
  console.log(
    `Rollback: ${r1.deletedCount} orders, ${r2.deletedCount} payouts, ${r3.deletedCount} users removed; ${r4.modifiedCount} products unassigned.`
  );
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------
async function run(db) {
  const Users = db.collection('users');
  const Products = db.collection('products');
  const Orders = db.collection('orders');
  const Payouts = db.collection('payouts');

  if (await Orders.findOne({ _demoSeed: true })) {
    console.log('Demo data already present — run with --rollback first if you want to reseed.');
    return;
  }

  const demoVendor = await Users.findOne({ email: DEMO_VENDOR_EMAIL });
  const demoCustomer = await Users.findOne({ email: DEMO_CUSTOMER_EMAIL });
  const admin = await Users.findOne({ role: 'admin' });

  // ── Vendors ──────────────────────────────────────────────────────────────
  const vendors = []; // { _id, rate, storeName }
  if (demoVendor) {
    await Users.updateOne(
      { _id: demoVendor._id },
      {
        $set: {
          'vendorProfile.storeLogo':
            demoVendor.vendorProfile?.storeLogo ||
            'https://cdn.dummyjson.com/product-images/laptops/apple-macbook-pro-14-inch-space-grey/thumbnail.webp',
          'vendorProfile.commissionRate': demoVendor.vendorProfile?.commissionRate ?? 10,
          createdAt: new Date('2026-04-02T09:00:00+07:00'),
        },
      }
    );
    vendors.push({ _id: demoVendor._id, rate: demoVendor.vendorProfile?.commissionRate ?? 10, types: DEMO_STORE_TYPES, take: 14 });
  }

  const vendorDocs = NEW_VENDORS.map((v, i) => ({
    _id: new ObjectId(),
    name: v.name,
    email: `${slugify(v.storeName)}@demo.nexusmart.vn`,
    phone: `09${between(10000000, 99999999)}`,
    role: 'vendor',
    status: 'active',
    emailVerified: true,
    vendorProfile: {
      storeName: v.storeName,
      storeSlug: slugify(v.storeName),
      storeDescription: v.desc,
      commissionRate: v.rate,
      verificationStatus: 'approved',
      bankInfo: { bankName: pick(['Vietcombank', 'Techcombank', 'MB Bank', 'ACB', 'VPBank']), accountNumber: String(between(1e9, 9e9)), accountName: slugify(v.name).replace(/-/g, ' ').toUpperCase() },
    },
    createdAt: new Date(2026, 3 + i, between(1, 20), 10),
    updatedAt: NOW,
    _demoSeed: true,
  }));
  const applicantDocs = APPLICANTS.map((a) => ({
    _id: new ObjectId(),
    name: a.name,
    email: `${slugify(a.storeName)}@demo.nexusmart.vn`,
    phone: `09${between(10000000, 99999999)}`,
    role: 'user',
    status: 'active',
    emailVerified: true,
    vendorProfile: {
      storeName: a.storeName,
      storeSlug: slugify(a.storeName),
      storeDescription: a.desc,
      commissionRate: 10,
      verificationStatus: a.status,
      ...(a.reason ? { rejectionReason: a.reason } : {}),
    },
    createdAt: addHours(NOW, -24 * a.daysAgo),
    updatedAt: addHours(NOW, -24 * a.daysAgo),
    _demoSeed: true,
  }));
  await Users.insertMany([...vendorDocs, ...applicantDocs]);
  vendorDocs.forEach((d, i) => vendors.push({ _id: d._id, rate: NEW_VENDORS[i].rate, types: NEW_VENDORS[i].types, take: NEW_VENDORS[i].take, maxPrice: NEW_VENDORS[i].maxPrice }));

  // ── Assign vendor-less products to vendors ───────────────────────────────
  for (const v of vendors) {
    const filter = { vendor: { $in: [null] }, productType: { $in: v.types }, price: { $lte: v.maxPrice || 40000000 } };
    const candidates = await Products.find(filter).sort({ sellCount: -1 }).limit(v.take).project({ _id: 1 }).toArray();
    if (candidates.length) {
      await Products.updateMany(
        { _id: { $in: candidates.map((c) => c._id) } },
        { $set: { vendor: v._id, _demoVendorSeed: true, status: 'in-stock' } }
      );
    }
    v.assigned = candidates.length;
  }

  // ── Customers ────────────────────────────────────────────────────────────
  const customers = [];
  const usedEmails = new Set();
  for (let i = 0; i < 45; i++) {
    const p = randomPerson();
    let email = `${slugify(p.name).replace(/-/g, '.')}${between(1, 99)}@demo.nexusmart.vn`;
    while (usedEmails.has(email)) email = email.replace('@', `${between(0, 9)}@`);
    usedEmails.add(email);
    // signups: most before May, steady trickle after
    const month = weighted([[0, 6], [1, 6], [2, 7], [3, 8], [4, 5], [5, 4], [6, 4], [7, 3], [8, 3], [9, 3]]);
    customers.push({
      _id: new ObjectId(),
      name: p.name,
      email,
      phone: p.phone,
      address: p.address,
      city: p.city,
      zipCode: p.zipCode,
      role: 'user',
      status: i === 7 ? 'blocked' : 'active',
      emailVerified: true,
      createdAt: new Date(2026, month, between(1, 27), between(8, 22), between(0, 59)),
      updatedAt: NOW,
      _demoSeed: true,
    });
  }
  await Users.insertMany(customers);
  const buyers = customers.filter((c) => c.status === 'active');
  if (demoCustomer) {
    buyers.push({
      ...demoCustomer,
      createdAt: new Date('2026-05-01'),
      ...randomPerson(),
      name: demoCustomer.name || 'Customer',
      email: demoCustomer.email,
      _isDemoCustomer: true,
    });
  }

  // ── Product pools ────────────────────────────────────────────────────────
  const vendorIds = vendors.map((v) => v._id);
  const rateOf = new Map(vendors.map((v) => [String(v._id), v.rate]));
  const allProducts = await Products.find({ price: { $lte: 30000000 }, status: { $ne: 'discontinued' } }).toArray();
  const vendorPool = allProducts.filter((p) => p.vendor && vendorIds.some((id) => String(id) === String(p.vendor)));
  const cheapPool = allProducts.filter((p) => p.price <= 3000000);
  const midPool = allProducts.filter((p) => p.price > 3000000);

  // ── Orders ───────────────────────────────────────────────────────────────
  const maxInv = (await Orders.find({}).sort({ invoice: -1 }).limit(1).toArray())[0]?.invoice || 1000;
  let invoice = maxInv;
  const orders = [];
  const dates = [];
  for (const [m, n] of Object.entries(MONTH_VOLUME)) {
    const month = Number(m) - 1;
    const lastDay = month === NOW.getMonth() ? NOW.getDate() : new Date(2026, month + 1, 0).getDate();
    for (let i = 0; i < n; i++) {
      const day = between(1, lastDay);
      const d = new Date(2026, month, day, weighted([[8, 2], [10, 3], [12, 4], [14, 3], [19, 5], [21, 6], [22, 3]]) + between(0, 1), between(0, 59), between(0, 59));
      if (d < NOW - 30 * 60 * 1000) dates.push(d);
    }
  }
  dates.sort((a, b) => a - b);

  const carriers = ['ghtk', 'ghn', 'viettelpost'];
  for (const createdAt of dates) {
    const ageDays = (NOW - createdAt) / 86400000;
    const eligible = buyers.filter((b) => b.createdAt <= createdAt);
    const demoBuyer = buyers.find((b) => b._isDemoCustomer);
    const buyer = demoBuyer && rand() < 0.035 ? demoBuyer : pick(eligible.length ? eligible : buyers);

    // items
    const lineCount = weighted([[1, 60], [2, 30], [3, 10]]);
    const chosen = new Map();
    for (let k = 0; k < lineCount; k++) {
      const pool = rand() < 0.55 && vendorPool.length ? vendorPool : rand() < 0.75 ? cheapPool : midPool;
      const p = pick(pool);
      if (!chosen.has(String(p._id))) chosen.set(String(p._id), p);
    }

    const status =
      ageDays > 10
        ? weighted([['delivered', 90], ['cancelled', 10]])
        : ageDays > 4
          ? weighted([['delivered', 60], ['shipped', 25], ['processing', 7], ['cancelled', 8]])
          : ageDays > 1
            ? weighted([['shipped', 30], ['processing', 30], ['confirmed', 20], ['pending', 15], ['cancelled', 5]])
            : weighted([['pending', 60], ['confirmed', 30], ['processing', 10]]);
    const fulfil = { delivered: 'delivered', shipped: 'shipped', processing: 'packed' }[status] || 'pending';

    const items = [];
    const cart = [];
    for (const p of chosen.values()) {
      const qty = weighted([[1, 75], [2, 20], [3, 5]]);
      const unit = roundK(p.price * (1 - (p.discount || 0) / 100));
      const subtotal = unit * qty;
      const vendorId = p.vendor && rateOf.has(String(p.vendor)) ? p.vendor : null;
      items.push({
        _id: new ObjectId(),
        product: p._id,
        ...(vendorId ? { vendor: vendorId, vendorCommission: Math.round((subtotal * rateOf.get(String(vendorId))) / 100) } : {}),
        title: p.title,
        sku: p.sku,
        image: p.img,
        price: unit,
        quantity: qty,
        subtotal,
        fulfillmentStatus: fulfil,
      });
      cart.push({
        _id: p._id, title: p.title, img: p.img, slug: p.slug, sku: p.sku, price: p.price, discount: p.discount || 0,
        productType: p.productType, category: p.category, brand: p.brand, parent: p.parent, children: p.children,
        unit: p.unit, orderQuantity: qty, ...(p.vendor ? { vendor: p.vendor } : {}),
      });
    }
    const subTotal = items.reduce((s, it) => s + it.subtotal, 0);
    const shippingCost = subTotal >= 500000 ? 0 : pick([15000, 22000, 30000]);
    const discount = rand() < 0.15 ? Math.min(100000, roundK(subTotal * pick([0.05, 0.1]))) : 0;
    const totalAmount = subTotal + shippingCost - discount;

    const pay = weighted([[['COD', 'cod'], 50], [['Card', 'vnpay'], 25], [['Card', 'momo'], 15], [['Bank Transfer', 'bank-transfer'], 10]]);
    const online = pay[1] !== 'cod';
    const paid = status === 'delivered' || (online && status !== 'cancelled');
    const refunded = status === 'cancelled' && online && rand() < 0.7;

    // timeline
    const history = [{ status: 'pending', timestamp: createdAt, note: 'Đơn hàng được tạo' }];
    const steps = ['confirmed', 'processing', 'shipped', 'delivered'];
    const target = status === 'cancelled' ? weighted([['pending', 50], ['confirmed', 50]]) : status;
    let t = createdAt;
    let shippedAt;
    let deliveredAt;
    for (const s of steps) {
      if (steps.indexOf(s) > steps.indexOf(target) || target === 'pending') break;
      t = addHours(t, s === 'delivered' ? between(24, 72) : s === 'shipped' ? between(6, 24) : between(1, 8));
      if (t > NOW) t = addHours(NOW, -0.5);
      history.push({ status: s, timestamp: t, note: { confirmed: 'Đã xác nhận đơn', processing: 'Đang đóng gói', shipped: 'Đã bàn giao cho đơn vị vận chuyển', delivered: 'Giao hàng thành công' }[s] });
      if (s === 'shipped') shippedAt = t;
      if (s === 'delivered') deliveredAt = t;
    }
    if (status === 'cancelled') {
      history.push({ status: 'cancelled', timestamp: addHours(t, between(1, 20)), note: pick(['Khách huỷ đơn', 'Khách đổi ý', 'Không liên lạc được khách', 'Hết hàng']) });
    }

    invoice += 1;
    const carrier = shippedAt ? pick(carriers) : undefined;
    const ymd = `${String(createdAt.getFullYear()).slice(2)}${String(createdAt.getMonth() + 1).padStart(2, '0')}${String(createdAt.getDate()).padStart(2, '0')}`;
    orders.push({
      _id: new ObjectId(),
      user: buyer._id,
      cart,
      items,
      name: buyer.name,
      address: buyer.address,
      email: buyer.email,
      contact: buyer.phone,
      city: buyer.city,
      country: 'Việt Nam',
      zipCode: buyer.zipCode,
      subTotal,
      shippingCost,
      discount,
      totalAmount,
      tax: 0,
      shippingOption: shippingCost === 0 ? 'free' : 'standard',
      paymentMethod: pay[0],
      paymentGateway: pay[1],
      paymentStatus: refunded ? 'refunded' : paid ? 'paid' : 'unpaid',
      ...(paid || refunded ? { paidAt: online ? addHours(createdAt, 0.05) : deliveredAt, transactionId: online ? `TXN${createdAt.getTime().toString(36).toUpperCase()}` : undefined } : {}),
      ...(refunded ? { refundedAt: history[history.length - 1].timestamp, refundAmount: totalAmount } : {}),
      invoice,
      orderNumber: `NM${ymd}${String(invoice).padStart(5, '0')}`,
      status,
      statusHistory: history,
      ...(carrier ? { carrier, trackingNumber: `${carrier.toUpperCase()}${between(100000000, 999999999)}`, shippedAt } : {}),
      ...(deliveredAt ? { deliveredAt } : {}),
      ...(shippedAt && !deliveredAt ? { estimatedDelivery: addHours(shippedAt, 72) } : {}),
      displayCurrency: 'VND',
      exchangeRate: 1,
      orderNote: rand() < 0.12 ? pick(['Giao giờ hành chính', 'Gọi trước khi giao', 'Gói quà giúp mình', 'Để ở bảo vệ toà nhà']) : undefined,
      createdAt,
      updatedAt: history[history.length - 1].timestamp,
      _demoSeed: true,
    });
  }
  // strip undefined keys
  orders.forEach((o) => Object.keys(o).forEach((k) => o[k] === undefined && delete o[k]));
  await Orders.insertMany(orders);

  // last login for buyers = their latest order
  const lastOrder = new Map();
  orders.forEach((o) => lastOrder.set(String(o.user), o.createdAt));
  await Promise.all(
    customers.map((c) => lastOrder.has(String(c._id)) && Users.updateOne({ _id: c._id }, { $set: { lastLogin: lastOrder.get(String(c._id)) } }))
  );

  // ── Payouts: monthly settlement of delivered vendor revenue ──────────────
  const payouts = [];
  for (const v of vendors) {
    const byMonth = new Map();
    orders
      .filter((o) => o.status === 'delivered')
      .forEach((o) =>
        o.items
          .filter((it) => String(it.vendor) === String(v._id))
          .forEach((it) => {
            const key = o.createdAt.getMonth();
            byMonth.set(key, (byMonth.get(key) || 0) + it.subtotal - (it.vendorCommission || 0));
          })
      );
    for (const [month, net] of byMonth) {
      if (net <= 0) continue;
      const isCurrent = month === NOW.getMonth();
      const requestedAt = isCurrent ? addHours(NOW, -between(6, 40)) : new Date(2026, month + 1, between(2, 6), 10);
      const status = isCurrent ? 'pending' : month === NOW.getMonth() - 1 ? weighted([['paid', 60], ['processing', 40]]) : 'paid';
      payouts.push({
        _id: new ObjectId(),
        vendor: v._id,
        amount: roundK(net),
        currency: 'VND',
        status,
        requestedAt,
        ...(status === 'paid' ? { processedAt: addHours(requestedAt, between(20, 60)), processedBy: admin?._id, transactionRef: `PO${between(1000000, 9999999)}`, note: `Đối soát doanh thu tháng ${month + 1}/2026` } : {}),
        createdAt: requestedAt,
        updatedAt: requestedAt,
        _demoSeed: true,
      });
    }
  }
  if (payouts.length) await Payouts.insertMany(payouts);

  // ── Summary ──────────────────────────────────────────────────────────────
  const revenue = orders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + o.totalAmount, 0);
  console.log(`Vendors: ${vendors.length} active (${vendors.map((v) => v.assigned).join('/')} products assigned), ${applicantDocs.length} applicants`);
  console.log(`Customers: ${customers.length} | Orders: ${orders.length} | Payouts: ${payouts.length}`);
  console.log(`Revenue (non-cancelled): ${revenue.toLocaleString('vi-VN')} ₫`);
  const demoOrders = orders.filter((o) => o.items.some((it) => demoVendor && String(it.vendor) === String(demoVendor._id))).length;
  console.log(`Orders containing Demo Tech Store items: ${demoOrders} | Orders of ${DEMO_CUSTOMER_EMAIL}: ${orders.filter((o) => demoCustomer && String(o.user) === String(demoCustomer._id)).length}`);
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  try {
    if (process.argv.includes('--rollback')) await rollback(db);
    else await run(db);
  } finally {
    await mongoose.disconnect();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
