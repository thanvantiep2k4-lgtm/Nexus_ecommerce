// Public storefront URL for a vendor store page.
// Dev: storefront runs on :3001. Prod: storefront is served at the site root
// (CRM lives under /admin), so a relative path works. Override with VITE_STORE_URL.
const STORE_BASE: string =
  import.meta.env.VITE_STORE_URL ?? (import.meta.env.DEV ? 'http://localhost:3001' : '');

export const vendorStorePath = (slug: string) => `/vendor/${slug}`;
export const vendorStoreUrl = (slug: string) =>
  `${STORE_BASE.replace(/\/$/, '')}${vendorStorePath(slug)}`;
