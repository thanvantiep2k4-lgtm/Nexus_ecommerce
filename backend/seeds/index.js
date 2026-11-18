require('dotenv').config();

const connectDB = require('../config/db');

const Brand = require('../models/Brand');
const brandData = require('./data/brands');

const Category = require('../models/Category');
const categoryData = require('./data/categories');

const Products = require('../models/Products');
const productsData = require('./data/products');

const Coupon = require('../models/Coupon');
const couponData = require('./data/coupons');

const Order = require('../models/Order');
const orderData = require('./data/orders');

const User = require('../models/User');
const userData = require('./data/users');

const Reviews = require('../models/Review');
const reviewsData = require('./data/reviews');

const Admin = require('../models/Admin');
const adminData = require('./data/admin');

connectDB();
const importData = async () => {
  try {
    await Brand.deleteMany();
    await Brand.insertMany(brandData);

    await Category.deleteMany();
    await Category.insertMany(categoryData);

    await Products.deleteMany();
    await Products.insertMany(productsData);

    await Coupon.deleteMany();
    await Coupon.insertMany(couponData);

    await Order.deleteMany();
    await Order.insertMany(orderData);

    await User.deleteMany();
    await User.insertMany(userData);

    await Reviews.deleteMany();
    await Reviews.insertMany(reviewsData);

    await Admin.deleteMany();
    await Admin.insertMany(adminData);

    console.log('data inserted successfully!');
    process.exit();
  } catch (error) {
    console.log('error', error);
    process.exit(1);
  }
};

importData();
