const dayjs = require('dayjs');
const { secret } = require('../config/secret');
const Order = require('../models/Order');
const Coupon = require('../models/Coupon');
const ExchangeRate = require('../models/ExchangeRate');
const User = require('../models/User');
const { emitOrderCreated, emitOrderUpdated } = require('../utils/socketEmitter');
const PaymentService = require('../services/paymentService');
const { sendTemplatedEmail } = require('../utils/emailService');
const { buildPaymentUrl } = require('../utils/vnpay');
const { withTransaction } = require('../core/withTransaction');
const { deductStock, InsufficientStockError } = require('../services/stock.service');

// create-payment-intent - DISABLED (Stripe removed)
exports.paymentIntent = async (req, res, next) => {
  try {
    // Stripe payment intent creation disabled - only COD available
    return res.status(200).json({
      status: 'success',
      message: 'Stripe disabled - only Cash on Delivery available',
      clientSecret: null,
    });
  } catch (error) {
    next(error);
  }
};

// addOrder — whitelist fields and enforce authenticated user
exports.addOrder = async (req, res, next) => {
  try {
    const {
      cart,
      name,
      address,
      email,
      contact,
      city,
      country,
      zipCode,
      subTotal,
      shippingCost,
      discount,
      totalAmount,
      shippingOption,
      cardInfo,
      paymentIntent,
      paymentMethod,
      orderNote,
    } = req.body;

    // Validate required fields
    if (!cart || !name || !totalAmount || !paymentMethod) {
      console.error('[addOrder Error] Missing required order fields:', {
        hasCart: !!cart,
        cartLength: cart ? cart.length : 0,
        name: name,
        totalAmount: totalAmount,
        paymentMethod: paymentMethod,
        bodyKeys: Object.keys(req.body),
      });
      return res.status(400).json({
        status: 'fail',
        error: 'Missing required order fields',
        details: {
          hasCart: !!cart,
          hasName: !!name,
          hasTotalAmount: !!totalAmount,
          hasPaymentMethod: !!paymentMethod,
        },
      });
    }

    // Process payment via PaymentService
    const paymentResult = await PaymentService.processPayment(
      { totalAmount, cart, name, email },
      paymentMethod,
      req.body.paymentData || {}
    );

    // For unimplemented gateways (VNPay, MoMo, Stripe) that return success:false,
    // reject the order rather than create it with a failed payment status
    if (!paymentResult.success && !['COD', 'bank-transfer'].includes(paymentMethod)) {
      console.error('[addOrder Error] Payment processing failed:', paymentResult);
      return res.status(400).json({
        status: 'fail',
        error: paymentResult.error || 'Payment processing failed',
      });
    }

    // Validate coupon (if provided) and record usage
    //
    // VẤN ĐỀ ĐÃ BIẾT (chưa sửa ở đây, thuộc bước "Checkout tách đơn theo shop"):
    //  - `discount`, `subTotal`, `shippingCost`, `totalAmount` và giá từng dòng trong `cart` đều do
    //    CLIENT gửi lên và được tin nguyên xi. Người dùng sửa request là mua rẻ tuỳ ý. Đúng ra
    //    server phải tải lại giá từ DB và tự tính tổng/giảm giá/phí ship.
    //  - Kiểm tra giới hạn lượt dùng coupon bên dưới (usageCount < usageLimit) là đọc-rồi-kiểm,
    //    không nguyên tử: hai đơn đồng thời có thể cùng vượt giới hạn. Cần điều kiện ngay trong
    //    câu lệnh cập nhật (xem cách làm với tồn kho ở services/stock.service.js).
    let resolvedDiscount = discount || 0;
    let appliedCoupon = null;
    let couponToApply = null;

    if (req.body.couponCode) {
      const coupon = await Coupon.findOne({
        couponCode: { $regex: `^${req.body.couponCode}$`, $options: 'i' },
        status: 'active',
      });

      if (coupon) {
        const now = new Date();
        const withinDates =
          (!coupon.startTime || now >= coupon.startTime) &&
          (!coupon.endTime || now <= coupon.endTime);
        const withinUsageLimit = coupon.usageLimit == null || coupon.usageCount < coupon.usageLimit;
        const userUsage = req.user
          ? coupon.usedBy.filter((u) => u.userId.toString() === req.user._id.toString()).length
          : 0;
        const withinPerUserLimit = coupon.perUserLimit == null || userUsage < coupon.perUserLimit;

        if (withinDates && withinUsageLimit && withinPerUserLimit) {
          // Chỉ GHI NHẬN lượt dùng ở bước transaction bên dưới (cùng lúc với tạo đơn). Trước đây
          // lượt coupon bị trừ ngay tại đây; nếu tạo đơn sau đó lỗi thì coupon mất lượt oan.
          couponToApply = coupon;
        }
      }
    }

    // Snapshot display currency and exchange rate at order time so historical
    // orders are not affected by future rate fluctuations.
    // Source of truth is the authenticated user's saved preference — never trust
    // the request body, which a client could tamper with to mismatch the rate.
    const userDoc = await User.findById(req.user._id).select('preferences.currency').lean();
    const displayCurrency = userDoc?.preferences?.currency || 'VND';
    let exchangeRate = 1;
    if (displayCurrency !== 'VND') {
      const rateDoc = await ExchangeRate.findOne({});
      exchangeRate = rateDoc?.rates?.[displayCurrency] ?? 1;
    }

    // Ba việc dưới đây phải thành công cùng nhau hoặc huỷ cùng nhau, nên gói trong MỘT transaction:
    //   (1) ghi nhận lượt dùng coupon  (2) tạo đơn  (3) trừ tồn kho có điều kiện.
    // Trước đây chạy rời nhau và trừ kho không kiểm tra điều kiện, nên có thể: tạo đơn xong server
    // lỗi mà kho chưa trừ, hoặc hai người mua món cuối cùng một lúc làm kho thành số âm.
    //
    // LƯU Ý: việc gọi cổng thanh toán (PaymentService.processPayment ở trên) nằm NGOÀI transaction.
    // Nếu thanh toán online đã được xử lý rồi mới phát hiện hết hàng thì cần hoàn tiền; hiện chưa có
    // luồng này (sẽ có khi làm bước Thanh toán/Hoàn tiền). Đúng ra phải giữ chỗ hàng TRƯỚC khi thu tiền.
    let orderItems;
    try {
      orderItems = await withTransaction(async (session) => {
        const opts = session ? { session } : {};

        if (couponToApply) {
          await Coupon.updateOne(
            { _id: couponToApply._id },
            {
              $inc: { usageCount: 1 },
              $push: { usedBy: { userId: req.user._id, usedAt: new Date() } },
            },
            opts
          );
        }

        const [created] = await Order.create(
          [
            {
              user: req.user._id,
              cart,
              name,
              address,
              email,
              contact,
              city,
              country,
              zipCode,
              subTotal,
              shippingCost,
              discount: resolvedDiscount,
              totalAmount,
              shippingOption,
              cardInfo,
              paymentIntent,
              paymentMethod,
              orderNote,
              status: 'pending',
              paymentGateway: paymentResult.paymentGateway || paymentMethod.toLowerCase(),
              paymentStatus: paymentResult.paymentStatus || 'unpaid',
              transactionId: paymentResult.transactionId || null,
              displayCurrency,
              exchangeRate,
            },
          ],
          opts
        );

        // Ném InsufficientStockError nếu thiếu hàng → toàn bộ transaction (coupon + đơn) bị huỷ.
        await deductStock(cart, session);

        return created;
      });
    } catch (err) {
      if (err instanceof InsufficientStockError) {
        return res.status(409).json({
          status: 'fail',
          error: err.message,
          details: err.details,
        });
      }
      throw err;
    }
    if (couponToApply) appliedCoupon = couponToApply.couponCode;

    // Resolve {orderId} placeholder in bank transfer content using actual invoice
    if (paymentMethod === 'bank-transfer' && paymentResult.bankDetails?.transferContentTemplate) {
      paymentResult.bankDetails.transferContent =
        paymentResult.bankDetails.transferContentTemplate.replace(
          '{orderId}',
          String(orderItems.invoice)
        );
    }

    // Emit real-time update
    emitOrderCreated(orderItems);

    // Fire-and-forget order confirmation email
    sendTemplatedEmail('order-confirmation', email, {
      customerName: name,
      orderNumber: orderItems.orderNumber || `#${orderItems.invoice}`,
      orderTotal: `$${totalAmount}`,
      orderDate: dayjs().format('YYYY-MM-DD'),
      itemsHtml: (cart || [])
        .map(
          (item) =>
            `<li>${item.title} x${item.orderQuantity || item.quantity || 1} — $${item.price}</li>`
        )
        .join(''),
      shippingAddress: `${address}, ${city}, ${country} ${zipCode}`,
    }).catch((err) => console.error('[email] order-confirmation send error:', err.message));

    let paymentUrl = null;
    let paymentError = null;
    if (
      paymentMethod === 'vnpay' ||
      paymentMethod === 'vnp' ||
      paymentMethod === 'online-gateway'
    ) {
      const ipAddr =
        req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.ip ||
        '127.0.0.1';

      try {
        paymentUrl = buildPaymentUrl({
          order: orderItems,
          ipAddr,
          bankCode: req.body.paymentData?.bankCode,
          locale: req.body.paymentData?.locale || 'vn',
        });
      } catch (err) {
        console.error('[addOrder] buildPaymentUrl failed:', err.message);
        paymentError = err.message;
      }
    }

    res.status(200).json({
      success: true,
      message: 'Order added successfully',
      order: orderItems,
      ...(paymentUrl && { paymentUrl }),
      ...(paymentError && { paymentError }),
      ...(paymentResult.bankDetails && { bankDetails: paymentResult.bankDetails }),
      ...(appliedCoupon && { appliedCoupon }),
    });
  } catch (error) {
    next(error);
  }
};

// get Orders
exports.getOrders = async (req, res, next) => {
  try {
    const orderItems = await Order.find({}).populate('user');
    res.status(200).json({
      success: true,
      data: orderItems,
    });
  } catch (error) {
    console.log(error);
    next(error);
  }
};

// get single Order
exports.getSingleOrder = async (req, res, next) => {
  try {
    const orderItem = await Order.findById(req.params.id).populate('user');
    res.status(200).json(orderItem);
  } catch (error) {
    console.log(error);
    next(error);
  }
};

exports.updateOrderStatus = async (req, res, next) => {
  const newStatus = req.body.status;
  try {
    const updatedOrder = await Order.findByIdAndUpdate(
      req.params.id,
      { $set: { status: newStatus } },
      { new: true }
    ).populate('user');

    // Emit real-time update
    emitOrderUpdated(updatedOrder);

    res.status(200).json({
      success: true,
      message: 'Status updated successfully',
      data: updatedOrder,
    });
  } catch (error) {
    console.log(error);
    next(error);
  }
};
