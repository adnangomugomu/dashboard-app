'use strict';

const bridge = window.api;

const state = {
  data: { projects: [], commands: [] },
  view: 'home',
  projectId: null,
  serviceId: null,
  statuses: {}, // id -> { status, pid }
  logs: {}, // id -> string
};

const COMMANDS = [
  'npm run dev',
  'npm run start:dev',
  'npm run start',
  'npm start',
  'npm run serve',
  'yarn dev',
  'yarn start',
  'pnpm dev',
  'pnpm start',
  'bun dev',
  'php artisan serve',
  'python manage.py runserver',
  'docker compose up',
];

const SERVICE_ICONS = [
  { id: 'globe', emoji: '🌐', label: 'Website' },
  { id: 'server', emoji: '🖥️', label: 'Server / Backend' },
  { id: 'database', emoji: '🗄️', label: 'Database' },
  { id: 'api', emoji: '🔌', label: 'API' },
  { id: 'storage', emoji: '📦', label: 'Storage' },
  { id: 'cloud', emoji: '☁️', label: 'Cloud' },
  { id: 'docker', emoji: '🐳', label: 'Docker' },
  { id: 'terminal', emoji: '⌨️', label: 'Terminal / CLI' },
  { id: 'mobile', emoji: '📱', label: 'Mobile' },
  { id: 'rocket', emoji: '🚀', label: 'Deploy' },
  { id: 'bolt', emoji: '⚡', label: 'Realtime' },
  { id: 'lock', emoji: '🔒', label: 'Auth' },
  { id: 'chart', emoji: '📊', label: 'Monitoring' },
  { id: 'gear', emoji: '⚙️', label: 'Worker' },
  { id: 'fire', emoji: '🔥', label: 'Queue' },
];

let commandBuffer = '';
let commandStatus = 'stopped';

let monitorBuffer = '';
let monitorTerm = null;
let monitorFit = null;
let monitorError = null;
let monitorRunning = false;

const STATUS_LABEL = {
  stopped: 'Stopped',
  starting: 'Starting',
  running: 'Running',
  error: 'Error',
};

// ---------------------------------------------------------------- helpers

const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function statusOf(id) {
  return (state.statuses[id] && state.statuses[id].status) || 'stopped';
}

function isActive(id) {
  const status = statusOf(id);
  return status === 'running' || status === 'starting';
}

function currentProject() {
  return state.data.projects.find((p) => p.id === state.projectId) || null;
}

function findService(id) {
  for (const project of state.data.projects) {
    const svc = project.services.find((s) => s.id === id);
    if (svc) return svc;
  }
  return null;
}

function stripAnsi(text) {
  return String(text)
    .replace(/\u001b\]8;;[^\u0007]*\u0007/g, '')
    .replace(/\u001b\][^\u0007]*\u0007/g, '')
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\r(?!\n)/g, '');
}

function prettyLink(link) {
  try {
    const url = new URL(link);
    return url.host + (url.pathname !== '/' ? url.pathname : '');
  } catch {
    return link;
  }
}

let toastTimer = null;
function toast(message, type = 'info') {
  let node = $('toast');
  if (!node) {
    node = el('div', 'toast');
    node.id = 'toast';
    document.body.append(node);
  }
  node.textContent = message;
  node.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.className = `toast ${type}`;
  }, 3200);
}

// ---------------------------------------------------------------- render

function renderAll() {
  renderNav();
  renderProjects();
  renderHeader();
  renderServices();
  renderLogHeader();
  renderLogContent();
}

function renderNav() {
  $('navCommands').classList.toggle('active', state.view === 'commands');
  $('navMonitor').classList.toggle('active', state.view === 'monitor');
}

const SWIPE_WIDTH = 110;
let openSwipeId = null;

function closeAllSwipes() {
  document
    .querySelectorAll('.project-swipe.open, .project-swipe.swiping')
    .forEach((wrapper) => {
      wrapper.classList.remove('open', 'swiping');
      const panel = wrapper.querySelector('.swipe-actions');
      if (panel) panel.style.transform = '';
    });
  openSwipeId = null;
}

function revealProjectActions(wrapper, item, id) {
  document.querySelectorAll('.project-swipe.open').forEach((other) => {
    if (other === wrapper) return;
    other.classList.remove('open');
    const otherPanel = other.querySelector('.swipe-actions');
    if (otherPanel) otherPanel.style.transform = '';
  });
  wrapper.classList.add('open');
  const panel = wrapper.querySelector('.swipe-actions');
  if (panel) panel.style.transform = 'translateX(0px)';
  openSwipeId = id;
}

function hideProjectActions(wrapper, item, id) {
  wrapper.classList.remove('open');
  const panel = wrapper.querySelector('.swipe-actions');
  if (panel) panel.style.transform = '';
  if (openSwipeId === id) openSwipeId = null;
}

function bindProjectSwipe(wrapper, item, project) {
  const panel = wrapper.querySelector('.swipe-actions');
  let startX = 0;
  let startY = 0;
  let base = 0;
  let pointerId = null;
  let active = false;
  let axis = null;
  let moved = false;

  item.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    base = wrapper.classList.contains('open') ? -SWIPE_WIDTH : 0;
    active = true;
    axis = null;
    moved = false;
    wrapper.classList.add('swiping');
    try {
      item.setPointerCapture(pointerId);
    } catch {
      /* ignore */
    }
  });

  item.addEventListener('pointermove', (e) => {
    if (!active || e.pointerId !== pointerId) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (axis === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';

      if (axis === 'y') {
        // Geser vertikal = scroll sidebar, bukan swipe.
        active = false;
        wrapper.classList.remove('swiping');
        if (panel) panel.style.transform = '';
        try {
          item.releasePointerCapture(pointerId);
        } catch {
          /* ignore */
        }
        return;
      }
      item.classList.add('dragging');
    }

    if (axis !== 'x') return;

    if (Math.abs(dx) > 4) moved = true;
    const offset = Math.max(-SWIPE_WIDTH, Math.min(0, base + dx));
    if (panel) panel.style.transform = `translateX(${SWIPE_WIDTH + offset}px)`;
  });

  const finish = (e) => {
    if (!active) return;
    if (e.pointerId !== undefined && e.pointerId !== pointerId) return;

    active = false;
    wrapper.classList.remove('swiping');
    item.classList.remove('dragging');
    try {
      item.releasePointerCapture(pointerId);
    } catch {
      /* ignore */
    }

    const dx = e.clientX - startX;
    const offset = Math.max(-SWIPE_WIDTH, Math.min(0, base + dx));

    if (offset <= -SWIPE_WIDTH * 0.4) {
      revealProjectActions(wrapper, item, project.id);
    } else {
      hideProjectActions(wrapper, item, project.id);
    }

    if (moved) {
      item.dataset.justDragged = '1';
      setTimeout(() => {
        item.dataset.justDragged = '0';
      }, 350);
    }
  };

  item.addEventListener('pointerup', finish);
  item.addEventListener('pointercancel', finish);
}

function renderProjects() {
  const list = $('projectList');
  list.textContent = '';

  if (openSwipeId && !state.data.projects.some((p) => p.id === openSwipeId)) {
    openSwipeId = null;
  }

  for (const project of state.data.projects) {
    const active = state.view === 'project' && project.id === state.projectId;
    const running = project.services.filter((s) => isActive(s.id)).length;

    const wrapper = el('div', 'project-swipe');
    wrapper.dataset.id = project.id;

    const item = el('div', `project-item${active ? ' active' : ''}`);
    item.setAttribute('role', 'button');
    item.tabIndex = 0;

    item.addEventListener('click', () => {
      if (item.dataset.justDragged === '1') return;
      if (wrapper.classList.contains('open')) {
        hideProjectActions(wrapper, item, project.id);
        return;
      }
      selectProject(project.id);
    });

    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (wrapper.classList.contains('open')) {
          hideProjectActions(wrapper, item, project.id);
        } else {
          selectProject(project.id);
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        revealProjectActions(wrapper, item, project.id);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        hideProjectActions(wrapper, item, project.id);
      }
    });

    const name = el('span', 'project-name', project.name);
    name.title = project.name;

    const count = el(
      'span',
      `project-count${running > 0 ? '' : ' idle'}`,
      running > 0 ? `${running} on` : String(project.services.length)
    );
    count.title =
      running > 0
        ? `${running} service berjalan`
        : `${project.services.length} service`;

    item.append(name, count);

    const actions = el('div', 'swipe-actions');

    const editBtn = el('button', 'swipe-action edit', '✎');
    editBtn.type = 'button';
    editBtn.title = 'Ubah projek';
    editBtn.setAttribute('aria-label', 'Ubah projek');
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllSwipes();
      openProjectModal(project);
    });

    const delBtn = el('button', 'swipe-action delete', '🗑');
    delBtn.type = 'button';
    delBtn.title = 'Hapus projek';
    delBtn.setAttribute('aria-label', 'Hapus projek');
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllSwipes();
      deleteProject(project);
    });

    actions.append(editBtn, delBtn);
    bindProjectSwipe(wrapper, item, project);

    wrapper.append(item, actions);

    if (openSwipeId === project.id) {
      wrapper.classList.add('open');
    }

    list.append(wrapper);
  }
}

function renderHeader() {
  const actions = $('projectActions');

  if (state.view === 'commands') {
    $('projectTitle').textContent = 'Command Linux';
    $('projectSub').textContent =
      'Simpan command Linux-mu, lalu jalankan kapan saja.';
    actions.hidden = true;
    return;
  }

  if (state.view === 'monitor') {
    $('projectTitle').textContent = 'Monitoring Sistem';
    $('projectSub').textContent =
      'btop berjalan otomatis selama aplikasi terbuka.';
    actions.hidden = true;
    return;
  }

  if (state.view === 'home') {
    const projects = state.data.projects;
    const services = projects.flatMap((p) => p.services);
    const running = services.filter((s) => isActive(s.id)).length;

    $('projectTitle').textContent = 'Beranda';
    $('projectSub').textContent = `${projects.length} projek · ${services.length} service · ${running} berjalan`;
    actions.hidden = true;
    return;
  }

  const project = currentProject();

  if (!project) {
    $('projectTitle').textContent = 'Belum ada projek';
    $('projectSub').textContent =
      'Tambahkan projek untuk mulai mengelola service.';
    actions.hidden = true;
    return;
  }

  actions.hidden = false;
  const running = project.services.filter((s) => isActive(s.id)).length;
  $('projectTitle').textContent = project.name;
  $('projectSub').textContent = `${project.services.length} service · ${running} berjalan`;
}

function renderServices() {
  const list = $('serviceList');
  const home = $('homeView');
  const logPanel = $('logPanel');
  const projectArea = $('projectArea');
  const commandsView = $('commandsView');
  const monitorView = $('monitorView');

  if (state.view === 'commands') {
    projectArea.hidden = true;
    commandsView.hidden = false;
    monitorView.hidden = true;
    logPanel.hidden = true;
    renderCommands();
    return;
  }

  if (state.view === 'monitor') {
    projectArea.hidden = true;
    commandsView.hidden = true;
    monitorView.hidden = false;
    logPanel.hidden = true;
    renderMonitor();
    return;
  }

  projectArea.hidden = false;
  commandsView.hidden = true;
  monitorView.hidden = true;

  if (state.view === 'home') {
    list.textContent = '';
    list.hidden = true;
    $('emptyState').hidden = true;
    logPanel.hidden = true;
    home.hidden = false;
    renderHome();
    return;
  }

  list.hidden = false;
  home.hidden = true;
  logPanel.hidden = false;
  list.textContent = '';

  const project = currentProject();

  if (!project) {
    showEmpty('no-project');
    return;
  }
  if (project.services.length === 0) {
    showEmpty('no-service');
    return;
  }

  $('emptyState').hidden = true;
  for (const service of project.services) {
    list.append(buildServiceCard(service));
  }
}

function renderHome() {
  const projects = state.data.projects;
  const services = projects.flatMap((p) => p.services);
  const running = services.filter((s) => isActive(s.id)).length;
  const errors = services.filter((s) => statusOf(s.id) === 'error').length;

  $('homeAddProjectBtn').hidden = projects.length === 0;
  $('statProjects').textContent = projects.length;
  $('statServices').textContent = services.length;
  $('statRunning').textContent = running;
  $('statErrors').textContent = errors;

  const list = $('homeProjects');
  list.textContent = '';

  if (projects.length === 0) {
    const empty = el('div', 'home-empty');
    empty.append(
      el('p', null, 'Belum ada projek. Tambahkan projek pertama untuk mulai.')
    );
    const btn = el('button', 'btn primary', '+ Tambah Projek');
    btn.addEventListener('click', () => openProjectModal());
    empty.append(btn);
    list.append(empty);
    return;
  }

  for (const project of projects) {
    const runningCount = project.services.filter((s) => isActive(s.id)).length;

    const row = el('div', 'home-project');
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.addEventListener('click', () => selectProject(project.id));
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') selectProject(project.id);
    });

    const main = el('div', 'home-project-main');
    main.append(
      el('span', 'home-project-name', project.name),
      el(
        'span',
        'home-project-meta',
        `${project.services.length} service${
          runningCount > 0 ? ` · ${runningCount} berjalan` : ''
        }`
      )
    );

    row.append(main, el('span', 'home-project-arrow', '→'));
    list.append(row);
  }
}

let emptyAction = () => {};

function showEmpty(mode) {
  const empty = $('emptyState');
  empty.hidden = false;
  const title = $('emptyTitle');
  const text = $('emptyText');
  const btn = $('emptyActionBtn');

  if (mode === 'no-project') {
    title.textContent = 'Belum ada projek';
    text.textContent =
      'Buat projek pertama kamu, lalu tambahkan service-service di dalamnya.';
    btn.textContent = '+ Tambah Projek';
    emptyAction = () => openProjectModal();
  } else {
    title.textContent = 'Belum ada service';
    text.textContent =
      'Tambahkan service pertama (Frontend, Backend, API, Storage, ...) ke projek ini.';
    btn.textContent = '+ Tambah Service';
    emptyAction = () => openServiceModal();
  }
}

function buildServiceCard(service) {
  const status = statusOf(service.id);
  const active = status === 'running' || status === 'starting';

  const card = el(
    'div',
    `service-card${state.serviceId === service.id ? ' selected' : ''}`
  );
  card.addEventListener('click', () => selectService(service.id));

  const statusWrap = el(
    'div',
    `svc-status${service.icon ? ' has-icon' : ''}`
  );
  if (service.icon) {
    statusWrap.append(el('span', 'svc-icon', service.icon));
  }
  statusWrap.append(el('span', `status-dot ${status}`));

  const info = el('div', 'svc-info');
  const top = el('div', 'svc-top');
  top.append(
    el('span', 'svc-name', service.name),
    el('span', `badge ${status}`, STATUS_LABEL[status] || status)
  );

  const meta = el('div', 'svc-meta');
  const pathEl = el('span', 'svc-path', service.path);
  pathEl.title = service.path;
  meta.append(pathEl, el('code', null, service.command));
  if (service.port) {
    meta.append(el('span', 'port-chip', `:${service.port}`));
  }
  if (service.link) {
    const linkBtn = el('button', 'link-chip', `↗ ${prettyLink(service.link)}`);
    linkBtn.title = `Buka ${service.link}`;
    linkBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const result = await bridge.openExternal(service.link);
      if (!result || !result.ok) {
        toast((result && result.error) || 'Gagal membuka link.', 'error');
      }
    });
    meta.append(linkBtn);
  }

  info.append(top, meta);

  const actions = el('div', 'svc-actions');

  const runBtn = el('button', 'btn btn-run', '▶ Run');
  runBtn.disabled = active;
  runBtn.title = 'Jalankan service';
  runBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    runService(service.id);
  });

  const restartBtn = el('button', 'btn btn-restart', '↻ Restart');
  restartBtn.disabled = !active;
  restartBtn.title = 'Restart service';
  restartBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    restartService(service.id);
  });

  const stopBtn = el('button', 'btn btn-stop', '■ Stop');
  stopBtn.disabled = !active;
  stopBtn.title = 'Hentikan service';
  stopBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    stopService(service.id);
  });

  const editBtn = el('button', 'btn tiny', '✎');
  editBtn.title = 'Ubah service';
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openServiceModal(service);
  });

  const delBtn = el('button', 'btn tiny danger', '🗑');
  delBtn.title = 'Hapus service';
  delBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteService(service);
  });

  actions.append(runBtn, restartBtn, stopBtn, editBtn, delBtn);
  card.append(statusWrap, info, actions);
  return card;
}

function renderLogHeader() {
  const service = findService(state.serviceId);
  const status = statusOf(state.serviceId);
  const dot = $('logDot');
  dot.className = `status-dot ${status}`;
  $('logServiceName').textContent = service ? `— ${service.name}` : '';
}

function renderLogContent() {
  const view = $('logView');
  const id = state.serviceId;

  if (!id) {
    view.textContent = 'Pilih service untuk melihat log…';
    return;
  }

  view.textContent =
    state.logs[id] || 'Belum ada log. Klik Run untuk memulai service.';
  view.scrollTop = view.scrollHeight;
}

function appendLog(id, text) {
  const clean = stripAnsi(text);
  if (!clean) return;

  const prev = state.logs[id] || '';
  let next = prev + clean;
  if (next.length > 450000) next = next.slice(next.length - 450000);
  state.logs[id] = next;

  if (state.serviceId !== id) return;

  const view = $('logView');
  const nearBottom =
    view.scrollHeight - view.scrollTop - view.clientHeight < 80;

  if (prev === '') {
    view.textContent = next;
  } else {
    view.appendChild(document.createTextNode(clean));
  }

  if (view.textContent.length > 500000) view.textContent = next;
  if (nearBottom || prev === '') view.scrollTop = view.scrollHeight;
}

// ---------------------------------------------------------------- actions

function goHome() {
  state.view = 'home';
  state.projectId = null;
  state.serviceId = null;
  renderAll();
}

function openCommands() {
  state.view = 'commands';
  renderAll();
}

function openMonitor() {
  state.view = 'monitor';
  renderAll();
}

function selectProject(id) {
  state.view = 'project';
  state.projectId = id;
  state.serviceId = null;
  renderProjects();
  renderHeader();
  renderServices();
  renderLogHeader();
  renderLogContent();
}

function selectService(id) {
  state.serviceId = id;
  renderServices();
  renderLogHeader();
  renderLogContent();
}

async function runService(id) {
  const result = await bridge.runService(id);
  if (!result || !result.ok) {
    toast((result && result.error) || 'Gagal menjalankan service.', 'error');
  }
}

async function stopService(id) {
  const result = await bridge.stopService(id);
  if (!result || !result.ok) {
    toast((result && result.error) || 'Gagal menghentikan service.', 'error');
  }
}

async function restartService(id) {
  const result = await bridge.restartService(id);
  if (!result || !result.ok) {
    toast((result && result.error) || 'Gagal me-restart service.', 'error');
  }
}

async function runAll() {
  const project = currentProject();
  if (!project || project.services.length === 0) {
    toast('Belum ada service untuk dijalankan.', 'error');
    return;
  }

  let started = 0;
  let failed = 0;
  for (const service of project.services) {
    if (isActive(service.id)) continue;
    const result = await bridge.runService(service.id);
    if (result && result.ok) started += 1;
    else failed += 1;
  }

  if (failed > 0) {
    toast(`${started} service dijalankan, ${failed} gagal.`, 'error');
  } else if (started > 0) {
    toast(`${started} service dijalankan.`, 'success');
  }
}

async function stopAll() {
  const project = currentProject();
  if (!project) return;

  let stopped = 0;
  for (const service of project.services) {
    if (!isActive(service.id)) continue;
    const result = await bridge.stopService(service.id);
    if (result && result.ok) stopped += 1;
  }
  if (stopped > 0) toast(`${stopped} service dihentikan.`, 'success');
}

async function deleteProject(project) {
  const ok = window.confirm(
    `Hapus projek "${project.name}" beserta semua service-nya?`
  );
  if (!ok) return;

  await bridge.deleteProject(project.id);
  if (state.projectId === project.id) {
    state.view = 'home';
    state.projectId = null;
    state.serviceId = null;
  }
  await reload();
  toast('Projek dihapus.', 'success');
}

async function deleteService(service) {
  const ok = window.confirm(`Hapus service "${service.name}"?`);
  if (!ok) return;

  await bridge.deleteService(service.id);
  if (state.serviceId === service.id) state.serviceId = null;
  delete state.logs[service.id];
  await reload();
  toast('Service dihapus.', 'success');
}

async function reload() {
  state.data = await bridge.getData();
  const projects = state.data.projects;

  if (state.view === 'project') {
    if (!projects.some((p) => p.id === state.projectId)) {
      state.view = 'home';
      state.projectId = null;
      state.serviceId = null;
    }
  }

  if (state.view === 'home') {
    state.projectId = null;
    state.serviceId = null;
  } else {
    const project = currentProject();
    const services = project ? project.services : [];
    if (!services.some((s) => s.id === state.serviceId)) {
      state.serviceId = null;
    }
  }

  renderAll();
}

// ---------------------------------------------------------------- modal

function closeModal() {
  $('modalRoot').textContent = '';
}

function makeInput(type, props = {}) {
  const input = document.createElement('input');
  input.type = type;
  Object.assign(input, props);
  return input;
}

function makeField(label, input, hint) {
  const wrap = el('label', 'field');
  wrap.append(el('span', null, label), input);
  if (hint) wrap.append(el('small', null, hint));
  return wrap;
}

function makeIconField(selected, onChange) {
  const wrap = el('div', 'field');
  wrap.append(el('span', null, 'Ikon service'));

  const grid = el('div', 'icon-grid');
  const options = [
    { id: 'none', emoji: '', label: 'Tanpa ikon' },
    ...SERVICE_ICONS,
  ];

  for (const option of options) {
    const btn = el(
      'button',
      `icon-option${selected === option.emoji ? ' selected' : ''}`,
      option.emoji || '∅'
    );
    btn.type = 'button';
    btn.title = option.label;
    btn.dataset.icon = option.id;
    btn.addEventListener('click', () => {
      for (const child of grid.children) child.classList.remove('selected');
      btn.classList.add('selected');
      onChange(option.emoji);
    });
    grid.append(btn);
  }

  wrap.append(grid);
  return wrap;
}

function mountModal(form, options) {
  closeModal();

  const overlay = el('div', 'modal-overlay');
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) closeModal();
  });

  const modal = el('div', 'modal');
  const head = el('div', 'modal-head');
  head.append(
    el('h2', null, options.title),
    el('p', null, options.subtitle || '')
  );

  const footer = el('div', 'modal-foot');
  const cancelBtn = el('button', 'btn ghost', 'Batal');
  cancelBtn.type = 'button';
  cancelBtn.addEventListener('click', closeModal);

  const submitBtn = el('button', 'btn primary', options.submitLabel || 'Simpan');
  submitBtn.type = 'submit';

  footer.append(cancelBtn, submitBtn);
  form.append(footer);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    try {
      const result = await options.onSubmit();
      if (result !== false) closeModal();
    } catch (err) {
      toast(err && err.message ? err.message : 'Terjadi kesalahan.', 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });

  modal.append(head, form);
  overlay.append(modal);
  $('modalRoot').append(overlay);

  const firstInput = form.querySelector('input, select, textarea');
  if (firstInput) setTimeout(() => firstInput.focus(), 30);
}

function openProjectModal(project) {
  const isEdit = Boolean(project);

  const nameInput = makeInput('text', {
    placeholder: 'Contoh: Sistem Gudang',
    value: isEdit ? project.name : '',
    required: true,
  });

  const form = el('form', 'modal-form');
  form.append(makeField('Nama projek', nameInput));

  mountModal(form, {
    title: isEdit ? 'Ubah projek' : 'Tambah projek',
    subtitle: 'Kelompokkan service dalam satu projek.',
    submitLabel: isEdit ? 'Simpan perubahan' : 'Tambah projek',
    onSubmit: async () => {
      const name = nameInput.value.trim();
      if (!name) throw new Error('Nama projek wajib diisi.');

      if (isEdit) {
        await bridge.updateProject(project.id, { name });
      } else {
        const created = await bridge.addProject(name);
        state.view = 'project';
        state.projectId = created.id;
        state.serviceId = null;
      }
      await reload();
      return true;
    },
  });
}

function openServiceModal(service) {
  const isEdit = Boolean(service);
  const project = currentProject();
  if (!project) {
    toast('Pilih projek terlebih dahulu.', 'error');
    return;
  }

  const nameInput = makeInput('text', {
    placeholder: 'Contoh: Frontend',
    value: isEdit ? service.name : '',
    required: true,
  });

  const pathInput = makeInput('text', {
    placeholder: '/home/user/projects/app/frontend',
    value: isEdit ? service.path : '',
    required: true,
  });

  const browseBtn = el('button', 'btn ghost', 'Pilih…');
  browseBtn.type = 'button';
  browseBtn.addEventListener('click', async () => {
    const folder = await bridge.pickFolder();
    if (!folder) return;
    pathInput.value = folder;
    if (!nameInput.value.trim()) {
      const base = folder.replace(/\/+$/, '').split('/').pop();
      if (base) nameInput.value = base;
    }
  });

  const pathRow = el('div', 'input-row');
  pathRow.append(pathInput, browseBtn);

  const commandInput = makeInput('text', {
    placeholder: 'npm run dev',
    value: isEdit ? service.command : 'npm run dev',
    required: true,
  });
  commandInput.setAttribute('list', 'command-suggestions');

  const datalist = document.createElement('datalist');
  datalist.id = 'command-suggestions';
  for (const command of COMMANDS) {
    const option = document.createElement('option');
    option.value = command;
    datalist.append(option);
  }

  const portInput = makeInput('number', {
    placeholder: '3000',
    min: '1',
    max: '65535',
    value: isEdit && service.port ? String(service.port) : '',
  });

  const linkInput = makeInput('text', {
    placeholder: 'http://localhost:3000',
    value: isEdit && service.link ? service.link : '',
  });

  let selectedIcon = isEdit && service.icon ? service.icon : '';
  const iconField = makeIconField(selectedIcon, (value) => {
    selectedIcon = value;
  });

  const form = el('form', 'modal-form');
  form.append(
    makeField('Nama service', nameInput),
    iconField,
    makeField('Folder service', pathRow, 'Command akan dijalankan di folder ini.'),
    makeField('Command', commandInput, 'Bisa pilih dari daftar atau ketik sendiri.'),
    makeField('Port (opsional)', portInput, 'Contoh: 3000.'),
    makeField(
      'Link (opsional)',
      linkInput,
      'Akan muncul sebagai tombol yang bisa diklik di kartu service.'
    ),
    datalist
  );

  mountModal(form, {
    title: isEdit ? 'Ubah service' : 'Tambah service',
    subtitle: `Projek: ${project.name}`,
    submitLabel: isEdit ? 'Simpan perubahan' : 'Tambah service',
    onSubmit: async () => {
      const name = nameInput.value.trim();
      const servicePath = pathInput.value.trim();
      const command = commandInput.value.trim();

      if (!name) throw new Error('Nama service wajib diisi.');
      if (!servicePath) throw new Error('Folder service wajib diisi.');
      if (!command) throw new Error('Command wajib diisi.');

      let port = null;
      if (portInput.value.trim() !== '') {
        port = Number(portInput.value);
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
          throw new Error('Port harus angka 1–65535.');
        }
      }

      let link = linkInput.value.trim();
      if (link) {
        if (!/^https?:\/\//i.test(link)) link = `http://${link}`;
        try {
          new URL(link);
        } catch {
          throw new Error('Link tidak valid.');
        }
      }

      const data = {
        name,
        path: servicePath,
        command,
        port,
        link: link || null,
        icon: selectedIcon || null,
      };

      if (isEdit) {
        await bridge.updateService(service.id, data);
      } else {
        const created = await bridge.addService(project.id, data);
        state.serviceId = created.id;
      }
      await reload();
      return true;
    },
  });
}

// ---------------------------------------------------------------- bind & init

async function restoreConfig() {
  const result = await bridge.importConfig();
  if (!result.ok) {
    if (!result.canceled) {
      toast(result.error || 'Gagal memulihkan konfigurasi.', 'error');
    }
    return;
  }

  state.statuses = {};
  state.view = 'home';
  state.projectId = null;
  state.serviceId = null;
  await reload();
  toast('Konfigurasi berhasil dipulihkan.', 'success');
}

async function backupConfig() {
  const result = await bridge.exportConfig();
  if (result.ok) {
    toast(`Backup disimpan: ${result.path}`, 'success');
  } else if (!result.canceled) {
    toast(result.error || 'Gagal membuat backup.', 'error');
  }
}

// ---------------------------------------------------------------- command linux

function renderCommands() {
  const list = $('commandList');
  const empty = $('commandEmpty');
  const commands = state.data.commands || [];

  list.textContent = '';
  empty.hidden = commands.length > 0;
  list.hidden = commands.length === 0;

  for (const command of commands) {
    list.append(buildSavedCommand(command));
  }

  updateCommandUi();
}

function buildSavedCommand(command) {
  const card = el('div', 'saved-command');
  const icon = el('div', 'saved-command-icon', '⌨️');

  const info = el('div', 'saved-command-info');
  info.append(
    el('strong', null, command.name),
    el('code', null, command.command)
  );

  const actions = el('div', 'saved-command-actions');

  const runBtn = el('button', 'btn btn-run', '▶ Run');
  runBtn.type = 'button';
  runBtn.title = 'Jalankan command';
  runBtn.addEventListener('click', () => runLinuxCommand(command.command));

  const editBtn = el('button', 'btn tiny', '✎');
  editBtn.type = 'button';
  editBtn.title = 'Ubah command';
  editBtn.addEventListener('click', () => openCommandModal(command));

  const delBtn = el('button', 'btn tiny danger', '🗑');
  delBtn.type = 'button';
  delBtn.title = 'Hapus command';
  delBtn.addEventListener('click', () => deleteSavedCommand(command));

  actions.append(runBtn, editBtn, delBtn);
  card.append(icon, info, actions);
  return card;
}

function openCommandModal(command) {
  const isEdit = Boolean(command);

  const nameInput = makeInput('text', {
    placeholder: 'Contoh: Buka AVD Pixel 7',
    value: isEdit ? command.name : '',
    required: true,
  });

  const commandInput = makeInput('text', {
    placeholder: 'emulator -avd Pixel_7_API_34',
    value: isEdit ? command.command : '',
    required: true,
  });

  const form = el('form', 'modal-form');
  form.append(
    makeField('Nama command', nameInput, 'Nama untuk mengenali command ini.'),
    makeField(
      'Command',
      commandInput,
      'Contoh AVD: emulator -avd <nama_avd> · wipe data: emulator -avd <nama_avd> -wipe-data'
    )
  );

  mountModal(form, {
    title: isEdit ? 'Ubah command' : 'Tambah command',
    subtitle: 'Simpan command untuk dijalankan kapan saja.',
    submitLabel: isEdit ? 'Simpan perubahan' : 'Tambah command',
    onSubmit: async () => {
      const name = nameInput.value.trim();
      const value = commandInput.value.trim();
      if (!name) throw new Error('Nama command wajib diisi.');
      if (!value) throw new Error('Command wajib diisi.');

      if (isEdit) {
        await bridge.updateCommand(command.id, { name, command: value });
      } else {
        await bridge.addCommand({ name, command: value });
      }
      await reload();
      return true;
    },
  });
}

async function deleteSavedCommand(command) {
  const ok = window.confirm(`Hapus command "${command.name}"?`);
  if (!ok) return;

  await bridge.deleteCommand(command.id);
  await reload();
  toast('Command dihapus.', 'success');
}

function updateCommandUi() {
  $('cmdDot').className = `status-dot ${commandStatus}`;
  $('cmdStopBtn').disabled = commandStatus !== 'running';
}

function appendCommandOutput(text) {
  const clean = stripAnsi(text);
  if (!clean) return;

  commandBuffer += clean;
  if (commandBuffer.length > 450000) {
    commandBuffer = commandBuffer.slice(-350000);
  }

  const out = $('cmdOutput');
  const nearBottom =
    out.scrollHeight - out.scrollTop - out.clientHeight < 80;

  out.appendChild(document.createTextNode(clean));
  if (out.textContent.length > 500000) out.textContent = commandBuffer;
  if (nearBottom) out.scrollTop = out.scrollHeight;
}

async function runLinuxCommand(command) {
  const cmd = String(command || '').trim();
  if (!cmd) return;

  commandBuffer = '';
  commandStatus = 'running';
  $('cmdOutput').textContent = `$ ${cmd}\n\n`;
  $('cmdTitle').textContent = cmd;
  updateCommandUi();

  const result = await bridge.runCommand(cmd);
  if (!result || !result.ok) {
    commandStatus = 'error';
    appendCommandOutput(
      `\n[gagal] ${(result && result.error) || 'Command gagal dijalankan.'}\n`
    );
    updateCommandUi();
  }
}

async function stopLinuxCommand() {
  await bridge.stopCommand();
}

async function clearCommandOutput() {
  await bridge.clearCommand();
  commandBuffer = '';
  $('cmdOutput').textContent = 'Pilih command untuk dijalankan…';
}

function runCustomCommand() {
  const input = $('cmdInput');
  const value = input.value.trim();
  if (!value) return;
  input.value = '';
  runLinuxCommand(value);
}

// ---------------------------------------------------------------- monitoring

function updateMonitorUi() {
  $('monitorDot').className = `status-dot ${
    monitorRunning ? 'running' : monitorError ? 'error' : 'stopped'
  }`;
  $('monitorLabel').textContent = monitorRunning
    ? 'btop berjalan'
    : monitorError
    ? 'btop error'
    : 'btop berhenti';
}

function ensureMonitorTerminal() {
  if (monitorTerm) {
    try {
      monitorFit.fit();
    } catch {
      /* ignore */
    }
    monitorTerm.focus();
    return;
  }

  const container = $('monitorTerminal');
  if (!container || typeof Terminal === 'undefined') {
    monitorError = 'Terminal (xterm.js) tidak termuat.';
    updateMonitorUi();
    return;
  }

  monitorTerm = new Terminal({
    cursorBlink: true,
    fontSize: 13,
    fontFamily:
      '"JetBrains Mono", "Fira Code", "DejaVu Sans Mono", monospace',
    scrollback: 2000,
    theme: {
      background: '#05070a',
      foreground: '#b7c6d8',
      cursor: '#2fd6ff',
      selectionBackground: 'rgba(47, 214, 255, 0.25)',
    },
  });

  monitorFit = new FitAddon.FitAddon();
  monitorTerm.loadAddon(monitorFit);
  monitorTerm.open(container);
  monitorFit.fit();

  if (monitorBuffer) monitorTerm.write(monitorBuffer);
  if (monitorError) {
    monitorTerm.write(`\r\n\x1b[31m[${monitorError}]\x1b[0m\r\n`);
  }

  monitorTerm.onData((data) => bridge.monitorInput(data));

  const observer = new ResizeObserver(() => {
    try {
      monitorFit.fit();
      bridge.monitorResize(monitorTerm.cols, monitorTerm.rows);
    } catch {
      /* ignore */
    }
  });
  observer.observe(container);

  monitorTerm.focus();
  bridge.monitorResize(monitorTerm.cols, monitorTerm.rows);
}

function renderMonitor() {
  ensureMonitorTerminal();
  updateMonitorUi();
}

async function restartMonitor() {
  const result = await bridge.monitorRestart();

  if (!result || !result.ok) {
    monitorRunning = false;
    monitorError = (result && result.error) || 'Gagal menjalankan btop.';
    if (monitorTerm) {
      monitorTerm.write(`\r\n\x1b[31m[${monitorError}]\x1b[0m\r\n`);
    }
    updateMonitorUi();
    return;
  }

  monitorBuffer = '';
  monitorError = null;
  monitorRunning = true;

  if (monitorTerm) {
    monitorTerm.reset();
    monitorTerm.focus();
    bridge.monitorResize(monitorTerm.cols, monitorTerm.rows);
  }

  updateMonitorUi();
}

function bindStatic() {
  $('brandHome').addEventListener('click', goHome);
  $('navCommands').addEventListener('click', openCommands);
  $('navMonitor').addEventListener('click', openMonitor);
  $('homeAddProjectBtn').addEventListener('click', () => openProjectModal());
  $('backupBtn').addEventListener('click', backupConfig);
  $('restoreBtn').addEventListener('click', restoreConfig);
  $('addProjectBtn').addEventListener('click', () => openProjectModal());
  $('addServiceBtn').addEventListener('click', () => openServiceModal());
  $('emptyActionBtn').addEventListener('click', () => emptyAction());
  $('runAllBtn').addEventListener('click', runAll);
  $('stopAllBtn').addEventListener('click', stopAll);

  $('clearLogBtn').addEventListener('click', async () => {
    if (!state.serviceId) {
      toast('Pilih service terlebih dahulu.', 'error');
      return;
    }
    await bridge.clearLogs(state.serviceId);
    state.logs[state.serviceId] = '';
    renderLogContent();
  });

  $('cmdStopBtn').addEventListener('click', stopLinuxCommand);
  $('cmdClearBtn').addEventListener('click', clearCommandOutput);
  $('cmdRunCustomBtn').addEventListener('click', runCustomCommand);
  $('addCommandBtn').addEventListener('click', () => openCommandModal());
  $('emptyAddCommandBtn').addEventListener('click', () => openCommandModal());
  $('cmdInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runCustomCommand();
    }
  });

  $('monitorRestartBtn').addEventListener('click', restartMonitor);
  $('monitorFocusBtn').addEventListener('click', () => {
    if (monitorTerm) monitorTerm.focus();
  });

  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest || !e.target.closest('.project-swipe')) {
      closeAllSwipes();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

async function init() {
  bindStatic();
  state.data = await bridge.getData();

  try {
    const version = await bridge.getVersion();
    $('appVersion').textContent = `v${version}`;
  } catch {
    /* abaikan */
  }

  renderAll();

  bridge.onLog(({ id, text }) => appendLog(id, text));

  bridge.onStatus(({ id, status, pid }) => {
    state.statuses[id] = { status, pid };
    renderProjects();
    renderHeader();
    if (state.view === 'home') {
      renderHome();
    } else {
      renderServices();
      renderLogHeader();
    }
  });

  bridge.onCommandData((text) => appendCommandOutput(text));

  bridge.onCommandStart(({ command }) => {
    if ($('cmdTitle').textContent !== command) {
      commandBuffer = '';
      $('cmdOutput').textContent = `$ ${command}\n\n`;
      $('cmdTitle').textContent = command;
    }
    commandStatus = 'running';
    updateCommandUi();
  });

  bridge.onCommandExit(({ code, signal }) => {
    commandStatus = code === 0 || signal === 'SIGTERM' ? 'stopped' : 'error';
    appendCommandOutput(
      `\n[selesai] ${signal ? `signal ${signal}` : `exit code ${code}`}\n`
    );
    updateCommandUi();
  });

  bridge.onCommandError(({ message }) => {
    commandStatus = 'error';
    appendCommandOutput(`\n[error] ${message}\n`);
    updateCommandUi();
  });

  bridge.onMonitorData((data) => {
    monitorBuffer += data;
    if (monitorBuffer.length > 2000000) {
      monitorBuffer = monitorBuffer.slice(-1500000);
    }
    if (monitorTerm) monitorTerm.write(data);
  });

  bridge.onMonitorExit(({ exitCode, signal }) => {
    monitorRunning = false;
    if (monitorTerm) {
      monitorTerm.write(
        `\r\n\x1b[31m[btop berhenti${
          signal ? ` (signal ${signal})` : ` (exit ${exitCode})`
        }]\x1b[0m\r\n`
      );
    }
    updateMonitorUi();
  });

  bridge
    .monitorReady()
    .then(async (result) => {
      if (result && result.ok) {
        monitorRunning = true;
        monitorError = null;
      } else {
        monitorRunning = false;
        monitorError = (result && result.error) || 'Gagal menjalankan btop.';
      }
      updateMonitorUi();

      // Setelah renderer reload, ambil buffer btop yang sudah berjalan di main.
      if (!monitorBuffer) {
        try {
          const status = await bridge.monitorStatus();
          if (status && status.buffer) monitorBuffer = status.buffer;
          if (monitorTerm && monitorBuffer) monitorTerm.write(monitorBuffer);
          if (monitorTerm && monitorError) {
            monitorTerm.write(
              `\r\n\x1b[31m[${monitorError}]\x1b[0m\r\n`
            );
          }
        } catch {
          /* ignore */
        }
      }
    })
    .catch((err) => {
      monitorRunning = false;
      monitorError = err.message;
      updateMonitorUi();
    });
}

init().catch((err) => {
  console.error(err);
  toast('Gagal memuat aplikasi: ' + err.message, 'error');
});
