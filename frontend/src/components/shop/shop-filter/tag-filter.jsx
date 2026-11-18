import React from 'react';
import { useRouter } from 'next/router';
import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { handleFilterSidebarClose } from '@/redux/features/shop-filter-slice';

const POPULAR_TAGS = [
  'Điện tử',
  'Thời trang',
  'Làm đẹp',
  'Nhà cửa & Đời sống',
  'Đồng hồ & Trang sức',
  'Thể thao',
  'Thực phẩm',
  'Xe cộ',
  'Điện thoại',
  'Laptop',
  'Túi xách',
  'Nước hoa',
];

const TagFilter = ({ setCurrPage }) => {
  const router = useRouter();
  const dispatch = useDispatch();
  const { t } = useTranslation();
  const activeTag = router.query.tag || '';

  const handleTagClick = (tag) => {
    setCurrPage(1);
    const slug = tag;
    const newQuery = { ...router.query };

    if (activeTag === slug) {
      delete newQuery.tag;
    } else {
      newQuery.tag = slug;
    }
    newQuery.page = 1;

    router.push({ pathname: '/shop', query: newQuery }, undefined, { shallow: true });
    dispatch(handleFilterSidebarClose());
  };

  return (
    <div className="cl-shop__widget">
      <h3 className="cl-shop__widget-title">{t('shop.popularTags', 'Nhóm sản phẩm')}</h3>
      <div className="cl-shop__tag-pills">
        {POPULAR_TAGS.map((tag) => {
          const slug = tag;
          const isActive = activeTag === slug;
          return (
            <button
              key={tag}
              type="button"
              className={`cl-shop__tag-pill${isActive ? ' cl-shop__tag-pill--active' : ''}`}
              onClick={() => handleTagClick(tag)}
            >
              {tag}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default TagFilter;
