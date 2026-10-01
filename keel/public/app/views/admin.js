import { esc, formDialog, toast, icons, tableHtml, download, confirmDialog, date } from '../ui.js';
import { importDialog } from './projects.js';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export async function render(el, route, app, { title }) {
  title.innerHTML = '<h1>Administration</h1><div class="muted small">Users, calendars, organisation and data</div>';
  const tabs = [['users', 'Users & roles'], ['calendars', 'Calendars'], ['org', 'Organisation & data'], ['audit', 'Audit log']];
  const tab = tabs.some(([k]) => k === route.tab) ? route.tab : 'users';
  el.innerHTML = `<div class="tabs">${tabs.map(([k, l]) => `<a href="#/admin/${k}" class="${k === tab ? 'active' : ''}">${l}</a>`).join('')}</div><div id="adm"></div>`;
  const host = el.querySelector('#adm');
  if (tab === 'calendars') return calendars(host, app);
  if (tab === 'org') return org(host, app);
  if (tab === 'audit') return audit(host, app);
  return users(host, app);
}

async function users(el, app) {
  const isAdmin = app.can('admin');
  el.innerHTML = `<div class="card flush"><header><h3>Users</h3>${isAdmin ? `<button class="btn primary sm" id="add">${icons.plus} User</button>` : ''}</header>${tableHtml(app.boot.users, [
    { label: 'Name', render: (u) => `<b>${esc(u.name)}</b>` },
    { label: 'Email', render: (u) => esc(u.email) },
    { label: 'Role', render: (u) => esc(app.boot.roles[u.role] || u.role) },
    { label: 'Linked resource', render: (u) => esc(app.resource(u.resourceId)?.name || '—') },
  ], { rowAttrs: (u) => (isAdmin ? `class="clickable" data-id="${esc(u.id)}"` : '') })}
  <div style="padding:12px 16px" class="muted small"><b>Roles:</b> Administrator — everything incl. users · Project Manager — plans, approves timesheets · Planner — schedules, baselines, registers · Team member — books own time, read-only elsewhere.</div></div>`;
  const edit = async (u) => {
    const fields = [
      { name: 'name', label: 'Name', required: true },
      { name: 'email', label: 'Email', required: true, type: 'email' },
      { name: 'role', label: 'Role', type: 'select', options: Object.entries(app.boot.roles) },
      { name: 'resourceId', label: 'Linked resource (for timesheets)', type: 'select', options: [['', '—'], ...app.boot.resources.filter((r) => r.type === 'labour').map((r) => [r.id, r.name])] },
      { name: 'password', label: u ? 'New password (leave blank to keep)' : 'Password', type: 'password', required: !u },
    ];
    const r = await formDialog({
      title: u ? `Edit ${u.name}` : 'New user',
      fields,
      values: u || { role: 'member' },
      onSubmit: (d) => {
        if (!d.password) delete d.password;
        if (!d.resourceId) d.resourceId = null;
        return u ? app.api.put(`users/${u.id}`, d) : app.api.post('users', d);
      },
      extraHtml: u && u.id !== app.user.id ? '<div style="margin-top:12px"><button class="btn danger sm" type="button" id="deluser">Delete user</button></div>' : '',
      onMount: (root, close) =>
        root.querySelector('#deluser')?.addEventListener('click', async () => {
          if (!(await confirmDialog('Delete user', `Remove ${u.name}'s login? Their resource and timesheet history stay.`, { danger: true, ok: 'Delete' }))) return;
          await app.api.del(`users/${u.id}`);
          close('deleted');
        }),
    });
    if (r) {
      toast(r === 'deleted' ? 'User deleted' : 'User saved');
      await app.refreshBoot();
      app.rerender();
    }
  };
  el.querySelector('#add')?.addEventListener('click', () => edit(null));
  el.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => edit(app.boot.users.find((u) => u.id === tr.dataset.id))));
}

async function calendars(el, app) {
  const cals = app.boot.calendars;
  el.innerHTML = `<div class="card flush"><header><h3>Work calendars</h3><button class="btn primary sm" id="add">${icons.plus} Calendar</button></header>${tableHtml(cals, [
    { label: 'Name', render: (c) => `<b>${esc(c.name)}</b>${c.id === 'default' ? ' <span class="pill">default</span>' : ''}` },
    { label: 'Working days', render: (c) => (c.workDays || []).slice().sort().map((d) => DOW[d]).join(' ') },
    { label: 'Hours/day', num: true, render: (c) => esc(c.hoursPerDay) },
    { label: 'Holidays', render: (c) => `${(c.holidays || []).length} <span class="muted small">${(c.holidays || []).slice(0, 4).map((h) => date(h)).join(', ')}${(c.holidays || []).length > 4 ? '…' : ''}</span>` },
  ], { rowAttrs: (c) => `class="clickable" data-id="${esc(c.id)}"` })}
  <div style="padding:12px 16px" class="muted small">Typical EPC set-up: office 5-day with regional bank holidays, fabrication yard 6-day, offshore 7-day × 12h (2/3 rotations), site 5-day × 10h. Each activity and resource can use its own calendar.</div></div>`;
  const edit = async (c) => {
    const body = `<div class="form-grid"><label class="field full">Name<input name="name" value="${esc(c?.name || '')}"></label>
      <label class="field">Hours per day<input name="hoursPerDay" type="number" step="0.5" value="${esc(c?.hoursPerDay ?? 8)}"></label>
      <div class="field">Working days<div class="row">${DOW.map((d, i) => `<label class="row small"><input type="checkbox" data-d="${i}" ${(c?.workDays || [1, 2, 3, 4, 5]).includes(i) ? 'checked' : ''}>${d}</label>`).join('')}</div></div>
      <label class="field full">Holidays / non-working dates <span class="hint">one per line, YYYY-MM-DD</span><textarea name="holidays" rows="6">${esc((c?.holidays || []).join('\n'))}</textarea></label></div>`;
    const { modal } = await import('../ui.js');
    const r = await modal({
      title: c ? `Edit ${c.name}` : 'New calendar',
      body,
      actions: [
        { label: 'Cancel', value: null },
        {
          label: 'Save',
          primary: true,
          handler: async (root) => {
            const data = {
              name: root.querySelector('[name=name]').value,
              hoursPerDay: Number(root.querySelector('[name=hoursPerDay]').value || 8),
              workDays: [...root.querySelectorAll('[data-d]')].filter((x) => x.checked).map((x) => Number(x.dataset.d)),
              holidays: root.querySelector('[name=holidays]').value.split(/[\s,]+/).map((s) => s.trim()).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)),
            };
            if (!data.workDays.length) throw new Error('Select at least one working day');
            return c && c.id !== 'default-virtual' && app.boot.calendars.some((x) => x.id === c.id) ? app.api.put(`calendars/${c.id}`, data) : app.api.post('calendars', data);
          },
        },
      ],
    });
    if (r) {
      toast('Calendar saved — schedules using it recalculate automatically');
      await app.refreshBoot();
      app.rerender();
    }
  };
  el.querySelector('#add').onclick = () => edit(null);
  el.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => edit(cals.find((c) => c.id === tr.dataset.id))));
}

async function org(el, app) {
  const isAdmin = app.can('admin');
  el.innerHTML = `<div class="grid g2">
    <div class="card"><h3>Organisation</h3>
      <div class="form-grid" style="margin-top:12px"><label class="field">Company name<input id="oname" value="${esc(app.boot.org.name)}" ${isAdmin ? '' : 'disabled'}></label>
      <label class="field">Reporting currency<input id="ocur" value="${esc(app.boot.org.currency)}" maxlength="3" ${isAdmin ? '' : 'disabled'}></label></div>
      ${isAdmin ? '<button class="btn primary" id="osave" style="margin-top:12px">Save</button>' : ''}
    </div>
    <div class="card"><h3>Data</h3>
      <p class="muted small" style="margin-top:6px">Running in <b>${app.api.mode === 'demo' ? 'browser demo mode (data stays on this device)' : 'server mode (data file on your server, daily rolling backups)'}</b>.</p>
      <div class="stack" style="margin-top:12px">
        ${isAdmin ? `<div class="row"><button class="btn" id="backup">${icons.download} Download full backup (JSON)</button></div>` : ''}
        <div class="row"><button class="btn" id="imp">${icons.import} Import P6 XER / MS Project XML</button></div>
        ${app.api.mode === 'demo' ? '<div class="row"><button class="btn danger" id="reset">Reset demo data</button></div>' : ''}
      </div>
    </div>
  </div>`;
  el.querySelector('#osave')?.addEventListener('click', async () => {
    await app.api.put('org', { name: el.querySelector('#oname').value, currency: el.querySelector('#ocur').value });
    await app.refreshBoot();
    toast('Organisation saved');
    app.rerender();
  });
  el.querySelector('#backup')?.addEventListener('click', async () => download(`keel-backup-${new Date().toISOString().slice(0, 10)}.json`, await app.api.backup(), 'application/json'));
  el.querySelector('#imp').onclick = () => importDialog(app);
  el.querySelector('#reset')?.addEventListener('click', async () => {
    if (!(await confirmDialog('Reset demo', 'Discard all changes and reload the sample portfolio?', { danger: true, ok: 'Reset' }))) return;
    app.api.resetDemo();
    location.hash = '#/';
    location.reload();
  });
}

async function audit(el, app) {
  const list = await app.api.get('audit', { limit: 300 });
  el.innerHTML = `<div class="card flush">${tableHtml(list, [
    { label: 'When', render: (a) => `<span class="nowrap small">${esc(new Date(a.ts).toLocaleString('en-GB'))}</span>` },
    { label: 'User', render: (a) => esc(a.userName) },
    { label: 'Action', render: (a) => esc(a.action) },
    { label: 'Record', render: (a) => esc(a.entity) },
    { label: 'Detail', render: (a) => `<span class="small">${esc(a.summary || '')}</span>` },
  ], { empty: 'No activity recorded yet' })}</div>`;
}
