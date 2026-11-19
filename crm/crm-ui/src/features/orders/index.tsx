import { useState, useCallback } from 'react';
import {
  Table,
  Input,
  Select,
  Button,
  Modal,
  Dropdown,
  Space,
  Typography,
  Descriptions,
  Divider,
  Image,
  Row,
  Col,
  Card,
  Empty,
  Form,
  DatePicker,
  Tag,
} from 'antd';
import {
  SearchOutlined,
  EyeOutlined,
  DownOutlined,
  ClearOutlined,
  CarryOutOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { MenuProps } from 'antd';

import { ordersApi } from '@/services/api';
import type { Order, OrderItem } from '@/types';
import { useFormatters } from '@/hooks/useFormatters';
import StatusBadge from '@/components/commons/StatusBadge';
import PageHeader from '@/components/commons/PageHeader';
import useAppStore from '@/stores/appStore';

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_LIMIT = 10;

const ORDER_STATUS_OPTIONS = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'pending', label: 'Chờ xử lý' },
  { value: 'confirmed', label: 'Đã xác nhận' },
  { value: 'processing', label: 'Đang xử lý' },
  { value: 'shipped', label: 'Đang giao' },
  { value: 'delivered', label: 'Đã giao' },
  { value: 'cancelled', label: 'Đã huỷ' },
];

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'Chờ xử lý',
  confirmed: 'Đã xác nhận',
  processing: 'Đang xử lý',
  shipped: 'Đang giao',
  delivered: 'Đã giao',
  cancelled: 'Đã huỷ',
};

const PAYMENT_STATUS_OPTIONS = [
  { value: '', label: 'Tất cả TT thanh toán' },
  { value: 'pending', label: 'Chờ thanh toán' },
  { value: 'paid', label: 'Đã thanh toán' },
  { value: 'failed', label: 'Thất bại' },
  { value: 'refunded', label: 'Đã hoàn tiền' },
];

const PAYMENT_METHOD_OPTIONS = [
  { value: '', label: 'Tất cả phương thức' },
  { value: 'COD', label: 'COD' },
  { value: 'Card', label: 'Thẻ' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getOrderNumber(order: Order): string {
  if (order.invoice) return `#${order.invoice}`;
  if (order.orderNumber) return order.orderNumber;
  return order._id;
}

function getCustomerName(order: Order): string {
  return order.name ?? order.user?.name ?? 'N/A';
}

function getCustomerEmail(order: Order): string {
  return order.email ?? order.user?.email ?? '';
}

function getEffectiveStatus(order: Order): string {
  return order.orderStatus ?? order.status ?? 'pending';
}

function getCartItems(order: Order): OrderItem[] {
  return order.cart ?? order.products ?? [];
}

// VNPay sends vnp_PayDate as a 'YYYYMMDDHHmmss' string. Parse it manually (no
// dayjs customParseFormat plugin is loaded) into a readable datetime; fall back
// to the raw value if it doesn't match the expected 14-digit shape.
function formatVnpayPayDate(raw?: string): string {
  if (!raw) return 'N/A';
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(raw);
  if (!m) return raw;
  const [, y, mo, d, h, mi, s] = m;
  const parsed = dayjs(`${y}-${mo}-${d}T${h}:${mi}:${s}`);
  return parsed.isValid() ? parsed.format('HH:mm DD/MM/YYYY') : raw;
}

// ---------------------------------------------------------------------------
// Order Detail Modal
// ---------------------------------------------------------------------------

const CARRIER_OPTIONS = [
  { value: 'dhl', label: 'DHL' },
  { value: 'fedex', label: 'FedEx' },
  { value: 'ups', label: 'UPS' },
  { value: 'usps', label: 'USPS' },
  { value: 'ghtk', label: 'GHTK' },
  { value: 'ghn', label: 'GHN' },
  { value: 'viettelpost', label: 'ViettelPost' },
];

interface OrderDetailModalProps {
  order: Order | null;
  open: boolean;
  onClose: () => void;
  onStatusChange: (orderId: string, status: string) => void;
  isUpdating: boolean;
  isShipper: boolean;
  onTakeOrder?: (id: string) => void;
  isTaking?: boolean;
  onTrackingUpdate?: (orderId: string, data: Record<string, unknown>) => void;
  isUpdatingTracking?: boolean;
}

function OrderDetailModal({
  order,
  open,
  onClose,
  onStatusChange,
  isUpdating,
  isShipper,
  onTakeOrder,
  isTaking,
  onTrackingUpdate,
  isUpdatingTracking,
}: OrderDetailModalProps) {
  const [trackingForm] = Form.useForm();
  const { formatCurrency, formatDate } = useFormatters();

  if (!order) return null;

  const items = getCartItems(order);
  const customerName = getCustomerName(order);
  const customerEmail = getCustomerEmail(order);
  const effectiveStatus = getEffectiveStatus(order);

  const subtotal = order.subTotal ?? order.totalAmount ?? 0;
  const total = order.totalAmount ?? order.finalAmount ?? 0;

  const statusMenuItems: MenuProps['items'] = [
    { key: 'pending', label: 'Chờ xử lý' },
    { key: 'confirmed', label: 'Đã xác nhận' },
    { key: 'processing', label: 'Đang xử lý' },
    { key: 'shipped', label: 'Đang giao' },
    { key: 'delivered', label: 'Đã giao' },
    { type: 'divider' },
    {
      key: 'cancelled',
      label: <span style={{ color: '#ff4d4f' }}>Huỷ đơn</span>,
      danger: true,
    },
  ];

  const itemColumns: ColumnsType<OrderItem> = [
    {
      title: 'Sản phẩm',
      key: 'product',
      render: (_, item) => (
        <Space>
          {(item.img ?? item.image) && (
            <Image
              src={item.img ?? item.image}
              width={40}
              height={40}
              style={{ objectFit: 'cover', borderRadius: 4 }}
              fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
            />
          )}
          <div>
            <div>{item.title}</div>
            {(item.color ?? item.size) && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {[item.color, item.size].filter(Boolean).join(', ')}
              </Text>
            )}
          </div>
        </Space>
      ),
    },
    {
      title: 'SL',
      key: 'qty',
      width: 60,
      render: (_, item) => item.orderQuantity ?? item.quantity ?? 1,
    },
    {
      title: 'Đơn giá',
      key: 'price',
      width: 100,
      render: (_, item) => formatCurrency(item.price),
    },
    {
      title: 'Thành tiền',
      key: 'total',
      width: 100,
      render: (_, item) => formatCurrency(item.price * (item.orderQuantity ?? item.quantity ?? 1)),
    },
  ];

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={`Đơn hàng ${getOrderNumber(order)}`}
      width={860}
      footer={
        <Space>
          {isShipper &&
            ['pending', 'processing'].includes(effectiveStatus.toLowerCase()) &&
            !order.shipper && (
              <Button
                type="primary"
                icon={<CarryOutOutlined />}
                onClick={() => onTakeOrder?.(order._id)}
                loading={isTaking}
                style={{ background: '#52c41a', borderColor: '#52c41a' }}
              >
                Nhận đơn đi giao
              </Button>
            )}
          {!isShipper && (
            <Dropdown
              menu={{
                items: statusMenuItems,
                onClick: ({ key }) => onStatusChange(order._id, key),
              }}
              disabled={isUpdating}
            >
              <Button type="primary" loading={isUpdating}>
                Cập nhật trạng thái <DownOutlined />
              </Button>
            </Dropdown>
          )}
          <Button onClick={onClose}>Đóng</Button>
        </Space>
      }
    >
      <Row gutter={24} style={{ marginBottom: 24 }}>
        {/* Left: Order Info */}
        <Col xs={24} md={12}>
          <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 12 }}>
            Thông tin đơn hàng
          </Typography.Title>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Mã đơn hàng">{getOrderNumber(order)}</Descriptions.Item>
            <Descriptions.Item label="Trạng thái đơn">
              <StatusBadge status={effectiveStatus} type="order" />
            </Descriptions.Item>
            <Descriptions.Item label="Trạng thái thanh toán">
              <StatusBadge status={order.paymentStatus ?? 'pending'} type="payment" />
            </Descriptions.Item>
            <Descriptions.Item label="Phương thức thanh toán">{order.paymentMethod}</Descriptions.Item>
            {order.paymentGateway && order.paymentGateway !== order.paymentMethod && (
              <Descriptions.Item label="Cổng thanh toán">{order.paymentGateway}</Descriptions.Item>
            )}
            {(order.vnpayTransactionNo || order.transactionId) && (
              <Descriptions.Item label="Mã giao dịch">
                <Text copyable>{order.vnpayTransactionNo ?? order.transactionId}</Text>
              </Descriptions.Item>
            )}
            {order.vnpayBankCode && (
              <Descriptions.Item label="Ngân hàng">{order.vnpayBankCode}</Descriptions.Item>
            )}
            {(order.paidAt || order.vnpayPayDate) && (
              <Descriptions.Item label="Thanh toán lúc">
                {order.paidAt ? formatDate(order.paidAt) : formatVnpayPayDate(order.vnpayPayDate)}
              </Descriptions.Item>
            )}
            {order.refundAmount != null && order.refundAmount > 0 && (
              <Descriptions.Item label="Đã hoàn tiền">
                {formatCurrency(order.refundAmount)}
                {order.refundedAt ? ` (${formatDate(order.refundedAt)})` : ''}
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Ngày đặt">{formatDate(order.createdAt)}</Descriptions.Item>
            {order.trackingNumber && (
              <Descriptions.Item label="Mã vận đơn">{order.trackingNumber}</Descriptions.Item>
            )}
            {order.shipper && (
              <Descriptions.Item label="Người giao hàng">
                <Tag color="blue">{order.shipper.name}</Tag>
              </Descriptions.Item>
            )}
            {order.shippedAt && (
              <Descriptions.Item label="Nhận đơn lúc">
                {new Date(order.shippedAt).toLocaleString('vi-VN', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Descriptions.Item>
            )}
            {order.estimatedDelivery && (
              <Descriptions.Item label="Dự kiến giao">
                {new Date(order.estimatedDelivery).toLocaleDateString('vi-VN', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </Descriptions.Item>
            )}
          </Descriptions>
        </Col>

        {/* Right: Customer + Shipping */}
        <Col xs={24} md={12}>
          <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 12 }}>
            Thông tin khách hàng
          </Typography.Title>
          <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Họ tên">{customerName}</Descriptions.Item>
            <Descriptions.Item label="Email">{customerEmail}</Descriptions.Item>
            <Descriptions.Item label="Số điện thoại">
              {order.contact ?? order.user?.email ?? 'N/A'}
            </Descriptions.Item>
          </Descriptions>

          <Typography.Title level={5} style={{ marginTop: 16, marginBottom: 12 }}>
            Địa chỉ giao hàng
          </Typography.Title>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Địa chỉ">{order.address ?? 'N/A'}</Descriptions.Item>
            <Descriptions.Item label="Tỉnh/Thành phố">{order.city ?? 'N/A'}</Descriptions.Item>
            <Descriptions.Item label="Mã bưu chính">{order.zipCode ?? 'N/A'}</Descriptions.Item>
            <Descriptions.Item label="Quốc gia">{order.country ?? 'N/A'}</Descriptions.Item>
          </Descriptions>
        </Col>
      </Row>

      {/* Shipping & Tracking */}
      {!isShipper && (
        <>
          <Divider style={{ marginTop: 0 }} />
          <Typography.Title level={5} style={{ marginBottom: 12 }}>
            Vận chuyển &amp; theo dõi
          </Typography.Title>
          <Form
            form={trackingForm}
            layout="vertical"
            initialValues={{
              carrier: order.carrier || undefined,
              trackingNumber: order.trackingNumber || '',
              trackingUrl: order.trackingUrl || '',
              estimatedDelivery: order.estimatedDelivery
                ? dayjs(order.estimatedDelivery)
                : undefined,
            }}
            onFinish={(values) => {
              const payload: Record<string, unknown> = {};
              if (values.carrier) payload.carrier = values.carrier;
              if (values.trackingNumber) payload.trackingNumber = values.trackingNumber;
              if (values.trackingUrl) payload.trackingUrl = values.trackingUrl;
              if (values.estimatedDelivery)
                payload.estimatedDelivery = values.estimatedDelivery.toISOString();
              onTrackingUpdate?.(order._id, payload);
            }}
          >
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item label="Đơn vị vận chuyển" name="carrier">
                  <Select placeholder="Chọn đơn vị vận chuyển" options={CARRIER_OPTIONS} allowClear />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label="Mã vận đơn" name="trackingNumber">
                  <Input placeholder="VD: 1Z999AA10123456784" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label="Link theo dõi (không bắt buộc)" name="trackingUrl">
                  <Input placeholder="Tự động tạo nếu để trống" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label="Ngày giao dự kiến" name="estimatedDelivery">
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
            <Button
              type="primary"
              htmlType="submit"
              icon={<SendOutlined />}
              loading={isUpdatingTracking}
              style={{ marginBottom: 8 }}
            >
              Lưu thông tin vận chuyển
            </Button>
          </Form>
        </>
      )}

      <Divider style={{ marginTop: 0 }} />

      {/* Order Items */}
      <Typography.Title level={5} style={{ marginBottom: 12 }}>
        Sản phẩm trong đơn
      </Typography.Title>
      <Table<OrderItem>
        columns={itemColumns}
        dataSource={items}
        rowKey={(item, idx) => item._id ?? String(idx)}
        expandable={{ childrenColumnName: '__children' }}
        pagination={false}
        size="small"
        style={{ marginBottom: 16 }}
      />

      {/* Totals */}
      <Row justify="end">
        <Col xs={24} sm={12} md={8}>
          <Card size="small" style={{ background: '#fafafa' }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Row justify="space-between">
                <Text>Tạm tính:</Text>
                <Text>{formatCurrency(subtotal)}</Text>
              </Row>
              {(order.discount ?? 0) > 0 && (
                <Row justify="space-between">
                  <Text>Giảm giá:</Text>
                  <Text type="success">-{formatCurrency(order.discount!)}</Text>
                </Row>
              )}
              {(order.shippingCost ?? 0) > 0 && (
                <Row justify="space-between">
                  <Text>Phí vận chuyển:</Text>
                  <Text>{formatCurrency(order.shippingCost!)}</Text>
                </Row>
              )}
              {(order.tax ?? 0) > 0 && (
                <Row justify="space-between">
                  <Text>Thuế:</Text>
                  <Text>{formatCurrency(order.tax!)}</Text>
                </Row>
              )}
              <Divider style={{ margin: '4px 0' }} />
              <Row justify="space-between">
                <Text strong>Tổng cộng:</Text>
                <Text strong>{formatCurrency(total)}</Text>
              </Row>
              {order.displayCurrency &&
                order.displayCurrency !== 'VND' &&
                (order.exchangeRate ?? 0) > 0 && (
                  <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
                    Khách đã trả:{' '}
                    {new Intl.NumberFormat(
                      order.displayCurrency === 'USD'
                        ? 'en-US'
                        : order.displayCurrency === 'EUR'
                          ? 'de-DE'
                          : order.displayCurrency === 'GBP'
                            ? 'en-GB'
                            : order.displayCurrency === 'JPY'
                              ? 'ja-JP'
                              : 'en-US',
                      { style: 'currency', currency: order.displayCurrency }
                    ).format((order.totalAmount ?? 0) / (order.exchangeRate ?? 1))}{' '}
                    ({order.displayCurrency} @ {(order.exchangeRate ?? 1).toLocaleString('vi-VN')}{' '}
                    VND)
                  </Typography.Text>
                )}
            </Space>
          </Card>
        </Col>
      </Row>

      {order.notes && (
        <>
          <Divider />
          <Typography.Title level={5} style={{ marginBottom: 8 }}>
            Ghi chú
          </Typography.Title>
          <Text type="secondary">{order.notes}</Text>
        </>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main Orders Page
// ---------------------------------------------------------------------------

interface Filters {
  search: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
}

const INITIAL_FILTERS: Filters = {
  search: '',
  status: '',
  paymentStatus: '',
  paymentMethod: '',
};

export default function OrdersPage() {
  const queryClient = useQueryClient();
  const { user } = useAppStore();
  const { formatCurrency, formatDate } = useFormatters();

  // Detect shipper-only role
  const roles = user?.roles || [];
  const isShipper =
    roles.some((r) => r.toLowerCase() === 'shipper') &&
    !roles.some((r) => ['admin', 'manager', 'staff'].includes(r.toLowerCase()));

  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [pendingSearch, setPendingSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // Debounce for search input
  const [searchTimer, setSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback(
    (value: string) => {
      setPendingSearch(value);
      if (searchTimer) clearTimeout(searchTimer);
      const timer = setTimeout(() => {
        setFilters((prev) => ({ ...prev, search: value }));
        setPage(1);
      }, 400);
      setSearchTimer(timer);
    },
    [searchTimer]
  );

  const handleFilterChange = (key: keyof Omit<Filters, 'search'>) => (value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const handleClearFilters = () => {
    setPendingSearch('');
    setFilters(INITIAL_FILTERS);
    setPage(1);
  };

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  const queryKey = ['orders', filters, page];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      ordersApi.getAll({
        page,
        limit: PAGE_LIMIT,
        search: filters.search || undefined,
        status: filters.status || undefined,
        paymentStatus: filters.paymentStatus || undefined,
        paymentMethod: filters.paymentMethod || undefined,
      }),
  });

  // Fetch single order for modal
  const { data: orderDetailData, isFetching: isFetchingDetail } = useQuery({
    queryKey: ['order', selectedOrder?._id],
    queryFn: () => ordersApi.getById(selectedOrder!._id),
    enabled: detailModalOpen && selectedOrder !== null,
  });

  // ---------------------------------------------------------------------------
  // Mutation — update status
  // ---------------------------------------------------------------------------

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      ordersApi.updateStatus(id, status),
    onSuccess: (_, variables) => {
      toast.success(
        `Đã cập nhật trạng thái đơn hàng: ${ORDER_STATUS_LABELS[variables.status] ?? variables.status}`
      );
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['order', variables.id] });
    },
    onError: () => {
      toast.error('Cập nhật trạng thái đơn hàng thất bại');
    },
  });

  const handleStatusChange = (orderId: string, status: string) => {
    updateStatusMutation.mutate({ id: orderId, status });
  };

  // ---------------------------------------------------------------------------
  // Mutation — take order (shipper)
  // ---------------------------------------------------------------------------

  const takeOrderMutation = useMutation({
    mutationFn: (id: string) => ordersApi.takeOrder(id),
    onSuccess: () => {
      toast.success('Nhận đơn thành công! Bạn là người giao đơn này.');
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Nhận đơn thất bại');
    },
  });

  const handleTakeOrder = (id: string) => {
    takeOrderMutation.mutate(id);
  };

  // ---------------------------------------------------------------------------
  // Mutation — update tracking info
  // ---------------------------------------------------------------------------

  const updateTrackingMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      ordersApi.updateTracking(id, data as Parameters<typeof ordersApi.updateTracking>[1]),
    onSuccess: (_, variables) => {
      toast.success('Đã cập nhật thông tin vận chuyển');
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['order', variables.id] });
    },
    onError: () => {
      toast.error('Cập nhật thông tin vận chuyển thất bại');
    },
  });

  const handleTrackingUpdate = (orderId: string, data: Record<string, unknown>) => {
    updateTrackingMutation.mutate({ id: orderId, data });
  };

  // ---------------------------------------------------------------------------
  // View order detail
  // ---------------------------------------------------------------------------

  const handleViewOrder = (order: Order) => {
    setSelectedOrder(order);
    setDetailModalOpen(true);
  };

  const handleCloseDetail = () => {
    setDetailModalOpen(false);
    setSelectedOrder(null);
  };

  // Prefer the freshly-fetched detail over the list-row snapshot
  const modalOrder = orderDetailData?.data ?? selectedOrder;

  // ---------------------------------------------------------------------------
  // Table columns
  // ---------------------------------------------------------------------------

  const columns: ColumnsType<Order> = [
    {
      title: 'Mã đơn',
      key: 'orderNumber',
      width: 160,
      render: (_, order) => (
        <div>
          <Text strong>{getOrderNumber(order)}</Text>
          {order.trackingNumber && (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Vận đơn: {order.trackingNumber}
              </Text>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Khách hàng',
      key: 'customer',
      width: 180,
      render: (_, order) => (
        <div>
          <div>{getCustomerName(order)}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {getCustomerEmail(order)}
          </Text>
        </div>
      ),
    },
    {
      title: 'Sản phẩm',
      key: 'items',
      width: 200,
      render: (_, order) => {
        const items = getCartItems(order);
        const preview = items.slice(0, 2);
        const extra = items.length - 2;
        return (
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {items.length} sản phẩm
            </Text>
            {preview.map((item, idx) => (
              <div
                key={item._id ?? idx}
                style={{
                  maxWidth: 180,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontSize: 12,
                }}
              >
                {item.title}
              </div>
            ))}
            {extra > 0 && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                +{extra} sản phẩm khác
              </Text>
            )}
          </div>
        );
      },
    },
    {
      title: 'Số tiền',
      key: 'amount',
      width: 130,
      render: (_, order) => (
        <div>
          <Text strong>{formatCurrency(order.totalAmount ?? order.finalAmount ?? 0)}</Text>
          {(order.shippingCost ?? 0) > 0 && (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                +{formatCurrency(order.shippingCost!)} phí ship
              </Text>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Thanh toán',
      key: 'payment',
      width: 130,
      render: (_, order) => (
        <div>
          <StatusBadge status={order.paymentStatus ?? 'pending'} type="payment" />
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {order.paymentMethod}
            </Text>
          </div>
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      key: 'status',
      width: 160,
      render: (_, order) => (
        <Space direction="vertical" size={0}>
          <StatusBadge status={getEffectiveStatus(order)} type="order" />
          {order.shipper && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              <CarryOutOutlined style={{ marginRight: 3 }} />
              {order.shipper.name}
            </Text>
          )}
          {order.shippedAt && (
            <Text type="secondary" style={{ fontSize: 10 }}>
              {new Date(order.shippedAt).toLocaleString('vi-VN', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Ngày',
      key: 'date',
      width: 160,
      render: (_, order) => (
        <div>
          <div style={{ fontSize: 12 }}>{formatDate(order.createdAt)}</div>
          {order.estimatedDelivery && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Dự kiến:{' '}
              {new Date(order.estimatedDelivery).toLocaleDateString('vi-VN', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 180,
      fixed: 'right',
      render: (_, order) => {
        const effectiveStatus = getEffectiveStatus(order).toLowerCase();
        const canTake =
          isShipper && ['pending', 'processing'].includes(effectiveStatus) && !order.shipper;

        const statusMenuItems: MenuProps['items'] = [
          { key: 'pending', label: 'Chờ xử lý' },
          { key: 'confirmed', label: 'Đã xác nhận' },
          { key: 'processing', label: 'Đang xử lý' },
          { key: 'shipped', label: 'Đang giao' },
          { key: 'delivered', label: 'Đã giao' },
          { type: 'divider' },
          {
            key: 'cancelled',
            label: <span style={{ color: '#ff4d4f' }}>Huỷ đơn</span>,
            danger: true,
          },
        ];

        return (
          <Space size="small">
            <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewOrder(order)}>
              Xem
            </Button>
            {canTake ? (
              <Button
                size="small"
                type="primary"
                icon={<CarryOutOutlined />}
                onClick={() => handleTakeOrder(order._id)}
                loading={takeOrderMutation.isPending}
                style={{ background: '#52c41a', borderColor: '#52c41a' }}
              >
                Nhận đơn
              </Button>
            ) : !isShipper ? (
              <Dropdown
                menu={{
                  items: statusMenuItems,
                  onClick: ({ key }) => handleStatusChange(order._id, key),
                }}
                disabled={updateStatusMutation.isPending}
              >
                <Button size="small">
                  Trạng thái <DownOutlined />
                </Button>
              </Dropdown>
            ) : null}
          </Space>
        );
      },
    },
  ];

  // ---------------------------------------------------------------------------
  // Pagination config
  // ---------------------------------------------------------------------------

  const pagination: TablePaginationConfig = {
    current: page,
    pageSize: PAGE_LIMIT,
    total: data?.pagination?.totalItems ?? 0,
    showSizeChanger: false,
    showTotal: (total) => `${total} đơn hàng`,
    onChange: (p) => setPage(p),
  };

  const hasActiveFilters =
    filters.search !== '' ||
    filters.status !== '' ||
    filters.paymentStatus !== '' ||
    filters.paymentMethod !== '';

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div>
      <PageHeader title="Quản lý đơn hàng" />

      {/* Filters */}
      <Card style={{ marginBottom: 16 }} size="small">
        <Space wrap style={{ width: '100%' }}>
          <Input
            placeholder="Tìm kiếm đơn hàng..."
            prefix={<SearchOutlined />}
            value={pendingSearch}
            onChange={(e) => handleSearchChange(e.target.value)}
            allowClear
            style={{ width: 220 }}
          />
          <Select
            value={filters.status}
            onChange={handleFilterChange('status')}
            options={ORDER_STATUS_OPTIONS}
            style={{ width: 180 }}
          />
          <Select
            value={filters.paymentStatus}
            onChange={handleFilterChange('paymentStatus')}
            options={PAYMENT_STATUS_OPTIONS}
            style={{ width: 190 }}
          />
          <Select
            value={filters.paymentMethod}
            onChange={handleFilterChange('paymentMethod')}
            options={PAYMENT_METHOD_OPTIONS}
            style={{ width: 140 }}
          />
          {hasActiveFilters && (
            <Button icon={<ClearOutlined />} onClick={handleClearFilters}>
              Xoá bộ lọc
            </Button>
          )}
        </Space>
      </Card>

      {/* Table */}
      <Card size="small">
        <Table<Order>
          columns={columns}
          dataSource={data?.data ?? []}
          rowKey="_id"
          loading={isLoading}
          expandable={{ childrenColumnName: '__children' }}
          pagination={pagination}
          scroll={{ x: 1100 }}
          size="small"
          locale={{ emptyText: <Empty description="Không tìm thấy đơn hàng" /> }}
        />
      </Card>

      {/* Order Detail Modal */}
      <OrderDetailModal
        order={isFetchingDetail ? selectedOrder : (modalOrder ?? null)}
        open={detailModalOpen}
        onClose={handleCloseDetail}
        onStatusChange={handleStatusChange}
        isUpdating={updateStatusMutation.isPending}
        isShipper={isShipper}
        onTakeOrder={handleTakeOrder}
        isTaking={takeOrderMutation.isPending}
        onTrackingUpdate={handleTrackingUpdate}
        isUpdatingTracking={updateTrackingMutation.isPending}
      />
    </div>
  );
}
