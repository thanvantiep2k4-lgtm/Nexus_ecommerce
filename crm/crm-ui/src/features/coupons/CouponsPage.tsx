import { useState, useRef, useCallback } from 'react';
import {
  Table,
  Button,
  Input,
  Select,
  Modal,
  Form,
  InputNumber,
  Radio,
  Tag,
  Space,
  Popconfirm,
  Row,
  Col,
  Card,
  Typography,
  Empty,
} from 'antd';
import type { TableProps } from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  ClearOutlined,
  GiftOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

import { couponsApi } from '@/services/api';
import type { Coupon } from '@/types';
import PageHeader from '@/components/commons/PageHeader';
import StatusBadge from '@/components/commons/StatusBadge';
import { useFormatters } from '@/hooks/useFormatters';

const { Text } = Typography;

const PAGE_SIZE = 10;
const DEBOUNCE_MS = 300;

const PRODUCT_TYPE_OPTIONS = [
  { value: '', label: 'Tất cả loại' },
  { value: 'electronics', label: 'Điện tử' },
  { value: 'fashion', label: 'Thời trang' },
  { value: 'beauty', label: 'Làm đẹp' },
  { value: 'furniture', label: 'Nội thất' },
  { value: 'foods', label: 'Thực phẩm' },
  { value: 'sports', label: 'Thể thao' },
];

interface Filters {
  search: string;
  productType: string;
  status: string;
}

const EMPTY_FILTERS: Filters = { search: '', productType: '', status: '' };

// ---------------------------------------------------------------------------
// Coupon Form Modal
// ---------------------------------------------------------------------------

interface CouponModalProps {
  open: boolean;
  editing: Coupon | null;
  onClose: () => void;
}

interface CouponFormValues {
  title: string;
  couponCode: string;
  discountPercentage: number;
  minimumAmount: number;
  productType: string;
  startTime: string;
  endTime: string;
  usageLimit?: number;
  perUserLimit?: number;
  status: 'active' | 'inactive';
}

function CouponModal({ open, editing, onClose }: CouponModalProps) {
  const [form] = Form.useForm<CouponFormValues>();
  const queryClient = useQueryClient();
  const isEdit = editing !== null;

  const handleAfterOpenChange = (visible: boolean) => {
    if (!visible) return;
    if (editing) {
      form.setFieldsValue({
        title: editing.title,
        couponCode: editing.couponCode,
        discountPercentage: editing.discountPercentage,
        minimumAmount: editing.minimumAmount,
        productType: editing.productType,
        startTime: editing.startTime ? dayjs(editing.startTime).format('YYYY-MM-DDTHH:mm') : '',
        endTime: editing.endTime ? dayjs(editing.endTime).format('YYYY-MM-DDTHH:mm') : '',
        usageLimit: editing.usageLimit,
        perUserLimit: editing.perUserLimit,
        status: editing.status,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ status: 'active', discountPercentage: 10, minimumAmount: 0 });
    }
  };

  const createMutation = useMutation({
    mutationFn: (data: Partial<Coupon>) => couponsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coupons'] });
      toast.success('Tạo mã giảm giá thành công');
      onClose();
    },
    onError: () => toast.error('Tạo mã giảm giá thất bại'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Coupon> }) =>
      couponsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coupons'] });
      toast.success('Cập nhật mã giảm giá thành công');
      onClose();
    },
    onError: () => toast.error('Cập nhật mã giảm giá thất bại'),
  });

  const isLoading = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload: Partial<Coupon> = {
        ...values,
        couponCode: values.couponCode.toUpperCase(),
        startTime: new Date(values.startTime).toISOString(),
        endTime: new Date(values.endTime).toISOString(),
      };
      if (isEdit && editing) {
        updateMutation.mutate({ id: editing._id, data: payload });
      } else {
        createMutation.mutate(payload);
      }
    } catch {
      // validation errors surface on the form
    }
  };

  return (
    <Modal
      title={isEdit ? 'Sửa mã giảm giá' : 'Tạo mã giảm giá'}
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      okText={isEdit ? 'Cập nhật' : 'Tạo'}
      confirmLoading={isLoading}
      width={640}
      afterOpenChange={handleAfterOpenChange}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item
              name="title"
              label="Tiêu đề"
              rules={[{ required: true, message: 'Vui lòng nhập tiêu đề' }]}
            >
              <Input placeholder="Khuyến mãi hè giảm 20%" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item
              name="couponCode"
              label="Mã giảm giá"
              rules={[{ required: true, message: 'Vui lòng nhập mã giảm giá' }]}
              normalize={(v: string) => v?.toUpperCase()}
            >
              <Input placeholder="SUMMER20" style={{ fontFamily: 'monospace', fontWeight: 600 }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              name="productType"
              label="Loại sản phẩm"
              rules={[{ required: true, message: 'Vui lòng chọn loại sản phẩm' }]}
            >
              <Select
                options={PRODUCT_TYPE_OPTIONS.filter((o) => o.value !== '')}
                placeholder="Chọn loại sản phẩm"
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item
              name="discountPercentage"
              label="Giảm giá (%)"
              rules={[{ required: true, message: 'Vui lòng nhập mức giảm' }]}
            >
              <InputNumber min={1} max={100} style={{ width: '100%' }} suffix="%" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              name="minimumAmount"
              label="Giá trị đơn tối thiểu"
              tooltip="Lưu theo VND. CRM/cửa hàng hiển thị theo đơn vị tiền tệ người dùng chọn."
              rules={[{ required: true, message: 'Vui lòng nhập giá trị tối thiểu' }]}
            >
              <InputNumber min={0} precision={0} style={{ width: '100%' }} prefix="₫" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item
              name="startTime"
              label="Thời gian bắt đầu"
              rules={[{ required: true, message: 'Vui lòng chọn thời gian bắt đầu' }]}
            >
              <Input type="datetime-local" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              name="endTime"
              label="Thời gian kết thúc"
              rules={[{ required: true, message: 'Vui lòng chọn thời gian kết thúc' }]}
            >
              <Input type="datetime-local" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item name="usageLimit" label="Giới hạn tổng lượt dùng">
              <InputNumber min={1} style={{ width: '100%' }} placeholder="Không giới hạn" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="perUserLimit" label="Giới hạn mỗi người dùng">
              <InputNumber min={1} style={{ width: '100%' }} placeholder="Không giới hạn" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="status" label="Trạng thái">
          <Radio.Group>
            <Radio value="active">Đang hoạt động</Radio>
            <Radio value="inactive">Ngừng hoạt động</Radio>
          </Radio.Group>
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function CouponsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [committedSearch, setCommittedSearch] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const { formatCurrency } = useFormatters();

  const queryParams = {
    page,
    limit: PAGE_SIZE,
    ...(committedSearch ? { search: committedSearch } : {}),
    ...(filters.productType ? { productType: filters.productType } : {}),
    ...(filters.status ? { status: filters.status } : {}),
  };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['coupons', queryParams],
    queryFn: () => couponsApi.getAll(queryParams),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => couponsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coupons'] });
      toast.success('Đã xoá mã giảm giá');
    },
    onError: () => toast.error('Xoá mã giảm giá thất bại'),
  });

  const handleSearchChange = useCallback((value: string) => {
    setFilters((prev) => ({ ...prev, search: value }));
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setCommittedSearch(value);
      setPage(1);
    }, DEBOUNCE_MS);
  }, []);

  const handleOpenCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (coupon: Coupon) => {
    setEditing(coupon);
    setModalOpen(true);
  };

  const columns: TableProps<Coupon>['columns'] = [
    {
      title: 'Mã',
      dataIndex: 'couponCode',
      key: 'code',
      width: 150,
      render: (code: string) => (
        <Tag
          icon={<GiftOutlined />}
          color="blue"
          style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13 }}
        >
          {code}
        </Tag>
      ),
    },
    {
      title: 'Tiêu đề',
      dataIndex: 'title',
      key: 'title',
      render: (title: string) => <Text strong>{title}</Text>,
    },
    {
      title: 'Giảm giá',
      dataIndex: 'discountPercentage',
      key: 'discount',
      width: 100,
      render: (v: number) => <Tag color="volcano">{v}%</Tag>,
    },
    {
      title: 'Đơn tối thiểu',
      dataIndex: 'minimumAmount',
      key: 'minAmount',
      width: 130,
      render: (v: number) => formatCurrency(v),
    },
    {
      title: 'Loại sản phẩm',
      dataIndex: 'productType',
      key: 'productType',
      width: 130,
      render: (v: string) => (
        <Tag>{PRODUCT_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v}</Tag>
      ),
    },
    {
      title: 'Bắt đầu',
      dataIndex: 'startTime',
      key: 'start',
      width: 140,
      render: (v: string) => dayjs(v).format('DD/MM/YYYY'),
    },
    {
      title: 'Kết thúc',
      dataIndex: 'endTime',
      key: 'end',
      width: 140,
      render: (v: string) => dayjs(v).format('DD/MM/YYYY'),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => <StatusBadge status={status} />,
    },
    {
      title: 'Lượt dùng',
      key: 'usage',
      width: 90,
      render: (_: unknown, record: Coupon) =>
        record.usageLimit
          ? `${record.usageCount ?? 0} / ${record.usageLimit}`
          : `${record.usageCount ?? 0}`,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 110,
      fixed: 'right' as const,
      render: (_: unknown, record: Coupon) => (
        <Button.Group size="small">
          <Button icon={<EditOutlined />} onClick={() => handleOpenEdit(record)} />
          <Popconfirm
            title="Xoá mã giảm giá?"
            description="Thao tác này không thể hoàn tác."
            onConfirm={() => deleteMutation.mutate(record._id)}
            okText="Xoá"
            cancelText="Huỷ"
            okButtonProps={{ danger: true }}
          >
            <Button icon={<DeleteOutlined />} danger loading={deleteMutation.isPending} />
          </Popconfirm>
        </Button.Group>
      ),
    },
  ];

  const hasActiveFilters =
    filters.search !== '' || filters.productType !== '' || filters.status !== '';

  return (
    <div>
      <PageHeader
        title="Mã giảm giá"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate}>
            Tạo mã giảm giá
          </Button>
        }
      />

      <Card style={{ marginBottom: 16 }} size="small">
        <Space wrap>
          <Input
            placeholder="Tìm kiếm mã giảm giá..."
            prefix={<SearchOutlined style={{ color: '#bbb' }} />}
            value={filters.search}
            onChange={(e) => handleSearchChange(e.target.value)}
            allowClear
            style={{ width: 220 }}
          />
          <Select
            placeholder="Tất cả loại"
            value={filters.productType || undefined}
            onChange={(val) => {
              setFilters((prev) => ({ ...prev, productType: val ?? '' }));
              setPage(1);
            }}
            allowClear
            options={PRODUCT_TYPE_OPTIONS}
            style={{ width: 160 }}
          />
          <Select
            placeholder="Tất cả trạng thái"
            value={filters.status || undefined}
            onChange={(val) => {
              setFilters((prev) => ({ ...prev, status: val ?? '' }));
              setPage(1);
            }}
            allowClear
            options={[
              { value: 'active', label: 'Đang hoạt động' },
              { value: 'inactive', label: 'Ngừng hoạt động' },
            ]}
            style={{ width: 140 }}
          />
          {hasActiveFilters && (
            <Button
              icon={<ClearOutlined />}
              onClick={() => {
                setFilters(EMPTY_FILTERS);
                setCommittedSearch('');
                setPage(1);
              }}
            >
              Xoá bộ lọc
            </Button>
          )}
        </Space>
      </Card>

      <Table<Coupon>
        rowKey="_id"
        columns={columns}
        dataSource={data?.data ?? []}
        loading={isLoading || isFetching}
        scroll={{ x: 1100 }}
        expandable={{ childrenColumnName: '__children' }}
        locale={{ emptyText: <Empty description="Không tìm thấy mã giảm giá" /> }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: data?.pagination?.totalItems ?? 0,
          showSizeChanger: false,
          showTotal: (total, range) => `${range[0]}–${range[1]} trên ${total} mã giảm giá`,
          onChange: (p) => setPage(p),
        }}
      />

      <CouponModal open={modalOpen} editing={editing} onClose={() => setModalOpen(false)} />
    </div>
  );
}
