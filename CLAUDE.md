# CLAUDE.md

> **ĐỌC [PROJECT_PLAN.md](PROJECT_PLAN.md) TRƯỚC KHI LÀM BẤT CỨ VIỆC GÌ.** Đó là kế hoạch thống nhất của cả nhóm: kiến trúc, chuẩn port/env, phân công từng người, quy ước Git. Mọi thay đổi phải bám theo file đó.

## Tổng quan

NexusMart là sàn TMĐT đa nhà bán tích hợp trợ lý AI (tên repo/code cũ: "Shofy"). Gồm 3 ứng dụng + Keycloak + MongoDB:

| Thư mục | Công nghệ | Port |
|---|---|---|
| `backend/` | Express 4 + Mongoose 7 + Socket.io, REST `/api/v1/*`, Swagger `/api-docs` | 4000 |
| `frontend/` | Next.js 13 (Pages Router), React 18, Redux Toolkit/RTK Query, Bootstrap 5 | 3001 |
| `crm/` | Server proxy Express (8081) + `crm/crm-ui` (Vite, React 19, TS, Ant Design 6; dev 5173) | 8081 / 5173 |
| Keycloak 26 + PostgreSQL 16 | SSO, RBAC (admin/manager/staff/shipper/vendor/user) | 8180 / 5433 |
| MongoDB 7 | DB `shofy` | 27017 |

Chi tiết từng phần: `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `crm/CLAUDE.md`.

## Lệnh thường dùng

```bash
npm run install:all     # cài dependency cho tất cả
npm run dev             # backend + frontend + crm + crm-ui
npm run seed            # CẢNH BÁO: xoá sạch mọi collection rồi nạp lại dữ liệu mẫu
cd backend && npx jest  # test API + chatbot
cd frontend && npx playwright test
cd crm/crm-ui && npx tsc --noEmit
```

## Quy ước bắt buộc

- Backend + CRM server dùng CommonJS; frontend dùng ES modules (file `.jsx`); `crm-ui` dùng TypeScript.
- Mọi endpoint ghi dữ liệu phải có validate Joi (`backend/validations/`) và trả về qua `utils/respond.js`.
- API chỉ dưới `/api/v1/*`. Route mới đặt trong `backend/routes/v1/{store,user,vendor,admin}`.
- **i18n:** mọi chữ hiển thị trên storefront dùng `t("namespace.key")`, thêm key vào cả `frontend/src/locales/en/common.json` và `vi/common.json`.
- **Đa tiền tệ:** không hardcode ký hiệu tiền. Dùng bộ format tiền tệ của dự án.
- Không commit file `.env`. Chỉ sửa `.env.example` khi thêm biến mới.
- Port và biến môi trường theo bảng trong PROJECT_PLAN.md. Không tự đổi.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **ecommerce_project** (7042 symbols, 9419 relationships, 129 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/ecommerce_project/context` | Codebase overview, check index freshness |
| `gitnexus://repo/ecommerce_project/clusters` | All functional areas |
| `gitnexus://repo/ecommerce_project/processes` | All execution flows |
| `gitnexus://repo/ecommerce_project/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
