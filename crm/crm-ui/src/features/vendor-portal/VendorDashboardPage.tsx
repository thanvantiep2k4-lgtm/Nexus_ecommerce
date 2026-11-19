import { useState } from 'react';
import { Card, Col, Row, Segmented, Typography, Table, Empty, Avatar, Button, Space } from 'antd';
import {
  DollarOutlined,
  ShoppingCartOutlined,
  ClockCircleOutlined,
  TrophyOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import PageHeader from '@/components/commons/PageHeader';
import { useFormatters } from '@/hooks/useFormatters';
import { vendorPortalApi, type VendorOrder } from './api';

const { Text, Title } = Typography;

function StatCard({
  title,
  value,
  icon,
  color,
  loading,
  onClick,
}: {
  title: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  color: string;
  loading?: boolean;
  onClick?: () => void;
}) {
  return (
    <Card
      loading={loading}
      hoverable
      onClick={onClick}
      style={{ height: '100%', cursor: onClick ? 'pointer' : 'default' }}
      styles={{ body: { padding: 20 } }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: `${color}1a`,
            color,
            fontSize: 22,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div style={{ minWidth: 0 }}>
          <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 2 }}>
            {title}
          </Text>
          <Title level={4} style={{ margin: 0, whiteSpace: 'nowrap' }}>
            {value}
          </Title>
        </div>
      </div>
    </Card>
  );
}

const PERIODS = [
  { label: '7 ngày', value: '7d' },
  { label: '30 ngày', value: '30d' },
  { label: '90 ngày', value: '90d' },
  { label: 'Tất cả', value: 'all' },
];

export default function VendorDashboardPage() {
  const navigate = useNavigate();
  const { formatCurrency, formatDate } = useFormatters();
  const [period, setPeriod] = useState('30d');

  const { data: profileRes } = useQuery({
    queryKey: ['vendor-portal', 'profile'],
    queryFn: () => vendorPortalApi.getProfile(),
  });
  const { data: summaryRes, isLoading } = useQuery({
    queryKey: ['vendor-portal', 'summary', period],
    queryFn: () => vendorPortalApi.getSummary(period === 'all' ? undefined : period),
  });
  const { data: ordersRes, isLoading: loadingOrders } = useQuery({
    queryKey: ['vendor-portal', 'orders', 'recent'],
    queryFn: () => vendorPortalApi.getOrders({ page: 1, limit: 5 }),
  });
  const { data: productsRes } = useQuery({
    queryKey: ['vendor-portal', 'products', 'count'],
    queryFn: () => vendorPortalApi.getProducts({ page: 1, limit: 1 }),
  });

  const summary = summaryRes?.data;
  const storeName = profileRes?.data?.vendorProfile?.storeName || profileRes?.data?.name;

  return (
    <div>
      <PageHeader
        title={storeName ? `Chào mừng trở lại, ${storeName}` : 'Tổng quan cửa hàng'}
        extra={
          <Space>
            <Segmented options={PERIODS} value={period} onChange={(v) => setPeriod(v as string)} />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate('/vendor/products?new=1')}
            >
              Thêm sản phẩm
            </Button>
          </Space>
        }
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Doanh thu (đã giao)"
            value={formatCurrency(summary?.totalRevenue ?? 0)}
            icon={<DollarOutlined />}
            color="#52c41a"
            loading={isLoading}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Đơn hàng"
            value={summary?.orderCount ?? 0}
            icon={<ShoppingCartOutlined />}
            color="#1677ff"
            loading={isLoading}
            onClick={() => navigate('/vendor/orders')}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Sản phẩm cần xử lý"
            value={summary?.pendingItems ?? 0}
            icon={<ClockCircleOutlined />}
            color="#fa8c16"
            loading={isLoading}
            onClick={() => navigate('/vendor/orders')}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Sản phẩm đang bán"
            value={productsRes?.pagination?.totalItems ?? 0}
            icon={<TrophyOutlined />}
            color="#a42c48"
            onClick={() => navigate('/vendor/products')}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={16}>
          <Card
            title="Đơn hàng gần đây"
            extra={<a onClick={() => navigate('/vendor/orders')}>Xem tất cả</a>}
          >
            <Table
              rowKey="_id"
              size="small"
              loading={loadingOrders}
              pagination={false}
              dataSource={ordersRes?.data ?? []}
              locale={{ emptyText: <Empty description="Chưa có đơn hàng" /> }}
              columns={[
                {
                  title: 'Đơn hàng',
                  dataIndex: '_id',
                  render: (id: string, o: VendorOrder) => (
                    <Text strong style={{ whiteSpace: 'nowrap' }}>
                      #{o.invoice ?? id.slice(-6).toUpperCase()}
                    </Text>
                  ),
                },
                { title: 'Khách hàng', dataIndex: 'name' },
                {
                  title: 'Số lượng',
                  render: (_, o) => o.items.reduce((s, i) => s + i.quantity, 0),
                },
                {
                  title: 'Tổng của bạn',
                  render: (_, o) => formatCurrency(o.items.reduce((s, i) => s + i.subtotal, 0)),
                },
                {
                  title: 'Ngày',
                  dataIndex: 'createdAt',
                  render: (d: string) => formatDate(d),
                },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="Bán chạy nhất" style={{ height: '100%' }} loading={isLoading}>
            {summary?.topProduct ? (
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <Avatar shape="square" size={72} src={summary.topProduct.img} />
                <div style={{ minWidth: 0 }}>
                  <Text strong style={{ display: 'block' }} ellipsis>
                    {summary.topProduct.title}
                  </Text>
                  <Text type="secondary">{summary.topProduct.sellCount ?? 0} đã bán</Text>
                  {summary.topProduct.price != null && (
                    <div>
                      <Text>{formatCurrency(summary.topProduct.price)}</Text>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <Empty description="Thêm sản phẩm đầu tiên để bắt đầu bán hàng">
                <Button type="primary" onClick={() => navigate('/vendor/products?new=1')}>
                  Thêm sản phẩm
                </Button>
              </Empty>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
