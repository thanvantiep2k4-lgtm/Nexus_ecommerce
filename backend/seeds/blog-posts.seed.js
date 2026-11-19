#!/usr/bin/env node

/**
 * Seed blog posts into the BlogPost collection.
 *
 * Usage:
 *   cd backend && node seeds/blog-posts.seed.js
 *
 * Chạy lại được nhiều lần: bài đã có (theo slug) sẽ được cập nhật, bài mẫu cũ
 * (tiếng Anh, ảnh lỗi) bị xoá. Cần ít nhất một Admin trong DB (làm tác giả).
 * Ảnh bìa là file tĩnh trong frontend/public/assets/img/blog/.
 */

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const BlogPost = require('../models/BlogPost');
const Admin = require('../models/Admin');
const { secret } = require('../config/secret');

const img = (name) => `/assets/img/blog/${name}.svg`;

// Slug của bài mẫu cũ cần dọn
const LEGACY_SLUGS = [
  'modern-art-clay-ceramics',
  'clothes-linked-climate-change',
  'sound-of-fashion-malcolm-mclaren',
  'top-10-gadgets-2026',
  'skincare-essentials-every-season',
  'style-home-on-budget',
];

const blogPosts = [
  {
    title: 'Cách chọn laptop cho sinh viên: cấu hình, pin và ngân sách',
    slug: 'chon-laptop-sinh-vien',
    excerpt:
      'Sinh viên cần laptop nhẹ, pin lâu và đủ mạnh cho việc học. Bài viết giúp bạn chọn đúng cấu hình mà không tốn tiền oan.',
    content: `<p>Laptop là khoản đầu tư lớn của sinh viên và thường dùng suốt 3–4 năm. Chọn đúng ngay từ đầu giúp bạn tiết kiệm được nhiều chi phí sửa chữa và nâng cấp về sau.</p>
<h3>1. Xác định nhu cầu trước khi xem giá</h3>
<p>Sinh viên kinh tế, ngoại ngữ chủ yếu dùng văn phòng và học trực tuyến, nên ưu tiên máy nhẹ, pin trâu. Sinh viên công nghệ thông tin, thiết kế đồ họa cần CPU mạnh, RAM lớn và màn hình đẹp.</p>
<h3>2. Cấu hình nên có</h3>
<ul>
<li><strong>RAM:</strong> tối thiểu 8GB, nên chọn 16GB nếu học lập trình hoặc thiết kế</li>
<li><strong>Ổ cứng:</strong> SSD từ 256GB trở lên để khởi động và mở ứng dụng nhanh</li>
<li><strong>Pin:</strong> thực tế dùng được từ 6 tiếng để mang đi học cả ngày</li>
<li><strong>Trọng lượng:</strong> dưới 1,6kg để bỏ balo không thấy nặng</li>
</ul>
<blockquote><p>"Đừng mua cấu hình cao hơn nhu cầu. Hãy dành phần tiền dư để mua thêm chuột, balo và gói bảo hành mở rộng."</p></blockquote>
<h3>3. Ngân sách gợi ý</h3>
<p>Mức 12–18 triệu đồng đáp ứng tốt nhu cầu học tập và văn phòng. Từ 20 triệu trở lên phù hợp với ngành đồ họa, lập trình hoặc dựng video.</p>
<p>Trước khi mua, hãy so sánh giá giữa các nhà bán trên NexusMart và đọc kỹ đánh giá của người đã mua để chọn được sản phẩm phù hợp nhất.</p>`,
    featuredImage: img('chon-laptop-sinh-vien'),
    category: 'Công nghệ',
    tags: ['Laptop', 'Sinh viên', 'Hướng dẫn mua'],
    featured: true,
    views: 214,
    publishedAt: new Date('2026-11-02'),
  },
  {
    title: 'Tai nghe chống ồn: nên chọn loại nào cho nhu cầu của bạn?',
    slug: 'tai-nghe-chong-on',
    excerpt:
      'Chống ồn chủ động, chống ồn thụ động, in-ear hay over-ear? Hiểu rõ khác biệt để chọn chiếc tai nghe phù hợp.',
    content: `<p>Tai nghe chống ồn không còn là món đồ xa xỉ. Nhiều mẫu giá dưới 3 triệu đồng đã cho chất lượng chống ồn đủ dùng khi đi xe buýt, làm việc ở quán cà phê hay học trong thư viện.</p>
<h3>Chống ồn chủ động và thụ động</h3>
<p>Chống ồn chủ động (ANC) dùng micro thu tiếng ồn xung quanh rồi tạo sóng âm ngược pha để triệt tiêu. Chống ồn thụ động dựa vào thiết kế đệm tai để cách âm vật lý. Các mẫu tốt thường kết hợp cả hai.</p>
<h3>Chọn kiểu dáng</h3>
<ul>
<li><strong>In-ear (nhét tai):</strong> nhỏ gọn, tiện mang theo, phù hợp đi lại và tập thể thao</li>
<li><strong>Over-ear (chụp tai):</strong> chống ồn tốt nhất, đeo thoải mái khi dùng nhiều giờ</li>
</ul>
<h3>Những điều cần kiểm tra</h3>
<p>Hãy xem thời lượng pin, độ trễ khi xem phim, chất lượng micro khi gọi và chế độ xuyên âm để nghe thông báo mà không cần tháo tai nghe.</p>
<p>Đừng quên đọc đánh giá có nhãn "đã mua hàng" trên NexusMart, vì đó là phản hồi thực tế nhất từ người dùng.</p>`,
    featuredImage: img('tai-nghe-chong-on'),
    category: 'Công nghệ',
    tags: ['Tai nghe', 'Âm thanh', 'Đánh giá'],
    featured: true,
    views: 178,
    publishedAt: new Date('2026-11-05'),
  },
  {
    title: 'Bảo vệ điện thoại đúng cách: ốp lưng và kính cường lực',
    slug: 'bao-ve-dien-thoai',
    excerpt:
      'Một chiếc ốp lưng tốt và miếng kính cường lực chuẩn có thể giúp bạn tránh được khoản sửa chữa hàng triệu đồng.',
    content: `<p>Màn hình vỡ là lỗi phổ biến nhất khiến người dùng phải mang điện thoại đi sửa. Chi phí thay màn hình có thể lên tới hàng triệu đồng, trong khi phụ kiện bảo vệ chỉ tốn vài chục nghìn.</p>
<h3>Chọn ốp lưng</h3>
<ul>
<li><strong>Ốp silicon:</strong> mềm, chống trượt, giá rẻ</li>
<li><strong>Ốp chống sốc:</strong> có gờ nâng bảo vệ camera và màn hình, phù hợp người hay làm rơi máy</li>
<li><strong>Ốp trong suốt:</strong> giữ nguyên vẻ ngoài của máy nhưng dễ ngả vàng theo thời gian</li>
</ul>
<h3>Chọn kính cường lực</h3>
<p>Nên chọn loại có độ cứng 9H, viền cong 2.5D và lớp phủ chống vân tay. Khi dán, hãy lau sạch bụi trên màn hình để tránh bọt khí.</p>
<h3>Mẹo kéo dài tuổi thọ máy</h3>
<p>Không để điện thoại ở nơi nóng, không vừa sạc vừa chơi game nặng và nên dùng củ sạc, dây sạc chính hãng hoặc có chứng nhận chất lượng.</p>`,
    featuredImage: img('bao-ve-dien-thoai'),
    category: 'Phụ kiện',
    tags: ['Điện thoại', 'Phụ kiện', 'Mẹo hay'],
    featured: true,
    views: 131,
    publishedAt: new Date('2026-11-08'),
  },
  {
    title: 'Mua sắm trực tuyến an toàn: cách tránh hàng giả và lừa đảo',
    slug: 'mua-sam-truc-tuyen-an-toan',
    excerpt:
      'Những dấu hiệu nhận biết người bán uy tín, cách thanh toán an toàn và quyền lợi của bạn khi mua hàng online.',
    content: `<p>Mua hàng trực tuyến rất tiện lợi, nhưng cũng tiềm ẩn rủi ro như hàng giả, hàng kém chất lượng hoặc bị lừa đặt cọc. Một vài thói quen nhỏ giúp bạn tránh được phần lớn rủi ro này.</p>
<h3>Dấu hiệu người bán đáng tin</h3>
<ul>
<li>Có trang cửa hàng rõ ràng, thông tin liên hệ đầy đủ</li>
<li>Được sàn xác minh và có nhiều đánh giá thật</li>
<li>Mô tả sản phẩm chi tiết, có ảnh thực tế</li>
</ul>
<h3>Cảnh giác với giá quá rẻ</h3>
<p>Sản phẩm giảm giá sâu bất thường so với mặt bằng chung thường là hàng nhái hoặc hàng lỗi. Hãy so sánh giá giữa nhiều người bán trước khi quyết định.</p>
<h3>Thanh toán an toàn</h3>
<p>Ưu tiên thanh toán qua cổng chính thức như VNPay, MoMo hoặc thanh toán khi nhận hàng (COD) để được kiểm tra hàng trước. Không chuyển khoản trực tiếp cho người lạ ngoài hệ thống của sàn.</p>
<h3>Khi có vấn đề</h3>
<p>Hãy giữ lại ảnh chụp, tin nhắn và mã đơn hàng, sau đó liên hệ bộ phận hỗ trợ của sàn để được giải quyết khiếu nại.</p>`,
    featuredImage: img('cho-an-toan-khi-mua-online'),
    category: 'Mua sắm',
    tags: ['Mua sắm online', 'An toàn', 'Kinh nghiệm'],
    featured: false,
    views: 259,
    publishedAt: new Date('2026-11-10'),
  },
  {
    title: 'Nhà thông minh cho người mới: bắt đầu từ đâu?',
    slug: 'nha-thong-minh-cho-nguoi-moi',
    excerpt:
      'Không cần đầu tư lớn, bạn vẫn có thể biến căn nhà của mình thành ngôi nhà thông minh với vài thiết bị cơ bản.',
    content: `<p>Nhà thông minh không chỉ dành cho biệt thự đắt tiền. Chỉ với vài thiết bị giá phải chăng, bạn đã có thể điều khiển đèn, ổ cắm và camera ngay trên điện thoại.</p>
<h3>Bước 1: Chọn hệ sinh thái</h3>
<p>Hãy chọn một nền tảng chính như Google Home, Apple Home hoặc Amazon Alexa để các thiết bị kết nối với nhau dễ dàng. Các thiết bị hỗ trợ chuẩn Matter hoạt động được với hầu hết hệ sinh thái.</p>
<h3>Bước 2: Bắt đầu với thiết bị đơn giản</h3>
<ul>
<li><strong>Ổ cắm thông minh:</strong> hẹn giờ bật tắt, theo dõi điện năng tiêu thụ</li>
<li><strong>Bóng đèn thông minh:</strong> đổi màu, chỉnh độ sáng, tạo kịch bản</li>
<li><strong>Camera trong nhà:</strong> xem từ xa và nhận cảnh báo chuyển động</li>
</ul>
<h3>Bước 3: Mở rộng dần</h3>
<p>Khi đã quen, bạn có thể thêm cảm biến cửa, khóa thông minh hoặc điều khiển điều hòa. Hãy kiểm tra wifi trong nhà đủ ổn định trước khi mua nhiều thiết bị.</p>`,
    featuredImage: img('nha-thong-minh'),
    category: 'Công nghệ',
    tags: ['Nhà thông minh', 'IoT', 'Hướng dẫn'],
    featured: false,
    views: 96,
    publishedAt: new Date('2026-11-13'),
  },
  {
    title: 'Kinh nghiệm bán hàng trên sàn dành cho nhà bán mới',
    slug: 'kinh-nghiem-ban-hang-cho-nha-ban-moi',
    excerpt:
      'Từ việc đăng sản phẩm đến chăm sóc khách hàng, đây là những bước giúp cửa hàng mới của bạn nhanh chóng có đơn đầu tiên.',
    content: `<p>Bán hàng trên sàn thương mại điện tử giúp bạn tiếp cận lượng khách lớn mà không cần tự xây dựng website. Tuy nhiên, cửa hàng mới cần chuẩn bị kỹ để nổi bật giữa nhiều đối thủ.</p>
<h3>Đăng ký và hoàn thiện hồ sơ</h3>
<p>Gửi đơn đăng ký nhà bán, chờ quản trị viên duyệt, sau đó hoàn thiện logo, ảnh bìa và phần giới thiệu cửa hàng để tạo sự tin tưởng.</p>
<h3>Đăng sản phẩm hiệu quả</h3>
<ul>
<li>Dùng ảnh rõ nét, chụp nhiều góc</li>
<li>Viết tiêu đề có từ khóa mà khách hay tìm</li>
<li>Mô tả đầy đủ thông số, chính sách bảo hành, đổi trả</li>
<li>Cập nhật tồn kho thường xuyên để tránh hủy đơn</li>
</ul>
<h3>Chăm sóc khách hàng</h3>
<p>Phản hồi tin nhắn nhanh, xử lý đơn đúng hạn và đóng gói cẩn thận sẽ giúp bạn có nhiều đánh giá tốt, từ đó tăng thứ hạng hiển thị của cửa hàng.</p>
<h3>Theo dõi doanh thu</h3>
<p>Dùng trang tổng quan của nhà bán để xem doanh thu, sản phẩm bán chạy và yêu cầu rút tiền theo từng kỳ đối soát.</p>`,
    featuredImage: img('kinh-nghiem-ban-hang'),
    category: 'Nhà bán hàng',
    tags: ['Nhà bán', 'Kinh doanh', 'Hướng dẫn'],
    featured: true,
    views: 73,
    publishedAt: new Date('2026-11-16'),
  },
];

async function seed() {
  await mongoose.connect(secret.db_url);
  console.log('Connected to MongoDB');

  const admin = await Admin.findOne({});
  if (!admin) {
    console.error('ERROR: No admin found in database. Please seed admins first.');
    process.exit(1);
  }
  console.log(`Using admin "${admin.name}" as author`);

  const removed = await BlogPost.deleteMany({ slug: { $in: LEGACY_SLUGS } });
  if (removed.deletedCount) console.log(`  ✗ Removed ${removed.deletedCount} legacy post(s)`);

  let inserted = 0;
  let updated = 0;

  for (const post of blogPosts) {
    const exists = await BlogPost.findOne({ slug: post.slug });
    if (exists) {
      await BlogPost.updateOne(
        { _id: exists._id },
        { $set: { ...post, status: 'published', author: admin._id } }
      );
      console.log(`  ↻ Updated: ${post.slug}`);
      updated++;
      continue;
    }

    await BlogPost.create({ ...post, status: 'published', author: admin._id });
    console.log(`  ✓ Created: ${post.title}`);
    inserted++;
  }

  console.log(`\nDone: ${inserted} inserted, ${updated} updated`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
