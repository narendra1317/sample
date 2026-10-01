// Keel single-page app: bootstrap, layout, hash router.

import { initApi } from './api.js';
import { esc, icons, toast, setCurrency, $ } from './ui.js';

const views = {
  login: () => import('./views/login.js'),
  portfolio: () => import('./views/portfolio.js'),
  projects: () => import('./views/projects.js'),
  project: () => import('./views/project.js'),
  resources: () => import('./views/resources.js'),
  timesheet: () => import('./views/timesheets.js'),
  admin: () => import('./views/admin.js'),
};

export const app = {
  api: null,
  boot: null,
  get user() {
    return this.boot?.user;
  },
  can(perm) {
    const r = this.user?.role;
    if (perm === 'write') return ['admin', 'pm', 'planner'].includes(r);
    if (perm === 'approve') return ['admin', 'pm'].includes(r);
    if (perm === 'admin') return r === 'admin';
    return true;
  },
  async refreshBoot() {
    this.boot = await this.api.get('bootstrap');
    setCurrency(this.boot.org.currency);
    return this.boot;
  },
  navigate(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  },
  rerender: () => render(),
  resource(id) {
    return this.boot.resources.find((r) => r.id === id);
  },
  project(id) {
    return this.boot.projects.find((p) => p.id === id);
  },
};

function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [a, b, c] = parts;
  if (!a || a === 'portfolio') return { view: 'portfolio' };
  if (a === 'projects') return { view: 'projects' };
  if (a === 'p' && b) return { view: 'project', id: b, tab: c || 'overview' };
  if (a === 'resources') return { view: 'resources', tab: b || 'utilisation' };
  if (a === 'timesheet') return { view: 'timesheet', tab: b || 'mine', week: c };
  if (a === 'admin') return { view: 'admin', tab: b || 'users' };
  return { view: 'portfolio' };
}

function navHtml(route) {
  const u = app.user;
  const link = (href, label, icon, active) => `<a href="${href}" class="${active ? 'active' : ''}">${icon}<span>${esc(label)}</span></a>`;
  const projects = app.boot.projects.filter((p) => p.status !== 'closed');
  return `<div class="brand">${icons.logo}<div>Keel<small>EPC project controls</small></div></div>
  <nav aria-label="Main">
    ${link('#/portfolio', 'Portfolio', icons.portfolio, route.view === 'portfolio')}
    ${link('#/projects', 'Projects', icons.projects, route.view === 'projects')}
    ${projects
      .map((p) => `<a class="proj-link ${route.view === 'project' && route.id === p.id ? 'active' : ''}" href="#/p/${esc(p.id)}" title="${esc(p.name)}">${esc(p.code)}${p.scenarioOf ? ' <span class="muted small">what-if</span>' : ''}</a>`)
      .join('')}
    <div class="section">Time & people</div>
    ${link('#/timesheet/mine', 'My timesheet', icons.timesheet, route.view === 'timesheet' && route.tab === 'mine')}
    ${app.can('approve') ? link('#/timesheet/approvals', 'Approvals', icons.approve, route.view === 'timesheet' && route.tab === 'approvals') : ''}
    ${link('#/timesheet/reports', 'Hours reports', icons.report, route.view === 'timesheet' && route.tab === 'reports')}
    ${link('#/resources', 'Resources', icons.resources, route.view === 'resources')}
    ${app.can('write') ? `<div class="section">Setup</div>${link('#/admin', 'Administration', icons.admin, route.view === 'admin')}` : ''}
  </nav>
  <div class="nav-foot"><div class="who">${esc(u.name)}</div><div class="muted" style="color:#8fa3bd">${esc(app.boot.roles[u.role] || u.role)} · ${esc(app.boot.org.name)}</div>
  <div class="row" style="margin-top:8px;gap:12px"><button data-act="theme">${icons.theme.replace('<svg', '<svg width="14" height="14" style="vertical-align:-2px"')} Theme</button><button data-act="logout">Sign out</button></div></div>`;
}

let renderSeq = 0;
async function render() {
  const seq = ++renderSeq;
  const root = document.getElementById('app');
  if (!app.api.signedIn || !app.boot) {
    if (app.api.signedIn && !app.boot) {
      try {
        await app.refreshBoot();
        return render();
      } catch {
        /* fall through to login */
      }
    }
    const mod = await views.login();
    root.innerHTML = '';
    return mod.render(root, {}, app);
  }
  const route = parseRoute();
  let shell = root.querySelector('.shell');
  if (!shell) {
    root.innerHTML = `${app.api.mode === 'demo' ? `<div class="demo-banner">Demo mode — the full application is running in your browser with sample data saved on this device. <a href="#" data-act="reset-demo">Reset demo data</a></div>` : ''}<div class="shell"><aside class="nav"></aside><div class="main"><div class="topbar"><button class="btn ghost menu-btn" data-act="menu" aria-label="Menu">${icons.menu}</button><div class="title"></div><div class="spacer"></div><div class="actions row"></div></div><div class="content"></div></div></div>`;
    shell = root.querySelector('.shell');
    root.addEventListener('click', onShellClick);
  }
  shell.querySelector('.nav').innerHTML = navHtml(route);
  shell.querySelector('.nav').classList.remove('open');
  const content = shell.querySelector('.content');
  const title = shell.querySelector('.topbar .title');
  const actions = shell.querySelector('.topbar .actions');
  // Each navigation renders into its own off-screen container (laid out at full
  // width so charts measure correctly) and is swapped in only if it is still the
  // current route — a slow, superseded page can never overwrite a newer one.
  content.style.opacity = '0.55';
  content.style.position = 'relative';
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:24px;right:24px;top:20px;visibility:hidden;pointer-events:none';
  const newTitle = document.createElement('div');
  const newActions = document.createElement('div');
  newActions.className = 'row';
  content.append(host);
  const isCurrent = () => seq === renderSeq;
  const commit = () => {
    if (!isCurrent()) return host.remove();
    for (const c of [...content.children]) if (c !== host) c.remove();
    host.style.cssText = '';
    title.replaceChildren(newTitle);
    actions.replaceChildren(newActions);
    content.style.opacity = '';
  };
  try {
    const mod = await views[route.view]();
    if (!isCurrent()) return host.remove();
    await mod.render(host, route, app, { title: newTitle, actions: newActions, isCurrent });
    commit();
  } catch (e) {
    if (!isCurrent()) return host.remove(); // superseded by a newer navigation
    console.error(e);
    host.innerHTML = `<div class="card"><h3>Something went wrong</h3><p class="muted">${esc(e.message)}</p></div>`;
    commit();
  }
}

async function onShellClick(e) {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act;
  if (act === 'logout') {
    await app.api.logout();
    app.boot = null;
    location.hash = '#/';
    document.getElementById('app').innerHTML = '';
    render();
  } else if (act === 'menu') {
    $('.nav').classList.toggle('open');
  } else if (act === 'theme') {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('keel.theme', next);
    } catch {
      /* ignore */
    }
    render();
  } else if (act === 'reset-demo') {
    e.preventDefault();
    app.api.resetDemo();
    location.hash = '#/';
    location.reload();
  }
}

async function start() {
  try {
    const t = localStorage.getItem('keel.theme');
    if (t) document.documentElement.dataset.theme = t;
  } catch {
    /* ignore */
  }
  app.api = await initApi();
  window.addEventListener('hashchange', render);
  window.addEventListener('keel:signed-out', () => {
    if (!app.boot) return;
    app.boot = null;
    document.getElementById('app').innerHTML = '';
    toast('Your session has ended — please sign in again');
    render();
  });
  render();
}

start();
