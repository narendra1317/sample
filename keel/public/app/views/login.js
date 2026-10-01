import { esc, icons, toast } from '../ui.js';

const DEMO = [
  ['pm@demo.keel', 'Priya Nair', 'Project Manager — approves timesheets'],
  ['planner@demo.keel', 'Callum Reid', 'Planner — schedules, baselines, risk'],
  ['engineer@demo.keel', 'Fiona Grant', 'Team member — books weekly hours'],
  ['admin@demo.keel', 'Alex Morgan', 'Administrator — users & setup'],
];

export async function render(root, _route, app) {
  const demo = app.api.mode === 'demo';
  root.innerHTML = `<div class="login-wrap">
    <section class="login-hero">
      <div class="row" style="gap:12px">${icons.logo.replace('width="28" height="28"', 'width="40" height="40"')}<div style="font-size:22px;font-weight:700;color:#fff">Keel</div></div>
      <h1>One platform for the whole EPC lifecycle — plan, book, earn, deliver.</h1>
      <p style="color:#b8c7da;max-width:520px">Critical-path scheduling with the power of P6, the ease of MS Project, and everything they leave to spreadsheets:</p>
      <ul>
        <li>Weekly timesheets that drive actual cost, actual starts and progress</li>
        <li>Earned value &amp; earned schedule, live S-curves</li>
        <li>Monte Carlo schedule risk and DCMA 14-point quality checks built in</li>
        <li>Engineering MDR, procurement ROS tracking and change impact analysis</li>
        <li>Cross-project resource utilisation, week by week</li>
      </ul>
    </section>
    <section class="login-form">
      <div class="card">
        <h2 style="margin-bottom:4px">Sign in</h2>
        <p class="muted small">${demo ? 'Demo mode: pick a role below — no password needed.' : 'Use your company account.'}</p>
        <form id="login" class="stack" style="margin-top:12px">
          <label class="field">Email<input name="email" type="email" autocomplete="username" required></label>
          <label class="field ${demo ? 'hidden' : ''}">Password<input name="password" type="password" autocomplete="current-password" ${demo ? '' : 'required'}></label>
          <button class="btn primary" type="submit" style="width:100%;justify-content:center">Sign in</button>
        </form>
        <div class="demo-accounts" style="margin-top:18px">
          <div class="muted small">${demo ? 'Demo roles' : 'Demo accounts (password <span class="mono">keel-demo-2026</span>)'}</div>
          ${DEMO.map(([email, name, role]) => `<button class="btn" data-email="${esc(email)}"><span><b>${esc(name)}</b></span><span class="muted small">${esc(role)}</span></button>`).join('')}
        </div>
      </div>
    </section>
  </div>`;
  const form = root.querySelector('#login');
  const go = async (email, password) => {
    try {
      await app.api.login(email, password);
      await app.refreshBoot();
      root.innerHTML = '';
      if (!location.hash || location.hash === '#/') location.hash = app.user.role === 'member' ? '#/timesheet/mine' : '#/portfolio';
      app.rerender();
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    go(form.email.value, form.password.value);
  });
  root.querySelectorAll('[data-email]').forEach((b) =>
    b.addEventListener('click', () => {
      form.email.value = b.dataset.email;
      if (demo) go(b.dataset.email, '');
      else {
        form.password.value = 'keel-demo-2026';
        go(b.dataset.email, 'keel-demo-2026');
      }
    }),
  );
}
