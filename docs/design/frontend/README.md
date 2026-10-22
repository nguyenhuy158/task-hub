# Bằng chứng frontend local

PR #22 đã merge, dữ liệu kiểm chứng hoàn toàn giả. Browser chạy build thật với `tests/browser-fixture.ts`; cookie qua verifier SSO nhưng khóa/chủ đều giả. [CI main](https://github.com/nguyenhuy158/task-hub/actions/runs/39809530446) đạt. Chưa có Google login thật hoặc deploy.

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

Gate local và CI: `pnpm check`, `pnpm test`, `pnpm openapi:check`, `pnpm api:types`, `pnpm build`. Người dùng tự thử (#3), hai AI clients thật (#5) và auth trên domain thật (#6) cần bằng chứng riêng.
