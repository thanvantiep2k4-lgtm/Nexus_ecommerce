import api from '@/services/api';
import type { ApiResponse } from '@/types/index';

// Vendor self-service API — CRM server proxies /api/vendor-portal/* to backend /api/v1/vendor/*

export interface VendorProduct {
  _id: string;
  title: string;
  img: string;
  price: number;
  discount?: number;
  quantity: number;
  status: 'in-stock' | 'out-of-stock' | 'discontinued';
  productType: string;
  parent?: string;
  children?: string;
  unit?: string;
  description?: string;
  category?: { id?: string; name?: string };
  brand?: { id?: string; name?: string };
  tags?: string[];
  sellCount?: number;
  createdAt?: string;
}

export interface VendorOrderItem {
  _id: string;
  title: string;
  image?: string;
  price: number;
  quantity: number;
  subtotal: number;
  color?: string;
  size?: string;
  fulfillmentStatus: 'pending' | 'packed' | 'shipped' | 'delivered';
}

export interface VendorOrder {
  _id: string;
  invoice?: number;
  name: string;
  email?: string;
  contact?: string;
  address?: string;
  city?: string;
  status: string;
  paymentMethod?: string;
  totalAmount?: number;
  createdAt: string;
  items: VendorOrderItem[];
}

export interface VendorSummary {
  totalRevenue: number;
  orderCount: number;
  pendingItems: number;
  topProduct: {
    _id: string;
    title: string;
    sellCount?: number;
    img?: string;
    price?: number;
  } | null;
  period: string;
}

export interface RevenuePoint {
  period: string;
  revenue: number;
  orderCount: number;
}

export interface VendorProfile {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  vendorProfile?: {
    storeName?: string;
    storeSlug?: string;
    storeDescription?: string;
    storeLogo?: string;
    storeBanner?: string;
    verificationStatus?: string;
    commissionRate?: number;
  };
}

export interface CatalogCategory {
  _id: string;
  parent: string;
  children?: string[];
  productType?: string;
}

export interface CatalogBrand {
  _id: string;
  name: string;
}

const BASE = '/api/vendor-portal';

export const vendorPortalApi = {
  getSummary: (period?: string) =>
    api
      .get<ApiResponse<VendorSummary>>(`${BASE}/analytics/summary`, { params: { period } })
      .then((r) => r.data),
  getRevenue: (params?: { startDate?: string; endDate?: string; groupBy?: string }) =>
    api
      .get<ApiResponse<RevenuePoint[]>>(`${BASE}/analytics/revenue`, { params })
      .then((r) => r.data),

  getProducts: (params?: { page?: number; limit?: number; search?: string; status?: string }) =>
    api.get<ApiResponse<VendorProduct[]>>(`${BASE}/products`, { params }).then((r) => r.data),
  createProduct: (data: Partial<VendorProduct>) =>
    api.post<ApiResponse<VendorProduct>>(`${BASE}/products`, data).then((r) => r.data),
  updateProduct: (id: string, data: Partial<VendorProduct>) =>
    api.patch<ApiResponse<VendorProduct>>(`${BASE}/products/${id}`, data).then((r) => r.data),
  deleteProduct: (id: string) =>
    api.delete<ApiResponse<null>>(`${BASE}/products/${id}`).then((r) => r.data),

  getOrders: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get<ApiResponse<VendorOrder[]>>(`${BASE}/orders`, { params }).then((r) => r.data),
  updateItemStatus: (orderId: string, itemId: string, fulfillmentStatus: string) =>
    api
      .patch<ApiResponse<unknown>>(`${BASE}/orders/${orderId}/items/${itemId}/status`, {
        fulfillmentStatus,
      })
      .then((r) => r.data),

  getProfile: () => api.get<ApiResponse<VendorProfile>>(`${BASE}/profile`).then((r) => r.data),
  updateProfile: (data: Record<string, unknown>) =>
    api.patch<ApiResponse<VendorProfile>>(`${BASE}/profile`, data).then((r) => r.data),

  getCategories: () =>
    api.get<ApiResponse<CatalogCategory[]>>(`${BASE}/catalog/categories`).then((r) => r.data),
  getBrands: () =>
    api.get<ApiResponse<CatalogBrand[]>>(`${BASE}/catalog/brands`).then((r) => r.data),
};

/** Extract a readable message from an axios error returned by the backend. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
  if (!data) return fallback;
  const details = (data.error as { details?: Record<string, string> })?.details || data.details;
  if (details && typeof details === 'object') {
    const first = Object.entries(details as Record<string, string>)[0];
    if (first) return `${first[0]}: ${first[1]}`;
  }
  const msg =
    (data.error as { message?: string })?.message ||
    (data.message as string) ||
    (typeof data.error === 'string' ? (data.error as string) : '');
  return msg || fallback;
}
