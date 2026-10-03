/* EnerTech Synergies — progressive enhancement. Every page works without JS. */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Header shadow on scroll */
  const header = $('[data-header]');
  if (header) {
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* Mobile navigation drawer */
  const nav = $('[data-nav]');
  const openBtn = $('[data-nav-open]');
  const setNav = (open) => {
    if (!nav) return;
    nav.classList.toggle('is-open', open);
    document.body.classList.toggle('nav-open', open);
    openBtn && openBtn.setAttribute('aria-expanded', String(open));
    if (open) { const first = $('.nav__link', nav); first && first.focus(); }
    else if (openBtn && nav.contains(document.activeElement)) openBtn.focus();
  };
  openBtn && openBtn.addEventListener('click', () => setNav(true));
  $$('[data-nav-close]').forEach((b) => b.addEventListener('click', () => setNav(false)));

  /* Dropdowns: click/tap toggles, hover opens on desktop, Esc closes */
  const dropdowns = $$('[data-dropdown]');
  const desktop = window.matchMedia('(min-width: 1101px)');
  const closeAll = (except) => dropdowns.forEach((d) => {
    if (d === except) return;
    d.classList.remove('is-open');
    $('button', d).setAttribute('aria-expanded', 'false');
  });
  dropdowns.forEach((d) => {
    const btn = $('button', d);
    let t;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = !d.classList.contains('is-open');
      closeAll(d);
      d.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
    });
    d.addEventListener('mouseenter', () => { if (!desktop.matches) return; clearTimeout(t); closeAll(d); d.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true'); });
    d.addEventListener('mouseleave', () => { if (!desktop.matches) return; t = setTimeout(() => { d.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); }, 160); });
    d.addEventListener('focusout', (e) => { if (desktop.matches && !d.contains(e.relatedTarget)) { d.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); } });
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('[data-dropdown]')) closeAll(); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = dropdowns.find((d) => d.classList.contains('is-open'));
    if (open) { closeAll(); $('button', open).focus(); }
    else if (nav && nav.classList.contains('is-open')) setNav(false);
  });

  /* Reveal on scroll: only elements that start below the fold animate in;
     everything in the first screen is visible immediately. */
  const revealEls = $$('.reveal, .lifecycle__stage');
  if ('IntersectionObserver' in window && !reduceMotion) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        en.target.classList.remove('is-pending');
        en.target.classList.add('is-visible');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealEls.forEach((el) => {
      if (el.getBoundingClientRect().top > window.innerHeight) el.classList.add('is-pending');
      io.observe(el);
    });
  } else {
    revealEls.forEach((el) => el.classList.add('is-visible'));
  }

  /* Count-up stats */
  const counters = $$('[data-count]');
  if (counters.length && 'IntersectionObserver' in window && !reduceMotion) {
    const run = (el) => {
      const target = parseFloat(el.dataset.count);
      const dur = 1400; const start = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased).toLocaleString('en-GB');
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { run(en.target); io.unobserve(en.target); } });
    }, { threshold: 0.6 });
    counters.forEach((el) => io.observe(el));
  }

  /* Sub-navigation active state */
  const subLinks = $$('.subnav a[href^="#"]');
  if (subLinks.length && 'IntersectionObserver' in window) {
    const map = new Map(subLinks.map((a) => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        subLinks.forEach((a) => a.classList.remove('is-active'));
        const a = map.get(en.target.id); a && a.classList.add('is-active');
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    map.forEach((_, id) => { const s = document.getElementById(id); s && io.observe(s); });
  }

  /* Project filter */
  const filterBar = $('[data-filter]');
  if (filterBar) {
    const items = $$('[data-category]');
    filterBar.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-value]');
      if (!btn) return;
      $$('button', filterBar).forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      const v = btn.dataset.value;
      let shown = 0;
      items.forEach((it) => {
        const match = v === 'all' || it.dataset.category.split(' ').includes(v);
        it.hidden = !match; if (match) shown++;
      });
      const status = $('[data-filter-status]');
      status && (status.textContent = `${shown} project${shown === 1 ? '' : 's'} shown`);
    });
  }

  /* Contact form: validation + AJAX submit to contact.php, with mailto fallback */
  const form = $('[data-contact-form]');
  if (form) {
    const status = $('[data-form-status]', form);
    const fields = $$('[data-validate]', form);
    const validate = (field) => {
      const input = $('input, select, textarea', field);
      let ok = input.checkValidity();
      if (input.type === 'checkbox') ok = input.checked;
      field.classList.toggle('has-error', !ok);
      input.setAttribute('aria-invalid', String(!ok));
      return ok;
    };
    fields.forEach((f) => {
      const input = $('input, select, textarea', f);
      input.addEventListener('blur', () => validate(f));
      input.addEventListener('input', () => f.classList.contains('has-error') && validate(f));
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const invalid = fields.filter((f) => !validate(f));
      if (invalid.length) { $('input, select, textarea', invalid[0]).focus(); return; }
      if (form.hasAttribute('data-preview')) {
        status.className = 'form-status is-success';
        status.textContent = 'Design preview: this form is not connected yet. On the live site, enquiries are emailed to info@enertechsynergies.com.';
        status.setAttribute('tabindex', '-1'); status.focus();
        return;
      }
      const btn = $('button[type="submit"]', form);
      const label = btn.innerHTML;
      btn.disabled = true; btn.textContent = 'Sending…';
      status.className = 'form-status';
      try {
        const res = await fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.error || 'Request failed');
        form.reset();
        status.className = 'form-status is-success';
        status.textContent = 'Thank you. Your enquiry has been received and one of our engineers will be in touch shortly.';
      } catch (err) {
        status.className = 'form-status is-error';
        status.innerHTML = 'Sorry, we couldn’t send your message just now. Please email <a href="mailto:info@enertechsynergies.com">info@enertechsynergies.com</a> or call <a href="tel:+441224025383">+44 (0)1224 025 383</a>.';
      } finally {
        btn.disabled = false; btn.innerHTML = label;
        status.setAttribute('tabindex', '-1'); status.focus();
      }
    });
  }
})();
