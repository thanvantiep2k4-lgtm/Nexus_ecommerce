#!/usr/bin/env node
/* Tạo các file .env từ .env.example nếu chưa có (không ghi đè). Chạy: npm run env:init */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pairs = [
  ['.env.example', '.env'],
  ['backend/.env.example', 'backend/.env'],
  ['frontend/.env.example', 'frontend/.env.local'],
  ['crm/.env.example', 'crm/.env'],
];

for (const [src, dest] of pairs) {
  const from = path.join(root, src);
  const to = path.join(root, dest);
  if (!fs.existsSync(from)) {
    console.warn(`! thiếu ${src}`);
  } else if (fs.existsSync(to)) {
    console.log(`= giữ nguyên ${dest}`);
  } else {
    fs.copyFileSync(from, to);
    console.log(`+ tạo ${dest}`);
  }
}
console.log('\nXong. Mở backend/.env và điền CLOUDINARY_*, GEMINI_API_KEY (và EMAIL_* nếu cần).');
