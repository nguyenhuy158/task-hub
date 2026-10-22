import type { components, operations } from '../generated/api';
import { routes } from '../src/contracts';
import type { Pending } from './state';

export type Task = components['schemas']['Task'];
export type Context = components['schemas']['TaskContext'];
export type Project = components['schemas']['Project'];
export type TaskPage = components['schemas']['TaskPage'];
export type Checkpoint = components['schemas']['Checkpoint'];
export type User = operations['web_current_user']['responses'][200]['content']['application/json'];

export class ApiError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { ...init, credentials: 'same-origin', signal: init.signal ?? AbortSignal.timeout(15000) });
  } catch { throw new ApiError(0, 'NETWORK_ERROR'); }
  let body;
  try { body = await response.json(); } catch { throw new ApiError(response.ok ? 502 : response.status, 'INVALID_RESPONSE'); }
  if (!response.ok) throw new ApiError(response.status, body?.error?.code ?? 'REQUEST_FAILED');
  return body as T;
}

export function sendPending(pending: Pending, csrf: string) {
  const route = pending.command === 'close_owner'
    ? { method: 'POST', path: '/tasks/:task_id/close-owner' }
    : routes.find(item => item.command === pending.command)!;
  const body: Record<string, unknown> = { ...pending.input };
  const path = route.path.replace(/:(\w+)/g, (_, key: string) => {
    const value = String(body[key]);
    delete body[key];
    return encodeURIComponent(value);
  });
  return request<Record<string, unknown>>('/api/v1' + path, {
    method: route.method,
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    body: JSON.stringify(body),
  });
}

export function message(error: unknown) {
  if (!(error instanceof ApiError)) return 'Không đọc/ghi được dữ liệu trên trình duyệt hoặc dữ liệu chưa hợp lệ. Giữ trang này và kiểm tra nội dung trước khi tiếp tục.';
  if (error.code === 'PENDING_REQUEST') return 'Một tab khác có yêu cầu chưa xác nhận. Hãy thử gửi lại yêu cầu đó trước.';
  if (error.status === 0 || error.status >= 500) return 'Mất kết nối hoặc máy chủ chưa phản hồi. Bản nháp được giữ; kết quả gửi có thể chưa rõ.';
  if (error.status === 401) return 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục; bản nháp vẫn được giữ.';
  if (error.status === 409) return 'Task đã thay đổi. Bản nháp được giữ, hãy xem bản mới trước khi lưu lại.';
  if (error.code === 'CSRF_INVALID') return 'Phiên đăng nhập đã đổi. Tải lại trang rồi thử gửi lại yêu cầu đang chờ.';
  if (error.status === 403) return 'Bạn không có quyền thực hiện thao tác này hoặc phiên giữ task đã đổi.';
  if (error.status === 404) return 'Không tìm thấy task hoặc bạn không có quyền xem.';
  if (error.code === 'CODE_EXISTS') return 'Mã dự án đã tồn tại. Hãy chọn mã khác.';
  return 'Dữ liệu chưa hợp lệ. Kiểm tra các trường rồi thử lại.';
}
