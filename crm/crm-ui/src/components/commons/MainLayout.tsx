import { Breadcrumb, Layout, Menu } from 'antd';
import type { ItemType } from 'antd/es/menu/interface';
import {
  DashboardOutlined,
  LogoutOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  ShoppingOutlined,
  TagsOutlined,
  TeamOutlined,
  NotificationOutlined,
  EditOutlined,
  SettingOutlined,
  InfoCircleOutlined,
  CreditCardOutlined,
  CarOutlined,
  GiftOutlined,
  PictureOutlined,
  AuditOutlined,
  MessageOutlined,
  PercentageOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import useAppStore from '@/stores/appStore';
import CurrencySwitcher from './CurrencySwitcher';

const { Sider, Content, Header } = Layout;

// ---------------------------------------------------------------------------
// Navigation structure
// ---------------------------------------------------------------------------

interface FlatNavItem {
  key: string;
  label: string;
  path: string;
}

// Flat list used for selected-key and title resolution
const FLAT_NAV: FlatNavItem[] = [
  { key: '/', label: 'Tổng quan', path: '/' },
  { key: '/products', label: 'Sản phẩm', path: '/products' },
  { key: '/categories', label: 'Danh mục', path: '/categories' },
  { key: '/orders', label: 'Đơn hàng', path: '/orders' },
  { key: '/users', label: 'Người dùng', path: '/users' },
  { key: '/vendors', label: 'Nhà bán', path: '/vendors' },
  { key: '/coupons', label: 'Mã giảm giá', path: '/coupons' },
  { key: '/cms/blog', label: 'Blog', path: '/cms/blog' },
  { key: '/cms/banners', label: 'Banner', path: '/cms/banners' },
  { key: '/settings/general', label: 'Chung', path: '/settings/general' },
  { key: '/settings/payment', label: 'Thanh toán', path: '/settings/payment' },
  { key: '/settings/shipping', label: 'Vận chuyển', path: '/settings/shipping' },
  { key: '/settings/tax', label: 'Thuế', path: '/settings/tax' },
  { key: '/activity-log', label: 'Nhật ký hoạt động', path: '/activity-log' },
  { key: '/chatbot', label: 'Trợ lý AI', path: '/chatbot' },
  { key: '/vendor', label: 'Tổng quan cửa hàng', path: '/vendor' },
  { key: '/vendor/products', label: 'Sản phẩm của tôi', path: '/vendor/products' },
  { key: '/vendor/orders', label: 'Đơn hàng của tôi', path: '/vendor/orders' },
  { key: '/vendor/profile', label: 'Hồ sơ cửa hàng', path: '/vendor/profile' },
];

const pathMatches = (pathname: string, path: string) =>
  pathname === path || pathname.startsWith(path + '/');

function resolveSelectedKey(pathname: string): string {
  if (pathname === '/') return '/';
  const match = FLAT_NAV.filter(
    (item) => item.path !== '/' && pathMatches(pathname, item.path)
  ).sort((a, b) => b.path.length - a.path.length)[0];
  return match?.key ?? '/';
}

function resolvePageTitle(pathname: string): string {
  if (pathname === '/') return 'Tổng quan';
  const match = FLAT_NAV.filter(
    (item) => item.path !== '/' && pathMatches(pathname, item.path)
  ).sort((a, b) => b.path.length - a.path.length)[0];
  return match?.label ?? 'Tổng quan';
}

// Keys that should be open when a child is selected
function resolveOpenKeys(pathname: string): string[] {
  const open: string[] = [];
  if (pathname.startsWith('/cms')) open.push('sub-cms');
  if (pathname.startsWith('/settings')) open.push('sub-settings');
  return open;
}

// ---------------------------------------------------------------------------
// Menu item tree
// ---------------------------------------------------------------------------

const MENU_ITEMS: ItemType[] = [
  {
    key: '/',
    icon: <DashboardOutlined />,
    label: 'Tổng quan',
  },
  {
    key: '/products',
    icon: <ShoppingOutlined />,
    label: 'Sản phẩm',
  },
  {
    key: '/categories',
    icon: <TagsOutlined />,
    label: 'Danh mục',
  },
  {
    key: '/orders',
    icon: <ShoppingCartOutlined />,
    label: 'Đơn hàng',
  },
  {
    key: '/users',
    icon: <TeamOutlined />,
    label: 'Người dùng',
  },
  {
    key: '/vendors',
    icon: <ShopOutlined />,
    label: 'Nhà bán',
  },
  {
    key: '/coupons',
    icon: <GiftOutlined />,
    label: 'Mã giảm giá',
  },
  {
    key: 'sub-cms',
    icon: <EditOutlined />,
    label: 'CMS',
    children: [
      { key: '/cms/blog', icon: <EditOutlined />, label: 'Blog' },
      { key: '/cms/banners', icon: <PictureOutlined />, label: 'Banner' },
    ],
  },
  {
    key: 'sub-settings',
    icon: <SettingOutlined />,
    label: 'Cài đặt',
    children: [
      { key: '/settings/general', icon: <InfoCircleOutlined />, label: 'Chung' },
      { key: '/settings/payment', icon: <CreditCardOutlined />, label: 'Thanh toán' },
      { key: '/settings/shipping', icon: <CarOutlined />, label: 'Vận chuyển' },
      { key: '/settings/tax', icon: <PercentageOutlined />, label: 'Thuế' },
    ],
  },
  {
    key: '/activity-log',
    icon: <AuditOutlined />,
    label: 'Nhật ký hoạt động',
  },
  {
    key: '/chatbot',
    icon: <MessageOutlined />,
    label: 'Trợ lý AI',
  },
];

// Menu shown to vendor-only accounts (Vendor Portal)
const VENDOR_MENU_ITEMS: ItemType[] = [
  { key: '/vendor', icon: <DashboardOutlined />, label: 'Tổng quan cửa hàng' },
  { key: '/vendor/products', icon: <ShoppingOutlined />, label: 'Sản phẩm của tôi' },
  { key: '/vendor/orders', icon: <ShoppingCartOutlined />, label: 'Đơn hàng của tôi' },
  { key: '/vendor/profile', icon: <UserOutlined />, label: 'Hồ sơ cửa hàng' },
];

// Suppress unused import warnings for icons only used in labels
void NotificationOutlined;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

import { useEffect } from 'react';
import { authApi } from '@/services/api';

export default function MainLayout() {
  const { sidebarCollapsed, toggleSidebar, user, setUser } = useAppStore();
  const location = useLocation();
  const navigate = useNavigate();

  // Hydrate user session from CRM backend on mount
  useEffect(() => {
    if (!user) {
      authApi
        .getMe()
        .then((data) => {
          console.log('[MainLayout] /api/me response:', data);
          if (data && data.roles) {
            setUser(data);
          } else {
            console.warn('[MainLayout] /api/me returned unexpected format:', data);
          }
        })
        .catch((err) => {
          console.error('[MainLayout] /api/me failed:', err);
        });
    }
  }, [user, setUser]);

  // Detect shipper-only role
  const roles = user?.roles || [];
  const isShipper =
    roles.some((r) => r.toLowerCase() === 'shipper') &&
    !roles.some((r) => ['admin', 'manager', 'staff'].includes(r.toLowerCase()));

  // Detect vendor-only role (approved seller without staff privileges)
  const isVendor =
    roles.some((r) => r.toLowerCase() === 'vendor') &&
    !roles.some((r) => ['admin', 'manager', 'staff'].includes(r.toLowerCase()));

  // Filter sidebar: shippers can only see Orders; vendors get the Vendor Portal menu
  const displayMenuItems = isVendor
    ? VENDOR_MENU_ITEMS
    : isShipper
      ? MENU_ITEMS.filter((item) => (item as any)?.key === '/orders')
      : MENU_ITEMS;

  // Keep vendors inside the Vendor Portal
  useEffect(() => {
    if (
      user &&
      isVendor &&
      !location.pathname.startsWith('/vendor/') &&
      location.pathname !== '/vendor'
    ) {
      navigate('/vendor', { replace: true });
    }
  }, [user, isVendor, location.pathname, navigate]);

  // Redirect shippers away from non-order pages
  useEffect(() => {
    if (
      user &&
      isShipper &&
      !isVendor &&
      !location.pathname.startsWith('/orders') &&
      location.pathname !== '/logout'
    ) {
      navigate('/orders', { replace: true });
    }
  }, [user, isShipper, isVendor, location.pathname, navigate]);

  const selectedKey = resolveSelectedKey(location.pathname);
  const pageTitle = resolvePageTitle(location.pathname);
  const defaultOpenKeys = resolveOpenKeys(location.pathname);

  function handleMenuClick({ key }: { key: string }) {
    // Ignore sub-menu group keys (they don't map to routes)
    if (key.startsWith('sub-')) return;
    navigate(key);
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={sidebarCollapsed}
        onCollapse={toggleSidebar}
        theme="light"
        width={220}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          height: '100vh',
          zIndex: 100,
          overflow: 'auto',
          borderRight: '1px solid #ece6e8',
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: sidebarCollapsed ? '18px 0' : '18px 20px',
            justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            borderBottom: '1px solid #f0e9ec',
            transition: 'padding 0.2s',
          }}
        >
          <ShopOutlined style={{ fontSize: 22, color: '#a42c48', flexShrink: 0 }} />
          {!sidebarCollapsed && (
            <span
              style={{
                color: '#2a2230',
                fontWeight: 700,
                fontSize: 16,
                letterSpacing: 0.3,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              }}
            >
              {isVendor ? 'NexusMart Seller' : 'NexusMart CRM'}
            </span>
          )}
        </div>

        <Menu
          theme="light"
          mode="inline"
          selectedKeys={[selectedKey]}
          defaultOpenKeys={defaultOpenKeys}
          items={displayMenuItems as any}
          onClick={handleMenuClick}
          style={{ borderRight: 0, marginTop: 8 }}
        />

        <div
          style={{
            position: 'absolute',
            bottom: 48,
            width: '100%',
            padding: sidebarCollapsed ? '8px' : '8px 12px',
          }}
        >
          <a
            href={`${import.meta.env.BASE_URL.replace(/\/$/, '')}/logout`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
              gap: 10,
              padding: '8px 12px',
              color: '#6b6270',
              borderRadius: 6,
              textDecoration: 'none',
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#a42c48')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#6b6270')}
          >
            <LogoutOutlined />
            {!sidebarCollapsed && <span>Đăng xuất</span>}
          </a>
        </div>
      </Sider>

      <Layout
        style={{
          marginLeft: sidebarCollapsed ? 80 : 220,
          transition: 'margin-left 0.2s',
        }}
      >
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            borderBottom: '1px solid #ece6e8',
            boxShadow: '0 1px 3px rgba(31,26,36,0.04)',
            position: 'sticky',
            top: 0,
            zIndex: 99,
            height: 56,
            lineHeight: '56px',
          }}
        >
          <Breadcrumb
            items={[{ title: isVendor ? 'Kênh người bán' : 'NexusMart CRM' }, { title: pageTitle }]}
          />
          <div style={{ marginLeft: 'auto' }}>
            <CurrencySwitcher />
          </div>
        </Header>

        <Content
          style={{
            padding: 24,
            minHeight: 'calc(100vh - 56px)',
            background: 'linear-gradient(180deg, #f8f5f6 0%, #f3eff1 100%)',
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
