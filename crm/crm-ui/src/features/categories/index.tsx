import { useState, useCallback, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table,
  Button,
  Input,
  Select,
  Space,
  Form,
  Switch,
  InputNumber,
  Tag,
  Avatar,
  Badge,
  Popconfirm,
  Typography,
  Row,
  Col,
  Tooltip,
  Tree,
  Card,
  Statistic,
  Drawer,
  Divider,
  Flex,
  Progress,
  Empty,
  Segmented,
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import {
  PlusOutlined,
  EditOutlined,
  EyeOutlined,
  DeleteOutlined,
  SearchOutlined,
  PictureOutlined,
  TableOutlined,
  ApartmentOutlined,
  TagsOutlined,
  EyeInvisibleOutlined,
  StarOutlined,
  FolderOutlined,
  CalendarOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import toast from 'react-hot-toast';
import type { TableProps } from 'antd';
import type { Category, CategoryStats } from '@/types';
import { categoriesApi } from '@/services/api';
import { useFormatters } from '@/hooks/useFormatters';
import StatusBadge from '@/components/commons/StatusBadge';
import PageHeader from '@/components/commons/PageHeader';
import ImageUpload from '@/components/commons/ImageUpload';

const { TextArea } = Input;
const { Text, Title } = Typography;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CategoryFormValues {
  parent: string;
  slug?: string;
  icon?: string;
  parentCategory?: string;
  productType: string;
  description?: string;
  img?: string;
  children?: string[];
  status: 'Show' | 'Hide';
  sortOrder?: number;
  featured?: boolean;
}

// ---------------------------------------------------------------------------
// Hook: debounced state
// ---------------------------------------------------------------------------

function useDebouncedState(
  initialValue: string,
  delay: number
): [string, string, (value: string) => void] {
  const [inputValue, setInputValue] = useState(initialValue);
  const [debouncedValue, setDebouncedValue] = useState(initialValue);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const setValue = useCallback(
    (value: string) => {
      setInputValue(value);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setDebouncedValue(value);
      }, delay);
    },
    [delay]
  );

  return [inputValue, debouncedValue, setValue];
}

// ---------------------------------------------------------------------------
// Product type color map
// ---------------------------------------------------------------------------

const PRODUCT_TYPE_COLORS: Record<string, string> = {
  fashion: 'magenta',
  electronics: 'blue',
  beauty: 'pink',
  jewelry: 'gold',
  other: 'default',
};

function getProductTypeColor(type: string): string {
  return PRODUCT_TYPE_COLORS[type?.toLowerCase()] ?? 'default';
}

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  fashion: 'Thời trang',
  electronics: 'Điện tử',
  beauty: 'Làm đẹp',
  jewelry: 'Trang sức',
  other: 'Khác',
};

function getProductTypeLabel(type: string): string {
  return PRODUCT_TYPE_LABELS[type?.toLowerCase()] ?? type;
}

// ---------------------------------------------------------------------------
// Sub-component: Category thumbnail
// ---------------------------------------------------------------------------

function CategoryImage({ src, alt, size = 48 }: { src?: string; alt: string; size?: number }) {
  if (src) {
    return (
      <Avatar
        shape="square"
        size={size}
        src={src}
        alt={alt}
        style={{ objectFit: 'cover', borderRadius: 8, border: '1px solid #f0f0f0' }}
      />
    );
  }
  return (
    <Avatar
      shape="square"
      size={size}
      icon={<PictureOutlined />}
      style={{
        backgroundColor: '#fafafa',
        color: '#d9d9d9',
        borderRadius: 8,
        border: '1px solid #f0f0f0',
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Tree builder (enhanced)
// ---------------------------------------------------------------------------

function buildTreeData(
  categories: Category[],
  onEdit: (cat: Category) => void,
  onView: (cat: Category) => void,
  onDelete: (id: string) => void
): DataNode[] {
  return categories.map((cat) => {
    const productCount = cat.products?.length ?? 0;

    const nodeTitle = (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderRadius: 8,
          background: '#fafafa',
          border: '1px solid #f0f0f0',
          marginBottom: 4,
          transition: 'all 0.2s',
        }}
      >
        <Flex align="center" gap={12}>
          <CategoryImage src={cat.img} alt={cat.parent} size={36} />
          <div>
            <Text strong style={{ fontSize: 14 }}>
              {cat.parent}
            </Text>
            <div>
              <Tag
                color={getProductTypeColor(cat.productType)}
                style={{ fontSize: 11, marginRight: 4 }}
              >
                {getProductTypeLabel(cat.productType)}
              </Tag>
              <Badge
                count={productCount}
                showZero
                size="small"
                style={{ backgroundColor: productCount > 0 ? '#1677ff' : '#d9d9d9', fontSize: 10 }}
              />
            </div>
          </div>
        </Flex>
        <Space size={0}>
          <StatusBadge status={cat.status} type="general" />
          {cat.featured && (
            <Tag color="gold" style={{ fontSize: 11 }}>
              Nổi bật
            </Tag>
          )}
          <Tooltip title="Xem">
            <Button
              size="small"
              type="text"
              icon={<EyeOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                onView(cat);
              }}
            />
          </Tooltip>
          <Tooltip title="Sửa">
            <Button
              size="small"
              type="text"
              icon={<EditOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                onEdit(cat);
              }}
            />
          </Tooltip>
          <Popconfirm
            title="Xoá danh mục này?"
            description="Thao tác này không thể hoàn tác."
            onConfirm={() => onDelete(cat._id)}
            okText="Xoá"
            cancelText="Huỷ"
            okButtonProps={{ danger: true }}
          >
            <Button
              size="small"
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={(e) => e.stopPropagation()}
            />
          </Popconfirm>
        </Space>
      </div>
    );

    const childNodes: DataNode[] = (cat.children ?? []).map((childName, idx) => ({
      key: `${cat._id}-child-${idx}`,
      title: (
        <div style={{ padding: '4px 12px', fontSize: 13, color: '#595959' }}>
          <FolderOutlined style={{ marginRight: 6, color: '#bfbfbf' }} />
          {childName}
        </div>
      ),
      isLeaf: true,
    }));

    return {
      key: cat._id,
      title: nodeTitle,
      children: childNodes.length > 0 ? childNodes : undefined,
    };
  });
}

// ---------------------------------------------------------------------------
// Stats cards component
// ---------------------------------------------------------------------------

function StatsCards({
  totalCategories,
  visibleCount,
  hiddenCount,
  featuredCount,
  productTypeStats,
  loading,
}: {
  totalCategories: number;
  visibleCount: number;
  hiddenCount: number;
  featuredCount: number;
  productTypeStats: { _id: string; count: number }[];
  loading: boolean;
}) {
  const cardStyle = {
    borderRadius: 12,
    height: '100%',
  };

  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
      <Col xs={12} sm={12} md={6}>
        <Card style={cardStyle} loading={loading} size="small">
          <Statistic
            title={
              <Text type="secondary" style={{ fontSize: 13 }}>
                Tổng danh mục
              </Text>
            }
            value={totalCategories}
            prefix={<TagsOutlined style={{ color: '#1677ff', fontSize: 20 }} />}
            valueStyle={{ color: '#1677ff', fontWeight: 600 }}
          />
        </Card>
      </Col>
      <Col xs={12} sm={12} md={6}>
        <Card style={cardStyle} loading={loading} size="small">
          <Statistic
            title={
              <Text type="secondary" style={{ fontSize: 13 }}>
                Đang hiển thị
              </Text>
            }
            value={visibleCount}
            prefix={<EyeOutlined style={{ color: '#52c41a', fontSize: 20 }} />}
            valueStyle={{ color: '#52c41a', fontWeight: 600 }}
            suffix={
              totalCategories > 0 ? (
                <Text type="secondary" style={{ fontSize: 13 }}>
                  / {totalCategories}
                </Text>
              ) : undefined
            }
          />
          {totalCategories > 0 && (
            <Progress
              percent={Math.round((visibleCount / totalCategories) * 100)}
              showInfo={false}
              strokeColor="#52c41a"
              size="small"
              style={{ marginTop: 4 }}
            />
          )}
        </Card>
      </Col>
      <Col xs={12} sm={12} md={6}>
        <Card style={cardStyle} loading={loading} size="small">
          <Statistic
            title={
              <Text type="secondary" style={{ fontSize: 13 }}>
                Đang ẩn
              </Text>
            }
            value={hiddenCount}
            prefix={<EyeInvisibleOutlined style={{ color: '#faad14', fontSize: 20 }} />}
            valueStyle={{ color: '#faad14', fontWeight: 600 }}
          />
        </Card>
      </Col>
      <Col xs={12} sm={12} md={6}>
        <Card style={cardStyle} loading={loading} size="small">
          <Statistic
            title={
              <Text type="secondary" style={{ fontSize: 13 }}>
                Nổi bật
              </Text>
            }
            value={featuredCount}
            prefix={<StarOutlined style={{ color: '#eb2f96', fontSize: 20 }} />}
            valueStyle={{ color: '#eb2f96', fontWeight: 600 }}
          />
          {productTypeStats.length > 0 && (
            <div style={{ marginTop: 6 }}>
              {productTypeStats.slice(0, 3).map((pt) => (
                <Tag
                  key={pt._id}
                  color={getProductTypeColor(pt._id)}
                  style={{ fontSize: 11, marginBottom: 2 }}
                >
                  {getProductTypeLabel(pt._id)}: {pt.count}
                </Tag>
              ))}
            </div>
          )}
        </Card>
      </Col>
    </Row>
  );
}

// ---------------------------------------------------------------------------
// Detail drawer content
// ---------------------------------------------------------------------------

function CategoryDetail({ category }: { category: Category }) {
  const { formatDate } = useFormatters();
  const productCount = category.products?.length ?? 0;

  return (
    <div>
      {/* Hero section */}
      <Flex align="center" gap={16} style={{ marginBottom: 24 }}>
        <CategoryImage src={category.img} alt={category.parent} size={80} />
        <div>
          <Title level={4} style={{ margin: 0 }}>
            {category.parent}
          </Title>
          <Flex gap={6} style={{ marginTop: 6 }}>
            <Tag color={getProductTypeColor(category.productType)}>
              {getProductTypeLabel(category.productType)}
            </Tag>
            <StatusBadge status={category.status} type="general" />
            {category.featured && <Tag color="gold">Nổi bật</Tag>}
          </Flex>
        </div>
      </Flex>

      <Divider style={{ margin: '16px 0' }} />

      {/* Metrics */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card size="small" style={{ textAlign: 'center', borderRadius: 8 }}>
            <Statistic title="Sản phẩm" value={productCount} valueStyle={{ fontSize: 20 }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" style={{ textAlign: 'center', borderRadius: 8 }}>
            <Statistic
              title="Danh mục con"
              value={category.children?.length ?? 0}
              valueStyle={{ fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" style={{ textAlign: 'center', borderRadius: 8 }}>
            <Statistic
              title="Thứ tự"
              value={category.sortOrder ?? 0}
              valueStyle={{ fontSize: 20 }}
            />
          </Card>
        </Col>
      </Row>

      {/* Description */}
      {category.description && (
        <div style={{ marginBottom: 20 }}>
          <Text
            type="secondary"
            style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}
          >
            Mô tả
          </Text>
          <p style={{ marginTop: 4, color: '#595959' }}>{category.description}</p>
        </div>
      )}

      {/* Sub-categories */}
      {category.children && category.children.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <Text
            type="secondary"
            style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}
          >
            Danh mục con
          </Text>
          <div style={{ marginTop: 8 }}>
            {category.children.map((child) => (
              <Tag
                key={child}
                style={{ marginBottom: 6, padding: '4px 12px', borderRadius: 6, fontSize: 13 }}
              >
                <FolderOutlined style={{ marginRight: 4 }} />
                {child}
              </Tag>
            ))}
          </div>
        </div>
      )}

      <Divider style={{ margin: '16px 0' }} />

      {/* Timestamps */}
      <Flex vertical gap={8}>
        <Flex align="center" gap={8}>
          <CalendarOutlined style={{ color: '#bfbfbf' }} />
          <Text type="secondary" style={{ fontSize: 13 }}>
            Ngày tạo: {formatDate(category.createdAt)}
          </Text>
        </Flex>
        <Flex align="center" gap={8}>
          <CalendarOutlined style={{ color: '#bfbfbf' }} />
          <Text type="secondary" style={{ fontSize: 13 }}>
            Cập nhật: {formatDate(category.updatedAt)}
          </Text>
        </Flex>
      </Flex>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function CategoriesPage() {
  const queryClient = useQueryClient();
  const { formatDate } = useFormatters();

  // View mode
  const [viewMode, setViewMode] = useState<'table' | 'tree'>('table');

  // Pagination
  const [page, setPage] = useState(1);
  const limit = 10;

  // Filters
  const [searchInput, debouncedSearch, setSearch] = useDebouncedState('', 300);
  const [statusFilter, setStatusFilter] = useState('');
  const [productTypeFilter, setProductTypeFilter] = useState('');

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [viewingCategory, setViewingCategory] = useState<Category | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [form] = Form.useForm<CategoryFormValues>();

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  const categoriesQuery = useQuery({
    queryKey: ['categories', page, limit, debouncedSearch, statusFilter, productTypeFilter],
    queryFn: () =>
      categoriesApi.getAll({
        page,
        limit,
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
        productType: productTypeFilter || undefined,
      }),
  });

  const statsQuery = useQuery({
    queryKey: ['categories', 'stats'],
    queryFn: () => categoriesApi.getStats(),
    staleTime: 1000 * 60 * 10,
  });

  const allCategoriesQuery = useQuery({
    queryKey: ['categories', 'all'],
    queryFn: () => categoriesApi.getAll({ limit: 500 }),
    enabled: viewMode === 'tree',
    staleTime: 1000 * 60 * 5,
  });

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const createMutation = useMutation({
    mutationFn: (data: Partial<Category>) => categoriesApi.create(data),
    onSuccess: () => {
      toast.success('Đã tạo danh mục');
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setDrawerOpen(false);
      form.resetFields();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Tạo danh mục thất bại');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Category> }) =>
      categoriesApi.update(id, data),
    onSuccess: () => {
      toast.success('Đã cập nhật danh mục');
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setDrawerOpen(false);
      setEditingCategory(null);
      form.resetFields();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Cập nhật danh mục thất bại');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => categoriesApi.delete(id),
    onSuccess: () => {
      toast.success('Đã xoá danh mục');
      setDeletingId(null);
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (error: Error) => {
      setDeletingId(null);
      toast.error(error.message || 'Xoá danh mục thất bại');
    },
  });

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleAddCategory = () => {
    setEditingCategory(null);
    form.resetFields();
    form.setFieldsValue({ status: 'Show', featured: false, sortOrder: 0 });
    setDrawerOpen(true);
  };

  const handleEditCategory = (category: Category) => {
    setEditingCategory(category);
    form.setFieldsValue({
      parent: category.parent,
      slug: (category as any).slug ?? '',
      icon: (category as any).icon ?? '',
      parentCategory: (category as any).parentCategory ?? undefined,
      productType: category.productType,
      description: category.description,
      img: category.img,
      children: category.children ?? [],
      status: category.status,
      sortOrder: category.sortOrder ?? 0,
      featured: category.featured ?? false,
    });
    setDrawerOpen(true);
  };

  const handleViewCategory = (category: Category) => {
    setViewingCategory(category);
    setDetailDrawerOpen(true);
  };

  const handleDeleteCategory = (id: string) => {
    setDeletingId(id);
    deleteMutation.mutate(id);
  };

  const handleDrawerSubmit = async () => {
    try {
      const values = await form.validateFields();

      const payload: Partial<Category> = {
        parent: values.parent,
        productType: values.productType,
        description: values.description,
        img: values.img,
        children: Array.isArray(values.children)
          ? values.children.map((c) => c?.trim()).filter(Boolean)
          : [],
        status: values.status,
        sortOrder: values.sortOrder,
        featured: values.featured,
        ...(values.slug ? { slug: values.slug } : {}),
        ...(values.icon ? { icon: values.icon } : {}),
        ...(values.parentCategory ? { parentCategory: values.parentCategory } : {}),
      };

      if (editingCategory) {
        updateMutation.mutate({ id: editingCategory._id, data: payload });
      } else {
        createMutation.mutate(payload);
      }
    } catch {
      // Ant Design validation errors shown inline
    }
  };

  const handleDrawerClose = () => {
    setDrawerOpen(false);
    setEditingCategory(null);
    form.resetFields();
  };

  const handleClearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setProductTypeFilter('');
    setPage(1);
  };

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const stats = statsQuery.data?.data as CategoryStats | undefined;
  const productTypeStats: { _id: string; count: number }[] = stats?.productTypeStats ?? [];

  // Stat cards must reflect the WHOLE collection (from the stats endpoint), not the
  // current paginated page — otherwise "Total Categories" shows the page size (10).
  const statTotal = stats?.totalCategories ?? 0;
  const statVisible = stats?.activeCategories ?? 0;
  const statHidden = stats?.hiddenCategories ?? Math.max(statTotal - statVisible, 0);
  const statFeatured = stats?.featuredCategories ?? 0;

  const categories: Category[] = categoriesQuery.data?.data ?? [];
  const allCategories: Category[] = allCategoriesQuery.data?.data ?? [];
  const pagination = categoriesQuery.data?.pagination;
  const hasActiveFilters = Boolean(debouncedSearch || statusFilter || productTypeFilter);
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const treeData = useMemo(
    () =>
      buildTreeData(allCategories, handleEditCategory, handleViewCategory, handleDeleteCategory),
    [allCategories]
  );

  // ---------------------------------------------------------------------------
  // Table columns
  // ---------------------------------------------------------------------------

  const columns: TableProps<Category>['columns'] = [
    {
      title: 'Danh mục',
      key: 'category',
      render: (_: unknown, record: Category) => (
        <Flex align="center" gap={12}>
          <CategoryImage src={record.img} alt={record.parent} />
          <div>
            <Flex align="center" gap={6}>
              <Text strong style={{ fontSize: 14 }}>
                {record.parent}
              </Text>
              {record.featured && <StarOutlined style={{ color: '#eb2f96', fontSize: 12 }} />}
            </Flex>
            {record.children && record.children.length > 0 && (
              <div style={{ marginTop: 4 }}>
                {record.children.slice(0, 3).map((child) => (
                  <Tag key={child} style={{ fontSize: 11, marginBottom: 2, borderRadius: 4 }}>
                    {child}
                  </Tag>
                ))}
                {record.children.length > 3 && (
                  <Tag style={{ fontSize: 11, marginBottom: 2, borderRadius: 4 }}>
                    +{record.children.length - 3} khác
                  </Tag>
                )}
              </div>
            )}
          </div>
        </Flex>
      ),
    },
    {
      title: 'Loại',
      dataIndex: 'productType',
      key: 'productType',
      width: 120,
      render: (value: string) => (
        <Tag color={getProductTypeColor(value)} style={{ borderRadius: 4 }}>
          {getProductTypeLabel(value)}
        </Tag>
      ),
    },
    {
      title: 'Sản phẩm',
      key: 'products',
      width: 90,
      align: 'center',
      sorter: (a: Category, b: Category) => (a.products?.length ?? 0) - (b.products?.length ?? 0),
      render: (_: unknown, record: Category) => {
        const count = record.products?.length ?? 0;
        return (
          <Badge
            count={count}
            showZero
            overflowCount={999}
            style={{
              backgroundColor: count > 0 ? '#1677ff' : '#f0f0f0',
              color: count > 0 ? '#fff' : '#bfbfbf',
              fontWeight: 600,
            }}
          />
        );
      },
    },
    {
      title: 'Trạng thái',
      key: 'status',
      width: 90,
      filters: [
        { text: 'Hiển thị', value: 'Show' },
        { text: 'Ẩn', value: 'Hide' },
      ],
      onFilter: (value, record) => record.status === value,
      render: (_: unknown, record: Category) => (
        <StatusBadge status={record.status} type="general" />
      ),
    },
    {
      title: 'Thứ tự',
      key: 'sortOrder',
      width: 70,
      align: 'center',
      sorter: (a: Category, b: Category) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
      render: (_: unknown, record: Category) => (
        <Text type="secondary" style={{ fontSize: 13 }}>
          {record.sortOrder ?? 0}
        </Text>
      ),
    },
    {
      title: 'Cập nhật',
      key: 'updatedAt',
      width: 140,
      render: (_: unknown, record: Category) => (
        <Tooltip title={`Ngày tạo: ${formatDate(record.createdAt)}`}>
          <Text style={{ fontSize: 12 }} type="secondary">
            {formatDate(record.updatedAt)}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 110,
      fixed: 'right',
      render: (_: unknown, record: Category) => (
        <Space size={0}>
          <Tooltip title="Xem chi tiết">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleViewCategory(record)}
            />
          </Tooltip>
          <Tooltip title="Sửa">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEditCategory(record)}
            />
          </Tooltip>
          <Popconfirm
            title="Xoá danh mục"
            description="Thao tác này không thể hoàn tác."
            onConfirm={() => handleDeleteCategory(record._id)}
            okText="Xoá"
            cancelText="Huỷ"
            okButtonProps={{ danger: true }}
          >
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              loading={deletingId === record._id && deleteMutation.isPending}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div>
      <PageHeader
        title="Quản lý danh mục"
        extra={
          <Space>
            <Segmented
              value={viewMode}
              onChange={(val) => setViewMode(val as 'table' | 'tree')}
              options={[
                { value: 'table', icon: <TableOutlined />, label: 'Bảng' },
                { value: 'tree', icon: <ApartmentOutlined />, label: 'Cây' },
              ]}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAddCategory}>
              Thêm danh mục
            </Button>
          </Space>
        }
      />

      {/* Stats cards */}
      <StatsCards
        totalCategories={statTotal}
        visibleCount={statVisible}
        hiddenCount={statHidden}
        featuredCount={statFeatured}
        productTypeStats={productTypeStats}
        loading={statsQuery.isLoading}
      />

      {viewMode === 'tree' ? (
        /* ---- Tree View ---- */
        <Card
          loading={allCategoriesQuery.isLoading}
          style={{ borderRadius: 12 }}
          styles={{ body: { padding: treeData.length === 0 ? 48 : 16 } }}
        >
          {treeData.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không tìm thấy danh mục">
              <Button type="primary" icon={<PlusOutlined />} onClick={handleAddCategory}>
                Tạo danh mục đầu tiên
              </Button>
            </Empty>
          ) : (
            <Tree
              treeData={treeData}
              defaultExpandAll
              blockNode
              showLine={{ showLeafIcon: false }}
              style={{ fontSize: 14 }}
            />
          )}
        </Card>
      ) : (
        <>
          {/* ---- Filter bar ---- */}
          <Card
            size="small"
            style={{ marginBottom: 16, borderRadius: 12 }}
            styles={{ body: { padding: '12px 16px' } }}
          >
            <Flex gap={12} wrap="wrap" align="center">
              <Input
                placeholder="Tìm kiếm danh mục..."
                prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                value={searchInput}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                allowClear
                style={{ width: 260 }}
              />

              <Select
                style={{ width: 140 }}
                placeholder="Trạng thái"
                value={statusFilter || undefined}
                onChange={(val?: string) => {
                  setStatusFilter(val ?? '');
                  setPage(1);
                }}
                allowClear
                options={[
                  { label: 'Hiển thị', value: 'Show' },
                  { label: 'Ẩn', value: 'Hide' },
                ]}
              />

              <Select
                style={{ width: 200 }}
                placeholder="Loại sản phẩm"
                value={productTypeFilter || undefined}
                onChange={(val?: string) => {
                  setProductTypeFilter(val ?? '');
                  setPage(1);
                }}
                allowClear
                loading={statsQuery.isLoading}
                options={productTypeStats.map((pt) => ({
                  label: `${getProductTypeLabel(pt._id)} (${pt.count})`,
                  value: pt._id,
                }))}
              />

              {hasActiveFilters && (
                <Button type="link" onClick={handleClearFilters} style={{ padding: 0 }}>
                  Xoá bộ lọc
                </Button>
              )}

              <div style={{ flex: 1 }} />

              <Text type="secondary" style={{ fontSize: 13 }}>
                {pagination?.totalItems ?? 0} danh mục
              </Text>
            </Flex>
          </Card>

          {/* ---- Table ---- */}
          <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 0 } }}>
            <Table<Category>
              rowKey="_id"
              columns={columns}
              dataSource={categories}
              loading={categoriesQuery.isLoading || categoriesQuery.isFetching}
              expandable={{ childrenColumnName: '__children' }}
              pagination={{
                current: page,
                pageSize: limit,
                total: pagination?.totalItems ?? 0,
                showSizeChanger: false,
                showTotal: (total, range) => (
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    {range[0]}-{range[1]} / {total}
                  </Text>
                ),
                onChange: (p) => setPage(p),
                style: { padding: '0 16px' },
              }}
              scroll={{ x: 820 }}
              size="middle"
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                      hasActiveFilters ? 'Không có danh mục phù hợp bộ lọc' : 'Chưa có danh mục nào'
                    }
                  >
                    {!hasActiveFilters && (
                      <Button type="primary" icon={<PlusOutlined />} onClick={handleAddCategory}>
                        Tạo danh mục đầu tiên
                      </Button>
                    )}
                  </Empty>
                ),
              }}
            />
          </Card>
        </>
      )}

      {/* ---- Create / Edit Drawer ---- */}
      <Drawer
        title={
          <Flex align="center" gap={8}>
            {editingCategory ? <EditOutlined /> : <PlusOutlined />}
            <span>{editingCategory ? 'Sửa danh mục' : 'Thêm danh mục'}</span>
          </Flex>
        }
        open={drawerOpen}
        onClose={handleDrawerClose}
        width={520}
        destroyOnClose
        extra={
          <Space>
            <Button onClick={handleDrawerClose}>Huỷ</Button>
            <Button type="primary" onClick={handleDrawerSubmit} loading={isSubmitting}>
              {editingCategory ? 'Cập nhật' : 'Tạo mới'}
            </Button>
          </Space>
        }
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ status: 'Show', featured: false, sortOrder: 0 }}
          requiredMark="optional"
        >
          {/* Image upload at top */}
          <div style={{ marginBottom: 24, textAlign: 'center' }}>
            <Form.Item name="img" noStyle>
              <ImageUpload placeholder="Tải ảnh danh mục" />
            </Form.Item>
          </div>

          <Divider style={{ margin: '0 0 16px' }} />

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="parent"
                label="Tên danh mục"
                rules={[{ required: true, message: 'Bắt buộc' }]}
              >
                <Input placeholder="VD: Điện tử" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="slug" label="Slug" tooltip="Tự động tạo nếu để trống">
                <Input placeholder="VD: dien-tu" style={{ fontFamily: 'monospace' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="productType"
                label="Loại sản phẩm"
                rules={[{ required: true, message: 'Bắt buộc' }]}
              >
                <Select
                  options={[
                    { value: 'fashion', label: 'Thời trang' },
                    { value: 'electronics', label: 'Điện tử' },
                    { value: 'beauty', label: 'Làm đẹp' },
                    { value: 'jewelry', label: 'Trang sức' },
                    { value: 'other', label: 'Khác' },
                  ]}
                  placeholder="Chọn loại"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="parentCategory"
                label="Danh mục cha"
                tooltip="Đặt làm danh mục con của danh mục khác"
              >
                <Select
                  allowClear
                  showSearch={{ optionFilterProp: 'label' }}
                  placeholder="Không có (cấp cao nhất)"
                  options={categories
                    .filter((c) => !editingCategory || c._id !== editingCategory._id)
                    .map((c) => ({ value: c._id, label: c.parent }))}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="icon" label="Biểu tượng" tooltip="Class icon hoặc emoji">
            <Input placeholder="VD: laptop, shirt" />
          </Form.Item>

          <Form.Item name="description" label="Mô tả">
            <TextArea rows={3} placeholder="Mô tả ngắn" showCount maxLength={500} />
          </Form.Item>

          <Divider style={{ margin: '8px 0 16px' }} />

          {/* Sub-categories */}
          <Form.List name="children">
            {(fields, { add, remove }) => (
              <>
                <Flex justify="space-between" align="center" style={{ marginBottom: 12 }}>
                  <Text strong style={{ fontSize: 14 }}>
                    <FolderOutlined style={{ marginRight: 6 }} />
                    Danh mục con
                  </Text>
                  <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={() => add()}>
                    Thêm
                  </Button>
                </Flex>
                {fields.length === 0 && (
                  <div
                    style={{
                      padding: '16px',
                      textAlign: 'center',
                      background: '#fafafa',
                      borderRadius: 8,
                      marginBottom: 12,
                      border: '1px dashed #d9d9d9',
                    }}
                  >
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      Chưa có danh mục con
                    </Text>
                  </div>
                )}
                {fields.map((field) => (
                  <Flex key={field.key} gap={8} style={{ marginBottom: 8 }} align="start">
                    <Form.Item
                      {...field}
                      rules={[{ required: true, message: 'Vui lòng nhập tên' }]}
                      style={{ margin: 0, flex: 1 }}
                    >
                      <Input placeholder="Tên danh mục con" />
                    </Form.Item>
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      size="small"
                      onClick={() => remove(field.name)}
                      style={{ marginTop: 4 }}
                    />
                  </Flex>
                ))}
              </>
            )}
          </Form.List>

          <Divider style={{ margin: '8px 0 16px' }} />

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="status" label="Trạng thái">
                <Select
                  options={[
                    { label: 'Hiển thị', value: 'Show' },
                    { label: 'Ẩn', value: 'Hide' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="sortOrder" label="Thứ tự">
                <InputNumber style={{ width: '100%' }} min={0} placeholder="0" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="featured" label="Nổi bật" valuePropName="checked">
                <Switch checkedChildren="Có" unCheckedChildren="Không" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Drawer>

      {/* ---- Detail Drawer ---- */}
      <Drawer
        title={
          <Flex align="center" gap={8}>
            <InfoCircleOutlined />
            <span>Chi tiết danh mục</span>
          </Flex>
        }
        open={detailDrawerOpen}
        onClose={() => {
          setDetailDrawerOpen(false);
          setViewingCategory(null);
        }}
        width={440}
        destroyOnClose
        extra={
          viewingCategory && (
            <Button
              type="primary"
              icon={<EditOutlined />}
              onClick={() => {
                setDetailDrawerOpen(false);
                handleEditCategory(viewingCategory);
              }}
            >
              Sửa
            </Button>
          )
        }
      >
        {viewingCategory && <CategoryDetail category={viewingCategory} />}
      </Drawer>
    </div>
  );
}
