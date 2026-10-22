# Auth web — SSO cho Task Hub

Backend dùng SSO tại `https://auth.huyab.click`, redirect về `https://task.huyab.click/`. Google OAuth do dịch vụ SSO quản lý; Task Hub không giữ Google client secret. Đây là phần backend của [issue #6](https://github.com/nguyenhuy158/task-hub/issues/6); UI xác nhận thu hồi và bằng chứng đăng nhập thật vẫn còn thiếu.

## Xác thực và giới hạn chủ

- Chỉ bật web auth khi có `TASK_HUB_SSO_ALLOWED_EMAIL`; giá trị phải là một email hợp lệ. Thiếu biến thì API bearer/MCP vẫn chạy, login web trả 503. Giá trị thật thuộc cấu hình riêng, không commit.
- Backend chỉ nhận SSO từ cookie `huyab_sso`. `jose` được pin trong package/lockfile; kiểm tra RS256, issuer cố định, audience `huyab.click`, sub/email/iat/exp và thời hạn. JWKS có cache hữu hạn, timeout và hỗ trợ đổi kid. Không nhận JWKS URL từ token/request.
- Email phải khớp allowlist trên mọi request. Lần đầu được chấp nhận sẽ ghim issuer/sub vào `web_owner` trong SQLite; sub khác bị từ chối dù cùng email. Không tự đổi chủ khi đổi cấu hình email. Chuyển chủ cần quy trình riêng được duyệt.
- Web owner có một principal riêng, scope all/read_private, không có bearer credential. Dùng cùng Store và quy tắc session/task với AI. Bearer AI không thể gọi me/logout/close-owner của chủ. Request chứa Authorization luôn được xử lý như bearer, không fallback sang cookie.

## Cookie, CSRF và logout

Task Hub không tạo session cookie riêng. Cookie SSO do issuer đặt HttpOnly/Secure, domain `.huyab.click`. API kiểm tra JWT trên từng request. `GET /api/v1/auth/me` trả thông tin chủ, expiry và CSRF token ràng buộc với JWT hiện tại; không trả JWT. Response không cache, không bật CORS.

Request web có Origin phải khớp chính xác `https://task.huyab.click`. Mọi mutation web cần Origin đó và `X-CSRF-Token` lấy từ me. Token CSRF là SHA-256 với nhãn riêng và JWT làm đầu vào; chỉ backend có thể đọc cookie HttpOnly và endpoint cùng origin mới trả token này. Khi JWT đổi, client lấy lại me. Không dùng SameSite để thay CSRF: subdomain khác vẫn là same-site.

- `GET /api/v1/auth/login`: 302 tới login SSO; return URL cố định từ cấu hình ứng dụng, không lấy từ Host/query.
- `POST /api/v1/auth/logout`: kiểm tra auth/Origin/CSRF, trả `redirect_url`. Frontend phải điều hướng trình duyệt tới URL này để issuer xóa cookie dùng chung. Response này tự nó chưa đăng xuất; logout ảnh hưởng tất cả app SSO.
- SSO dùng JWT stateless: xóa cookie không thu hồi một bản JWT đã bị sao chép; bản đó còn hợp lệ tới expiry. Thu hồi client web qua CLI chặn principal ngay trên Task Hub nhưng không đóng owner task.

## Thu hồi owner

`POST /api/v1/tasks/{task_id}/close-owner` chỉ dành cho web owner. UI phải hiện task và owner đang giữ, rồi gửi `operation_id`, `base_version`, `expected_owner_session_id`, `expected_generation` sau xác nhận. Store.closeOwner giữ transaction, idempotency và conflict hiện có; không có tool MCP tương ứng. Phiên AI không thể nhận quyền thu hồi chỉ vì có scope all.

## Local, migration và xác minh

Cookie SSO không đến localhost. Test tự động dùng khóa RSA/JWKS giả trong process; server không có test issuer hoặc dev login bypass. Thử đăng nhập thật cần HTTPS đúng domain và quyền triển khai riêng; đợt backend không đổi DNS, deploy hoặc sửa SSO.

Migration 002 thêm bảng ghim chủ, giữ các client/task/token cũ. Test kiểm tra migration từ v1, giữ dữ liệu và danh tính sau restart, JWT giả/hết hạn/sai issuer/audience/algorithm, đổi kid/JWKS lỗi, allowlist, Origin/CSRF, IDOR, bearer AI và close-owner conflict/retry. Contract tests đối chiếu cả response auth/admin. Chạy `pnpm check`, `pnpm test`, `pnpm openapi:check`, `pnpm api:types`, `pnpm build`.

Chưa có UI auth/thu hồi, chưa có browser proof đăng nhập tại domain thật hoặc CI cho head đã publish. Không đóng #6 từ bằng chứng backend local.
