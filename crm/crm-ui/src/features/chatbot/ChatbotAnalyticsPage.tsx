import { useState } from 'react';
import { Card, Row, Col, Statistic, Table, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';

import { chatbotApi } from '@/services/api';
import type { ChatbotSessionRow } from '@/services/api';
import PageHeader from '@/components/commons/PageHeader';

const { Title } = Typography;

const SESSION_STATUS_LABEL: Record<string, string> = {
  active: 'Đang hoạt động',
  closed: 'Đã đóng',
  ended: 'Đã kết thúc',
  archived: 'Đã lưu trữ',
};

export default function ChatbotAnalyticsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const analyticsQuery = useQuery({
    queryKey: ['chatbot-analytics'],
    queryFn: () => chatbotApi.getAnalytics(),
  });

  const sessionsQuery = useQuery({
    queryKey: ['chatbot-sessions', page, pageSize],
    queryFn: () => chatbotApi.listSessions({ page, limit: pageSize }),
  });

  const a = analyticsQuery.data?.data?.last30Days;
  const satisfaction =
    a?.satisfactionRate == null ? '—' : `${Math.round(a.satisfactionRate * 100)}%`;

  return (
    <div>
      <PageHeader title="Thống kê AI Chatbot" />

      <Title level={5} style={{ margin: '8px 0 12px' }}>
        30 ngày qua
      </Title>

      <Row gutter={16}>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="Phiên chat"
              value={a?.totalSessions ?? 0}
              loading={analyticsQuery.isLoading}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="Tin nhắn"
              value={a?.totalMessages ?? 0}
              loading={analyticsQuery.isLoading}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="👍 Hữu ích"
              value={a?.thumbsUp ?? 0}
              loading={analyticsQuery.isLoading}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="👎 / Mức hài lòng"
              value={a ? `${a.thumbsDown} / ${satisfaction}` : '—'}
              loading={analyticsQuery.isLoading}
            />
          </Card>
        </Col>
      </Row>

      <Card title="Phiên chat gần đây" style={{ marginTop: 16 }}>
        <Table<ChatbotSessionRow>
          rowKey="sessionId"
          loading={sessionsQuery.isLoading}
          dataSource={sessionsQuery.data?.data?.sessions || []}
          columns={[
            {
              title: 'Phiên',
              dataIndex: 'sessionId',
              key: 'sessionId',
              render: (v: string) => <code>{v.slice(0, 8)}</code>,
            },
            {
              title: 'Người dùng',
              key: 'user',
              render: (_: unknown, row: ChatbotSessionRow) =>
                row.userId ? (
                  <Tag color="blue">{String(row.userId).slice(0, 8)}</Tag>
                ) : (
                  <Tag>Ẩn danh</Tag>
                ),
            },
            {
              title: 'Ngôn ngữ',
              dataIndex: 'locale',
              key: 'locale',
              render: (v: string) => <Tag>{v.toUpperCase()}</Tag>,
            },
            {
              title: 'Tin nhắn',
              dataIndex: 'messageCount',
              key: 'messageCount',
            },
            {
              title: 'Trạng thái',
              dataIndex: 'status',
              key: 'status',
              render: (v: string) =>
                v ? <Tag color={v === 'active' ? 'green' : 'default'}>{SESSION_STATUS_LABEL[v] ?? v}</Tag> : '—',
            },
            {
              title: 'Cập nhật',
              dataIndex: 'updatedAt',
              key: 'updatedAt',
              render: (v: string) => new Date(v).toLocaleString('vi-VN'),
            },
          ]}
          pagination={{
            current: page,
            pageSize,
            total: sessionsQuery.data?.data?.pagination?.total || 0,
            showSizeChanger: true,
            showTotal: (total) => `${total} phiên chat`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
        />
      </Card>
    </div>
  );
}
