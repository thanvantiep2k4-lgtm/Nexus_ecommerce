import { useState } from 'react';
import {
  Table,
  Button,
  Select,
  Space,
  Tag,
  Typography,
  Card,
  Drawer,
  Descriptions,
  DatePicker,
  Tooltip,
  Empty,
} from 'antd';
import type { TableProps } from 'antd';
import { DownloadOutlined, HistoryOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import type { RangePickerProps } from 'antd/es/date-picker';
import { activityLogApi } from '@/services/api';
import type { ActivityLogEntry } from '@/types';
import PageHeader from '@/components/commons/PageHeader';

const { Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACTION_OPTIONS = [
  { value: 'create', label: 'Tạo mới' },
  { value: 'update', label: 'Cập nhật' },
  { value: 'delete', label: 'Xoá' },
  { value: 'status-change', label: 'Đổi trạng thái' },
  { value: 'login', label: 'Đăng nhập' },
  { value: 'logout', label: 'Đăng xuất' },
  { value: 'approve', label: 'Duyệt' },
  { value: 'reject', label: 'Từ chối' },
  { value: 'export', label: 'Xuất dữ liệu' },
];

const RESOURCE_TYPE_OPTIONS = [
  { value: 'product', label: 'Sản phẩm' },
  { value: 'order', label: 'Đơn hàng' },
  { value: 'user', label: 'Người dùng' },
  { value: 'category', label: 'Danh mục' },
  { value: 'review', label: 'Đánh giá' },
  { value: 'coupon', label: 'Mã giảm giá' },
  { value: 'vendor', label: 'Nhà bán' },
  { value: 'blog', label: 'Bài viết' },
  { value: 'banner', label: 'Banner' },
  { value: 'page', label: 'Trang' },
  { value: 'settings', label: 'Cài đặt' },
  { value: 'email-template', label: 'Mẫu email' },
];

const ROLE_LABELS: Record<string, string> = {
  admin: 'Quản trị viên',
  manager: 'Quản lý',
  staff: 'Nhân viên',
  shipper: 'Giao hàng',
  vendor: 'Nhà bán',
  user: 'Khách hàng',
};

function actionLabel(action: string): string {
  return ACTION_OPTIONS.find((o) => o.value === action)?.label ?? action;
}

function resourceLabel(type: string): string {
  return RESOURCE_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function actionColor(action: string): string {
  switch (action) {
    case 'create':
      return 'green';
    case 'update':
      return 'blue';
    case 'delete':
      return 'red';
    case 'status-change':
      return 'orange';
    case 'approve':
      return 'cyan';
    case 'reject':
      return 'volcano';
    case 'login':
      return 'purple';
    case 'logout':
      return 'default';
    default:
      return 'geekblue';
  }
}

function resourceColor(type: string): string {
  switch (type) {
    case 'product':
      return 'magenta';
    case 'order':
      return 'gold';
    case 'user':
      return 'blue';
    case 'review':
      return 'orange';
    case 'vendor':
      return 'purple';
    case 'category':
      return 'cyan';
    default:
      return 'default';
  }
}

function formatTimestamp(ts: string): string {
  return dayjs(ts).format('DD/MM/YYYY HH:mm:ss');
}

// ---------------------------------------------------------------------------
// Detail Drawer
// ---------------------------------------------------------------------------

interface DetailDrawerProps {
  entry: ActivityLogEntry | null;
  open: boolean;
  onClose: () => void;
}

function DetailDrawer({ entry, open, onClose }: DetailDrawerProps) {
  if (!entry) return null;

  return (
    <Drawer
      title={
        <Space>
          <HistoryOutlined />
          <span>Chi tiết nhật ký hoạt động</span>
        </Space>
      }
      open={open}
      onClose={onClose}
      width={560}
      destroyOnHidden
    >
      <Descriptions column={1} bordered size="small" style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Thời gian">{formatTimestamp(entry.timestamp)}</Descriptions.Item>
        <Descriptions.Item label="Hành động">
          <Tag color={actionColor(entry.action)} style={{ textTransform: 'capitalize' }}>
            {actionLabel(entry.action)}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Người thực hiện">{entry.actor.name}</Descriptions.Item>
        <Descriptions.Item label="Vai trò">
          <Tag style={{ textTransform: 'capitalize' }}>{roleLabel(entry.actor.role)}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Loại tác nhân">{entry.actor.type}</Descriptions.Item>
        <Descriptions.Item label="Địa chỉ IP">{entry.ipAddress ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="Trình duyệt (User Agent)">
          <Paragraph ellipsis={{ rows: 2, expandable: true }} style={{ margin: 0, fontSize: 12 }}>
            {entry.userAgent ?? '—'}
          </Paragraph>
        </Descriptions.Item>
      </Descriptions>

      <Descriptions column={1} bordered size="small" style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Loại đối tượng">
          <Tag color={resourceColor(entry.resource.type)} style={{ textTransform: 'capitalize' }}>
            {resourceLabel(entry.resource.type)}
          </Tag>
        </Descriptions.Item>
        {entry.resource.id && (
          <Descriptions.Item label="ID đối tượng">
            <Text code style={{ fontSize: 12 }}>
              {entry.resource.id}
            </Text>
          </Descriptions.Item>
        )}
        {entry.resource.name && (
          <Descriptions.Item label="Tên đối tượng">{entry.resource.name}</Descriptions.Item>
        )}
      </Descriptions>

      {entry.details && Object.keys(entry.details).length > 0 && (
        <div>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            Chi tiết
          </Text>
          <div
            style={{
              background: '#f6f8fa',
              borderRadius: 6,
              padding: 12,
              border: '1px solid #e8e8e8',
            }}
          >
            <pre
              style={{
                margin: 0,
                fontSize: 12,
                fontFamily: 'Monaco, Menlo, "Courier New", monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                maxHeight: 400,
                overflowY: 'auto',
              }}
            >
              {JSON.stringify(entry.details, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Filters interface
// ---------------------------------------------------------------------------

interface Filters {
  action: string;
  resourceType: string;
  startDate: string;
  endDate: string;
}

const EMPTY_FILTERS: Filters = {
  action: '',
  resourceType: '',
  startDate: '',
  endDate: '',
};

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ActivityLogPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [detailEntry, setDetailEntry] = useState<ActivityLogEntry | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const queryParams = {
    page,
    limit: PAGE_SIZE,
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.resourceType ? { resourceType: filters.resourceType } : {}),
    ...(filters.startDate ? { startDate: filters.startDate } : {}),
    ...(filters.endDate ? { endDate: filters.endDate } : {}),
  };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['activityLog', queryParams],
    queryFn: () => activityLogApi.getAll(queryParams),
  });

  // ---------------------------------------------------------------------------
  // Export CSV
  // ---------------------------------------------------------------------------

  const handleExport = async () => {
    setExporting(true);
    try {
      const exportParams: Record<string, string> = {};
      if (filters.action) exportParams.action = filters.action;
      if (filters.resourceType) exportParams.resourceType = filters.resourceType;
      if (filters.startDate) exportParams.startDate = filters.startDate;
      if (filters.endDate) exportParams.endDate = filters.endDate;

      const blob = await activityLogApi.exportCsv(exportParams);
      const url = URL.createObjectURL(blob as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `activity-log-${dayjs().format('YYYY-MM-DD')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Export failed silently — the backend may not support CSV export yet
    } finally {
      setExporting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Date range change
  // ---------------------------------------------------------------------------

  const handleDateChange: RangePickerProps['onChange'] = (dates) => {
    if (dates && dates[0] && dates[1]) {
      setFilters((prev) => ({
        ...prev,
        startDate: dates[0]!.toISOString(),
        endDate: dates[1]!.toISOString(),
      }));
    } else {
      setFilters((prev) => ({ ...prev, startDate: '', endDate: '' }));
    }
    setPage(1);
  };

  // ---------------------------------------------------------------------------
  // Table columns
  // ---------------------------------------------------------------------------

  const columns: TableProps<ActivityLogEntry>['columns'] = [
    {
      title: 'Thời gian',
      key: 'timestamp',
      width: 175,
      render: (_: unknown, record: ActivityLogEntry) => (
        <Text style={{ fontSize: 12 }}>{formatTimestamp(record.timestamp)}</Text>
      ),
      sorter: false,
    },
    {
      title: 'Người thực hiện',
      key: 'actor',
      width: 180,
      render: (_: unknown, record: ActivityLogEntry) => (
        <div>
          <Text style={{ fontSize: 13 }}>{record.actor.name}</Text>
          <div>
            <Tag style={{ fontSize: 10, textTransform: 'capitalize' }}>{roleLabel(record.actor.role)}</Tag>
          </div>
        </div>
      ),
    },
    {
      title: 'Hành động',
      key: 'action',
      width: 130,
      render: (_: unknown, record: ActivityLogEntry) => (
        <Tag color={actionColor(record.action)} style={{ textTransform: 'capitalize' }}>
          {actionLabel(record.action)}
        </Tag>
      ),
    },
    {
      title: 'Đối tượng',
      key: 'resource',
      width: 200,
      render: (_: unknown, record: ActivityLogEntry) => (
        <Space size={4} wrap>
          <Tag
            color={resourceColor(record.resource.type)}
            style={{ textTransform: 'capitalize', fontSize: 11 }}
          >
            {resourceLabel(record.resource.type)}
          </Tag>
          {record.resource.name && (
            <Text
              style={{ fontSize: 12, maxWidth: 120 }}
              ellipsis={{ tooltip: record.resource.name }}
            >
              {record.resource.name}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Địa chỉ IP',
      key: 'ip',
      width: 130,
      render: (_: unknown, record: ActivityLogEntry) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {record.ipAddress ?? '—'}
        </Text>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Nhật ký hoạt động"
        extra={
          <Tooltip title="Xuất dữ liệu theo bộ lọc hiện tại ra CSV">
            <Button icon={<DownloadOutlined />} loading={exporting} onClick={handleExport}>
              Xuất CSV
            </Button>
          </Tooltip>
        }
      />

      {/* Filters */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            placeholder="Tất cả hành động"
            value={filters.action || undefined}
            onChange={(val) => {
              setFilters((prev) => ({ ...prev, action: val ?? '' }));
              setPage(1);
            }}
            allowClear
            style={{ width: 160 }}
            options={ACTION_OPTIONS}
          />
          <Select
            placeholder="Tất cả loại đối tượng"
            value={filters.resourceType || undefined}
            onChange={(val) => {
              setFilters((prev) => ({ ...prev, resourceType: val ?? '' }));
              setPage(1);
            }}
            allowClear
            style={{ width: 180 }}
            options={RESOURCE_TYPE_OPTIONS}
          />
          <RangePicker
            style={{ width: 260 }}
            onChange={handleDateChange}
            placeholder={['Từ ngày', 'Đến ngày']}
          />
          {(filters.action || filters.resourceType || filters.startDate) && (
            <Button
              onClick={() => {
                setFilters(EMPTY_FILTERS);
                setPage(1);
              }}
            >
              Xoá bộ lọc
            </Button>
          )}
        </Space>
      </Card>

      {/* Table */}
      <Table<ActivityLogEntry>
        rowKey="_id"
        columns={columns}
        dataSource={data?.data ?? []}
        loading={isLoading || isFetching}
        scroll={{ x: 900 }}
        expandable={{ childrenColumnName: '__children' }}
        locale={{ emptyText: <Empty description="Không có nhật ký hoạt động" /> }}
        onRow={(record) => ({
          onClick: () => {
            setDetailEntry(record);
            setDrawerOpen(true);
          },
          style: { cursor: 'pointer' },
        })}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: data?.pagination?.totalItems ?? 0,
          showSizeChanger: false,
          showTotal: (total, range) => `${range[0]}–${range[1]} trên ${total} bản ghi`,
          onChange: (p) => setPage(p),
        }}
      />

      {/* Detail Drawer */}
      <DetailDrawer
        entry={detailEntry}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setDetailEntry(null);
        }}
      />
    </div>
  );
}
