import React from 'react';
import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { handleFilterSidebarOpen } from '@/redux/features/shop-filter-slice';

const SORT_OPTIONS = [
  { value: 'Default Sorting', key: 'shop.sortPopular', label: 'Phổ biến nhất' },
  { value: 'Low to High', key: 'shop.sortPriceAsc', label: 'Giá: thấp đến cao' },
  { value: 'High to Low', key: 'shop.sortPriceDesc', label: 'Giá: cao đến thấp' },
  { value: 'New Added', key: 'shop.sortNewest', label: 'Mới nhất' },
];

const ShopTopRight = ({ selectHandleFilter }) => {
  const dispatch = useDispatch();
  const { t } = useTranslation();

  return (
    <div className="cl-shop__topbar-right">
      <div className="cl-shop__topbar-sort">
        <label>{t('shop.sortBy', 'Sắp xếp')}:</label>
        <select onChange={(e) => selectHandleFilter(e)} defaultValue="Default Sorting">
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {t(opt.key, opt.label)}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        className="cl-shop__topbar-filter-btn"
        onClick={() => dispatch(handleFilterSidebarOpen())}
      >
        <i className="fa-solid fa-sliders" /> Filter
      </button>
    </div>
  );
};

export default ShopTopRight;
