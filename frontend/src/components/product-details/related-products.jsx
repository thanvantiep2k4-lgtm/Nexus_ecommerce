import { useTranslation } from 'react-i18next';
import React from 'react';
import { useGetRelatedProductsQuery } from '@/redux/features/productApi';
import { useGetTopRatedProductsQuery } from '@/redux/features/productApi';
import CliconProductSmRow from '@/components/clicon/products/clicon-product-sm-row';
import ErrorMsg from '../common/error-msg';

const ProductColumn = ({ title, products, isLoading }) => {
  const { t } = useTranslation();
  let content = null;

  if (isLoading) {
    content = [...Array(3)].map((_, i) => <div key={i} className="cl-product-columns__skeleton" />);
  } else if (!products || products.length === 0) {
    content = (
      <p className="cl-product-columns__empty">{t('products.empty', 'Chưa có sản phẩm.')}</p>
    );
  } else {
    content = products.slice(0, 3).map((p) => <CliconProductSmRow key={p._id} product={p} />);
  }

  return (
    <div className="col-xl-3 col-lg-6 col-md-6">
      <div className="cl-product-columns__col">
        <h3 className="cl-product-columns__heading">{title}</h3>
        <div className="cl-product-columns__list">{content}</div>
      </div>
    </div>
  );
};

const RelatedProducts = ({ id, relatedProducts = [] }) => {
  const { t } = useTranslation();
  const {
    data: relatedData,
    isLoading: relatedLoading,
    isError: relatedError,
  } = useGetRelatedProductsQuery(id, { skip: relatedProducts.length > 0 });

  const { data: topRatedData, isLoading: topRatedLoading } = useGetTopRatedProductsQuery();

  const related = relatedProducts.length > 0 ? relatedProducts : relatedData?.data || [];

  const topRated = topRatedData?.data || [];

  // Split related products into groups for the 4 columns
  const col1 = related.slice(0, 3);
  const col2 = related.slice(3, 6);
  const col3 = related.slice(6, 9);
  const col4 = topRated.slice(0, 3);

  if (!relatedLoading && !related.length && !topRated.length) {
    return null;
  }

  return (
    <section className="cl-product-columns" style={{ borderTop: '1px solid var(--cl-border)' }}>
      <div className="container">
        <div className="row g-4">
          <ProductColumn
            title={t('pd.related', 'Sản phẩm liên quan')}
            products={col1}
            isLoading={relatedLoading}
          />
          <ProductColumn
            title={t('pd.accessories', 'Phụ kiện gợi ý')}
            products={col2}
            isLoading={relatedLoading}
          />
          <ProductColumn
            title={t('pd.sameBrand', 'Có thể bạn thích')}
            products={col3.length > 0 ? col3 : col1}
            isLoading={relatedLoading}
          />
          <ProductColumn
            title={t('pd.featured', 'Sản phẩm nổi bật')}
            products={col4}
            isLoading={topRatedLoading}
          />
        </div>
      </div>
    </section>
  );
};

export default RelatedProducts;
