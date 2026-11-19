import { useState, useEffect } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  Select,
  Switch,
  Typography,
  Space,
  Collapse,
  Spin,
  Row,
  Col,
  Divider,
} from 'antd';
import { SaveOutlined, ArrowLeftOutlined, GlobalOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

import { blogApi } from '@/services/api';
import type { BlogPost } from '@/types';
import ImageUpload from '@/components/commons/ImageUpload';

const { Title, Text } = Typography;
const { Panel } = Collapse;

// ---------------------------------------------------------------------------
// Slug generator
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------
// Right sidebar cards
// ---------------------------------------------------------------------------

interface PublishCardProps {
  status: string;
  publishedAt: string;
  onStatusChange: (v: string) => void;
  onDateChange: (v: string) => void;
  onSaveDraft: () => void;
  onPublish: () => void;
  saving: boolean;
}

function PublishCard({
  status,
  publishedAt,
  onStatusChange,
  onDateChange,
  onSaveDraft,
  onPublish,
  saving,
}: PublishCardProps) {
  return (
    <Card title="Xuất bản" size="small" style={{ marginBottom: 12 }}>
      <Form.Item label="Trạng thái" style={{ marginBottom: 8 }}>
        <Select
          value={status}
          onChange={onStatusChange}
          options={[
            { value: 'draft', label: 'Bản nháp' },
            { value: 'published', label: 'Đã xuất bản' },
            { value: 'archived', label: 'Đã lưu trữ' },
          ]}
          style={{ width: '100%' }}
        />
      </Form.Item>
      <Form.Item label="Ngày xuất bản" style={{ marginBottom: 8 }}>
        <Input
          type="datetime-local"
          value={publishedAt}
          onChange={(e) => onDateChange(e.target.value)}
        />
      </Form.Item>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Button onClick={onSaveDraft} loading={saving} size="small">
          Lưu nháp
        </Button>
        <Button type="primary" onClick={onPublish} loading={saving} size="small">
          Xuất bản
        </Button>
      </Space>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Editor
// ---------------------------------------------------------------------------

export default function BlogEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isNew = !id || id === 'new';

  // Form state
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManual, setSlugManual] = useState(false);
  const [content, setContent] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [featuredImage, setFeaturedImage] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [status, setStatus] = useState<'draft' | 'published' | 'archived'>('draft');
  const [publishedAt, setPublishedAt] = useState('');
  const [featured, setFeatured] = useState(false);
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [titleVi, setTitleVi] = useState('');
  const [excerptVi, setExcerptVi] = useState('');
  const [contentVi, setContentVi] = useState('');

  // Auto-slug from title
  useEffect(() => {
    if (!slugManual && title) {
      setSlug(slugify(title));
    }
  }, [title, slugManual]);

  // Load existing post
  const { data: postData, isLoading } = useQuery({
    queryKey: ['blog-post', id],
    queryFn: () => blogApi.getById(id!),
    enabled: !isNew,
  });

  useEffect(() => {
    if (postData?.data) {
      const p = postData.data;
      setTitle(p.title);
      setSlug(p.slug);
      setSlugManual(true);
      setContent(p.content);
      setExcerpt(p.excerpt ?? '');
      setFeaturedImage(p.featuredImage ?? '');
      setCategory(p.category ?? '');
      setTags(p.tags ?? []);
      setStatus(p.status);
      setPublishedAt(p.publishedAt ? dayjs(p.publishedAt).format('YYYY-MM-DDTHH:mm') : '');
      setFeatured(p.featured);
      setSeoTitle(p.seo?.metaTitle ?? '');
      setSeoDescription(p.seo?.metaDescription ?? '');
      setTitleVi(p.i18n?.titleVi ?? '');
      setExcerptVi(p.i18n?.excerptVi ?? '');
      setContentVi(p.i18n?.contentVi ?? '');
    }
  }, [postData]);

  const buildPayload = (overrideStatus?: string): Partial<BlogPost> => ({
    title,
    slug,
    content,
    excerpt: excerpt || undefined,
    featuredImage: featuredImage || undefined,
    category: category || undefined,
    tags,
    status: (overrideStatus ?? status) as 'draft' | 'published' | 'archived',
    publishedAt: publishedAt ? new Date(publishedAt).toISOString() : undefined,
    featured,
    seo: {
      metaTitle: seoTitle || undefined,
      metaDescription: seoDescription || undefined,
    },
    i18n: {
      titleVi: titleVi || undefined,
      excerptVi: excerptVi || undefined,
      contentVi: contentVi || undefined,
    },
  });

  const saveMutation = useMutation({
    mutationFn: (payload: Partial<BlogPost>) => {
      if (isNew) return blogApi.create(payload);
      return blogApi.update(id!, payload);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['blog-posts'] });
      toast.success('Đã lưu bài viết');
      if (isNew && result?.data?._id) {
        navigate(`/cms/blog/${result.data._id}`, { replace: true });
      }
    },
    onError: () => toast.error('Lưu bài viết thất bại'),
  });

  const handleSaveDraft = () => saveMutation.mutate(buildPayload('draft'));
  const handlePublish = () => saveMutation.mutate(buildPayload('published'));

  if (!isNew && isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      {/* Top bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20,
        }}
      >
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/cms/blog')}>
            Quay lại
          </Button>
          <Title level={4} style={{ margin: 0 }}>
            {isNew ? 'Thêm bài viết' : 'Sửa bài viết'}
          </Title>
        </Space>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          loading={saveMutation.isPending}
          onClick={() => saveMutation.mutate(buildPayload())}
        >
          Lưu
        </Button>
      </div>

      <Row gutter={20}>
        {/* Left: Main content */}
        <Col xs={24} lg={16}>
          <Card size="small" style={{ marginBottom: 16 }}>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Tiêu đề bài viết"
              size="large"
              style={{
                fontSize: 20,
                fontWeight: 600,
                marginBottom: 12,
                border: 'none',
                boxShadow: 'none',
                padding: '0 0 12px 0',
                borderBottom: '1px solid #f0f0f0',
              }}
            />

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
              <Text type="secondary" style={{ fontSize: 12, flexShrink: 0 }}>
                Slug:
              </Text>
              <Input
                value={slug}
                onChange={(e) => {
                  setSlugManual(true);
                  setSlug(e.target.value);
                }}
                addonBefore="/"
                size="small"
                style={{ flex: 1 }}
              />
            </div>

            <Form.Item label="Tóm tắt" style={{ marginBottom: 12 }}>
              <Input.TextArea
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                rows={2}
                placeholder="Mô tả ngắn hiển thị trong danh sách..."
              />
            </Form.Item>

            <Form.Item label="Nội dung" style={{ marginBottom: 0 }}>
              <Input.TextArea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={16}
                placeholder="Nhập nội dung bài viết (hỗ trợ HTML)..."
                style={{ fontFamily: 'monospace', fontSize: 13 }}
              />
              <Text type="secondary" style={{ fontSize: 11 }}>
                Trình soạn thảo văn bản sẽ được bổ sung trong bản cập nhật sau. Hiện hỗ trợ HTML.
              </Text>
            </Form.Item>
          </Card>

          {/* Vietnamese Translation */}
          <Collapse>
            <Panel
              key="vi"
              header={
                <Space>
                  <GlobalOutlined />
                  <span>Bản dịch tiếng Việt</span>
                </Space>
              }
            >
              <Form layout="vertical">
                <Form.Item label="Tiêu đề (VI)">
                  <Input
                    value={titleVi}
                    onChange={(e) => setTitleVi(e.target.value)}
                    placeholder="Tiêu đề bài viết"
                  />
                </Form.Item>
                <Form.Item label="Tóm tắt (VI)">
                  <Input.TextArea
                    value={excerptVi}
                    onChange={(e) => setExcerptVi(e.target.value)}
                    rows={2}
                    placeholder="Mô tả ngắn..."
                  />
                </Form.Item>
                <Form.Item label="Nội dung (VI)" style={{ marginBottom: 0 }}>
                  <Input.TextArea
                    value={contentVi}
                    onChange={(e) => setContentVi(e.target.value)}
                    rows={10}
                    placeholder="Nội dung bài viết (hỗ trợ HTML)..."
                    style={{ fontFamily: 'monospace', fontSize: 13 }}
                  />
                </Form.Item>
              </Form>
            </Panel>
          </Collapse>
        </Col>

        {/* Right sidebar */}
        <Col xs={24} lg={8}>
          <div style={{ position: 'sticky', top: 72 }}>
            <PublishCard
              status={status}
              publishedAt={publishedAt}
              onStatusChange={(v) => setStatus(v as 'draft' | 'published' | 'archived')}
              onDateChange={setPublishedAt}
              onSaveDraft={handleSaveDraft}
              onPublish={handlePublish}
              saving={saveMutation.isPending}
            />

            <Card title="Ảnh đại diện" size="small" style={{ marginBottom: 12 }}>
              <ImageUpload
                value={featuredImage}
                onChange={(url) => setFeaturedImage(url)}
                placeholder="Tải ảnh đại diện"
                width="100%"
                height={160}
              />
            </Card>

            <Card title="Danh mục" size="small" style={{ marginBottom: 12 }}>
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="VD: Thời trang, Công nghệ"
              />
            </Card>

            <Card title="Thẻ" size="small" style={{ marginBottom: 12 }}>
              <Select
                mode="tags"
                value={tags}
                onChange={(v: string[]) => setTags(v)}
                placeholder="Thêm thẻ..."
                style={{ width: '100%' }}
                tokenSeparators={[',']}
              />
            </Card>

            <Card title="Tuỳ chọn" size="small" style={{ marginBottom: 12 }}>
              <Space>
                <Switch checked={featured} onChange={setFeatured} size="small" />
                <Text>Bài viết nổi bật</Text>
              </Space>
            </Card>

            <Card title="SEO" size="small">
              <Form layout="vertical">
                <Form.Item style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 12 }}>Tiêu đề meta</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {seoTitle.length}/60
                    </Text>
                  </div>
                  <Input
                    value={seoTitle}
                    onChange={(e) => setSeoTitle(e.target.value)}
                    maxLength={60}
                    size="small"
                  />
                </Form.Item>
                <Form.Item style={{ marginBottom: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 12 }}>Mô tả meta</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {seoDescription.length}/160
                    </Text>
                  </div>
                  <Input.TextArea
                    value={seoDescription}
                    onChange={(e) => setSeoDescription(e.target.value)}
                    rows={3}
                    maxLength={160}
                    size="small"
                  />
                </Form.Item>
              </Form>
            </Card>
          </div>
        </Col>
      </Row>
      <Divider />
    </div>
  );
}
