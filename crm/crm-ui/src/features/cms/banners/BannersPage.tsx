import { useState } from 'react';
import {
  Table,
  Button,
  Tag,
  Space,
  Popconfirm,
  Select,
  Card,
  Typography,
  Modal,
  Form,
  Input,
  Switch,
  Row,
  Col,
  Badge,
  Segmented,
  ColorPicker,
} from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CalendarOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

import { bannersApi } from '@/services/api';
import type { Banner } from '@/types';
import PageHeader from '@/components/commons/PageHeader';
import ImageUpload from '@/components/commons/ImageUpload';

const { Text } = Typography;

const BANNER_TYPE_OPTIONS = [
  { value: 'announcement-bar', label: 'Thanh thông báo' },
  { value: 'popup', label: 'Popup' },
  { value: 'hero-slide', label: 'Slide trang chủ' },
  { value: 'promotional-banner', label: 'Banner khuyến mãi' },
  { value: 'category-banner', label: 'Banner danh mục' },
];

const BANNER_TYPE_COLOR: Record<string, string> = {
  'announcement-bar': 'cyan',
  popup: 'orange',
  'hero-slide': 'blue',
  'promotional-banner': 'green',
  'category-banner': 'purple',
};

const STATUS_OPTIONS = [
  { value: 'active', label: 'Đang hoạt động' },
  { value: 'inactive', label: 'Ngừng hoạt động' },
  { value: 'scheduled', label: 'Đã lên lịch' },
];

// ---------------------------------------------------------------------------
// Banner Modal — simplified
// ---------------------------------------------------------------------------

interface BannerFormValues {
  title: string;
  type: Banner['type'];
  status: Banner['status'];
  content_text: string;
  content_textVi: string;
  content_buttonText: string;
  content_buttonUrl: string;
  content_image: string;
  content_backgroundColor: string;
  content_textColor: string;
  scheduling_isAlwaysActive: boolean;
  scheduling_startDate: string;
  scheduling_endDate: string;
  dismissible: boolean;
}

interface BannerModalProps {
  open: boolean;
  editing: Banner | null;
  onClose: () => void;
}

function BannerModal({ open, editing, onClose }: BannerModalProps) {
  const [form] = Form.useForm<BannerFormValues>();
  const queryClient = useQueryClient();
  const isEdit = editing !== null;
  const [scheduled, setScheduled] = useState(false);

  const handleAfterOpenChange = (visible: boolean) => {
    if (!visible) return;
    if (editing) {
      const isAlways = editing.scheduling?.isAlwaysActive ?? true;
      setScheduled(!isAlways);
      form.setFieldsValue({
        title: editing.title,
        type: editing.type,
        status: editing.status,
        content_text: editing.content?.text ?? '',
        content_textVi: editing.content?.textVi ?? '',
        content_buttonText: editing.content?.buttonText ?? '',
        content_buttonUrl: editing.content?.buttonUrl ?? '',
        content_image: editing.content?.image ?? '',
        content_backgroundColor: editing.content?.backgroundColor ?? '#0989FF',
        content_textColor: editing.content?.textColor ?? '#ffffff',
        scheduling_isAlwaysActive: isAlways,
        scheduling_startDate: editing.scheduling?.startDate
          ? dayjs(editing.scheduling.startDate).format('YYYY-MM-DDTHH:mm')
          : '',
        scheduling_endDate: editing.scheduling?.endDate
          ? dayjs(editing.scheduling.endDate).format('YYYY-MM-DDTHH:mm')
          : '',
        dismissible: editing.dismissible ?? false,
      });
    } else {
      form.resetFields();
      setScheduled(false);
      form.setFieldsValue({
        status: 'active',
        type: 'announcement-bar',
        scheduling_isAlwaysActive: true,
        content_backgroundColor: '#0989FF',
        content_textColor: '#ffffff',
        dismissible: true,
      });
    }
  };

  const createMutation = useMutation({
    mutationFn: (data: Partial<Banner>) => bannersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banners'] });
      toast.success('Đã tạo banner');
      onClose();
    },
    onError: () => toast.error('Tạo banner thất bại'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Banner> }) =>
      bannersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banners'] });
      toast.success('Đã cập nhật banner');
      onClose();
    },
    onError: () => toast.error('Cập nhật banner thất bại'),
  });

  const isLoading = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload: Partial<Banner> = {
        title: values.title,
        type: values.type,
        status: values.status,
        priority: 0,
        dismissible: values.dismissible,
        content: {
          text: values.content_text,
          textVi: values.content_textVi,
          buttonText: values.content_buttonText,
          buttonUrl: values.content_buttonUrl,
          image: values.content_image,
          backgroundColor: values.content_backgroundColor,
          textColor: values.content_textColor,
        },
        scheduling: {
          isAlwaysActive: !scheduled,
          startDate:
            scheduled && values.scheduling_startDate
              ? new Date(values.scheduling_startDate).toISOString()
              : undefined,
          endDate:
            scheduled && values.scheduling_endDate
              ? new Date(values.scheduling_endDate).toISOString()
              : undefined,
        },
        targeting: { pages: ['*'], userSegments: [] },
      };
      if (isEdit && editing) {
        updateMutation.mutate({ id: editing._id, data: payload });
      } else {
        createMutation.mutate(payload);
      }
    } catch {
      // validation errors
    }
  };

  return (
    <Modal
      title={isEdit ? 'Sửa banner' : 'Thêm banner'}
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      okText={isEdit ? 'Lưu' : 'Tạo'}
      confirmLoading={isLoading}
      width={560}
      afterOpenChange={handleAfterOpenChange}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        {/* Name + Type */}
        <Form.Item
          name="title"
          label="Tên banner"
          rules={[{ required: true, message: 'Bắt buộc' }]}
        >
          <Input placeholder="VD: Khuyến mãi hè" />
        </Form.Item>

        <Row gutter={12}>
          <Col span={14}>
            <Form.Item name="type" label="Loại" rules={[{ required: true }]}>
              <Select options={BANNER_TYPE_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={10}>
            <Form.Item name="status" label="Trạng thái">
              <Segmented
                options={[
                  { label: 'Bật', value: 'active' },
                  { label: 'Tắt', value: 'inactive' },
                ]}
              />
            </Form.Item>
          </Col>
        </Row>

        {/* Image */}
        <Form.Item name="content_image" label="Ảnh banner">
          <ImageUpload placeholder="Tải ảnh lên" width={520} height={160} />
        </Form.Item>

        {/* Text */}
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="content_text" label="Nội dung (EN)">
              <Input placeholder="Free shipping on orders over $50!" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="content_textVi" label="Nội dung (VI)">
              <Input placeholder="Miễn phí vận chuyển cho đơn trên 1.200.000₫!" />
            </Form.Item>
          </Col>
        </Row>

        {/* Button */}
        <Row gutter={12}>
          <Col span={10}>
            <Form.Item name="content_buttonText" label="Nhãn nút">
              <Input placeholder="Shop Now" />
            </Form.Item>
          </Col>
          <Col span={14}>
            <Form.Item name="content_buttonUrl" label="Liên kết nút">
              <Input placeholder="/shop" />
            </Form.Item>
          </Col>
        </Row>

        {/* Colors + Dismissible */}
        <Row gutter={12} align="middle">
          <Col span={7}>
            <Form.Item
              name="content_backgroundColor"
              label="Màu nền"
              getValueFromEvent={(color) => color.toHexString()}
              getValueProps={(hex) => ({ value: hex || '#0989FF' })}
            >
              <ColorPicker format="hex" showText />
            </Form.Item>
          </Col>
          <Col span={7}>
            <Form.Item
              name="content_textColor"
              label="Màu chữ"
              getValueFromEvent={(color) => color.toHexString()}
              getValueProps={(hex) => ({ value: hex || '#ffffff' })}
            >
              <ColorPicker format="hex" showText />
            </Form.Item>
          </Col>
          <Col span={10}>
            <Form.Item name="dismissible" label="Cho phép đóng" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
        </Row>

        {/* Schedule toggle */}
        <Row align="middle" style={{ marginBottom: 8 }}>
          <Col flex="auto">
            <Text type="secondary">
              <CalendarOutlined style={{ marginRight: 6 }} />
              Đặt thời gian hiển thị
            </Text>
          </Col>
          <Col>
            <Switch size="small" checked={scheduled} onChange={setScheduled} />
          </Col>
        </Row>
        {scheduled && (
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="scheduling_startDate" label="Bắt đầu">
                <Input type="datetime-local" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="scheduling_endDate" label="Kết thúc">
                <Input type="datetime-local" />
              </Form.Item>
            </Col>
          </Row>
        )}
      </Form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function BannersPage() {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Banner | null>(null);

  const params = {
    // Trang này quản lý priority bằng kéo-thả nên cần lấy TẤT CẢ banner trong 1 lần.
    // Backend mặc định limit=10 (MAX_LIMIT=100) → nếu không truyền limit, banner thứ 11+ bị cắt mất.
    limit: 100,
    ...(typeFilter ? { type: typeFilter } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
  };

  const { data, isLoading } = useQuery({
    queryKey: ['banners', params],
    queryFn: () => bannersApi.getAll(params),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => bannersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banners'] });
      toast.success('Đã xoá banner');
    },
    onError: () => toast.error('Xoá banner thất bại'),
  });

  const columns: TableProps<Banner>['columns'] = [
    {
      title: 'Tên',
      key: 'title',
      render: (_: unknown, record: Banner) => <Text strong>{record.title}</Text>,
    },
    {
      title: 'Loại',
      dataIndex: 'type',
      key: 'type',
      width: 170,
      render: (type: string) => (
        <Tag color={BANNER_TYPE_COLOR[type] ?? 'default'}>
          {BANNER_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type}
        </Tag>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (s: string) => (
        <Badge
          status={s === 'active' ? 'success' : s === 'scheduled' ? 'warning' : 'default'}
          text={STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s}
        />
      ),
    },
    {
      title: 'Lịch hiển thị',
      key: 'schedule',
      width: 180,
      render: (_: unknown, record: Banner) =>
        record.scheduling?.isAlwaysActive ? (
          <Tag color="green">Luôn hiển thị</Tag>
        ) : (
          <div>
            <div style={{ fontSize: 12 }}>
              {record.scheduling?.startDate
                ? dayjs(record.scheduling.startDate).format('DD/MM/YYYY')
                : '—'}
            </div>
            <div style={{ fontSize: 12, color: '#aaa' }}>
              {record.scheduling?.endDate
                ? `→ ${dayjs(record.scheduling.endDate).format('DD/MM/YYYY')}`
                : ''}
            </div>
          </div>
        ),
    },
    {
      title: 'Ưu tiên',
      dataIndex: 'priority',
      key: 'priority',
      width: 90,
      render: (p: number) => <Tag>{p}</Tag>,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 110,
      fixed: 'right' as const,
      render: (_: unknown, record: Banner) => (
        <Button.Group size="small">
          <Button
            icon={<EditOutlined />}
            onClick={() => {
              setEditing(record);
              setModalOpen(true);
            }}
          />
          <Popconfirm
            title="Xoá banner?"
            onConfirm={() => deleteMutation.mutate(record._id)}
            okText="Xoá"
            cancelText="Huỷ"
            okButtonProps={{ danger: true }}
          >
            <Button icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </Button.Group>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Banner"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            Thêm banner
          </Button>
        }
      />

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            placeholder="Tất cả loại"
            value={typeFilter || undefined}
            onChange={(v) => setTypeFilter(v ?? '')}
            allowClear
            options={BANNER_TYPE_OPTIONS}
            style={{ width: 180 }}
          />
          <Select
            placeholder="Tất cả trạng thái"
            value={statusFilter || undefined}
            onChange={(v) => setStatusFilter(v ?? '')}
            allowClear
            options={STATUS_OPTIONS}
            style={{ width: 150 }}
          />
        </Space>
      </Card>

      <Table<Banner>
        rowKey="_id"
        columns={columns}
        dataSource={data?.data ?? []}
        loading={isLoading}
        expandable={{ childrenColumnName: '__children' }}
        pagination={false}
        scroll={{ x: 800 }}
      />

      <BannerModal open={modalOpen} editing={editing} onClose={() => setModalOpen(false)} />
    </div>
  );
}
