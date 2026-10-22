# Roadmap

Issues là nơi cập nhật trạng thái công việc. Milestones gom theo phase; README dẫn vào phase đang làm. Không duy trì phần trăm tiến độ thủ công trong Markdown.

| Phase | Kết quả cần đạt | Trạng thái lúc khởi tạo |
|---|---|---|
| 1 — MVP local | API/MCP + frontend dễ dùng, auth web, bàn giao qua client thực tế | Đang làm; API và OpenAPI đã có |
| 2 — Sẵn sàng dùng dữ liệu thật | Backup/restore, đo host và triển khai được kiểm chứng | Chưa bắt đầu |
| 3 — Plane | Work sync có allowlist, chống lặp và conflict | Chưa bắt đầu |
| 4 — Hindsight và Telegram | Memory theo scope, bot của chủ tài khoản | Chưa bắt đầu |
| 5 — Offline và adapters | Queue bền vững, idle checkpoint, thêm AI clients | Chưa bắt đầu |

Phase 2 tách riêng các điều kiện dùng dữ liệu thật từ MVP cũ; Plane/Memory/Offline tương ứng các đợt 2/3/4 trong kế hoạch trước. Đây là cách nhóm lại công việc, không bỏ yêu cầu cũ.

## Cách dùng GitHub

- Mỗi issue có mục tiêu, checklist, tiêu chí nghiệm thu và bằng chứng hoặc ghi rõ chưa có.
- Dùng labels `status:ready`, `status:blocked`, `status:in-progress` cho issue còn mở; issue đóng là đã đạt tiêu chí của chính issue đó.
- Chỉ đóng milestone khi mọi issue cần thiết đã đạt; API chạy không đồng nghĩa toàn MVP xong.
- Link PR/commit/test vào issue. Nếu tiêu chí yêu cầu production thì merge PR chưa đủ để đóng.
- Bản thiết kế bị từ chối vẫn lưu để tham khảo, ghi rõ trạng thái. Bản đã duyệt mới là đầu vào triển khai UI.
- Thay hợp đồng FE/BE qua openapi.yaml, chạy pnpm openapi:check trước publish.

Không sync các issue quản lý sản phẩm Task Hub sang Plane. Chức năng tích hợp Plane tương lai dành cho work tasks bên trong app, không biến repo này thành dữ liệu nghiệp vụ.

## Issue tổng và ưu tiên

[MVP tổng](https://github.com/nguyenhuy158/task-hub/issues/13) liệt kê nhóm bắt buộc và điều kiện dùng dữ liệu thật. P0 = MVP local; P1 = dùng dữ liệu thật; P2 = mở rộng. Auth web ở Phase 1 vì frontend cần cơ chế gọi API; Phase 2 giữ backup và triển khai.

- [P0 · #1 · MVP API: task, owner, checklist và checkpoint](https://github.com/nguyenhuy158/task-hub/issues/1)
- [P0 · #2 · OpenAPI: hợp đồng FE ↔ BE và sinh type](https://github.com/nguyenhuy158/task-hub/issues/2)
- [P0 · #3 · Thiết kế lại UI: người dùng hiểu được luồng làm việc](https://github.com/nguyenhuy158/task-hub/issues/3)
- [P0 · #4 · Frontend: nối UI đã duyệt với API thật](https://github.com/nguyenhuy158/task-hub/issues/4)
- [P0 · #5 · MCP: kiểm chứng Claude Code và Codex trên hai môi trường](https://github.com/nguyenhuy158/task-hub/issues/5)
- [P0 · #6 · Auth web: đăng nhập chủ tài khoản và quyền quản trị](https://github.com/nguyenhuy158/task-hub/issues/6)
- [P1 · #7 · Backup mã hóa R2 + Drive và diễn tập restore VM](https://github.com/nguyenhuy158/task-hub/issues/7)
- [P1 · #8 · Chọn host và cấu hình triển khai qua selfhost](https://github.com/nguyenhuy158/task-hub/issues/8)
- [P2 · #9 · Plane: đồng bộ hai chiều đúng ranh giới work/personal](https://github.com/nguyenhuy158/task-hub/issues/9)
- [P2 · #10 · Hindsight: memory theo scope và nguồn context rõ ràng](https://github.com/nguyenhuy158/task-hub/issues/10)
- [P2 · #11 · Telegram: quản lý task và bàn giao cho chủ tài khoản](https://github.com/nguyenhuy158/task-hub/issues/11)
- [P2 · #12 · Offline queue, idle checkpoint và AI adapters bổ sung](https://github.com/nguyenhuy158/task-hub/issues/12)
