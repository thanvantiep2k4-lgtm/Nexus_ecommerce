const Brand = require('../models/Brand');
const Category = require('../models/Category');
const Product = require('../models/Products');

// create product service
exports.createProductService = async (data) => {
  const product = await Product.create(data);
  const { _id: productId, brand, category } = product;
  //update Brand
  await Brand.updateOne({ _id: brand.id }, { $push: { products: productId } });
  //Category Brand
  await Category.updateOne({ _id: category.id }, { $push: { products: productId } });
  return product;
};

// create all product service
exports.addAllProductService = async (data) => {
  await Product.deleteMany();
  const products = await Product.insertMany(data);
  for (const product of products) {
    await Brand.findByIdAndUpdate(product.brand.id, {
      $push: { products: product._id },
    });
    await Category.findByIdAndUpdate(product.category.id, {
      $push: { products: product._id },
    });
  }
  return products;
};

// get product data
exports.getAllProductsService = async () => {
  const products = await Product.find({}).populate('reviews');
  return products;
};

// get type of product service
exports.getProductTypeService = async (req) => {
  const type = req.params.type;
  const query = req.query;
  // type = "all" → không lọc theo nhóm (trang chủ trộn nhiều ngành hàng)
  const filter = type === 'all' ? {} : { productType: type };
  const limit = Math.min(parseInt(query.limit, 10) || 0, 100);
  let q;
  if (query.new === 'true') {
    q = Product.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit || 8);
  } else if (query.featured === 'true') {
    q = Product.find({ ...filter, featured: true });
    if (limit) q = q.limit(limit);
  } else if (query.topSellers === 'true') {
    q = Product.find(filter)
      .sort({ sellCount: -1 })
      .limit(limit || 8);
  } else {
    q = Product.find(filter);
    if (limit) q = q.limit(limit);
  }
  return q.populate('reviews');
};

// get offer product service
exports.getOfferTimerProductService = async (query) => {
  const filter = { 'offerDate.endDate': { $gt: new Date() } };
  if (query && query !== 'all') filter.productType = query;
  const products = await Product.find(filter).populate('reviews');
  return products;
};

// get popular product service by type
exports.getPopularProductServiceByType = async (type) => {
  const products = await Product.find(type === 'all' ? {} : { productType: type })
    .sort({ 'reviews.length': -1, sellCount: -1 })
    .limit(8)
    .populate('reviews');
  return products;
};

exports.getTopRatedProductService = async () => {
  const products = await Product.find({
    reviews: { $exists: true, $ne: [] },
  }).populate('reviews');

  const topRatedProducts = products.map((product) => {
    const totalRating = product.reviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating = totalRating / product.reviews.length;

    return {
      ...product.toObject(),
      rating: averageRating,
    };
  });

  topRatedProducts.sort((a, b) => b.rating - a.rating);

  // Chưa có đánh giá nào → dùng sản phẩm bán chạy để khu vực này không trống
  if (!topRatedProducts.length) {
    return Product.find({}).sort({ sellCount: -1 }).limit(8).lean();
  }
  return topRatedProducts;
};

// File path: services/productService.js

/**
 * Get product data along with populated reviews and user details
 * @param {string} id - The ID of the product to retrieve
 * @returns {Object|null} - Returns the product object if found, otherwise null
 * @throws {Error} - Throws an error if the operation fails
 */
exports.getProductService = async (id) => {
  if (!id) {
    console.error('Product ID is required');
    throw new Error('Product ID is required');
  }

  try {
    const product = await Product.findById(id).populate({
      path: 'reviews',
      populate: { path: 'userId', select: 'name email imageURL' },
    });
    console.log(product);
    if (!product) {
      console.warn(`Product not found for ID: ${id}`);
      return null; // Return null if product is not found
    }

    console.log(`Product found: ${JSON.stringify(product, null, 2)}`);
    return product;
  } catch (error) {
    console.error(`Error fetching product with ID ${id}:`, error.message);
    throw new Error('Error fetching product data');
  }
};

// get product data
exports.getRelatedProductService = async (productId) => {
  const currentProduct = await Product.findById(productId);

  const relatedProducts = await Product.find({
    'category.name': currentProduct.category.name,
    _id: { $ne: productId }, // Exclude the current product ID
  });
  return relatedProducts;
};

// update a product
exports.updateProductService = async (id, currProduct) => {
  const product = await Product.findById(id);
  if (product) {
    product.title = currProduct.title;
    product.brand.name = currProduct.brand.name;
    product.brand.id = currProduct.brand.id;
    product.category.name = currProduct.category.name;
    product.category.id = currProduct.category.id;
    product.sku = currProduct.sku;
    product.img = currProduct.img;
    product.slug = currProduct.slug;
    product.unit = currProduct.unit;
    product.imageURLs = currProduct.imageURLs;
    product.tags = currProduct.tags;
    product.parent = currProduct.parent;
    product.children = currProduct.children;
    product.price = currProduct.price;
    product.discount = currProduct.discount;
    product.quantity = currProduct.quantity;
    product.status = currProduct.status;
    product.productType = currProduct.productType;
    product.description = currProduct.description;
    product.additionalInformation = currProduct.additionalInformation;
    product.offerDate.startDate = currProduct.offerDate.startDate;
    product.offerDate.endDate = currProduct.offerDate.endDate;

    await product.save();
  }

  return product;
};

// get Reviews Products
exports.getReviewsProducts = async () => {
  const result = await Product.find({
    reviews: { $exists: true, $ne: [] },
  }).populate({
    path: 'reviews',
    populate: { path: 'userId', select: 'name email imageURL' },
  });

  const products = result.filter((p) => p.reviews.length > 0);

  return products;
};

// get Reviews Products
exports.getStockOutProducts = async () => {
  const result = await Product.find({ status: 'out-of-stock' }).sort({ createdAt: -1 });
  return result;
};

// get Reviews Products
exports.deleteProduct = async (id) => {
  const result = await Product.findByIdAndDelete(id);
  return result;
};
