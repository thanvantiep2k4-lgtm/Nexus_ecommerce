import React from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useGetProductTypeQuery } from '@/redux/features/productApi';
import useCurrency from '@/hooks/use-currency';

const finalPrice = (p) => (p ? p.price - (p.price * (p.discount || 0)) / 100 : 0);

const BannerCard = ({ product, variant, tag }) => {
  const { t } = useTranslation();
  const { formatPrice } = useCurrency();
  const dark = variant === 'dark';
  const href = product ? `/product-details/${product._id}` : '/shop';

  return (
    <div className={`cl-double-banner__card cl-double-banner__card--${variant}`}>
      <div className="cl-double-banner__body">
        <span className={`cl-double-banner__tag${dark ? ' cl-double-banner__tag--blue' : ''}`}>
          {tag}
        </span>
        <h3 className={`cl-double-banner__title${dark ? ' cl-double-banner__title--white' : ''}`}>
          {product?.title || t('banner.loading', 'Đang tải...')}
        </h3>
        <p className={`cl-double-banner__desc${dark ? ' cl-double-banner__desc--white' : ''}`}>
          {product
            ? t('banner.productDesc', {
                category: product.category?.name,
                brand: product.brand?.name,
                defaultValue: '{{category}} · {{brand}} — hàng chính hãng, giao nhanh toàn quốc',
              })
            : ''}
        </p>
        <Link href={href} className="cl-double-banner__btn cl-double-banner__btn--primary">
          {t('banner.shopNow')} <i className="fas fa-arrow-right"></i>
        </Link>
      </div>
      <div className="cl-double-banner__img">
        {product && (
          <span className="cl-double-banner__price-circle">{formatPrice(finalPrice(product))}</span>
        )}
        {product?.img ? (
          <img src={product.img} alt={product.title} />
        ) : (
          <div className="cl-double-banner__img-placeholder" />
        )}
      </div>
    </div>
  );
};

const CliconDoubleBanner = () => {
  const { t } = useTranslation();
  const { data: fashion } = useGetProductTypeQuery({
    type: 'fashion',
    query: 'topSellers=true&limit=1',
  });
  const { data: home } = useGetProductTypeQuery({ type: 'home', query: 'topSellers=true&limit=1' });

  return (
    <section className="cl-double-banner">
      <div className="container">
        <div className="row g-4">
          <div className="col-lg-6">
            <BannerCard
              product={fashion?.data?.[0]}
              variant="light"
              tag={t('banner.fashionTag', 'Thời trang bán chạy')}
            />
          </div>
          <div className="col-lg-6">
            <BannerCard
              product={home?.data?.[0]}
              variant="dark"
              tag={t('banner.homeTag', 'Nhà cửa & Đời sống')}
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default CliconDoubleBanner;
