import { Tag } from 'antd';

interface StatusBadgeProps {
  status: string;
  type?: 'general' | 'payment' | 'order';
}

type ColorMap = Record<string, string>;

const GENERAL_COLORS: ColorMap = {
  show: 'green',
  hide: 'default',
  active: 'green',
  inactive: 'default',
  blocked: 'red',
};

const PAYMENT_COLORS: ColorMap = {
  pending: 'orange',
  paid: 'green',
  failed: 'red',
  refunded: 'blue',
};

const ORDER_COLORS: ColorMap = {
  pending: 'orange',
  confirmed: 'blue',
  processing: 'geekblue',
  shipped: 'cyan',
  delivered: 'green',
  cancelled: 'red',
};

const COLOR_MAP: Record<NonNullable<StatusBadgeProps['type']>, ColorMap> = {
  general: GENERAL_COLORS,
  payment: PAYMENT_COLORS,
  order: ORDER_COLORS,
};

type LabelMap = Record<string, string>;

const GENERAL_LABELS: LabelMap = {
  show: 'Hiển thị',
  hide: 'Ẩn',
  active: 'Hoạt động',
  inactive: 'Không hoạt động',
  blocked: 'Bị khoá',
};

const PAYMENT_LABELS: LabelMap = {
  pending: 'Chờ thanh toán',
  paid: 'Đã thanh toán',
  failed: 'Thất bại',
  refunded: 'Đã hoàn tiền',
};

const ORDER_LABELS: LabelMap = {
  pending: 'Chờ xử lý',
  confirmed: 'Đã xác nhận',
  processing: 'Đang xử lý',
  shipped: 'Đang giao',
  delivered: 'Đã giao',
  cancelled: 'Đã huỷ',
};

const LABEL_MAP: Record<NonNullable<StatusBadgeProps['type']>, LabelMap> = {
  general: GENERAL_LABELS,
  payment: PAYMENT_LABELS,
  order: ORDER_LABELS,
};

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function StatusBadge({ status, type = 'general' }: StatusBadgeProps) {
  const colorMap = COLOR_MAP[type];
  const color = colorMap[status.toLowerCase()] ?? 'default';
  const label = LABEL_MAP[type][status.toLowerCase()] ?? capitalize(status);

  return <Tag color={color}>{label}</Tag>;
}
