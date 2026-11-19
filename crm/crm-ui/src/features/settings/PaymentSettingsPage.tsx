import { useEffect } from 'react';
import {
  Button,
  Card,
  Form,
  Checkbox,
  Typography,
  Space,
  Spin,
  Tag,
  Input,
  Select,
  Alert,
} from 'antd';
import {
  SaveOutlined,
  CreditCardOutlined,
  DollarOutlined,
  BankOutlined,
  MobileOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import { settingsApi } from '@/services/api';
import PageHeader from '@/components/commons/PageHeader';
import ImageUpload from '@/components/commons/ImageUpload';
import { VN_BANKS } from './vnBanks';

const { Title, Text } = Typography;

const GATEWAYS = [
  {
    value: 'stripe',
    label: 'Stripe',
    icon: <CreditCardOutlined />,
    description: 'Thẻ tín dụng/ghi nợ qua Stripe',
  },
  {
    value: 'cod',
    label: 'Thanh toán khi nhận hàng (COD)',
    icon: <DollarOutlined />,
    description: 'Khách thanh toán khi nhận hàng',
  },
  {
    value: 'vnpay',
    label: 'VNPay',
    icon: <BankOutlined />,
    description: 'Cổng thanh toán nội địa Việt Nam',
  },
  {
    value: 'momo',
    label: 'MoMo',
    icon: <MobileOutlined />,
    description: 'Ví điện tử MoMo',
  },
  {
    value: 'bank-transfer',
    label: 'Chuyển khoản ngân hàng',
    icon: <BankOutlined />,
    description: 'Chuyển khoản trực tiếp qua ngân hàng',
  },
];

export default function PaymentSettingsPage() {
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['site-settings'],
    queryFn: () => settingsApi.get(),
  });

  useEffect(() => {
    if (data?.data) {
      const s = data.data;
      form.setFieldsValue({
        enabledGateways: s.payment?.enabledGateways ?? ['stripe', 'cod'],
        bankTransfer: s.payment?.bankTransfer ?? {
          bankName: '',
          vietqrBankBin: '',
          accountNumber: '',
          accountName: '',
          branch: '',
          qrImageUrl: '',
          transferContentTemplate: '',
        },
      });
    }
  }, [data, form]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const values = await form.validateFields();
      return settingsApi.update({
        payment: {
          enabledGateways: values.enabledGateways ?? [],
          bankTransfer: values.bankTransfer ?? {},
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-settings'] });
      queryClient.invalidateQueries({ queryKey: ['site-settings', 'public'] });
      toast.success('Đã lưu cài đặt thanh toán');
    },
    onError: () => toast.error('Lưu cài đặt thanh toán thất bại'),
  });

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Cài đặt thanh toán"
        extra={
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            Lưu thay đổi
          </Button>
        }
      />

      <Form form={form} layout="vertical">
        {/* Gateways */}
        <Card
          title={
            <Title level={5} style={{ margin: 0 }}>
              Cổng thanh toán
            </Title>
          }
          size="small"
          style={{ marginBottom: 16 }}
        >
          <Form.Item name="enabledGateways" style={{ marginBottom: 0 }}>
            <Checkbox.Group style={{ width: '100%' }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                {GATEWAYS.map((gw) => (
                  <Card key={gw.value} size="small" style={{ background: '#fafafa' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Space>
                        <Checkbox value={gw.value} />
                        <Space>
                          {gw.icon}
                          <Text strong>{gw.label}</Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {gw.description}
                          </Text>
                        </Space>
                      </Space>
                      <Tag color="default">{gw.value}</Tag>
                    </div>
                  </Card>
                ))}
              </Space>
            </Checkbox.Group>
          </Form.Item>
        </Card>

        <Form.Item
          noStyle
          shouldUpdate={(prev, curr) => prev.enabledGateways !== curr.enabledGateways}
        >
          {({ getFieldValue }) => {
            const gateways: string[] = getFieldValue('enabledGateways') ?? [];
            if (!gateways.includes('bank-transfer')) return null;
            return (
              <Card title="Thông tin chuyển khoản" style={{ marginTop: 16 }}>
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message="Mã VietQR sẽ được tạo tự động cho ngân hàng đã chọn"
                  description="Ứng dụng ngân hàng của khách sẽ tự điền ngân hàng, số tài khoản, số tiền và nội dung chuyển khoản từ mã QR. Bạn chỉ cần tải QR riêng nếu ngân hàng của bạn không có trong danh sách."
                />

                <Form.Item
                  label="Ngân hàng"
                  name={['bankTransfer', 'bankName']}
                  rules={[{ required: true, message: 'Vui lòng chọn ngân hàng' }]}
                >
                  <Select
                    showSearch
                    placeholder="Chọn ngân hàng"
                    optionFilterProp="label"
                    options={VN_BANKS.map((b) => ({
                      value: b.shortName,
                      label: `${b.shortName} — ${b.fullName}`,
                      bin: b.bin,
                    }))}
                    onChange={(_value, option) => {
                      const opt = Array.isArray(option) ? option[0] : option;
                      form.setFieldValue(
                        ['bankTransfer', 'vietqrBankBin'],
                        (opt as { bin?: string })?.bin ?? ''
                      );
                    }}
                  />
                </Form.Item>

                <Form.Item name={['bankTransfer', 'vietqrBankBin']} hidden>
                  <Input />
                </Form.Item>

                <Form.Item
                  label="Số tài khoản"
                  name={['bankTransfer', 'accountNumber']}
                  rules={[{ required: true, message: 'Vui lòng nhập số tài khoản' }]}
                >
                  <Input placeholder="VD: 0123456789" />
                </Form.Item>

                <Form.Item
                  label="Chủ tài khoản"
                  name={['bankTransfer', 'accountName']}
                  rules={[{ required: true, message: 'Vui lòng nhập tên chủ tài khoản' }]}
                >
                  <Input placeholder="VD: CONG TY TNHH SHOFY" />
                </Form.Item>

                <Form.Item label="Chi nhánh (không bắt buộc)" name={['bankTransfer', 'branch']}>
                  <Input placeholder="VD: Chi nhánh Hà Nội" />
                </Form.Item>

                <Form.Item
                  label="Mẫu nội dung chuyển khoản (không bắt buộc)"
                  name={['bankTransfer', 'transferContentTemplate']}
                  extra="Dùng {orderId} làm biến thay thế. VD: SHOFY-{orderId}"
                >
                  <Input placeholder="SHOFY-{orderId}" />
                </Form.Item>

                <Form.Item
                  label="Mã QR tuỳ chỉnh (không bắt buộc)"
                  name={['bankTransfer', 'qrImageUrl']}
                  extra="Chỉ tải lên nếu ngân hàng của bạn không có trong danh sách trên. Nếu không, cửa hàng sẽ tự tạo mã VietQR."
                >
                  <ImageUpload />
                </Form.Item>
              </Card>
            );
          }}
        </Form.Item>
      </Form>
    </div>
  );
}
