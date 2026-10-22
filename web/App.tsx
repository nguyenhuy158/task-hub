import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCheck, ChevronRight, Circle, Layers2, LogIn, LogOut, Plus, RefreshCw, Search, ShieldCheck, X } from 'lucide-react';
import { z } from 'zod';
import type { components } from '../generated/api';
import { ApiError, message, request, sendPending, type Context, type Project, type TaskPage, type User } from './api';
import { checkpointRequest, draftIsCurrent, draftSchema, key, newDraft, pendingSchema, readStored, rebaseDraft, type Draft, type Pending } from './state';

const statuses = { todo: 'Chưa bắt đầu', in_progress: 'Đang làm', blocked: 'Đang vướng', done: 'Đã xong' };
const date = (value: string) => new Date(value).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
const selectedFromUrl = () => new URLSearchParams(location.search).get('task') ?? '';

function Dialog({ title, children, close, busy = false, error = '' }: { title: string; children: ReactNode; close: () => void; busy?: boolean; error?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} onCancel={event => { event.preventDefault(); if (!busy) close(); }} aria-labelledby="dialog-title">
    <header className="flex items-center justify-between gap-4"><h2 id="dialog-title">{title}</h2><button type="button" className="icon-button" aria-label="Đóng" disabled={busy} onClick={close}><X /></button></header>
    {error && <p role="alert" className="banner danger">{error}</p>}
    {children}
  </dialog>;
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  async function load() {
    setStatus('loading');
    try { setUser(await request<User>('/api/v1/auth/me')); setStatus('ready'); }
    catch (error) {
      setUser(null);
      setStatus(error instanceof ApiError && error.status === 401 ? 'login' : 'error');
      setError(error instanceof ApiError && error.status === 403 ? 'Tài khoản này chưa được cấp quyền vào Task Hub.' : message(error));
    }
  }
  useEffect(() => { void load(); }, []);
  if (user && status === 'ready') return <Workspace key={user.sub} user={user} expired={() => { setUser(null); setStatus('login'); }} />;
  return <main className="login-shell"><div className="brand"><Layers2 />Task Hub</div><section className="panel login-panel">
    <div className="login-symbol"><ShieldCheck /></div><h1>Tiếp tục từ nơi bạn dừng lại.</h1>
    <p className="muted">Task, checklist và bàn giao — trong một không gian của bạn.</p>
    {status === 'loading' ? <p role="status">Đang kiểm tra đăng nhập…</p> : <>
      {status === 'error' && <p role="alert" className="banner">{error}</p>}
      <a className="button primary" href="/api/v1/auth/login"><LogIn />Đăng nhập bằng Google<ArrowRight /></a>
      <p className="small muted">Qua SSO của bạn. Chỉ tài khoản được cấp quyền mới truy cập được.</p>
      {status === 'error' && <button onClick={() => void load()}><RefreshCw />Thử kết nối lại</button>}
    </>}
  </section></main>;
}

function Workspace({ user, expired }: { user: User; expired: () => void }) {
  const [initial] = useState(() => {
    try {
      const session = readStored(sessionStorage, key(user.sub, 'session'), z.uuid());
      const pending = readStored(localStorage, key(user.sub, 'pending'), pendingSchema);
      return { session, pending, error: '' };
    } catch { return { session: null, pending: null, error: 'Không đọc được dữ liệu đã lưu trên trình duyệt. Không gửi thay đổi để tránh ghi đè bản đang chờ.' }; }
  });
  const [session, setSession] = useState<string | null>(initial.session);
  const [pending, setPending] = useState<Pending | null>(initial.pending);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<TaskPage>({ items: [], next_cursor: null });
  const [selected, setSelected] = useState(selectedFromUrl);
  const [context, setContext] = useState<Context | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [storageError, setStorageError] = useState(initial.error);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [revision, setRevision] = useState(0);
  const [scope, setScope] = useState('');
  const [project, setProject] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<'task' | 'project' | 'close' | 'done' | 'logout' | null>(null);
  const [confirmation, setConfirmation] = useState<Context['task'] | null>(null);
  const [history, setHistory] = useState<components['schemas']['CheckpointPage'] | null>(null);
  const locked = useRef(false);
  const activeSelection = useRef(selected);
  activeSelection.current = selected;
  const own = !!context && !!session && context.task.owner_session_id === session;
  const stale = !!draft && !!context && !draftIsCurrent(draft, context, session);
  const cannotMutate = busy || !!pending || !!storageError || offline;
  const blocked = cannotMutate || !own || stale;

  function report(value: unknown) {
    setError(value instanceof ApiError && value.status === 409 && modal === 'close'
      ? 'Task hoặc phiên giữ quyền đã thay đổi. Đóng hộp thoại, tải bản mới rồi xác nhận lại.'
      : message(value));
    if (value instanceof ApiError && value.status === 401) expired();
  }
  function choose(id: string) {
    if (locked.current) return;
    const url = new URL(location.href);
    if (id) url.searchParams.set('task', id); else url.searchParams.delete('task');
    window.history.pushState(null, '', url);
    setSelected(id); setContext(null); setHistory(null); setError('');
  }
  useEffect(() => {
    const back = () => { setSelected(selectedFromUrl()); setContext(null); setHistory(null); };
    const network = () => setOffline(!navigator.onLine);
    const storage = (event: StorageEvent) => {
      if (event.key !== key(user.sub, 'pending')) return;
      try { setPending(readStored(localStorage, key(user.sub, 'pending'), pendingSchema)); }
      catch { setStorageError('Yêu cầu đang chờ ở tab khác không đọc được. Giữ dữ liệu trình duyệt để kiểm tra.'); }
    };
    addEventListener('popstate', back); addEventListener('online', network); addEventListener('offline', network);
    addEventListener('storage', storage);
    return () => { removeEventListener('popstate', back); removeEventListener('online', network); removeEventListener('offline', network); removeEventListener('storage', storage); };
  }, []);
  useEffect(() => {
    let live = true;
    async function loadProjects() {
      const items: Project[] = [];
      let cursor: string | null = null;
      do {
        const page: components['schemas']['ProjectPage'] = await request('/api/v1/projects?limit=100' + (cursor ? '&cursor=' + cursor : ''));
        items.push(...page.items); cursor = page.next_cursor;
      } while (cursor && live);
      if (live) setProjects(items);
    }
    void loadProjects().catch(value => { if (live) report(value); });
    return () => { live = false; };
  }, [revision]);
  function listUrl(cursor?: string) {
    const params = new URLSearchParams({ limit: '30' });
    if (scope) params.set('scope', scope);
    if (project) params.set('project_id', project);
    if (statusFilter) params.set('status', statusFilter);
    if (query) params.set('query', query);
    if (cursor) params.set('cursor', cursor);
    return '/api/v1/tasks?' + params;
  }
  useEffect(() => {
    let live = true;
    setLoading(true);
    void request<TaskPage>(listUrl()).then(value => { if (live) setTasks(value); }).catch(value => { if (live) report(value); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [scope, project, statusFilter, query, revision]);
  useEffect(() => {
    let live = true;
    if (!selected) { setContext(null); setDraft(null); return; }
    setDetailLoading(true);
    void request<Context>('/api/v1/tasks/' + encodeURIComponent(selected) + '/context?include_private=true').then(value => {
      if (!live) return;
      setContext(value);
      try {
        const saved = readStored(localStorage, key(user.sub, 'draft:' + selected), draftSchema);
        setDraft(saved ?? (session && value.task.owner_session_id === session ? newDraft(value, session) : null));
        setDirty(!!saved);
      } catch { setStorageError('Bản nháp lưu trên máy không đọc được. Không gửi thay đổi; hãy giữ dữ liệu trình duyệt để kiểm tra.'); }
    }).catch(value => { if (live) report(value); }).finally(() => { if (live) setDetailLoading(false); });
    return () => { live = false; };
  }, [selected, session, revision]);

  function edit(next: Draft) {
    try {
      localStorage.setItem(key(user.sub, 'draft:' + next.task_id), JSON.stringify(next));
      setDraft(next); setDirty(true); setNotice('');
    } catch { setDraft(next); setDirty(true); setStorageError('Bản nháp chỉ còn trong trang này vì trình duyệt không lưu được. Đừng đóng hoặc tải lại trang; hãy sao chép nội dung trước.'); }
  }
  async function executeLocked(value: Pending) {
    const checked = pendingSchema.parse(value);
    const existing = readStored(localStorage, key(user.sub, 'pending'), pendingSchema);
    if (existing && (existing.input.operation_id !== checked.input.operation_id || JSON.stringify(existing) !== JSON.stringify(checked))) {
      setPending(existing);
      throw new ApiError(409, 'PENDING_REQUEST');
    }
    localStorage.setItem(key(user.sub, 'pending'), JSON.stringify(checked));
    setPending(checked);
    let result: Record<string, unknown>;
    try { result = await sendPending(checked, user.csrf_token); }
    catch (error) {
      if (error instanceof ApiError && error.status >= 400 && error.status < 500 && ![401, 403].includes(error.status)) {
        localStorage.removeItem(key(user.sub, 'pending')); setPending(null);
      }
      throw error;
    }
    if (checked.command === 'open_session') {
      sessionStorage.setItem(key(user.sub, 'session'), JSON.stringify(result.id));
      setSession(String(result.id));
    }
    if (checked.command === 'save_checkpoint') {
      const draftKey = key(user.sub, 'draft:' + checked.input.task_id);
      const saved = readStored(localStorage, draftKey, draftSchema);
      if (!saved || JSON.stringify(checkpointRequest(saved, checked.input.operation_id, checked.input.end_session)) === JSON.stringify(checked)) {
        localStorage.removeItem(draftKey);
        if (activeSelection.current === checked.input.task_id) { setDraft(null); setDirty(false); }
      }
      setNotice(checked.input.end_session ? 'Đã lưu bàn giao và kết thúc phiên giữ task.' : 'Đã lưu bàn giao. Bạn vẫn đang giữ task.');
    } else setNotice('Đã lưu thay đổi.');
    localStorage.removeItem(key(user.sub, 'pending')); setPending(null);
    setRevision(value => value + 1); setModal(null);
    if (checked.command === 'create_task') {
      const url = new URL(location.href); url.searchParams.set('task', String(result.id)); window.history.pushState(null, '', url);
      setSelected(String(result.id)); setContext(null);
    }
    return result;
  }
  async function execute(value: Pending) {
    return navigator.locks.request(key(user.sub, 'mutation-lock'), () => executeLocked(value));
  }
  async function action(fn: () => Promise<unknown>) {
    if (locked.current || storageError) return;
    locked.current = true; setBusy(true); setError(''); setNotice('');
    try { await fn(); } catch (value) { report(value); }
    finally { locked.current = false; setBusy(false); }
  }
  async function claim() {
    if (!context || pending) return;
    const task = context.task;
    await action(async () => {
      let id = session;
      if (!id) {
        const opened = await execute({ command: 'open_session', input: { operation_id: crypto.randomUUID(), label: 'Trình duyệt · ' + new Date().toLocaleString('vi-VN') } });
        id = String(opened.id);
      }
      await execute({ command: 'claim_task', input: { task_id: task.id, operation_id: crypto.randomUUID(), base_version: task.version, session_id: id } });
    });
  }
  function save(end: boolean) {
    if (!draft || blocked || !context) return;
    const form = document.querySelector<HTMLFormElement>('#handoff');
    if (!form?.reportValidity()) return;
    void action(() => execute(checkpointRequest(draft, crypto.randomUUID(), end)));
  }
  function create(event: FormEvent<HTMLFormElement>, kind: 'task' | 'project') {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    const value = (name: string) => String(data.get(name) ?? '').trim();
    void action(() => execute(kind === 'project'
      ? { command: 'create_project', input: { operation_id: crypto.randomUUID(), code: value('code'), name: value('name'), scope: value('scope') as 'personal' | 'work' } }
      : { command: 'create_task', input: { operation_id: crypto.randomUUID(), project_id: value('project_id'), title: value('title'), checklist: value('checklist').split('\n').map(x => x.trim()).filter(Boolean) } }));
  }
  async function loadHistory(cursor?: string) {
    if (!context) return;
    const taskId = context.task.id;
    await action(async () => {
      const page = await request<components['schemas']['CheckpointPage']>('/api/v1/tasks/' + taskId + '/checkpoints?include_private=true&limit=10' + (cursor ? '&cursor=' + cursor : ''));
      if (activeSelection.current === taskId) setHistory(old => ({ items: cursor ? [...(old?.items ?? []), ...page.items] : page.items, next_cursor: page.next_cursor }));
    });
  }

  return <main className="shell">
    <header className="app-header"><a className="brand" href="/" onClick={event => { event.preventDefault(); choose(''); }}><Layers2 />Task Hub</a>
      <div className="account"><span className="small muted">Không gian của bạn</span><button className="icon-button" aria-label="Đăng xuất" title="Đăng xuất" disabled={busy || !!pending} onClick={() => setModal('logout')}><LogOut /></button></div></header>
    <div className="titlebar"><div><p className="eyebrow">MỖI VIỆC MỘT BƯỚC TIẾP THEO</p><h1>Tiếp tục công việc</h1></div><button className="primary" disabled={cannotMutate} onClick={() => setModal(projects.length ? 'task' : 'project')}><Plus />Tạo task</button></div>
    {offline && <div role="status" className="banner">Mất kết nối. Bản nháp giữ trên máy này; chưa kết thúc phiên.</div>}
    {storageError && <div role="alert" className="banner danger">{storageError}</div>}
    {error && <div role="alert" className="banner danger">{error}<button disabled={busy} onClick={() => { setError(''); setRevision(x => x + 1); }}><RefreshCw />Tải lại dữ liệu</button></div>}
    {notice && <div role="status" className="banner success"><Check />{notice}</div>}
    {pending && <div role="status" className="banner"><div><strong>Có yêu cầu chưa xác nhận</strong><p>Thử lại đúng yêu cầu đã lưu, không tạo bản ghi mới.</p></div><button disabled={busy || offline || !!storageError} onClick={() => void action(() => execute(pending))}><RefreshCw />Thử gửi lại</button></div>}
    <div className={'workspace ' + (selected ? 'has-selection' : '')}>
      <aside className="task-list" aria-label="Danh sách task">
        <header className="list-heading"><h2>Việc của bạn</h2><button className="icon-button" title="Tạo dự án" aria-label="Tạo dự án" disabled={cannotMutate} onClick={() => setModal('project')}><Plus /></button></header>
        <nav className="scope-tabs" aria-label="Phạm vi">{[['', 'Tất cả'], ['personal', 'Cá nhân'], ['work', 'Công việc']].map(([value, label]) => <button key={value} aria-pressed={scope === value} onClick={() => setScope(value)}>{label}</button>)}</nav>
        <div className="list-controls"><form className="search" onSubmit={event => { event.preventDefault(); setQuery(String(new FormData(event.currentTarget).get('query') ?? '')); }}><Search /><input name="query" aria-label="Tìm task" placeholder="Tìm tên hoặc mã task…" maxLength={120} /><button className="icon-button" aria-label="Tìm kiếm"><ArrowRight /></button></form>
          <div className="filter-row"><select aria-label="Dự án" value={project} onChange={event => setProject(event.target.value)}><option value="">Mọi dự án</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><select aria-label="Trạng thái" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">Mọi trạng thái</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div>
        {loading ? <p className="empty" role="status">Đang tải task…</p> : tasks.items.length ? tasks.items.map(task => <button key={task.id} className={'task-row ' + (selected === task.id ? 'selected' : '')} aria-current={selected === task.id ? 'true' : undefined} disabled={busy} onClick={() => choose(task.id)}>
          <span className="row-meta"><span>{task.code} · {projects.find(p => p.id === task.project_id)?.scope === 'work' ? 'Công việc' : 'Cá nhân'}</span><ChevronRight /></span><strong>{task.title}</strong><span className="small muted">{statuses[task.status]} · {task.owner_session_id ? task.owner_session_id === session ? 'Bạn đang làm' : 'Phiên khác đang giữ' : 'Sẵn sàng nhận'}</span>
        </button>) : <div className="empty"><Circle /><p>Chưa có task phù hợp.</p><small>Đổi bộ lọc hoặc tạo việc đầu tiên.</small></div>}
        {tasks.next_cursor && <button className="load-more" disabled={busy || loading} onClick={() => void action(async () => { const page = await request<TaskPage>(listUrl(tasks.next_cursor!)); setTasks(old => ({ items: [...old.items, ...page.items], next_cursor: page.next_cursor })); })}>Xem thêm task</button>}
      </aside>
      <section className="detail-area" aria-label="Chi tiết task">
        <button className="mobile-back" disabled={busy} onClick={() => choose('')}><ArrowLeft />Danh sách task</button>
        {!selected ? <div className="panel empty welcome"><Layers2 /><h2>Chọn một việc để tiếp tục</h2><p>Bước tiếp theo và bàn giao gần nhất sẽ ở đây.</p></div> : detailLoading ? <div className="panel empty" role="status">Đang tải chi tiết…</div> : context ? <article className="panel">
          <div className="detail-meta"><span>{context.task.code} · {context.task.scope === 'work' ? 'Công việc' : 'Cá nhân'}</span><span className="status"><Circle />{statuses[context.task.status]}</span></div>
          <h2 className="task-title">{context.task.title}</h2>
          <div className="next-step"><p className="small muted">Bước tiếp theo</p><p>{context.checkpoint?.next ?? 'Chưa có bàn giao. Nhận task để bắt đầu.'}</p></div>
          {stale && <div className="banner danger"><div><strong>Bản nháp khác bản đang lưu</strong><p>Bản nháp giữ nguyên ở máy này. Xem bàn giao và checklist mới bên dưới trước khi chọn dùng lại nội dung.</p><details><summary>Checklist trong bản nháp</summary>{draft!.checklist.map(item => <p key={item.id}>{item.done ? '✓' : '○'} {item.text}</p>)}</details></div><button disabled={busy} onClick={() => setRevision(x => x + 1)}>Xem bản mới</button>{own && <button disabled={cannotMutate} onClick={() => { edit(rebaseDraft(draft!, context, session!)); setError(''); }}>Đã đối chiếu, giữ nội dung nháp</button>}</div>}
          <div className="section-title"><h3>Checklist</h3><span className="small muted">{context.task.checklist.filter(item => (draft && !stale ? draft.checklist.find(x => x.id === item.id)?.done : item.done)).length}/{context.task.checklist.length} đã xong</span></div>
          <div className="checklist">{context.task.checklist.length ? context.task.checklist.map(item => {
            const checked = draft && !stale ? draft.checklist.find(x => x.id === item.id)?.done ?? item.done : item.done;
            return <label key={item.id} className={checked ? 'checked' : ''}><input type="checkbox" checked={checked} disabled={blocked || !draft} onChange={event => draft && edit({ ...draft, checklist: draft.checklist.map(x => x.id === item.id ? { ...x, done: event.target.checked } : x) })} /><span>{item.text}</span></label>;
          }) : <p className="small muted">Task này chưa có mục checklist.</p>}</div>
          <details className="context-block" open={stale}><summary>Lần trước đã làm gì?</summary>{context.checkpoint ? <div className="context-content"><p className="preserve">{context.checkpoint.done}</p>{context.checkpoint.blocker && <p className="preserve"><strong>Đang vướng:</strong> {context.checkpoint.blocker}</p>}{context.checkpoint.decisions && <p className="preserve"><strong>Quyết định:</strong> {context.checkpoint.decisions}</p>}<small className="muted">{date(context.checkpoint.created_at)}</small></div> : <p className="context-content muted">Chưa có checkpoint.</p>}</details>
          <details className="context-block"><summary>Ghi chú &amp; bằng chứng</summary><div className="context-content">{context.checkpoint?.evidence.map((item, i) => <p key={i} className="preserve">{item.kind === 'url' && /^https?:\/\//.test(item.value) ? <a href={item.value} rel="noopener noreferrer" target="_blank">{item.value}</a> : item.value}</p>)}<p className="preserve">{context.checkpoint?.private_note || 'Chưa có ghi chú riêng.'}</p></div></details>
          <details className="context-block" onToggle={event => { if (event.currentTarget.open && !history) void loadHistory(); }}><summary>Lịch sử bàn giao</summary><div className="context-content">{history?.items.map(item => <div className="history-item" key={item.id}><small className="muted">{date(item.created_at)}</small><p className="preserve">{item.done}</p><p className="preserve"><strong>Tiếp theo:</strong> {item.next}</p></div>)}{history?.items.length === 0 && <p>Chưa có bàn giao.</p>}{history?.next_cursor && <button disabled={busy} onClick={() => void loadHistory(history.next_cursor!)}>Xem bàn giao trước</button>}</div></details>
          {draft && <form id="handoff" className="handoff" onSubmit={event => { event.preventDefault(); save(false); }}>
            <div className="section-title"><h3>Bàn giao công việc</h3><span className="small muted">{dirty ? 'Bản nháp · chưa lưu lên server' : 'Nội dung mới'}</span></div>
            <fieldset disabled={blocked}><label>Đã làm<textarea required maxLength={4000} value={draft.done} onChange={event => edit({ ...draft, done: event.target.value })} placeholder="Ghi kết quả đã làm để phiên sau tiếp tục…" /></label><label>Bước tiếp theo<input required maxLength={1000} value={draft.next} onChange={event => edit({ ...draft, next: event.target.value })} placeholder="Một bước cụ thể tiếp theo" /></label>
              <details className="optional-fields"><summary>Thêm blocker, quyết định, bằng chứng, ghi chú riêng</summary><label>Đang vướng<textarea maxLength={4000} value={draft.blocker} onChange={event => edit({ ...draft, blocker: event.target.value })} /></label><label>Quyết định<textarea maxLength={4000} value={draft.decisions} onChange={event => edit({ ...draft, decisions: event.target.value })} /></label><label>Bằng chứng<textarea maxLength={2000} value={draft.evidence} onChange={event => edit({ ...draft, evidence: event.target.value })} /></label><label>Ghi chú riêng<textarea maxLength={4000} value={draft.private_note} onChange={event => edit({ ...draft, private_note: event.target.value })} /></label><p className="small muted">Chỉ chủ và client được cấp quyền mới đọc được ghi chú riêng.</p></details>
            </fieldset>
            {own && <div className="save-actions"><button type="submit" disabled={blocked}><Check />Lưu, tiếp tục làm</button><button type="button" className="primary" disabled={blocked} onClick={() => save(true)}><CheckCheck />Lưu &amp; kết thúc phiên</button></div>}
          </form>}
          <footer className="task-footer"><div className="small muted">{own ? 'Bạn đang giữ task trong phiên này.' : context.task.owner_session_id ? 'Một phiên khác đang giữ quyền làm.' : 'Chưa có phiên giữ task.'}<br />{context.checkpoint ? 'Bàn giao gần nhất · ' + date(context.checkpoint.created_at) : 'Chưa có bàn giao'}<br />{own && 'Kết thúc phiên không tự đánh dấu task đã xong.'}</div>
            {!context.task.owner_session_id ? <button className="primary" disabled={cannotMutate} onClick={() => void claim()}>Nhận làm<ArrowRight /></button> : !own ? <button disabled={cannotMutate} onClick={() => { setConfirmation({ ...context.task }); setModal('close'); }}>Thu hồi quyền làm</button> : <button disabled={cannotMutate || dirty || context.task.status === 'done'} onClick={() => setModal('done')}>Đánh dấu xong</button>}
          </footer>
        </article> : <div className="panel empty">Không tải được task. Bản nháp vẫn giữ trên máy.</div>}
      </section>
    </div>
    {(modal === 'task' || modal === 'project') && <Dialog title={modal === 'task' ? 'Tạo task' : 'Tạo dự án'} close={() => setModal(null)} busy={busy} error={error}>
      <form onSubmit={event => create(event, modal)}><fieldset disabled={busy || !!pending}>
        {modal === 'project' ? <><label>Tên dự án<input name="name" required maxLength={120} autoFocus /></label><label>Mã dự án<input name="code" required pattern="[A-Z][A-Z0-9]{1,11}" maxLength={12} placeholder="VD: LAB" /></label><label>Phạm vi<select name="scope"><option value="personal">Cá nhân</option><option value="work">Công việc</option></select></label><p className="small muted">Task công việc cần bằng chứng release production để đánh dấu xong.</p></> : <><label>Dự án<select name="project_id" required defaultValue={project || projects[0]?.id}>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Tên task<input name="title" required maxLength={120} autoFocus /></label><label>Checklist · mỗi dòng một mục<textarea name="checklist" rows={5} placeholder="Đọc context hiện tại&#10;Thực hiện bước tiếp theo" /></label></>}
        <button className="primary" type="submit"><Plus />{modal === 'task' ? 'Tạo task' : 'Tạo dự án'}</button></fieldset></form>
    </Dialog>}
    {modal === 'close' && confirmation && <Dialog title="Thu hồi quyền làm?" close={() => setModal(null)} busy={busy} error={error}>
      <p>Phiên hiện tại sẽ mất quyền ghi vào <strong>{confirmation.code} · {confirmation.title}</strong>. Nội dung đã lưu không bị xóa.</p><dl className="confirmation"><dt>Phiên đang giữ</dt><dd>{confirmation.owner_session_id}</dd><dt>Phiên bản đang xác nhận</dt><dd>{confirmation.version} · lượt giữ {confirmation.generation}</dd></dl><p className="small muted">Nếu task đã thay đổi, yêu cầu sẽ bị từ chối để bạn xem lại.</p>
      <div className="dialog-actions"><button disabled={busy} onClick={() => setModal(null)}>Giữ nguyên</button><button className="primary" disabled={cannotMutate} onClick={() => void action(() => execute({ command: 'close_owner', input: { operation_id: crypto.randomUUID(), task_id: confirmation.id, base_version: confirmation.version, expected_owner_session_id: confirmation.owner_session_id!, expected_generation: confirmation.generation } }))}>Xác nhận thu hồi</button></div>
    </Dialog>}
    {modal === 'done' && context && <Dialog title="Đánh dấu task đã xong" close={() => setModal(null)} busy={busy} error={error}><form onSubmit={event => { event.preventDefault(); const evidence = String(new FormData(event.currentTarget).get('evidence')).trim(); void action(() => execute({ command: 'update_task', input: { operation_id: crypto.randomUUID(), task_id: context.task.id, base_version: context.task.version, generation: context.task.generation, session_id: session!, status: 'done', completion_evidence: { kind: context.task.completion_rule, value: evidence } } })); }}><label>{context.task.completion_rule === 'production_release' ? 'Bằng chứng đã release production' : 'Bằng chứng hoàn thành'}<textarea name="evidence" required maxLength={4000} autoFocus /></label><p className="small muted">Bạn vẫn giữ phiên làm việc. Lưu bàn giao và kết thúc phiên khi sẵn sàng.</p><button className="primary" disabled={cannotMutate}>Xác nhận đã xong</button></form></Dialog>}
    {modal === 'logout' && <Dialog title="Đăng xuất khỏi SSO?" close={() => setModal(null)} busy={busy} error={error}><p>Bạn sẽ đăng xuất khỏi các ứng dụng dùng chung SSO. Bản nháp trên máy vẫn được giữ cho tài khoản này.</p><div className="dialog-actions"><button disabled={busy} onClick={() => setModal(null)}>Ở lại</button><button className="primary" disabled={busy} onClick={() => void action(async () => { const result = await request<{ redirect_url: string }>('/api/v1/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': user.csrf_token } }); const target = new URL(result.redirect_url); if (target.origin !== 'https://auth.huyab.click' || target.pathname !== '/logout') throw new Error('Invalid logout redirect'); location.assign(target.href); })}>Đăng xuất toàn SSO</button></div></Dialog>}
    {busy && <span className="sr-only" role="status">Đang xử lý…</span>}
  </main>;
}
