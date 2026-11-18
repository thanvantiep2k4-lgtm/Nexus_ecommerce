# NexusMart E-Commerce Platform

> **Thành viên nhóm: đọc [PROJECT_PLAN.md](PROJECT_PLAN.md) trước.** Đó là kế hoạch thống nhất (kiến trúc, port, phân công, quy ước Git).
> Tên cũ trong code vẫn là "Shofy" (đang đổi tên).

Multi-vendor marketplace with CMS-driven storefront, built with Express.js, Next.js 13, React 19 + Ant Design 6, and MongoDB.

## Architecture

| Service | Stack | Port | Purpose |
|---------|-------|------|---------|
| **Backend API** | Express.js + MongoDB | 4000 | Unified REST API |
| **Storefront** | Next.js 13 (Pages Router) + Bootstrap 5 | 3001 | Customer-facing store |
| **CRM Admin** | Vite + React 19 + TypeScript + Ant Design 6 | 8081 (UI dev: 5173) | Admin panel |
| **Auth** | Keycloak 26 | 8180 | SSO, RBAC (RS256 JWT) |
| **Database** | MongoDB 7 | 27017 | Single database (`shofy`) |

## Quick Start

Yêu cầu: Node.js 20, Docker Desktop.

```bash
npm run setup      # tạo .env từ .env.example + cài dependency (5 package)
npm run infra:up   # MongoDB + PostgreSQL + Keycloak (tự import realm)
# điền CLOUDINARY_*, GEMINI_API_KEY trong backend/.env
npm run seed       # nạp dữ liệu mẫu (xoá sạch dữ liệu cũ!)
npm run dev        # api :4000 · store :3001 · crm :8081 · crm-ui :5173
```

Chi tiết, tài khoản dev và xử lý sự cố: xem [PROJECT_PLAN.md](PROJECT_PLAN.md#3-cách-chạy-dự-án-làm-đúng-thứ-tự).

### Docker (toàn bộ stack)

```bash
npm run env:init && docker compose up -d --build
```

## API Documentation

Interactive Swagger UI: `http://localhost:4000/api-docs`

### API Route Groups

| Prefix | Auth | Purpose |
|--------|------|---------|
| `/api/v1/store/*` | Public | Storefront endpoints |
| `/api/v1/auth/*` | Public | Authentication + payment webhooks |
| `/api/v1/user/*` | User token | User profile, orders, wishlist, addresses |
| `/api/v1/vendor/*` | Vendor token | Vendor self-service |
| `/api/v1/admin/*` | Staff+ token | Admin CRM operations |

## Project Structure

```
├── backend/           # Express.js REST API
│   ├── controller/    # Route handlers (v1/ for versioned API)
│   ├── model/         # Mongoose schemas (16 collections)
│   ├── routes/        # Express routers
│   ├── middleware/     # Auth, validation, activity log
│   ├── services/      # Payment service
│   ├── utils/         # Respond, pagination, email
│   ├── validations/   # Joi schemas
│   └── seeds/         # Email template seeds
├── frontend/          # Next.js 13 storefront
│   ├── src/pages/     # Pages (SSR, ISR)
│   ├── src/components/# React components
│   ├── src/redux/     # Redux Toolkit + RTK Query
│   ├── src/hooks/     # Custom hooks
│   └── tests/e2e/     # Playwright E2E tests
├── crm/               # Admin panel
│   ├── crm-ui/        # React 19 + TypeScript + Ant Design 6
│   ├── controllers/   # API proxy controllers
│   ├── routes/        # Proxy routes
│   └── server.js      # Express proxy server
├── migration/         # Database migration scripts
├── scripts/           # Utility scripts (backup)
└── docker-compose.yml # Full stack Docker setup
```

## Key Features

- **Multi-vendor marketplace** — vendor registration, approval, products, orders, payouts
- **CMS engine** — homepage builder, menu editor, blog, banners, theme settings
- **Full e-commerce** — products with variants, server-side filtering, wishlists, address book
- **Review moderation** — admin approval flow with verified purchase badges
- **Order tracking** — carrier integration, status timeline, email notifications
- **Analytics dashboard** — revenue trends, top products, customer growth, vendor performance
- **Email templates** — editable with merge tags, preview, test send
- **Activity logging** — automatic audit trail of admin actions
- **Payment gateways** — COD, bank transfer (VNPay/MoMo/Stripe stubs ready)
- **AI shopping assistant** — Gemini 2.0 Flash powered chat widget with semantic product search (Atlas Vector Search), order tracking, EN/VI support, and suggest-only action confirmation. Admin kill-switch + CRM analytics.

## AI Chatbot setup

1. Set `GEMINI_API_KEY` in `backend/.env` (free tier works — get one at [aistudio.google.com](https://aistudio.google.com/apikey)).
2. Create Atlas Vector Search indexes per [docs/atlas-vector-index.md](docs/atlas-vector-index.md).
3. Backfill embeddings for existing data:
   ```bash
   node backend/scripts/backfill-embeddings.js
   ```
4. Toggle from CRM → Settings → General → AI Chatbot.

The widget appears on every page of the storefront as a floating bubble (bottom-right).

## Documentation

- [Deployment Guide](DEPLOYMENT.md) — Docker, manual deploy, SSL, backups
- [API Docs](http://localhost:4000/api-docs) — Swagger UI (when running)

## Testing

```bash
# Backend API tests
cd backend && npx jest

# Frontend E2E tests
cd frontend && npx playwright test

# CRM TypeScript check
cd crm/crm-ui && npx tsc --noEmit
```
