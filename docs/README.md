# Tài liệu NexusMart

Toàn bộ tài liệu của dự án nằm trong thư mục này. **Đọc [PROJECT_PLAN.md](PROJECT_PLAN.md) trước.**

| Thư mục / file | Nội dung |
|---|---|
| [PROJECT_PLAN.md](PROJECT_PLAN.md) | Kế hoạch thống nhất: kiến trúc, port, cách chạy, quy ước, phân công từng người |
| [deployment.md](deployment.md) | Triển khai Docker, Nginx, SSL, backup |
| `guides/` | Hướng dẫn kỹ thuật: [Atlas Vector Search](guides/atlas-vector-index.md), [Google OAuth](guides/google-oauth-setup.md), [kế hoạch test Google OAuth](guides/google-oauth-test-plan.md) |
| `design/` | [Design system Clicon](design/clicon-design-system.md) cho storefront |
| `report/` | Báo cáo đồ án (`BaoCao_Shofy.md` / `.docx`), sơ đồ Mermaid `diagrams/`, script build docx |
| `reference/` | Tài liệu gốc: `phancong.md` (phân công ban đầu), `TMDT.pdf` (yêu cầu đề tài) |

Quy tắc: tài liệu mới đặt vào đúng thư mục trên, không để rải rác trong code. Ngoại lệ duy nhất: `README.md`, `CLAUDE.md`, `AGENTS.md` ở gốc và `CLAUDE.md` trong từng package (công cụ AI đọc theo thư mục).
