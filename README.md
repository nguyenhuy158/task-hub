# Task Hub

App cá nhân để quản lý task, checklist và bàn giao context giữa AI clients trên nhiều máy. Code nằm ở Git/PR; Task Hub giữ tiến độ và bước tiếp theo.

**AI mới tiếp quản:** đọc [docs/handoff.md](docs/handoff.md) trước.

## Đang ở đâu?

**Phase 1 — MVP local đang làm.** Backend REST/MCP và OpenAPI đã có. Frontend React nối API trên branch `feat/4-web-ui` theo [bố cục A hai cột](docs/design/README.md), đã kiểm chứng bằng dữ liệu giả. Chưa publish frontend, dùng dữ liệu thật hoặc deploy VM.

**Việc tiếp theo:** [#3 — xác nhận luồng UI](https://github.com/nguyenhuy158/task-hub/issues/3), cùng [#6 — auth web/origin](https://github.com/nguyenhuy158/task-hub/issues/6) để gỡ phụ thuộc cho frontend.

**[MVP tổng: cần những gì?](https://github.com/nguyenhuy158/task-hub/issues/13)** · [Issues](https://github.com/nguyenhuy158/task-hub/issues) · [Milestones](https://github.com/nguyenhuy158/task-hub/milestones)

## Phase và ưu tiên

| Phase | Milestone | Phạm vi |
|---|---|---|
| 1 | [1 — MVP local](https://github.com/nguyenhuy158/task-hub/milestone/1) | MVP local: API, UI, auth và AI clients thực tế |
| 2 | [2 — Sẵn sàng dùng dữ liệu thật](https://github.com/nguyenhuy158/task-hub/milestone/2) | Backup/restore, host và triển khai trước dùng dữ liệu thật |
| 3 | [3 — Plane](https://github.com/nguyenhuy158/task-hub/milestone/3) | Plane work sync |
| 4 | [4 — Hindsight và Telegram](https://github.com/nguyenhuy158/task-hub/milestone/4) | Hindsight và Telegram |
| 5 | [5 — Offline và adapters](https://github.com/nguyenhuy158/task-hub/milestone/5) | Offline queue, idle checkpoint và adapters |

- **P0:** bắt buộc để hoàn thành MVP local.
- **P1:** điều kiện trước khi dùng dữ liệu thật.
- **P2:** tích hợp/cải tiến sau MVP.

Issues giữ trạng thái và bằng chứng; Milestones tính tiến độ từ issues. Không dùng phần trăm thủ công trong README. Tracker tổng không gắn milestone để tránh đếm trùng.

## Tài liệu dự án

| Nội dung | Nơi quản lý |
|---|---|
| Bàn giao, trạng thái và bước tiếp theo | [AI handoff](docs/handoff.md) |
| Phạm vi, workflow và yêu cầu | [Product](docs/product.md) |
| Roadmap và cách cập nhật tiến độ | [Roadmap](docs/roadmap.md) |
| Wireframe, screenshots, prototype, Stitch | [Design](docs/design/README.md) |
| Tech stack, sơ đồ, dữ liệu và quyết định | [Architecture](docs/architecture/README.md) |
| Hợp đồng FE ↔ BE | [OpenAPI 3.1](openapi.yaml) |

## Phát triển và chạy thử

Node/Hono + SQLite; pnpm; Docker Compose. Frontend dùng React/Vite/Tailwind. Hướng dẫn [chạy local, Docker, MCP và admin](docs/development.md).

```sh
rtk proxy pnpm run setup
rtk proxy pnpm dev
```

`rtk proxy` là wrapper CLI dùng trong workspace; có thể chạy trực tiếp phần lệnh phía sau khi máy không có rtk.

Dev API: http://127.0.0.1:4181. Setup tạo dữ liệu giả và token riêng trong `data/dev`; chạy lại giữ dữ liệu/token hiện có. Dùng `pnpm run setup`, vì `pnpm setup` là lệnh riêng của pnpm. Quy trình đóng góp: [AGENTS.md](AGENTS.md), [PR template](.github/pull_request_template.md), [CI](https://github.com/nguyenhuy158/task-hub/actions/workflows/ci.yml).

Source app nằm trong repo này. Cấu hình triển khai thuộc infra-selfhost; chuẩn bị VM thuộc infra-vm-setup. Repo public chỉ giữ code, thiết kế và dữ liệu giả; không chứa DB, token, inventory máy hoặc task công việc thật.
