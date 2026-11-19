const mongoose = require('mongoose');
const { secret } = require('./secret');

mongoose.set('strictQuery', false);

// local url
const DB_URL = 'mongodb://0.0.0.0:27017/nexusmart';
// mongodb url
const MONGO_URI = secret.db_url;

const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI, {
      // Ở production KHÔNG để Mongoose tự tạo chỉ mục mỗi lần khởi động: với dữ liệu lớn việc dựng
      // chỉ mục có thể làm DB chậm hoặc treo ngay lúc server lên. Chỉ mục và ràng buộc ở production
      // được tạo có kiểm soát bằng `npm run schema:ensure` (scripts/ensure-schema.js) khi deploy.
      // Ở dev/test vẫn tự tạo để chạy local không phải thêm bước.
      autoIndex: process.env.NODE_ENV !== 'production',
    });
    console.log('mongodb connection success!');
  } catch (err) {
    console.log('mongodb connection failed!', err.message);
  }
};

module.exports = connectDB;
