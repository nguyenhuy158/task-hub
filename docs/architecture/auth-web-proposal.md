# Auth web — đề xuất cho #6

**Trạng thái: đã khảo sát source, chưa được duyệt triển khai.** Tài liệu không tạo API, cấu hình SSO hay quyền deploy. [Issue #6](https://github.com/nguyenhuy158/task-hub/issues/6).

## Phát hiện từ code hiện có

- Task Hub: `src/app.ts` từ chối mọi request có Origin, sau đó xác thực bearer token AI. `src/admin.ts` giữ close-owner/archive ngoài HTTP. `Principal` hiện là client có scope/read_private, chưa có vai trò chủ web.
- [SSO repo](https://github.com/nguyenhuy158/sso), [hướng dẫn tích hợp](https://github.com/nguyenhuy158/sso/blob/main/docs/INTEGRATION.md): Google login dùng chung; cookie HttpOnly/Secure/SameSite=Lax trên domain chung; JWT RS256 và JWKS công khai.
- [Thư viện verifier](https://github.com/nguyenhuy158/kit/tree/main/packages/sso): `verifySsoToken` kiểm tra chữ ký, issuer, expiry, sub/email; audience là tùy chọn và phải bật rõ. `getClaimsFromRequest` hỗ trợ cả cookie lẫn bearer; Task Hub phải tách đường web/AI, không nhận SSO bearer như token AI một cách ngầm định.
- Verifier cache key theo issuer/kid, không fetch mỗi request. Cần rà cách pin package, rotation/cache và kiểu claims trước tích hợp; chưa chứng minh source checkout trùng package version sẽ cài.
- Cookie domain không tới localhost. Login redirect chỉ chấp nhận HTTPS thuộc domain SSO cho phép. Logout SSO đăng xuất tất cả app dùng cookie chung.

Đây là kiểm tra source, không phải đã thử đăng nhập production hoặc đã thay đổi SSO. Các repo ngoài phải đọc lại phiên bản đang pin khi triển khai.

## Phạm vi đã đề xuất trong chat

1. Tái sử dụng SSO; allowlist đúng một owner theo định danh ổn định `sub` với issuer đã xác minh. Không cho mọi Google user trở thành chủ.
2. Thiết kế cookie/session, CSRF, exact Origin allowlist; token AI giữ scope hiện có, không có quyền admin.
3. Chủ xác nhận thu hồi đúng task/version/owner/generation; thay đổi trong lúc mở dialog phải trả conflict. Tái dùng `Store.closeOwner`, không viết đường bypass riêng.
4. Login/logout/current-user và admin routes nếu cần phải được đưa vào `openapi.yaml`, code và tests cùng lúc. Tên endpoint/session lifetime chưa chốt.
5. Dev login/danh tính giả riêng, chỉ môi trường local rõ ràng; không dùng production cookie/key và không mở bypass có thể bật ở production.

## Quyết định cần chốt trước code

| Điểm | Hướng đề xuất / câu cần trả lời |
|---|---|
| Domain/owner | Xác nhận domain dự kiến và owner sub; không công khai định danh thật trong repo |
| Session ứng dụng | Quyết định dùng cookie SSO trực tiếp hay đổi sang session riêng; mô tả expiry/revoke/logout để không tự đăng nhập lại ngoài ý muốn |
| Logout | Giải thích logout toàn SSO; nếu thêm logout riêng, cần cơ chế ngăn tự tái tạo session từ cookie SSO còn sống |
| Local | Chọn test issuer/key hoặc cơ chế bootstrap local có giới hạn; test từ chối khi bind non-loopback/chạy mode thật |
| UI admin | #6 cần form xác nhận thu hồi; lên kế hoạch giao diện nhỏ phù hợp bố cục A, không coi lựa chọn A là duyệt mọi màn auth |

Cookie dùng chung tin cậy các app trong cùng domain; cần đánh giá ranh giới subdomain. SameSite không thay kiểm tra Origin/CSRF giữa các subdomain. Không lưu JWT trong localStorage, không log credential/body checkpoint. Dữ liệu URL redirect lấy từ cấu hình đáng tin, không từ Host tùy ý.

## Files dự kiến và kiểm chứng

`src/app.ts`, module auth mới, `src/server.ts`, Store/migration nếu cần session web, `openapi.yaml`, tests, package/lockfile khi thêm verifier, config mẫu không secret và docs. Chỉ sửa repo SSO/kit khi có kế hoạch riêng được duyệt.

Test synthetic local: login/logout, expired/tampered JWT, sai issuer/audience/sub, không nâng quyền bearer AI, IDOR, CSRF/Origin, session revoke, close-owner với expected owner/version sai. Giữ bộ test API/MCP hiện có xanh. Test browser phải chứng minh UI và dữ liệu lưu khớp nhau. Chạy CI exact commit; không deploy hoặc ghi dữ liệu thật trong đợt này.
