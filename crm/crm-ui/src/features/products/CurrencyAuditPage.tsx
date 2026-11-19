import { useState } from 'react';
import {
  Button,
  Card,
  Image,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { TableProps } from 'antd';
import { DollarOutlined, CheckCircleOutlined, WarningOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { currencyAuditApi, type AuditProduct, type AuditResponse } from '@/services/currencyAudit';
import PageHeader from '@/components/commons/PageHeader';

const { Text } = Typography;

export default function CurrencyAuditPage() {
  const [page, setPage] = useState(1);
  const [showReviewed, setShowReviewed] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<AuditResponse>({
    queryKey: ['currency-audit', { page, showReviewed }],
    queryFn: () => currencyAuditApi.list({ page, limit: 20, showReviewed }),
  });

  const normalizeOne = useMutation({
    mutationFn: ({ id, fromCurrency }: { id: string; fromCurrency: 'USD' | 'VND' }) =>
      currencyAuditApi.normalizeOne(id, fromCurrency),
    onSuccess: () => {
      message.success('Đã duyệt sản phẩm');
      queryClient.invalidateQueries({ queryKey: ['currency-audit'] });
    },
    onError: () => message.error('Cập nhật sản phẩm thất bại'),
  });

  const normalizeBulk = useMutation({
    mutationFn: ({ ids, fromCurrency }: { ids: string[]; fromCurrency: 'USD' | 'VND' }) =>
      currencyAuditApi.normalizeBulk(ids, fromCurrency),
    onSuccess: (res) => {
      const skipped = (res.notFound?.length ?? 0) + (res.invalidIds?.length ?? 0);
      message.success(
        skipped > 0
          ? `Đã cập nhật ${res.updated} sản phẩm (bỏ qua ${skipped})`
          : `Đã cập nhật ${res.updated} sản phẩm`
      );
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ['currency-audit'] });
    },
    onError: () => message.error('Cập nhật hàng loạt thất bại'),
  });

  const columns: TableProps<AuditProduct>['columns'] = [
    {
      title: 'Ảnh',
      dataIndex: 'img',
      key: 'img',
      width: 80,
      render: (img: string | undefined, record) => (
        <Image
          src={img || record.imageURLs?.[0]?.img}
          alt={record.title}
          width={48}
          height={48}
          fallback="https://placehold.co/48"
          style={{ objectFit: 'cover', borderRadius: 4 }}
        />
      ),
    },
    {
      title: 'Tên sản phẩm',
      dataIndex: 'title',
      key: 'title',
      render: (t: string, r) => (
        <Space direction="vertical" size={2}>
          <Text strong>{t}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            /{r.slug}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Giá hiện tại',
      dataIndex: 'price',
      key: 'price',
      width: 140,
      align: 'right',
      render: (p: number) => (
        <Text strong style={{ color: '#fa8c16' }}>
          {p.toLocaleString('vi-VN')} ₫
        </Text>
      ),
    },
    {
      title: 'Nếu quy đổi USD → VND',
      dataIndex: 'suggestedVndPrice',
      key: 'suggestedVndPrice',
      width: 160,
      align: 'right',
      render: (v: number) => <Text type="secondary">{v?.toLocaleString('vi-VN') ?? '—'} ₫</Text>,
    },
    {
      title: 'Đã duyệt',
      dataIndex: 'currencyReviewedAt',
      key: 'currencyReviewedAt',
      width: 130,
      render: (d: string | null) =>
        d ? (
          <Tag color="green" icon={<CheckCircleOutlined />}>
            Đã duyệt
          </Tag>
        ) : (
          <Tag color="orange" icon={<WarningOutlined />}>
            Chờ duyệt
          </Tag>
        ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 280,
      render: (_: unknown, record: AuditProduct) => (
        <Space>
          <Popconfirm
            title={`Quy đổi "${record.title}" từ USD?`}
            description={`Giá mới sẽ là ${record.suggestedVndPrice?.toLocaleString('vi-VN')} ₫`}
            onConfirm={() => normalizeOne.mutate({ id: record._id, fromCurrency: 'USD' })}
          >
            <Button size="small" type="primary" danger>
              Quy đổi từ USD
            </Button>
          </Popconfirm>
          <Button
            size="small"
            onClick={() => normalizeOne.mutate({ id: record._id, fromCurrency: 'VND' })}
          >
            Đánh dấu là VND
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Kiểm tra tiền tệ" />
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Rà soát các sản phẩm có giá nghi là theo USD và chuẩn hoá về VND.
      </Text>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space size="large" wrap>
          <Space>
            <Switch checked={showReviewed} onChange={setShowReviewed} />
            <Text>Hiện sản phẩm đã duyệt</Text>
          </Space>
          {selectedIds.length > 0 && (
            <Space>
              <Text>Đã chọn {selectedIds.length}</Text>
              <Popconfirm
                title={`Quy đổi ${selectedIds.length} sản phẩm từ USD?`}
                onConfirm={() => normalizeBulk.mutate({ ids: selectedIds, fromCurrency: 'USD' })}
              >
                <Button type="primary" danger icon={<DollarOutlined />}>
                  Quy đổi hàng loạt từ USD
                </Button>
              </Popconfirm>
              <Button
                onClick={() => normalizeBulk.mutate({ ids: selectedIds, fromCurrency: 'VND' })}
              >
                Đánh dấu hàng loạt là VND
              </Button>
            </Space>
          )}
          <Text type="secondary">
            Tỷ giá USD→VND hiện tại: {data?.currentRate?.toLocaleString('vi-VN') ?? '—'}
          </Text>
        </Space>
      </Card>

      <Table<AuditProduct>
        rowKey="_id"
        loading={isLoading}
        columns={columns}
        dataSource={data?.items ?? []}
        rowSelection={{
          selectedRowKeys: selectedIds,
          onChange: (keys) => setSelectedIds(keys as string[]),
        }}
        pagination={{
          current: page,
          pageSize: 20,
          total: data?.pagination.totalItems ?? 0,
          onChange: setPage,
          showSizeChanger: false,
        }}
      />
    </div>
  );
}
