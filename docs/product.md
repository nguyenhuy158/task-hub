# Phạm vi sản phẩm

## Mục tiêu

Một chủ tài khoản dùng nhiều AI client trên nhiều máy. Từ task, AI đọc được việc đã làm, checklist còn lại, quyết định, bằng chứng, blocker và bước tiếp theo để tiếp tục làm. Code giữ trên Git/PR; không đồng bộ working tree hoặc toàn bộ transcript.

## Workflow đã chốt

1. Chọn task chưa xong, mở theo ID/link hoặc tạo mới.
2. Đọc checkpoint mới nhất và checklist từ Task DB; memory chỉ bổ sung kiến thức.
3. Mỗi task thường có một phiên giữ quyền ghi. Mất kết nối không tự chuyển quyền; chủ tài khoản xác nhận thu hồi khi cần.
4. Lưu bàn giao khi yêu cầu hoặc kết thúc: đã làm, bước tiếp theo, quyết định, bằng chứng, blocker và ghi chú riêng. Giữ lịch sử các phiên bản.
5. Checkpoint không tự kết thúc phiên; kết thúc phiên không tự Done. Điều kiện Done theo project; công việc thường cần release production.

Idle checkpoint mặc định đề xuất 15 phút và có cấu hình; chưa triển khai. Hook đóng ứng dụng/tab cần kiểm chứng từng client, không coi là bảo đảm lưu. Có nút/lệnh explicit để bàn giao.

## Dữ liệu và tích hợp

| Phần | Quy tắc |
|---|---|
| Personal projects | Quản lý task/note riêng, không xuất sang Plane |
| Work projects | Chỉ sync khi đã mapping và task thuộc phạm vi giao cho chủ tài khoản |
| Shared work fields | Trạng thái theo mapping, checklist/subtask, comment chia sẻ và link PR |
| Private note / full context | Giữ nội bộ; không đưa vào payload Plane |
| Conflict | Giữ cả hai bản và chờ chọn; không tự last-write-wins |
| Xóa | Archive/tombstone trước khi lan truyền; không cascade tùy ý |
| Hindsight | Bank theo scope, không thay nguồn task state |
| Telegram | Chủ tài khoản xem/tạo/sửa/chọn/checkpoint; không chạy agent |
| Offline | Giữ draft/queue bền vững; không chiếm owner chưa được server cấp |

## Độ bền và vận hành

Backup mã hóa tới R2 và Google Drive, khóa độc lập; mục tiêu RPO ≤15 phút. Phải diễn tập restore cả runtime và dữ liệu sang VM khác, integrations mặc định tắt đến khi đối soát. Draft chưa gửi lên server không nằm trong RPO trung tâm. Host production, tài nguyên và ngân sách cuối cùng chưa chốt.

Trước dùng dữ liệu thật cần auth web một chủ, token AI riêng có revoke, kiểm tra quyền/validation, logs không chứa secret/context, migration có đường phục hồi và đo latency/tài nguyên thực tế.

## Phạm vi bản đầu

Backend local đã có task/checklist/session/checkpoint, REST/MCP và OpenAPI. UI hiện là demo chưa được duyệt, chưa gọi backend. Không tự tính phần tích hợp hoặc prototype thành feature đã hoàn thành.

Chưa làm multi-user/team, sync working tree, thu toàn transcript hoặc tự khởi chạy agent qua Telegram. Các mục offline, Plane, Hindsight, Telegram và backup vẫn nằm trong roadmap, không bị bỏ khỏi yêu cầu tổng.

Tiến độ chi tiết: [roadmap](roadmap.md), [Issues](https://github.com/nguyenhuy158/task-hub/issues), [Milestones](https://github.com/nguyenhuy158/task-hub/milestones). Kiến trúc: [architecture](architecture/README.md). Thiết kế: [design](design/README.md). Hợp đồng API hiện hành: [openapi.yaml](../openapi.yaml).
