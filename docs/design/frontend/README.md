# Bằng chứng frontend local

Branch `feat/4-web-ui`, dữ liệu hoàn toàn giả. Browser chạy build thật với `tests/browser-fixture.ts`; cookie qua verifier SSO nhưng khóa/chủ đều giả. Chưa có Google login thật, deploy hoặc CI frontend.

| Luồng | UI và SQLite đã đối chiếu |
|---|---|
| Desktop/mobile | CSS 1440/375 px, hai cột và danh sách → chi tiết; không tràn ngang |
| Claim và bàn giao | Lưu checklist/done/next, kết thúc phiên nhả owner; client bearer khác đọc lại đúng checkpoint |
| Mất mạng | DB không đổi; reload giữ operation_id; retry thêm đúng một checkpoint |
| Conflict | Giữ nháp; tải bản mới và xác nhận đối chiếu trước khi lưu |
| Thu hồi | Dialog giữ snapshot; task đổi thì 409 và owner giữ nguyên; xác nhận bản mới mới thu hồi |
| Tạo project/task | Project và task với hai mục checklist khớp UI/DB |
| Logout | Đã xem cảnh báo toàn SSO rồi hủy; chưa logout thật |

Ảnh đã mở kiểm tra cùng lượt đối chiếu DB. Ảnh conflict dùng câu lỗi chung trước khi tinh chỉnh lời nhắc tải bản mới; cơ chế không đổi.

- [Desktop](desktop.png)
- [Nháp mobile](draft-mobile.png)
- [Retry khi lỗi mạng](retry-mobile.png)
- [Bàn giao](handoff-mobile.png)
- [Conflict thu hồi](owner-conflict-mobile.png)
- [Tạo task](created-desktop.png)

Gate local: `pnpm check`, `pnpm test`, `pnpm openapi:check`, `pnpm api:types`, `pnpm build`. Chưa thay cho CI đúng commit, người dùng tự thử (#3), hai AI clients thật (#5) hoặc auth trên domain thật (#6).
