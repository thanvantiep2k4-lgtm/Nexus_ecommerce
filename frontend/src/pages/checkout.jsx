import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import SEO from '@/components/seo';
import Wrapper from '@/layout/wrapper';
import HeaderClicon from '@/layout/headers/header-clicon';
import FooterClicon from '@/layout/footers/footer-clicon';
import ShopBreadcrumb from '@/components/breadcrumb/shop-breadcrumb';
import CheckoutArea from '@/components/checkout/checkout-area';
import keycloak from '@/lib/keycloak';
import { useKeycloak } from '@/components/providers/keycloak-provider';

const CheckoutPage = () => {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const kc = useKeycloak();
  // Chỉ chuyển sang đăng nhập khi Keycloak đã khởi tạo xong; gọi sớm hơn gây vòng lặp đăng nhập
  useEffect(() => {
    if (!kc?.initialized) return;
    if (!keycloak.authenticated) {
      const locale = (i18n.language || 'vi').startsWith('en') ? 'en' : 'vi';
      keycloak.login({
        redirectUri: window.location.origin + window.location.pathname,
        locale,
      });
    }
  }, [kc?.initialized, router.pathname, i18n.language]);

  const breadcrumbLinks = [
    { label: t('breadcrumb.home'), href: '/' },
    { label: t('breadcrumb.shoppingCart'), href: '/cart' },
    { label: t('checkout.title') },
  ];

  return (
    <Wrapper>
      <SEO pageTitle={t('checkout.title')} noindex />
      <HeaderClicon />
      <ShopBreadcrumb links={breadcrumbLinks} />
      <CheckoutArea />
      <FooterClicon />
    </Wrapper>
  );
};

export default CheckoutPage;
