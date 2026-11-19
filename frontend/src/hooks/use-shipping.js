import { useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useGetSettingsQuery } from '@/redux/features/cmsApi';
import { set_shipping_method_id } from '@/redux/features/order/orderSlice';
import useCartInfo from './use-cart-info';

const FALLBACK_METHODS = [
  { id: 'free', label: 'Free shipping', labelVi: 'Miễn phí', cost: 0, enabled: true },
  { id: 'flat', label: 'Flat rate', labelVi: 'Phí cố định', cost: 20000, enabled: true },
  { id: 'pickup', label: 'Local pickup', labelVi: 'Nhận tại cửa hàng', cost: 25000, enabled: true },
];
const FREE_ID = 'free';
const STORAGE_KEY = 'shipping_method_id';

/**
 * Shared shipping logic for cart + checkout so both always agree.
 *
 * Rules:
 *  - The "free" method is only offered when the cart subtotal reaches
 *    settings.shipping.freeShippingThreshold (threshold <= 0 → always offered).
 *  - When the cart becomes eligible, "free" is auto-selected; when it drops
 *    below the threshold, the selection falls back to the first paid method.
 *  - The customer's explicit choice is persisted across reloads.
 */
const useShipping = () => {
  const dispatch = useDispatch();
  const { total } = useCartInfo();
  const { data: settingsData } = useGetSettingsQuery();
  const selectedId = useSelector((state) => state.order.shipping_method_id);

  const shipping = settingsData?.data?.shipping || {};
  const threshold = Number(shipping.freeShippingThreshold ?? 0);
  const eligibleFree = threshold <= 0 || total >= threshold;
  const remaining = Math.max(0, threshold - total);

  const allMethods = useMemo(() => {
    const raw = shipping.methods;
    const list = Array.isArray(raw) && raw.length > 0 ? raw : FALLBACK_METHODS;
    return list.filter((m) => m && m.enabled !== false);
  }, [shipping.methods]);

  const methods = useMemo(
    () => allMethods.filter((m) => m.id !== FREE_ID || eligibleFree),
    [allMethods, eligibleFree]
  );
  const hasFree = methods.some((m) => m.id === FREE_ID);

  // Keep the selection valid: restore the saved choice, auto-pick free when the
  // cart crosses the threshold, fall back to a paid method when it drops below.
  const wasEligible = useRef(null);
  useEffect(() => {
    if (!methods.length || total <= 0) return; // wait for cart + settings
    const becameEligible = eligibleFree && wasEligible.current === false;
    wasEligible.current = eligibleFree;
    const current = methods.find((m) => m.id === selectedId);
    if (becameEligible && hasFree) {
      dispatch(set_shipping_method_id(FREE_ID));
      return;
    }
    if (current) return;
    let saved = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      // storage unavailable — ignore
    }
    const fallback = methods.some((m) => m.id === saved)
      ? saved
      : eligibleFree && hasFree
        ? FREE_ID
        : (methods.find((m) => m.id !== FREE_ID) || methods[0]).id;
    dispatch(set_shipping_method_id(fallback));
  }, [methods, selectedId, eligibleFree, hasFree, total, dispatch]);

  const selected = methods.find((m) => m.id === selectedId) || null;
  const shippingCost = Number(selected?.cost ?? 0);

  const select = (id) => {
    dispatch(set_shipping_method_id(id));
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignore
    }
  };

  return {
    methods,
    selected,
    selectedId,
    shippingCost,
    select,
    eligibleFree,
    threshold,
    remaining,
  };
};

export default useShipping;
