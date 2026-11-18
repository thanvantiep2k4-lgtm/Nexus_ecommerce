import React from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useGetProductTypeQuery } from '@/redux/features/productApi';
import useCurrency from '@/hooks/use-currency';

const CliconFullWidthBanner = () => {
  const { t } = useTranslation();
  const { formatPrice } = useCurrency();
  const { data } = useGetProductTypeQuery({
    type: 'electronics',
    query: 'topSellers=true&limit=1',
  });
  const product = data?.data?.[0];
  const discount = product?.discount || 0;
  const price = product ? product.price - (product.price * discount) / 100 : 0;

  return (
    <section className="cl-full-banner">
      <div className="container">
        <div className="cl-full-banner__inner">
          <div className="cl-full-banner__content">
            {discount > 0 && (
              <span className="cl-full-banner__tag">
                {t('banner.saveTag', {
                  percent: discount,
                  defaultValue: 'Tiết kiệm {{percent}}%',
                })}
              </span>
            )}
            <h2 className="cl-full-banner__title">{product?.title || ''}</h2>
            <p className="cl-full-banner__specs">
              {product
                ? t('banner.techSpecs', {
                    brand: product.brand?.name,
                    defaultValue: 'Công nghệ {{brand}} chính hãng · Bảo hành 12 tháng · Trả góp 0%',
                  })
                : ''}
            </p>
            <Link
              href={product ? `/product-details/${product._id}` : '/shop'}
              className="cl-full-banner__btn"
            >
              {t('banner.shopNow')} <i className="fas fa-arrow-right"></i>
            </Link>
          </div>
          <div className="cl-full-banner__image">
            {product && <span className="cl-full-banner__price-circle">{formatPrice(price)}</span>}
            {product?.img ? (
              <img src={product.img} alt={product.title} />
            ) : (
              <div className="cl-full-banner__image-placeholder" />
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default CliconFullWidthBanner;
