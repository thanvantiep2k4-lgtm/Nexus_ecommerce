import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';

const useCartInfo = () => {
  const [quantity, setQuantity] = useState(0);
  const [total, setTotal] = useState(0);
  const { cart_products } = useSelector((state) => state.cart);

  useEffect(() => {
    const cart = cart_products.reduce(
      (cartTotal, cartItem) => {
        const { price = 0, discount = 0, orderQuantity } = cartItem;
        // Giá đã giảm (discount là %), khớp với giá hiển thị ở từng dòng giỏ hàng
        const unitPrice = discount > 0 ? price - (price * discount) / 100 : price;
        const itemTotal = unitPrice * orderQuantity;
        cartTotal.total += itemTotal;
        cartTotal.quantity += orderQuantity;

        return cartTotal;
      },
      {
        total: 0,
        quantity: 0,
      }
    );
    setQuantity(cart.quantity);
    setTotal(cart.total);
  }, [cart_products]);
  return {
    quantity,
    total,
    setTotal,
  };
};

export default useCartInfo;
