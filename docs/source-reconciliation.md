# Đối chiếu tài liệu nguồn và context

Đợt bàn giao 2026-10-22 đã đọc đủ năm file nguồn trong `homelab/docs/task-hub/`. Nội dung liên quan được chuyển/đối chiếu dưới đây để AI mới không cần checkout homelab hoặc lịch sử chat cũ.

| Nguồn gốc | Nơi giữ nội dung hiện tại | Cách xử lý |
|---|---|---|
| `mvp.md` | [Product](product.md), [Roadmap](roadmap.md), #13, [Deferred design](architecture/deferred-design.md) | Giữ phạm vi, gate dữ liệu thật và acceptance; đợt 1–4 cũ đã nhóm lại thành 5 milestones |
| `architecture.md` | [Architecture](architecture/README.md), [Deferred design](architecture/deferred-design.md), [Auth proposal](architecture/auth-web-proposal.md) | Giữ quyết định stack, ranh giới dữ liệu, sync/offline/restore; bỏ inventory riêng |
| `data-api.md` | [OpenAPI](../openapi.yaml), [Development](development.md), source contracts/migration; bảng khác biệt bên dưới | Đặc tả trước code không còn là hợp đồng wire |
| `architecture.c4` | Mermaid trong Architecture và Deferred design | Giữ góc nhìn app/tích hợp/restore dạng portable; không cần LikeC4 để tiếp quản, không publish view inventory |
| `prototype.html` | [Prototype B cũ](design/prototype-b.html) | Hai file giống byte-for-byte: SHA256 `955baed4da9ea98745a6ace3786a4d43d82448b1d5c2a90cc3dd2554fd5b7dc2`; chỉ tham khảo |

Bố cục **A** trong [design/layout-a](design/README.md) là lựa chọn mới nhất. Tên “B” ở prototype cũ và “B” ở trang so sánh A/B mới là hai đợt thiết kế khác nhau; không suy rằng người dùng quay lại duyệt prototype cũ.

## Khác biệt đặc tả cũ và code đã chạy

| Đặc tả trước code | Hiện tại phải dùng |
|---|---|
| Có POST close-owner/archive qua HTTP | Chưa có hai route này; CLI admin gọi Store. #6 mới đề xuất owner web |
| MCP có tên close-session | Tool hiện tại là `release_task`, hoặc `save_checkpoint` với `end_session=true` |
| Envelope có message/current_version/current_generation | Contract hiện là `{error:{code,fields?}}`; đọc lại task khi cần state mới |
| `operations.response_status` | Migration hiện chỉ lưu response_json; mutation thành công trả 200 |
| Hash gồm method/path/JSON | Store hiện dùng command + canonical input; không lấy mô tả cũ làm thuật toán đã triển khai |
| Mã task ví dụ LAB-01 | Mã hiển thị do Store tạo; routing dùng UUID, query tìm code. Không dùng mã demo làm path ID |
| create_task có history minh họa | Task thật mới tạo chưa có checkpoint; bootstrap tạo checkpoint riêng sau claim |
| Danh sách/chỉ tiết cùng dạng task | `TaskSummary` không có checklist; dùng `Task`/context để xem checklist |
| Completion evidence là object trong mọi response | Request là object; response hiện là JSON string hoặc null |
| Bảng integrations/epoch/queue đã được vẽ | Chưa có trong migration hoặc runtime. Chỉ là yêu cầu/đề xuất cho pha sau |

Khi code đổi, cập nhật OpenAPI/tests/docs đồng thời. Xem migration và contracts để lấy giới hạn field và schema đúng, không copy JSON mẫu của tài liệu cũ rồi coi là contract.

## Context trao đổi đã được bảo toàn

App riêng; Git/PR giữ code; Task Hub giữ checklist/context; Plane chỉ là tập con work; personal/private không sync; một owner/task; checkpoint explicit khi dừng/yêu cầu; memory bổ sung; backup độc lập; giữ Node/Hono thay vì Go/Rust; pnpm; GitHub giữ toàn bộ tiến độ/tài liệu; UI ít chữ, Be Vietnam Pro/Lucide, chọn A hai cột. Các phần này có nguồn trong product/architecture/design/issues.

Kế hoạch #6 vừa thảo luận được lưu riêng dưới nhãn **chưa duyệt**, không đổi thành quyết định triển khai. ATF chưa rõ nghĩa được ghi trong handoff, không tự tạo một framework để lấp chỗ trống.

## Phần cố ý không đưa lên repo public

Secret, cookie/token, DB/task công việc thật, inventory/địa chỉ máy, snapshot tài nguyên host và thông tin ngân sách cá nhân. Chúng không cần để build/test synthetic app. Khi làm #7/#8, cần khảo sát qua nguồn riêng và xin phép deploy đúng host; không đoán dữ liệu vận hành từ tài liệu public.

Không lưu nguyên toàn bộ hội thoại hoặc diễn giải câu trả lời chữ cái thiếu câu hỏi. Handoff lưu quyết định có căn cứ, phần còn mở và nơi xác minh, thay vì tạo một lịch sử giả đầy đủ.
