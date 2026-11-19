# AGENTS.md

> Đọc `docs/PROJECT_PLAN.md` trước khi làm bất cứ việc gì: đó là kế hoạch thống nhất của cả nhóm (port, env, phân công, quy ước).
> Phạm vi nghiệp vụ, đặc tả 12 phân hệ (M1–M12) và phân công v2: `KE_HOACH_NGHIEP_VU.md` ở gốc repo.

## Cập nhật tài liệu khi thay đổi API

Mọi thay đổi chạm tới API (endpoint, request/response, quyền, luồng trạng thái, model trả về, webhook, sự kiện Socket.io) phải cập nhật tài liệu **trong cùng commit/PR**: chú thích Swagger, `docs/api/API.md`, `docs/specs/<phân hệ>.md`, `docs/data-model.md` (nếu sửa model), `docs/STATUS.md`, `docs/CHANGELOG.md`. File chưa có thì tạo mới. Chi tiết từng file và quy tắc ghi: mục **"Cập nhật tài liệu khi thay đổi API"** trong `CLAUDE.md` ở gốc repo.

## Ghi chú giải thích tại chỗ sửa code

Khi sửa code vì một vấn đề (lỗi, rủi ro, thiết kế chưa đúng), ghi chú ngay tại chỗ sửa: làm gì và vì sao, hệ quả cụ thể nếu không sửa, các `VẤN ĐỀ ĐÃ BIẾT` chưa sửa (đánh số, kèm cách sửa đúng), điều kiện bắt buộc với người gọi, và tham chiếu tới file/mục liên quan. Gặp vấn đề tương tự ở chỗ khác mà chưa sửa cũng ghi chú tại đó. Cấu trúc đầy đủ và ví dụ: mục **"Ghi chú giải thích tại chỗ sửa code"** trong `CLAUDE.md` ở gốc repo.

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