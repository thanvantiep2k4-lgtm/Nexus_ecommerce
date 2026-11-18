/**
 * Seed catalog đa ngành cho NexusMart từ scripts/data/dummyjson-catalog.json.
 *
 * - 8 nhóm sản phẩm (productType), 24 danh mục tiếng Việt, thương hiệu, ~190 sản phẩm
 * - Giá quy đổi sang VND, giảm giá là PHẦN TRĂM (đúng với PriceDisplay ở storefront)
 * - Ảnh thật từ cdn.dummyjson.com, gán sản phẩm cho các nhà bán (nếu có user role vendor)
 * - Banner trang chủ (hero + khuyến mãi) dùng ảnh sản phẩm
 *
 * CẢNH BÁO: xoá products / categories / brands / banners hiện có rồi nạp lại.
 * Chạy: npm --prefix backend run seed:catalog
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Product = require('../models/Products');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const Banner = require('../models/Banner');
const User = require('../models/User');
const SiteSetting = require('../models/SiteSetting');
const catalog = require('../scripts/data/dummyjson-catalog.json');

const USD_TO_VND = 25000;

// productType (nhóm) → tên hiển thị
const GROUPS = {
  electronics: 'Điện tử',
  fashion: 'Thời trang',
  beauty: 'Làm đẹp',
  jewelry: 'Đồng hồ & Trang sức',
  home: 'Nhà cửa & Đời sống',
  groceries: 'Thực phẩm',
  sports: 'Thể thao',
  vehicles: 'Xe cộ',
};

// danh mục DummyJSON → [productType, tên danh mục, tiền tố tên sản phẩm, đơn vị]
const CATEGORY_MAP = {
  smartphones: ['electronics', 'Điện thoại', 'Điện thoại', 'chiếc'],
  laptops: ['electronics', 'Laptop', 'Laptop', 'chiếc'],
  tablets: ['electronics', 'Máy tính bảng', 'Máy tính bảng', 'chiếc'],
  'mobile-accessories': ['electronics', 'Phụ kiện công nghệ', '', 'cái'],
  'mens-shirts': ['fashion', 'Áo nam', 'Áo nam', 'cái'],
  tops: ['fashion', 'Áo nữ', 'Áo nữ', 'cái'],
  'womens-dresses': ['fashion', 'Váy đầm', 'Đầm', 'cái'],
  'mens-shoes': ['fashion', 'Giày nam', 'Giày nam', 'đôi'],
  'womens-shoes': ['fashion', 'Giày nữ', 'Giày nữ', 'đôi'],
  'womens-bags': ['fashion', 'Túi xách', 'Túi xách', 'chiếc'],
  sunglasses: ['fashion', 'Kính mắt', 'Kính mát', 'chiếc'],
  beauty: ['beauty', 'Trang điểm', '', 'hộp'],
  'skin-care': ['beauty', 'Chăm sóc da', '', 'chai'],
  fragrances: ['beauty', 'Nước hoa', 'Nước hoa', 'chai'],
  'mens-watches': ['jewelry', 'Đồng hồ nam', 'Đồng hồ nam', 'chiếc'],
  'womens-watches': ['jewelry', 'Đồng hồ nữ', 'Đồng hồ nữ', 'chiếc'],
  'womens-jewellery': ['jewelry', 'Trang sức', 'Trang sức', 'món'],
  furniture: ['home', 'Nội thất', 'Nội thất', 'món'],
  'home-decoration': ['home', 'Trang trí nhà cửa', 'Đồ trang trí', 'món'],
  'kitchen-accessories': ['home', 'Đồ dùng nhà bếp', '', 'cái'],
  groceries: ['groceries', 'Thực phẩm & Đồ uống', '', 'gói'],
  'sports-accessories': ['sports', 'Dụng cụ thể thao', '', 'cái'],
  motorcycle: ['vehicles', 'Xe máy', 'Xe máy', 'chiếc'],
  vehicle: ['vehicles', 'Ô tô', 'Ô tô', 'chiếc'],
};

// Một số từ thông dụng → tiếng Việt cho tên sản phẩm
const WORDS = [
  [/\bWom[ae]n'?s?\b/gi, 'nữ'],
  [/\bM[ae]n'?s?\b/gi, 'nam'],
  [/\bWireless\b/gi, 'không dây'],
  [/\bEarphones?\b/gi, 'Tai nghe'],
  [/\bHeadphones?\b/gi, 'Tai nghe'],
  [/\bCharger\b/gi, 'Sạc'],
  [/\bCase\b/gi, 'Ốp lưng'],
  [/\bShirt\b/gi, 'Sơ mi'],
  [/\bEarrings?\b/gi, 'Bông tai'],
  [/\bNecklace\b/gi, 'Dây chuyền'],
  [/\bRing\b/gi, 'Nhẫn'],
  [/\bLeather\b/gi, 'Da'],
  [/\bBlack\b/gi, 'Đen'],
  [/\bWhite\b/gi, 'Trắng'],
  [/\bRed\b/gi, 'Đỏ'],
  [/\bGreen\b/gi, 'Xanh lá'],
  [/\bBlue\b/gi, 'Xanh dương'],
  [/\bBrown\b/gi, 'Nâu'],
  [/\bGold(en)?\b/gi, 'Vàng'],
  [/\bSilver\b/gi, 'Bạc'],
  [/\bPink\b/gi, 'Hồng'],
  [/\bApple(?=\s*$)\b/g, 'Táo'],
  [/\bBeef Steak\b/gi, 'Thịt bò bít tết'],
  [/\bChicken Meat\b/gi, 'Thịt gà'],
  [/\bFish Steak\b/gi, 'Cá phi lê'],
  [/\bEggs\b/gi, 'Trứng gà'],
  [/\bMilk\b/gi, 'Sữa tươi'],
  [/\bJuice\b/gi, 'Nước ép'],
  [/\bRice\b/gi, 'Gạo'],
  [/\bHoney Jar\b/gi, 'Hũ mật ong'],
  [/\bCucumber\b/gi, 'Dưa leo'],
  [/\bPotatoes\b/gi, 'Khoai tây'],
  [/\bStrawberry\b/gi, 'Dâu tây'],
  [/\bKiwi\b/gi, 'Kiwi'],
  [/\bLemon\b/gi, 'Chanh'],
  [/\bMulberry\b/gi, 'Dâu tằm'],
  [/\bGreen Bell Pepper\b/gi, 'Ớt chuông xanh'],
  [/\bWater\b/gi, 'Nước suối'],
  [/\bKnife\b/gi, 'Dao'],
  [/\bSpoon\b/gi, 'Muỗng'],
  [/\bFork\b/gi, 'Nĩa'],
  [/\bPlate\b/gi, 'Đĩa'],
  [/\bBowl\b/gi, 'Bát'],
  [/\bPan\b/gi, 'Chảo'],
  [/\bGlass\b/gi, 'Ly'],
  [/\bMug\b/gi, 'Cốc'],
  [/\bBall\b/gi, 'Bóng'],
  [/\bBat\b/gi, 'Gậy'],
  [/\bRacket\b/gi, 'Vợt'],
  [/\bGloves?\b/gi, 'Găng tay'],
  [/\bHelmet\b/gi, 'Mũ bảo hiểm'],
  [/\bLamp\b/gi, 'Đèn'],
  [/\bSofa\b/gi, 'Sofa'],
  [/\bBed\b/gi, 'Giường'],
  [/\bChair\b/gi, 'Ghế'],
  [/\bTable\b/gi, 'Bàn'],
  [/\bDress\b/gi, ''],
  [/\bShoes?\b/gi, ''],
  [/\bBag\b/gi, ''],
  [/\bWatch\b/gi, ''],
];

const slugify = (s) =>
  s
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const toVnd = (usd) => {
  const v = usd * USD_TO_VND;
  const step = v >= 10000000 ? 100000 : v >= 1000000 ? 10000 : 1000;
  return Math.max(step, Math.round(v / step) * step);
};

function viTitle(p, prefix) {
  let name = p.title;
  for (const [re, rep] of WORDS) name = name.replace(re, rep);
  name = name.replace(/\s{2,}/g, ' ').trim();
  if (!prefix || name.toLowerCase().includes(prefix.toLowerCase())) return name;
  return `${prefix} ${name}`;
}

function viDescription(p, title, catName) {
  const brand = p.brand ? ` của thương hiệu ${p.brand}` : '';
  return (
    `${title} chính hãng${brand}, thuộc danh mục ${catName}. ` +
    `Sản phẩm được tuyển chọn trên NexusMart với chất lượng kiểm định, ` +
    `đánh giá trung bình ${p.rating.toFixed(1)}/5 từ người mua. ` +
    `Giao hàng toàn quốc, hỗ trợ đổi trả trong 7 ngày và thanh toán COD, chuyển khoản hoặc VNPay.`
  );
}

async function run() {
  await connectDB();

  await Promise.all([
    Product.deleteMany({}),
    Category.deleteMany({}),
    Brand.deleteMany({}),
    Banner.deleteMany({}),
  ]);

  // Thương hiệu
  const brandNames = [...new Set(catalog.map((p) => p.brand || 'NexusMart Choice'))];
  const brands = await Brand.insertMany(
    brandNames.map((name, i) => ({
      name,
      slug: slugify(name),
      status: 'active',
      featured: i < 12,
      sortOrder: i,
    }))
  );
  const brandByName = Object.fromEntries(brands.map((b) => [b.name, b]));

  // Danh mục (lấy ảnh đại diện là thumbnail sản phẩm đầu tiên)
  const djCats = Object.keys(CATEGORY_MAP).filter((c) => catalog.some((p) => p.category === c));
  const categories = await Category.insertMany(
    djCats.map((c, i) => {
      const [productType, name] = CATEGORY_MAP[c];
      const first = catalog.find((p) => p.category === c);
      return {
        parent: name,
        name,
        slug: slugify(name),
        children: [],
        productType,
        img: (first.images && first.images[0]) || first.thumbnail,
        description: `${name} — ${GROUPS[productType]}`,
        status: 'Show',
        featured: true,
        sortOrder: i,
      };
    })
  );
  const catByDj = Object.fromEntries(djCats.map((c, i) => [c, categories[i]]));

  const vendors = await User.find({ role: 'vendor' }).select('_id').lean();

  const now = Date.now();
  const docs = catalog
    .filter((p) => CATEGORY_MAP[p.category])
    .map((p, i) => {
      const [productType, catName, prefix, unit] = CATEGORY_MAP[p.category];
      const cat = catByDj[p.category];
      const brand = brandByName[p.brand || 'NexusMart Choice'];
      const title = viTitle(p, prefix);
      const images = (p.images && p.images.length ? p.images : [p.thumbnail]).slice(0, 4);
      return {
        sku: p.sku,
        img: images[0],
        title,
        slug: `${slugify(title)}-${p.id}`,
        unit,
        imageURLs: images.map((img) => ({ img, color: { name: '', clrCode: '' } })),
        parent: catName,
        children: catName,
        price: toVnd(p.price),
        discount: Math.round(p.discountPercentage),
        quantity: p.stock,
        brand: { name: brand.name, id: brand._id },
        category: { name: cat.parent, id: cat._id },
        status: p.stock > 0 ? 'in-stock' : 'out-of-stock',
        productType,
        description: viDescription(p, title, catName),
        featured: i % 4 === 0,
        sellCount: Math.round(p.rating * 40 + (p.id % 37) * 7),
        tags: [catName, GROUPS[productType], ...(p.tags || [])].slice(0, 6),
        offerDate:
          i % 6 === 0
            ? { startDate: new Date(now - 86400000), endDate: new Date(now + 7 * 86400000) }
            : undefined,
        weight: p.weight,
        vendor: vendors.length ? vendors[i % vendors.length]._id : undefined,
        importId: `dummyjson-${p.id}`,
      };
    });

  const products = await Product.insertMany(docs, { ordered: false });

  // Gắn sản phẩm vào danh mục / thương hiệu
  for (const cat of categories) {
    cat.products = products
      .filter((p) => String(p.category.id) === String(cat._id))
      .map((p) => p._id);
    await cat.save();
  }
  for (const b of brands) {
    b.products = products.filter((p) => String(p.brand.id) === String(b._id)).map((p) => p._id);
    await b.save();
  }

  // Banner trang chủ
  const pick = (dj) => products.find((p) => p.importId === `dummyjson-${dj.id}`);
  const byTitle = (re, cat) =>
    catalog.find((p) => re.test(p.title)) || catalog.find((p) => p.category === cat);
  const hero = [
    byTitle(/AirPods Max/i, 'mobile-accessories'),
    byTitle(/MacBook Pro/i, 'laptops'),
    byTitle(/Air Jordan/i, 'mens-shoes'),
  ]
    .map(pick)
    .filter(Boolean);
  const promo = ['womens-watches', 'furniture']
    .map((c) => catalog.find((p) => p.category === c))
    .map(pick)
    .filter(Boolean);
  const heroCopy = [
    [
      'Mua sắm thông minh. Sống tiện nghi hơn.',
      'Hàng chính hãng từ hàng trăm nhà bán uy tín, giao nhanh toàn quốc.',
    ],
    [
      'Hiệu năng mới cho mọi ý tưởng.',
      'Laptop chính hãng, trả góp 0%, giao nhanh 2 giờ nội thành.',
    ],
    ['Phong cách bắt đầu từ đôi giày.', 'Giày, túi, thời trang chính hãng giảm đến 30% mỗi ngày.'],
  ];
  const heroBg = ['#EEF4FF', '#F1F8EC', '#FFF3EC'];
  await Banner.insertMany([
    ...hero.map((p, i) => ({
      title: heroCopy[i][0],
      type: 'hero-slide',
      status: 'active',
      priority: 10 - i,
      scheduling: { isAlwaysActive: true },
      content: {
        text: heroCopy[i][0],
        buttonText: ['Mới về', 'Công nghệ', 'Thời trang'][i],
        textVi: heroCopy[i][1],
        image: p.img,
        backgroundColor: heroBg[i],
        buttonUrl: `/product-details/${p._id}`,
      },
    })),
    ...promo.map((p, i) => ({
      title: i === 0 ? 'Ưu đãi chớp nhoáng hôm nay' : 'Nội thất giảm đến 25%',
      type: 'promotional-banner',
      status: 'active',
      priority: 10 - i,
      scheduling: { isAlwaysActive: true },
      content: {
        text: i === 0 ? 'Ưu đãi chớp nhoáng hôm nay' : 'Nội thất giảm đến 25%',
        buttonText: i === 0 ? 'Deal hot' : 'Nhà đẹp',
        image: p.img,
        backgroundColor: i === 0 ? '#EAF2FF' : '#FFF6E5',
        buttonUrl: `/product-details/${p._id}`,
      },
    })),
  ]).catch((e) => console.warn('[banner] bỏ qua:', e.message));

  // Thông tin site + theme NexusMart
  await SiteSetting.findOneAndUpdate(
    {},
    {
      $set: {
        siteName: 'NexusMart',
        siteDescription: 'Sàn thương mại điện tử đa nhà bán tích hợp trợ lý AI',
        'theme.primaryColor': '#2563EB',
        'theme.secondaryColor': '#F59E0B',
        'theme.accentColor': '#EF4444',
        'theme.fontFamily': 'Be Vietnam Pro',
        'contact.email': 'hotro@nexusmart.vn',
        'contact.phone': '1900 6868',
        'contact.address': 'Hà Nội, Việt Nam',
        'shipping.freeShippingThreshold': 500000,
        'payment.enabledGateways': ['cod', 'bank-transfer', 'vnpay'],
        'payment.bankTransfer.bankName': 'Vietcombank (tài khoản demo)',
        'payment.bankTransfer.vietqrBankBin': '970436',
        'payment.bankTransfer.accountNumber': '0123456789',
        'payment.bankTransfer.accountName': 'NEXUSMART DEMO',
        'payment.bankTransfer.transferContentTemplate': 'NEXUS-{orderId}',
      },
    },
    { upsert: true }
  );

  console.log(
    `Đã nạp ${brands.length} thương hiệu, ${categories.length} danh mục, ${products.length} sản phẩm` +
      (vendors.length ? `, gán cho ${vendors.length} nhà bán` : '')
  );
  await mongoose.disconnect();
}

run().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
