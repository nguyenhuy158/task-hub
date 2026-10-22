# AI tiếp quản Task Hub

## Đọc theo thứ tự

1. [AGENTS.md](../AGENTS.md), [README](../README.md) và [MVP #13](https://github.com/nguyenhuy158/task-hub/issues/13): quy tắc, trạng thái, việc còn lại.
2. [Product](product.md), [Architecture](architecture/README.md), [bố cục A](design/README.md): mục tiêu và các quyết định đã chốt.
3. [Development](development.md), [OpenAPI](../openapi.yaml) và issue định làm: cách chạy, hợp đồng và tiêu chí nghiệm thu.
4. Với auth, đọc [đề xuất #6](architecture/auth-web-proposal.md). Với tích hợp/infra, đọc [thiết kế các pha sau](architecture/deferred-design.md).
5. [Đối chiếu nguồn cũ](source-reconciliation.md): phần được chuyển, phần bị thay thế và dữ liệu không được đưa vào repo public.

GitHub Issues/Milestones giữ tiến độ trực tiếp. Tài liệu này là điểm bàn giao ngày 2026-10-22, không thay trạng thái live của issue/PR. Clone repo không kéo nội dung issues: AI cần đọc links hoặc dùng `gh issue view`.

## Đang dừng ở đâu

| Phần | Trạng thái và bằng chứng |
|---|---|
| API, MCP, SQLite, OpenAPI | Đã có, #1/#2 đóng; commit `9d63140`; tests dùng SQLite thật và MCP stdio |
| CI, bootstrap, quy trình dev | #14–#16 đóng qua [PR #17](https://github.com/nguyenhuy158/task-hub/pull/17); [CI main](https://github.com/nguyenhuy158/task-hub/actions/runs/39713505366) |
| Thiết kế | Người dùng đã chọn **A hai cột**; [PR #18](https://github.com/nguyenhuy158/task-hub/pull/18), [CI main](https://github.com/nguyenhuy158/task-hub/actions/runs/39719247917). #3 còn mở cho xác nhận sử dụng luồng chính |
| Auth web #6 | Backend SSO đã được duyệt và triển khai local trên branch `feat/6-sso-auth`; còn UI xác nhận thu hồi, CI/publish và đăng nhập thật |
| Frontend #4 | Chưa có React app; wireframe là HTML tĩnh với điều hướng trạng thái mẫu, không có lưu thật |
| Client thực tế #5 | SDK protocol đã test; chưa chứng minh Claude Code/Codex bàn giao thực tế trên hai môi trường |
| Backup/deploy/tích hợp #7–#12 | Chưa triển khai. Không dùng dữ liệu thật hoặc suy ra đã có production |

Người dùng đã duyệt backend auth qua SSO hiện có, một email allowlist riêng và domain `task.huyab.click`. Chưa duyệt deploy/DNS hoặc giao diện auth mới.

## Bước tiếp theo cụ thể

Bằng chứng backend auth local: `pnpm check`, `pnpm test` (8 tests), `pnpm openapi:check` (18 operations), `pnpm api:types`, `pnpm build` đều đạt. `pnpm run setup` chạy lại trên fixture có sẵn; runtime dev kiểm tra health 200, login redirect 302 đúng SSO/return URL và me 401 khi không có cookie. Không có bằng chứng đăng nhập Google thật hoặc CI cho thay đổi chưa publish. Email chủ ở `.env.sso.local` đã ignore, không đưa vào handoff public.

- #6: hoàn tất kiểm chứng backend local theo tài liệu auth; UI thu hồi và deploy/login thật cần kế hoạch riêng. Không đóng issue chỉ từ API tests.
- #3: bố cục A đã chọn; chưa có bằng chứng người dùng tự hoàn thành luồng không cần giải thích. Không tự đóng chỉ từ lựa chọn A.
- #4: khi có thiết kế và auth phù hợp, lên kế hoạch React/Vite/Tailwind theo A, sinh types từ OpenAPI. Không lấy prototype B làm đặc tả.
- Không khởi chạy tất cả các pha cùng lúc; làm theo phụ thuộc trong issues.

## Dựng môi trường trên máy mới

Node 26.7.0, pnpm 11.25.0. Trong checkout:

```sh
pnpm run setup
pnpm dev
```

API dev ở `http://127.0.0.1:4181`; Docker local dùng 4180. Setup tạo DB/task giả, hai token file 0600 trong `data/dev`, và `.env.development.local`; chạy lại không đổi token hay reset dữ liệu. Không cần DB/token từ máy cũ. Xem [development](development.md) cho cấu hình MCP và các gate kiểm tra.

Nếu dùng mise và pnpm chưa có trong PATH: `mise exec npm:pnpm@11.25.0 -- pnpm run setup`. Đây là cách chạy tooling, không phải thay đổi stack. `rtk proxy` có thể đứng trước các lệnh khi workspace có rtk.

Xem wireframe bằng static server; không cần Stitch account:

```sh
python3 -m http.server 4193 --bind 127.0.0.1 --directory docs/design/layout-a
```

Mở `http://127.0.0.1:4193/?v=a`. URL localhost từ chat chỉ là preview của máy cũ; HTML/CSS/ảnh trong Git mới là artifact bền vững. Font/icon tải từ CDN, nên preview đầy đủ cần mạng; PNG vẫn xem được offline. GitHub hiển thị HTML source, không tự chạy app.

## Bản đồ code

| File | Trách nhiệm |
|---|---|
| `src/store.ts`, `migrations/001.sql` | Quyền scope/owner, transaction, checkpoint, idempotency, SQLite |
| `src/contracts.ts`, `openapi.yaml` | Zod và hợp đồng wire; thay cùng nhau |
| `src/app.ts`, `src/server.ts` | HTTP bearer AI và cookie SSO, routing, runtime; Origin web phải đúng domain |
| `src/admin.ts` | Provision/revoke token, close-owner và archive local |
| `src/mcp.ts` | Adapter stdio gọi HTTP; không mở DB trực tiếp |
| `tests/`, `scripts/check-openapi.ts` | Integration, contract và bootstrap checks |
| `scripts/setup.mjs`, `scripts/setup-dev.ts` | Bootstrap dữ liệu giả; giữ dữ liệu hiện có |

## Các điểm không được làm sai

- Task DB là trạng thái chuẩn; Hindsight không quyết định checklist nào đã xong. Code ở Git/PR.
- Owner không tự hết hạn khi offline. Chỉ chủ được thu hồi owner khác; AI token không có quyền đó. Bàn giao, nhả owner và Done là ba việc khác nhau.
- `operation_id` giữ nguyên khi retry kết quả chưa rõ; không tự đổi version/generation rồi ghi đè. Private note không xuất sang Plane.
- API có close-owner cho chủ SSO; archive vẫn chỉ CLI. Dùng OpenAPI hiện tại khi xây FE.
- Chỉ dữ liệu giả; không commit token/DB/.env hoặc inventory máy. Không bật outbound sau restore trước đối soát.

## Những gì còn chưa rõ

- “ATF” do người dùng nhắc chưa được giải nghĩa/chọn công cụ. Hiện có automated tests + CI; không tự khẳng định đã có ATF.
- Domain đã chốt `task.huyab.click`; email chủ lưu ở cấu hình riêng, không đưa vào tài liệu public. SSO sub được ghim từ JWT hợp lệ đầu tiên. Host/deploy chưa chốt; không suy ra quyền triển khai từ quyết định auth.
- Các câu trả lời A/B/C cũ không còn câu hỏi tương ứng trong lịch sử bàn giao không đủ để suy ra yêu cầu mới. Dùng yêu cầu đã ghi rõ trong product/issues; hỏi lại nếu gặp mâu thuẫn.
- Không có cam kết latency cực thấp hoặc sức chứa host: cần benchmark #8. Không đổi sang Go/Rust; người dùng giữ stack Node/Hono.
