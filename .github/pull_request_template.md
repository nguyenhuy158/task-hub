## Issue

Refs #

## Thay đổi

-

## Kiểm tra và bằng chứng

- [ ] `pnpm check` và `pnpm test`
- [ ] `pnpm openapi:check`, `pnpm api:types`, `pnpm build`
- [ ] CI xanh trên đúng commit
- [ ] Nếu đổi UI: ảnh desktop/mobile và review luồng thực tế

## Hợp đồng và dữ liệu

- [ ] Nếu đổi API: cập nhật OpenAPI và kiểm tra FE types
- [ ] Không commit secret, DB hoặc dữ liệu thật
- [ ] Nêu thay đổi migration, cách phục hồi và giới hạn còn lại nếu có

## Nghiệm thu

- [ ] Link bằng chứng vào issue và cập nhật MVP tổng #13
- [ ] Chỉ đóng issue khi đạt tiêu chí; merge không tự đồng nghĩa đã release
