import React from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useGetSettingsQuery } from '@/redux/features/cmsApi';
import { useGetShowCategoryQuery } from '@/redux/features/categoryApi';
import BrandLogo from '@/components/common/brand-logo';

const FooterClicon = () => {
  const { t } = useTranslation();
  const { data: settingsData } = useGetSettingsQuery();
  const { data: categories } = useGetShowCategoryQuery();
  const settings = settingsData?.data;
  const phone = settings?.contact?.phone || '+84 28 7106 1234';
  const email = settings?.contact?.email || 'support@tychicus.id.vn';
  const address = settings?.contact?.address || 'Hồ Chí Minh, Việt Nam';

  const categoryItems = (categories?.result || []).slice(0, 6);
  const year = new Date().getFullYear();

  const buildCategorySlug = (title) => title.toLowerCase().replace('&', '').split(' ').join('-');

  return (
    <footer className="cl-footer">
      {/* Main footer */}
      <div className="cl-footer__main">
        <div className="container">
          <div className="row">
            {/* Col 1: Logo + Contact */}
            <div className="col-xl-3 col-lg-4 col-md-6 col-12 mb-4 mb-xl-0">
              <div className="cl-footer__brand">
                <Link href="/" className="cl-footer__logo">
                  <BrandLogo size={36} />
                </Link>
                <div className="cl-footer__contact">
                  <p className="cl-footer__contact-label">
                    {t('footer.support', 'Hỗ trợ khách hàng')}:
                  </p>
                  <a href={`tel:${phone}`} className="cl-footer__contact-phone">
                    {phone}
                  </a>
                  <p className="cl-footer__contact-address">{address}</p>
                  <a href={`mailto:${email}`} className="cl-footer__contact-email">
                    {email}
                  </a>
                </div>
              </div>
            </div>

            {/* Col 2: Top Category */}
            <div className="col-xl-2 col-lg-2 col-md-6 col-6 mb-4 mb-xl-0">
              <div className="cl-footer__widget">
                <h4 className="cl-footer__widget-title">
                  {t('footer.topCategory', 'Danh mục nổi bật')}
                </h4>
                <ul className="cl-footer__links">
                  {categoryItems.map((cat) => (
                    <li key={cat._id}>
                      <Link href={`/shop?category=${buildCategorySlug(cat.parent)}`}>
                        {cat.parent}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <Link href="/shop" className="cl-footer__browse-link">
                      {t('featured.browse_all', 'Xem tất cả')}{' '}
                      <i className="fas fa-arrow-right"></i>
                    </Link>
                  </li>
                </ul>
              </div>
            </div>

            {/* Col 3: Quick Links */}
            <div className="col-xl-2 col-lg-2 col-md-6 col-6 mb-4 mb-xl-0">
              <div className="cl-footer__widget">
                <h4 className="cl-footer__widget-title">
                  {t('footer.quickLinks', 'Liên kết nhanh')}
                </h4>
                <ul className="cl-footer__links">
                  <li>
                    <Link href="/shop">{t('footer.shopProducts', 'Tất cả sản phẩm')}</Link>
                  </li>
                  <li>
                    <Link href="/cart">{t('header.cart')}</Link>
                  </li>
                  <li>
                    <Link href="/wishlist">{t('header.wishlist')}</Link>
                  </li>
                  <li>
                    <Link href="/compare">{t('footer.compare', 'So sánh sản phẩm')}</Link>
                  </li>
                  <li>
                    <Link href="/track-order">{t('footer.trackOrder', 'Tra cứu đơn hàng')}</Link>
                  </li>
                  <li>
                    <Link href="/contact">{t('footer.help', 'Trung tâm trợ giúp')}</Link>
                  </li>
                </ul>
              </div>
            </div>

            {/* Col 4: Download App */}
            <div className="col-xl-2 col-lg-2 col-md-6 col-6 mb-4 mb-xl-0">
              <div className="cl-footer__widget">
                <h4 className="cl-footer__widget-title">
                  {t('footer.downloadApp', 'Tải ứng dụng')}
                </h4>
                <div className="cl-footer__app-badges">
                  <a href="#" className="cl-footer__app-badge" aria-label="Google Play">
                    <div className="cl-footer__app-badge-inner">
                      <i className="fab fa-google-play"></i>
                      <div>
                        <span>{t('footer.getItNow', 'Tải ngay trên')}</span>
                        <strong>Google Play</strong>
                      </div>
                    </div>
                  </a>
                  <a href="#" className="cl-footer__app-badge" aria-label="App Store">
                    <div className="cl-footer__app-badge-inner">
                      <i className="fab fa-apple"></i>
                      <div>
                        <span>{t('footer.getItNow', 'Tải ngay trên')}</span>
                        <strong>App Store</strong>
                      </div>
                    </div>
                  </a>
                </div>
              </div>
            </div>

            {/* Col 5: Popular Tags */}
            <div className="col-xl-3 col-lg-2 col-md-6 col-6 mb-4 mb-xl-0">
              <div className="cl-footer__widget">
                <h4 className="cl-footer__widget-title">
                  {t('footer.popularTags', 'Tìm kiếm phổ biến')}
                </h4>
                <div className="cl-footer__tags">
                  {[
                    'Điện thoại',
                    'Laptop',
                    'Giày nam',
                    'Túi xách',
                    'Đồng hồ',
                    'Nước hoa',
                    'Nội thất',
                    'Đồ bếp',
                    'Thể thao',
                    'Apple',
                    'Samsung',
                    'Xe máy',
                  ].map((tag) => (
                    <Link
                      key={tag}
                      href={`/search?searchText=${encodeURIComponent(tag)}`}
                      className="cl-footer__tag"
                    >
                      {tag}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Copyright bar */}
      <div className="cl-footer__bottom">
        <div className="container">
          <p className="cl-footer__copyright">
            NexusMart &copy; {year}. {t('footer.allRightsReserved')}
          </p>
        </div>
      </div>
    </footer>
  );
};

export default FooterClicon;
