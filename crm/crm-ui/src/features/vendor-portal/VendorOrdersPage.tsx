import { useState } from 'react';
import { Table, Card, Select, Space, Typography, Tag, Empty, Avatar } from 'antd';
import type { TableProps } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import PageHeader from '@/components/commons/PageHeader';
import StatusBadge from '@/components/commons/StatusBadge';
import { useFormatters } from '@/hooks/useFormatters';
import { vendorPortalApi, apiErrorMessage, type VendorOrder, type VendorOrderItem } from './api';

const { Text } = Typography;
const PAGE_SIZE = 10;

const ORDER_STATUS = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: 'Chờ xử lý',
  processing: 'Đang xử lý',
  shipped: 'Đang giao',
  delivered: 'Đã giao',
  cancelled: 'Đã huỷ',
};
const FULFILMENT = [
  { value: 'pending', label: 'Chờ xử lý', color: 'orange' },
  { value: 'packed', label: 'Đã đóng gói', color: 'blue' },
  { value: 'shipped', label: 'Đang giao', color: 'cyan' },
  { value: 'delivered', label: 'Đã giao', color: 'green' },
];

export default function VendorOrdersPage() {
  const queryClient = useQueryClient();
  const { formatCurrency, formatDate } = useFormatters();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string | undefined>();

  const { data, isLoading } = useQuery({
    queryKey: ['vendor-portal', 'orders', page, status],
    queryFn: () => vendorPortalApi.getOrders({ page, limit: PAGE_SIZE, status }),
  });

  const itemMutation = useMutation({
    mutationFn: (v: { orderId: string; itemId: string; fulfillmentStatus: string }) =>
      vendorPortalApi.updateItemStatus(v.orderId, v.itemId, v.fulfillmentStatus),
    onSuccess: () => {
      toast.success('Đã cập nhật trạng thái giao hàng');
      queryClient.invalidateQueries({ queryKey: ['vendor-portal'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Cập nhật trạng thái thất bại')),
  });

  const itemColumns = (order: VendorOrder): TableProps<VendorOrderItem>['columns'] => [
    {
      title: 'Sản phẩm',
      key: 'item',
      render: (_, i) => (
        <Space>
          <Avatar shape="square" size={40} src={i.image} />
          <div>
            <Text strong>{i.title}</Text>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {[i.color, i.size].filter(Boolean).join(' · ') || '—'}
              </Text>
            </div>
          </div>
        </Space>
      ),
    },
    { title: 'Giá', dataIndex: 'price', render: (v: number) => formatCurrency(v) },
    { title: 'SL', dataIndex: 'quantity', width: 70 },
    { title: 'Thành tiền', dataIndex: 'subtotal', render: (v: number) => formatCurrency(v) },
    {
      title: 'Xử lý giao hàng',
      key: 'fulfilment',
      width: 160,
      render: (_, i) => (
        <Select
          size="small"
          style={{ width: 140 }}
          value={i.fulfillmentStatus}
          disabled={order.status === 'cancelled'}
          options={FULFILMENT.map((f) => ({
            value: f.value,
            label: <Tag color={f.color}>{f.label}</Tag>,
          }))}
          onChange={(v) =>
            itemMutation.mutate({ orderId: order._id, itemId: i._id, fulfillmentStatus: v })
          }
        />
      ),
    },
  ];

  const columns: TableProps<VendorOrder>['columns'] = [
    {
      title: 'Đơn hàng',
      dataIndex: '_id',
      render: (id: string, o: VendorOrder) => (
        <Text strong style={{ whiteSpace: 'nowrap' }}>
          #{o.invoice ?? id.slice(-6).toUpperCase()}
        </Text>
      ),
    },
    {
      title: 'Khách hàng',
      key: 'customer',
      render: (_, o) => (
        <div>
          <Text strong>{o.name}</Text>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {o.contact || o.email}
            </Text>
          </div>
        </div>
      ),
    },
    {
      title: 'SP của bạn',
      key: 'items',
      render: (_, o) => o.items.reduce((s, i) => s + i.quantity, 0),
    },
    {
      title: 'Tổng của bạn',
      key: 'total',
      render: (_, o) => (
        <Text strong>{formatCurrency(o.items.reduce((s, i) => s + i.subtotal, 0))}</Text>
      ),
    },
    {
      title: 'Thanh toán',
      dataIndex: 'paymentMethod',
      render: (v?: string) => (v ? <Tag>{v}</Tag> : '—'),
    },
    {
      title: 'Trạng thái đơn',
      dataIndex: 'status',
      render: (s: string) => <StatusBadge status={s} type="order" />,
    },
    { title: 'Ngày', dataIndex: 'createdAt', render: (d: string) => formatDate(d) },
  ];

  return (
    <div>
      <PageHeader title="Đơn hàng của tôi" />
      <Card styles={{ body: { padding: 16 } }}>
        <Space style={{ marginBottom: 16 }}>
          <Select
            allowClear
            placeholder="Tất cả trạng thái đơn"
            style={{ width: 200 }}
            value={status}
            options={ORDER_STATUS.map((s) => ({
              value: s,
              label: ORDER_STATUS_LABEL[s] ?? s.charAt(0).toUpperCase() + s.slice(1),
            }))}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          />
        </Space>
        <Table
          scroll={{ x: 900 }}
          rowKey="_id"
          columns={columns}
          dataSource={data?.data ?? []}
          loading={isLoading}
          locale={{
            emptyText: <Empty description="Chưa có đơn hàng nào chứa sản phẩm của bạn" />,
          }}
          expandable={{
            expandedRowRender: (order) => (
              <Table
                rowKey="_id"
                size="small"
                pagination={false}
                columns={itemColumns(order)}
                dataSource={order.items}
              />
            ),
          }}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: data?.pagination?.totalItems ?? 0,
            onChange: setPage,
            showTotal: (t) => `${t} đơn hàng`,
          }}
        />
      </Card>
    </div>
  );
}
