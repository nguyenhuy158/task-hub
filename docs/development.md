# Task Hub API MVP

Node.js + Hono + SQLite. REST API và 13 MCP tools dùng chung validation, quyền và transaction. Chỉ dùng dữ liệu giả ở giai đoạn này; chưa nối UI, SSO, Plane, Hindsight, Telegram hoặc backup ngoài host.

## Chạy local

Node 26.7.0 đã được kiểm tra; pnpm 11.25.0 được pin trong package.json.

```sh
rtk proxy pnpm install --frozen-lockfile
rtk proxy pnpm check
rtk proxy pnpm test
rtk proxy pnpm build
rtk proxy pnpm admin create-client codex personal data/codex.token --private
rtk proxy pnpm admin create-client claude personal data/claude.token
rtk proxy pnpm start
```

Chạy từ thư mục task-hub. API mặc định http://127.0.0.1:4180. Token được ghi file mode 0600, không in ra terminal; SQLite chỉ lưu hash. Không ghi đè file token đã tồn tại. Muốn client truy cập cả work/personal dùng scope `all`; chỉ cấp `--private` khi cần đọc/ghi ghi chú riêng. Không gửi token trong URL.

Config: `TASK_HUB_DB` mặc định `data/task-hub.sqlite`, `HOST` mặc định `127.0.0.1`, `PORT` mặc định `4180`. Bản API này từ chối Origin của browser; kết nối UI/SSO sẽ cần auth và CSRF riêng.

## Docker Compose

```sh
rtk proxy docker compose -p task-hub-mvp up -d --build --wait
rtk proxy docker compose -p task-hub-mvp exec api node dist/admin.js create-client codex personal /app/data/codex.token --private
rtk proxy docker compose -p task-hub-mvp exec api node dist/admin.js list-clients
```

Host chỉ bind loopback 4180. Container chạy user node, SQLite nằm trong named volume `task-hub-mvp_task-data`. npm trong Dockerfile chỉ bootstrap pnpm; dependencies cài bằng pnpm frozen lockfile. Container và local dùng hai DB khác nhau.

MCP trên host cần token của DB đang phục vụ. Để lấy token Docker mà không in ra màn hình, tạo thư mục local `data` và dùng `docker compose cp api:/app/data/codex.token data/codex-docker.token`, rồi đặt quyền file 0600. Không commit hoặc chia sẻ file này. Không chạy đồng thời local server và Docker trên cùng port.

## MCP stdio

Build trước, cấu hình client chạy `node` với args là đường dẫn tuyệt đối tới `dist/mcp.js`. Adapter chỉ gọi HTTP API, không mở SQLite. API cần chạy trước.

```json
{
  "mcpServers": {
    "task-hub": {
      "command": "node",
      "args": ["/absolute/path/to/task-hub/dist/mcp.js"],
      "env": {
        "TASK_HUB_URL": "http://127.0.0.1:4180",
        "TASK_HUB_TOKEN_FILE": "/absolute/path/to/task-hub/data/codex.token"
      }
    }
  }
}
```

Đây là ví dụ cấu hình, chưa cài vào Codex/Claude của người dùng. Remote API phải HTTPS; adapter không theo redirect. Không log token hay response context.

## Cách dùng API

### Hợp đồng FE ↔ BE

[openapi.yaml](../openapi.yaml) là hợp đồng OpenAPI 3.1 của 13 API nghiệp vụ và `/health`. FE lấy request/response từ spec, không tự viết lại type. Khi đổi API: sửa spec và BE cùng nhau, chạy gate rồi sinh lại type.

```sh
rtk proxy pnpm openapi:check
rtk proxy pnpm api:types
```

`openapi:check` validate OpenAPI, so routes/request schema với Zod, kiểm tra examples và response thực tế của cả 14 operations bằng DB giả. Sai field, nullability, status hoặc route làm kiểm tra thất bại. Quy tắc nghiệp vụ như ownership và version vẫn do integration tests kiểm chứng.

`api:types` sinh `generated/api.d.ts` (không commit). FE có thể import `paths`, `components`, `operations`; ví dụ `components['schemas']['Task']`. TypeScript tooling pin 5.9 để tương thích generator. Chạy `pnpm test` cũng bao gồm contract test.

Import file YAML vào Swagger Editor hoặc Postman bằng Import → File; chọn server local và cấu hình Bearer token riêng trong client. Không upload spec kèm credential. Swagger trong browser xem được tài liệu nhưng “Try it out” hiện bị chặn bởi chính sách Origin của API. Nối FE trực tiếp cần bổ sung auth/origin; file hợp đồng không tự bật CORS.

Wire format hiện tại cần lưu ý: `TaskSummary` trong danh sách không có checklist; `Task` chi tiết có checklist/scope/completion_rule. `completion_evidence` là chuỗi JSON hoặc null. `checkpoint` có thể null; `private_note` bị bỏ khỏi response mặc định. Tất cả mutation thành công hiện trả 200, kể cả tạo mới. Không có HTTP endpoint cưỡng chế đóng phiên/archive; đó là lệnh admin local.

Mọi endpoint trừ `/health` cần `Authorization: Bearer <token>`. Body JSON tối đa 64 KiB. Mutation cần UUID `operation_id`; retry giữ nguyên ID và payload. ID route phải là UUID, tìm mã như LAB-1 qua `GET /api/v1/tasks?query=LAB-1`.

| REST dưới /api/v1 | MCP |
|---|---|
| GET /projects; POST /projects; PATCH /projects/:project_id | list_projects; create_project; update_project |
| POST /sessions | open_session |
| GET /tasks; POST /tasks; GET /tasks/:task_id | list_tasks; create_task; get_task |
| GET /tasks/:task_id/context; GET /tasks/:task_id/checkpoints | get_task_context; list_checkpoints |
| POST /tasks/:task_id/claim; PATCH /tasks/:task_id | claim_task; update_task |
| POST /tasks/:task_id/checkpoints; POST /tasks/:task_id/release | save_checkpoint; release_task |

Schema chuẩn nằm trong `src/contracts.ts`; MCP tools/list cung cấp đầy đủ input schema. Query danh sách hỗ trợ cursor/limit (20 mặc định, 100 tối đa); tasks hỗ trợ project_id/scope/status/query. `next_cursor=null` là hết trang.

Luồng dùng:

1. create_project `{operation_id,code:"LAB",name:"Homelab",scope:"personal"}` rồi create_task `{operation_id,project_id,title,checklist:["Backup","Restore"]}`.
2. open_session `{operation_id,label:"Codex trên Mac"}`; claim_task `{operation_id,task_id,session_id,base_version}` lấy version/generation mới.
3. save_checkpoint `{operation_id,task_id,session_id,base_version,generation,done,next,checklist:[{id,done:true}],end_session:true}`.
4. Client B get_task_context, đọc checklist/checkpoint mới nhất, rồi claim với session riêng và version vừa đọc.

Trong HTTP, bỏ task_id/project_id đã có trên path. Body không nhận field lạ. update_task.checklist là thay toàn bộ danh sách (ID có sẵn được giữ; mục không có ID được tạo). save_checkpoint.checklist chỉ patch trạng thái done; checkpoint lưu snapshot đầy đủ. Để đọc private_note cần token có quyền và `include_private=true`; mặc định không trả. Client không có quyền vẫn có thể lưu checkpoint và giữ nguyên note trước đó.

Status: todo/in_progress/blocked/done. Claim chỉ chuyển todo → in_progress. Kết thúc phiên không tự Done. update_task sang done cần completion_evidence `{kind:"evidence"|"production_release",value:"..."}` khớp project.completion_rule; work mặc định production_release. Đây là bằng chứng do client khai báo, chưa tích hợp xác minh release tự động.

## Quản trị local

API/MCP không có quyền cưỡng chế thu hồi owner hoặc archive. Trước khi có UI đăng nhập, hai thao tác này chỉ có trong CLI của người quản trị máy.

```sh
rtk proxy pnpm admin list-clients
rtk proxy pnpm admin revoke-client CLIENT_UUID
rtk proxy pnpm admin close-owner request.json --confirm
rtk proxy pnpm admin archive request.json --confirm
```

close-owner JSON: `{operation_id,task_id,base_version,expected_owner_session_id,expected_generation}`. archive JSON: `{operation_id,task_id,base_version}`; task phải không có owner. Không tự thu hồi khi mất mạng. Revoke token không tự đóng owner; cần xác nhận close-owner riêng. CLI là ranh giới quyền OS: không đưa quyền đọc DB/chạy admin cho client không tin cậy.

## Lỗi, lưu trữ và kiểm tra

Lỗi có dạng `{error:{code,fields?}}`: 400 INVALID_INPUT/INVALID_CHECKLIST, 401 UNAUTHENTICATED, 403 FORBIDDEN, 404 NOT_FOUND, 409 VERSION_CONFLICT/OWNER_CHANGED/TASK_OWNED/OPERATION_REUSED, 503 RETRY_LATER. 409: giữ draft, đọc lại task; không tự thay generation rồi ghi đè. Timeout sau mutation: kết quả chưa rõ, retry nguyên operation_id. Retry có thể trả kết quả thành công lịch sử; đọc task lại trước thao tác mới.

Migration 001 chạy trong transaction khi mở DB; user_version mới hơn code bị từ chối. Foreign keys, WAL, synchronous FULL; checkpoint/private note bất biến. Transaction ghi ngắn, một writer SQLite; chưa benchmark latency/tải lớn. Restart giữ dữ liệu, không thay thế backup.

`pnpm test` chạy SQLite thật trong thư mục tạm: auth/scope/private, rollback checklist lỗi, retry/idempotency, checkpoint+release, reopen DB, MCP stdio qua HTTP, token revoke và hai server process tranh cùng task. Không gọi dịch vụ ngoài hoặc dữ liệu thật.

Backup/restore mã hóa R2 + Drive, SSO, tích hợp và offline queue còn là gate trước dùng dữ liệu thật. Source app được quản lý riêng trong repo task-hub. Cấu hình triển khai cụ thể thuộc infra-selfhost; chuẩn bị VM thuộc infra-vm-setup.
