import { useState, useRef, useCallback } from 'react';
import {
  Table,
  Button,
  Tag,
  Space,
  Popconfirm,
  Input,
  Select,
  Card,
  Typography,
  Badge,
} from 'antd';
import type { TableProps } from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

import { blogApi } from '@/services/api';
import type { BlogPost } from '@/types';
import PageHeader from '@/components/commons/PageHeader';

const { Text } = Typography;

const PAGE_SIZE = 15;
const DEBOUNCE_MS = 300;

const STATUS_LABEL: Record<string, string> = {
  published: 'Đã xuất bản',
  draft: 'Bản nháp',
  archived: 'Đã lưu trữ',
};

const STATUS_COLOR: Record<string, string> = {
  published: 'success',
  draft: 'processing',
  archived: 'default',
};

export default function BlogListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [committedSearch, setCommittedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const params = {
    page,
    limit: PAGE_SIZE,
    ...(committedSearch ? { search: committedSearch } : {}),
    ...(status ? { status } : {}),
    ...(category ? { category } : {}),
  };

  const { data, isLoading } = useQuery({
    queryKey: ['blog-posts', params],
    queryFn: () => blogApi.getAll(params),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => blogApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blog-posts'] });
      toast.success('Đã xoá bài viết');
    },
    onError: () => toast.error('Xoá bài viết thất bại'),
  });

  const publishMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'publish' | 'unpublish' }) =>
      action === 'publish' ? blogApi.publish(id) : blogApi.unpublish(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blog-posts'] });
      toast.success('Đã cập nhật trạng thái bài viết');
    },
    onError: () => toast.error('Cập nhật trạng thái thất bại'),
  });

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setCommittedSearch(value);
      setPage(1);
    }, DEBOUNCE_MS);
  }, []);

  const columns: TableProps<BlogPost>['columns'] = [
    {
      title: 'Tiêu đề',
      key: 'title',
      render: (_: unknown, record: BlogPost) => (
        <div>
          <Text strong>{record.title}</Text>
          {record.featured && (
            <Tag color="gold" style={{ marginLeft: 6, fontSize: 11 }}>
              Nổi bật
            </Tag>
          )}
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              /{record.slug}
            </Text>
          </div>
          {record.excerpt && (
            <Text
              type="secondary"
              style={{
                fontSize: 12,
                display: 'block',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 320,
              }}
            >
              {record.excerpt}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: 'Danh mục',
      dataIndex: 'category',
      key: 'category',
      width: 130,
      render: (cat: string) => (cat ? <Tag>{cat}</Tag> : <Text type="secondary">—</Text>),
    },
    {
      title: 'Thẻ',
      dataIndex: 'tags',
      key: 'tags',
      width: 160,
      render: (tags: string[]) => (
        <Space size={2} wrap>
          {(tags ?? []).slice(0, 3).map((t) => (
            <Tag key={t} style={{ fontSize: 11 }}>
              {t}
            </Tag>
          ))}
          {(tags ?? []).length > 3 && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              +{tags.length - 3}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (s: string) => (
        <Badge status={STATUS_COLOR[s] as 'success' | 'processing' | 'default'} text={STATUS_LABEL[s] ?? s} />
      ),
    },
    {
      title: 'Tác giả',
      key: 'author',
      width: 130,
      render: (_: unknown, record: BlogPost) => <Text>{record.author?.name ?? '—'}</Text>,
    },
    {
      title: 'Ngày xuất bản',
      key: 'publishedAt',
      width: 130,
      render: (_: unknown, record: BlogPost) =>
        record.publishedAt ? (
          dayjs(record.publishedAt).format('DD/MM/YYYY')
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: 'Lượt xem',
      dataIndex: 'views',
      key: 'views',
      width: 80,
      render: (v: number) => v ?? 0,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 150,
      fixed: 'right' as const,
      render: (_: unknown, record: BlogPost) => (
        <Button.Group size="small">
          <Button icon={<EditOutlined />} onClick={() => navigate(`/cms/blog/${record._id}`)} />
          <Button
            icon={<EyeOutlined />}
            onClick={() =>
              publishMutation.mutate({
                id: record._id,
                action: record.status === 'published' ? 'unpublish' : 'publish',
              })
            }
            title={record.status === 'published' ? 'Huỷ xuất bản' : 'Xuất bản'}
          />
          <Popconfirm
            title="Xoá bài viết này?"
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
        title="Bài viết Blog"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/cms/blog/new')}>
            Thêm bài viết
          </Button>
        }
      />

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="Tìm kiếm bài viết..."
            prefix={<SearchOutlined style={{ color: '#bbb' }} />}
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            allowClear
            style={{ width: 240 }}
          />
          <Select
            placeholder="Tất cả trạng thái"
            value={status || undefined}
            onChange={(v) => {
              setStatus(v ?? '');
              setPage(1);
            }}
            allowClear
            options={[
              { value: 'draft', label: 'Bản nháp' },
              { value: 'published', label: 'Đã xuất bản' },
              { value: 'archived', label: 'Đã lưu trữ' },
            ]}
            style={{ width: 150 }}
          />
          <Input
            placeholder="Lọc theo danh mục"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
            allowClear
            style={{ width: 180 }}
          />
        </Space>
      </Card>

      <Table<BlogPost>
        rowKey="_id"
        columns={columns}
        dataSource={data?.data ?? []}
        loading={isLoading}
        scroll={{ x: 1100 }}
        expandable={{ childrenColumnName: '__children' }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: data?.pagination?.totalItems ?? 0,
          showSizeChanger: false,
          showTotal: (total) => `${total} bài viết`,
          onChange: (p) => setPage(p),
        }}
      />
    </div>
  );
}
