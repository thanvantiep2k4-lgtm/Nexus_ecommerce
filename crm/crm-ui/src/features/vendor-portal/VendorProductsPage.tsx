import { useEffect, useMemo, useState } from 'react';
import {
  Table,
  Button,
  Input,
  Select,
  Form,
  InputNumber,
  Drawer,
  Image,
  Typography,
  Row,
  Col,
  Tag,
  Popconfirm,
  Space,
  Empty,
  Card,
  Tooltip,
} from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined, EditOutlined, StopOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import PageHeader from '@/components/commons/PageHeader';
import ImageUpload from '@/components/commons/ImageUpload';
import { useFormatters } from '@/hooks/useFormatters';
import { vendorPortalApi, apiErrorMessage, type VendorProduct } from './api';

const { Text } = Typography;
const PAGE_SIZE = 10;
const PLACEHOLDER_IMG = 'https://placehold.co/64x64?text=No+Img';

const STATUS_OPTIONS = [
  { value: 'in-stock', label: 'Còn hàng' },
  { value: 'out-of-stock', label: 'Hết hàng' },
  { value: 'discontinued', label: 'Ngừng bán' },
];
const STATUS_COLOR: Record<string, string> = {
  'in-stock': 'green',
  'out-of-stock': 'orange',
  discontinued: 'default',
};

interface FormValues {
  title: string;
  description: string;
  price: number;
  discount?: number;
  quantity: number;
  unit?: string;
  status: VendorProduct['status'];
  categoryId: string;
  children?: string;
  brandId: string;
  img: string;
  tags?: string[];
}

export default function VendorProductsPage() {
  const queryClient = useQueryClient();
  const { formatCurrency } = useFormatters();
  const [searchParams, setSearchParams] = useSearchParams();
  const [form] = Form.useForm<FormValues>();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | undefined>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<VendorProduct | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['vendor-portal', 'products', page, search, status],
    queryFn: () =>
      vendorPortalApi.getProducts({ page, limit: PAGE_SIZE, search: search || undefined, status }),
  });
  const { data: catRes } = useQuery({
    queryKey: ['vendor-portal', 'catalog', 'categories'],
    queryFn: () => vendorPortalApi.getCategories(),
    staleTime: Infinity,
  });
  const { data: brandRes } = useQuery({
    queryKey: ['vendor-portal', 'catalog', 'brands'],
    queryFn: () => vendorPortalApi.getBrands(),
    staleTime: Infinity,
  });

  const categories = useMemo(() => catRes?.data ?? [], [catRes]);
  const brands = useMemo(() => brandRes?.data ?? [], [brandRes]);
  const selectedCategoryId = Form.useWatch('categoryId', form);
  const selectedCategory = categories.find((c) => c._id === selectedCategoryId);

  // Open the create drawer when arriving with ?new=1 (from dashboard)
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      openCreate();
      searchParams.delete('new');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreate() {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: 'in-stock', unit: 'cái', quantity: 10, discount: 0 });
    setDrawerOpen(true);
  }

  function openEdit(p: VendorProduct) {
    setEditing(p);
    form.resetFields();
    form.setFieldsValue({
      title: p.title,
      description: p.description,
      price: p.price,
      discount: p.discount,
      quantity: p.quantity,
      unit: p.unit,
      status: p.status,
      categoryId: p.category?.id,
      children: p.children && p.children !== p.parent ? p.children : undefined,
      brandId: p.brand?.id,
      img: p.img,
      tags: p.tags,
    });
    setDrawerOpen(true);
  }

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['vendor-portal'] });

  const saveMutation = useMutation({
    mutationFn: (payload: Partial<VendorProduct>) =>
      editing
        ? vendorPortalApi.updateProduct(editing._id, payload)
        : vendorPortalApi.createProduct(payload),
    onSuccess: () => {
      toast.success(editing ? 'Đã cập nhật sản phẩm' : 'Đã đăng bán sản phẩm');
      setDrawerOpen(false);
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Lưu sản phẩm thất bại')),
  });

  const discontinueMutation = useMutation({
    mutationFn: (id: string) => vendorPortalApi.deleteProduct(id),
    onSuccess: () => {
      toast.success('Đã ngừng bán sản phẩm');
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Ngừng bán sản phẩm thất bại')),
  });

  function handleSubmit(values: FormValues) {
    const cat = categories.find((c) => c._id === values.categoryId);
    const brand = brands.find((b) => b._id === values.brandId);
    const payload: Partial<VendorProduct> = {
      title: values.title,
      description: values.description,
      price: values.price,
      discount: values.discount ?? 0,
      quantity: values.quantity,
      unit: values.unit || 'cái',
      status: values.status,
      img: values.img,
      tags: values.tags ?? [],
      productType: cat?.productType || 'other',
      category: cat ? { id: cat._id, name: cat.parent } : undefined,
      parent: cat?.parent,
      children: values.children || cat?.parent,
      brand: brand ? { id: brand._id, name: brand.name } : undefined,
    };
    saveMutation.mutate(payload);
  }

  const columns: TableProps<VendorProduct>['columns'] = [
    {
      title: 'Sản phẩm',
      key: 'product',
      render: (_, p) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Image
            src={p.img || PLACEHOLDER_IMG}
            fallback={PLACEHOLDER_IMG}
            width={48}
            height={48}
            style={{ objectFit: 'cover', borderRadius: 6 }}
          />
          <div style={{ minWidth: 0 }}>
            <Text strong style={{ display: 'block', maxWidth: 320 }} ellipsis>
              {p.title}
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {p.category?.name || p.parent || '—'}
              {p.brand?.name ? ` · ${p.brand.name}` : ''}
            </Text>
          </div>
        </div>
      ),
    },
    {
      title: 'Giá',
      dataIndex: 'price',
      width: 160,
      render: (price: number, p) => (
        <div>
          <Text style={{ whiteSpace: 'nowrap' }}>{formatCurrency(price)}</Text>
          {!!p.discount && (
            <Tag color="red" style={{ marginLeft: 6 }}>
              -{p.discount}%
            </Tag>
          )}
        </div>
      ),
    },
    {
      title: 'Tồn kho',
      dataIndex: 'quantity',
      width: 90,
      render: (q: number) => <Text type={q <= 5 ? 'danger' : undefined}>{q}</Text>,
    },
    { title: 'Đã bán', dataIndex: 'sellCount', width: 80, render: (v?: number) => v ?? 0 },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 130,
      render: (s: string) => (
        <Tag color={STATUS_COLOR[s] ?? 'default'}>
          {STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s}
        </Tag>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 110,
      align: 'center',
      render: (_, p) => (
        <Space>
          <Tooltip title="Sửa">
            <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(p)} />
          </Tooltip>
          {p.status !== 'discontinued' && (
            <Popconfirm
              title="Ngừng bán sản phẩm này?"
              description="Sản phẩm sẽ bị ẩn khỏi cửa hàng."
              onConfirm={() => discontinueMutation.mutate(p._id)}
            >
              <Tooltip title="Ngừng bán">
                <Button type="text" danger icon={<StopOutlined />} />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Sản phẩm của tôi"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Thêm sản phẩm
          </Button>
        }
      />

      <Card styles={{ body: { padding: 16 } }}>
        <Space style={{ marginBottom: 16 }} wrap>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Tìm theo tên"
            style={{ width: 260 }}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <Select
            allowClear
            placeholder="Tất cả trạng thái"
            style={{ width: 180 }}
            options={STATUS_OPTIONS}
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          />
        </Space>

        <Table
          rowKey="_id"
          columns={columns}
          dataSource={data?.data ?? []}
          loading={isLoading}
          // product.children is a sub-category string, not tree rows
          expandable={{ childrenColumnName: '__children' }}
          scroll={{ x: 860 }}
          locale={{
            emptyText: (
              <Empty description="Bạn chưa đăng bán sản phẩm nào">
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                  Thêm sản phẩm đầu tiên
                </Button>
              </Empty>
            ),
          }}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: data?.pagination?.totalItems ?? 0,
            onChange: setPage,
            showTotal: (t) => `${t} sản phẩm`,
          }}
        />
      </Card>

      <Drawer
        title={editing ? 'Sửa sản phẩm' : 'Thêm sản phẩm mới'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        size="large"
        destroyOnHidden
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>Huỷ</Button>
            <Button type="primary" loading={saveMutation.isPending} onClick={() => form.submit()}>
              {editing ? 'Lưu thay đổi' : 'Đăng bán'}
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} requiredMark="optional">
          <Form.Item
            name="img"
            label="Ảnh chính"
            rules={[{ required: true, message: 'Vui lòng tải ảnh lên hoặc dán URL ảnh' }]}
          >
            <ImageUpload folder="products" width="100%" height={180} />
          </Form.Item>

          <Form.Item
            name="title"
            label="Tên sản phẩm"
            rules={[{ required: true, min: 3, message: 'Tối thiểu 3 ký tự' }]}
          >
            <Input placeholder="VD: Tai nghe Bluetooth không dây" />
          </Form.Item>

          <Form.Item
            name="description"
            label="Mô tả"
            rules={[{ required: true, message: 'Vui lòng nhập mô tả sản phẩm' }]}
          >
            <Input.TextArea rows={4} placeholder="Tính năng chính, chất liệu, bảo hành…" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="categoryId"
                label="Danh mục"
                rules={[{ required: true, message: 'Chọn danh mục' }]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Chọn danh mục"
                  options={categories.map((c) => ({
                    value: c._id,
                    label: c.productType ? `${c.parent} (${c.productType})` : c.parent,
                  }))}
                  onChange={() => form.setFieldValue('children', undefined)}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="children" label="Danh mục con">
                <Select
                  allowClear
                  placeholder={selectedCategory?.children?.length ? 'Chọn' : 'Không có'}
                  disabled={!selectedCategory?.children?.length}
                  options={(selectedCategory?.children ?? []).map((c) => ({ value: c, label: c }))}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="brandId"
                label="Thương hiệu"
                rules={[{ required: true, message: 'Chọn thương hiệu' }]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Chọn thương hiệu"
                  options={brands.map((b) => ({ value: b._id, label: b.name }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="status" label="Trạng thái" rules={[{ required: true }]}>
                <Select options={STATUS_OPTIONS} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="price"
                label="Giá (VND)"
                rules={[{ required: true, message: 'Nhập giá' }]}
              >
                <InputNumber
                  min={1}
                  style={{ width: '100%' }}
                  formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={(v) => Number((v ?? '').replace(/,/g, '')) as unknown as 1}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="discount" label="Giảm giá (%)">
                <InputNumber min={0} max={100} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="quantity"
                label="Tồn kho"
                rules={[{ required: true, message: 'Nhập số lượng tồn kho' }]}
              >
                <InputNumber min={0} precision={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="unit" label="Đơn vị">
                <Input placeholder="cái, chiếc, bộ, hộp..." />
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item name="tags" label="Tags">
                <Select mode="tags" placeholder="Nhập rồi nhấn Enter" tokenSeparators={[',']} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Drawer>
    </div>
  );
}
