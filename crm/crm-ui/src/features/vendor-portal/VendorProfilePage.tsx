import { useEffect } from 'react';
import { Card, Form, Input, Button, Row, Col, Tag, Descriptions, Spin } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import PageHeader from '@/components/commons/PageHeader';
import { vendorStorePath, vendorStoreUrl } from '@/utils/storeUrl';
import ImageUpload from '@/components/commons/ImageUpload';
import { vendorPortalApi, apiErrorMessage } from './api';

interface ProfileForm {
  storeName: string;
  storeDescription?: string;
  storeLogo?: string;
  storeBanner?: string;
}

const STATUS_LABEL: Record<string, string> = {
  approved: 'Đã duyệt',
  pending: 'Chờ duyệt',
  rejected: 'Bị từ chối',
  suspended: 'Bị tạm ngưng',
};

const STATUS_COLOR: Record<string, string> = {
  approved: 'green',
  pending: 'orange',
  rejected: 'red',
  suspended: 'red',
};

export default function VendorProfilePage() {
  const queryClient = useQueryClient();
  const [form] = Form.useForm<ProfileForm>();

  const { data, isLoading } = useQuery({
    queryKey: ['vendor-portal', 'profile'],
    queryFn: () => vendorPortalApi.getProfile(),
  });
  const profile = data?.data;
  const vp = profile?.vendorProfile;

  useEffect(() => {
    if (vp) {
      form.setFieldsValue({
        storeName: vp.storeName,
        storeDescription: vp.storeDescription,
        storeLogo: vp.storeLogo,
        storeBanner: vp.storeBanner,
      });
    }
  }, [vp, form]);

  const mutation = useMutation({
    mutationFn: (values: ProfileForm) =>
      vendorPortalApi.updateProfile(values as unknown as Record<string, unknown>),
    onSuccess: () => {
      toast.success('Đã lưu hồ sơ cửa hàng');
      queryClient.invalidateQueries({ queryKey: ['vendor-portal', 'profile'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Lưu hồ sơ thất bại')),
  });

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Hồ sơ cửa hàng" />
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card title="Thông tin cửa hàng">
            <Form form={form} layout="vertical" onFinish={(v) => mutation.mutate(v)}>
              <Form.Item
                name="storeName"
                label="Tên cửa hàng"
                rules={[{ required: true, min: 2, message: 'Tối thiểu 2 ký tự' }]}
              >
                <Input />
              </Form.Item>
              <Form.Item name="storeDescription" label="Mô tả">
                <Input.TextArea rows={4} maxLength={1000} showCount />
              </Form.Item>
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item name="storeLogo" label="Logo">
                    <ImageUpload folder="vendors" width="100%" height={140} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="storeBanner" label="Ảnh bìa">
                    <ImageUpload folder="vendors" width="100%" height={140} />
                  </Form.Item>
                </Col>
              </Row>
              <Button type="primary" htmlType="submit" loading={mutation.isPending}>
                Lưu thay đổi
              </Button>
            </Form>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="Tài khoản">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Chủ sở hữu">{profile?.name}</Descriptions.Item>
              <Descriptions.Item label="Email">{profile?.email}</Descriptions.Item>
              <Descriptions.Item label="Trạng thái">
                <Tag color={STATUS_COLOR[vp?.verificationStatus ?? ''] ?? 'default'}>
                  {vp?.verificationStatus
                    ? (STATUS_LABEL[vp.verificationStatus] ?? vp.verificationStatus)
                    : '—'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Hoa hồng">{vp?.commissionRate ?? 10}%</Descriptions.Item>
              <Descriptions.Item label="URL cửa hàng">
                {vp?.storeSlug ? (
                  <a href={vendorStoreUrl(vp.storeSlug)} target="_blank" rel="noreferrer">
                    {vendorStorePath(vp.storeSlug)}
                  </a>
                ) : (
                  '—'
                )}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
