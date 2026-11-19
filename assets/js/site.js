// Fettler prototype: basket, shop filter, shade page, and the small animations.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const ROOT = document.body.dataset.root || '';
const page = document.body.dataset.page;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const money = (n) => '£' + (Number.isInteger(n) ? n : n.toFixed(2));
const DELIVERY = 20;

// ---------- basket (kept in this browser only) ----------
const KEY = 'fettler-basket-v1';
const basket = {
  read() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } },
  write(lines) { try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch {} paintBag(true); },
  add(line) {
    const lines = this.read();
    const hit = lines.find((l) => l.key === line.key);
    if (hit) hit.qty = Math.min(20, hit.qty + line.qty); else lines.push(line);
    this.write(lines);
  },
  count() { return this.read().reduce((n, l) => n + l.qty, 0); },
  lineTotal(l) { return (l.price + (l.addons || []).reduce((n, a) => n + a.price, 0)) * l.qty; },
  items() { return this.read().reduce((n, l) => n + this.lineTotal(l), 0); },
  delivery() { const ls = this.read(); return ls.length && ls.some((l) => l.ships !== false) ? DELIVERY : 0; },
};

function paintBag(bump) {
  const n = basket.count();
  const badge = $('[data-bag-n]'), bag = $('[data-bag]');
  if (!badge) return;
  badge.textContent = n; badge.hidden = n === 0;
  bag.setAttribute('aria-label', n ? `Basket, ${n} item${n > 1 ? 's' : ''}` : 'Basket, empty');
  if (bump && n && !reduce) { badge.classList.remove('bump'); void badge.offsetWidth; badge.classList.add('bump'); }
}
paintBag(false);
addEventListener('pageshow', () => paintBag(false));

let addedTimer;
function showAdded(line) {
  const box = $('[data-added]'); if (!box) return;
  const extras = (line.addons || []).map((a) => a.name).join(', ');
  box.innerHTML = `<p class="added-h"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>Added to your basket</p>
    <div class="added-row"><img src="${ROOT}assets/img/${line.photo}-480.webp" alt="" width="64" height="64"><p>${line.name}<small>${[line.finish && 'Finish: ' + line.finish, line.option, extras && 'With ' + extras].filter(Boolean).join(' · ')}</small></p></div>
    <p class="btns"><a class="btn btn-primary btn-s" href="${ROOT}basket.html">View basket</a><button class="btn btn-line btn-s" type="button" data-added-close>Keep shopping</button></p>`;
  box.hidden = false;
  clearTimeout(addedTimer);
  addedTimer = setTimeout(() => { box.hidden = true; }, 7000);
  $('[data-added-close]', box).addEventListener('click', () => { box.hidden = true; });
}

// ---------- header menu (phones) ----------
const menuBtn = $('.menu-btn'), nav = $('#nav');
if (menuBtn) {
  menuBtn.addEventListener('click', () => {
    const open = menuBtn.getAttribute('aria-expanded') !== 'true';
    menuBtn.setAttribute('aria-expanded', open); nav.classList.toggle('open', open);
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('open')) { menuBtn.click(); menuBtn.focus(); } });
}

// ---------- reveal on scroll ----------
const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -12% 0px' });
$$('[data-reveal], .scale').forEach((el) => io.observe(el));
// the space strip: lights come on one by one as it scrolls into view
const strip = $('[data-lights]');
if (strip) new IntersectionObserver((es, o) => es.forEach((e) => { if (e.isIntersecting) { strip.classList.add('lit'); o.disconnect(); } }), { threshold: 0.35 }).observe(strip);

// ---------- accessories: add straight from the grid ----------
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-add-acc]'); if (!b) return;
  const a = JSON.parse(b.dataset.addAcc);
  const line = { key: a.id, slug: '', name: a.name, price: a.price, photo: a.photo, qty: 1, addons: [] };
  basket.add(line); showAdded(line);
});

// ---------- home ----------
if (page === 'home') {
  const hero = $('[data-hero]'), pull = $('[data-pull]');
  const set = (on) => {
    hero.dataset.state = on ? 'on' : 'off';
    pull.setAttribute('aria-pressed', on);
    $('.pull-tx', pull).textContent = on ? 'Switch it off' : 'Switch it on';
    hero.dispatchEvent(new CustomEvent('lights', { detail: on }));
  };
  pull.addEventListener('click', () => {
    if (!reduce) { pull.classList.remove('tug'); void pull.offsetWidth; pull.classList.add('tug'); }
    set(hero.dataset.state !== 'on');
  });
  // show the shadow pattern once, unprompted, unless motion is reduced
  if (!reduce) setTimeout(() => { if (hero.dataset.state === 'off' && !hero.dataset.touched) set(true); }, 1600);
  pull.addEventListener('pointerdown', () => { hero.dataset.touched = '1'; });
  if (hero.dataset.glb && !reduce && matchMedia('(min-width: 700px)').matches) {
    const start = () => import('./hero.js').then((m) => m.mount(hero)).catch((err) => console.warn('3D hero not started, poster stays', err));
    ('requestIdleCallback' in window) ? requestIdleCallback(start, { timeout: 1500 }) : setTimeout(start, 400);
  }
}

// ---------- shop ----------
if (page === 'shop') {
  const SPACES = JSON.parse($('#spaces').textContent);
  const cards = $$('.card', $('[data-grid]'));
  const tabs = $$('.tab');
  const q = $('#q');
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9 ]/g, '');
  // forgiving: substring, or within two edits of any word in the name (for half-remembered names)
  const lev = (a, b) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
  const matches = (name, term) => {
    if (!term) return true;
    if (name.includes(term)) return true;
    return term.split(' ').filter(Boolean).every((t) => name.split(' ').some((w) => w.startsWith(t) || (t.length > 2 && Math.min(lev(w, t), lev(w.slice(0, t.length), t)) <= (t.length > 4 ? 2 : 1))));
  };
  const state = () => { const p = new URLSearchParams(location.search); return { space: p.get('space') || '', show: p.get('show') || '', q: p.get('q') || '' }; };
  function paint(animate) {
    const s = state();
    const tab = s.show || s.space || 'all';
    const space = SPACES.find((x) => x.id === s.space);
    const term = norm(q.value.trim());
    const kind = term ? 'shade' : s.show || 'shade'; // search looks through the shades (H6: find it again)
    let n = 0;
    cards.forEach((c) => {
      let ok = c.dataset.kind === kind;
      if (ok && term) ok = matches(norm(c.dataset.name), term);
      if (ok && !term && space) ok = c.dataset.spaces.split(' ').includes(space.id);
      c.hidden = !ok;
      if (ok) { c.style.setProperty('--n', n++); if (animate && !reduce) { c.classList.remove('in-anim'); void c.offsetWidth; c.classList.add('in-anim'); } }
    });
    tabs.forEach((t) => t.setAttribute('aria-current', String(!term && t.dataset.tab === tab)));
    const title = term ? `Results for "${q.value.trim()}"` : space ? space.heading : s.show === 'fittings' ? 'Bulbs and fixings' : s.show === 'more' ? 'Furniture and more' : 'All shades';
    $('[data-shop-title]').textContent = title;
    $('[data-shop-over]').textContent = space && !term ? 'Shop by space' : 'Shop';
    $('[data-shop-line]').textContent = term ? 'Searching every shade by name.' : space ? space.line : s.show === 'fittings' ? 'Fixings and LED bulbs that suit Fettler shades.' : s.show === 'more' ? 'A floor lamp, a coffee table and a T-shirt.' : "Sixteen shades, each in Golden Brown or Dark Wenge. Pick the space it's going in, or browse them all.";
    // the space's room illustration: shown in daylight, then the light comes on
    const art = $('[data-shop-art]');
    if (space && !term) {
      if (art.dataset.space !== space.id) {
        art.dataset.space = space.id; art.classList.remove('lit');
        $('[data-art-off]', art).src = `assets/3d/space-${space.id}-off.webp`;
        const on = $('[data-art-on]', art); on.onload = () => setTimeout(() => art.classList.add('lit'), reduce ? 0 : 350); on.src = `assets/3d/space-${space.id}-on.webp`;
      }
      art.hidden = false;
    } else art.hidden = true;
    const noun = kind === 'shade' ? 'shade' : 'item';
    $('[data-count]').textContent = `${n} ${noun}${n === 1 ? '' : 's'}`;
    $('[data-fit-note]').hidden = s.show !== 'fittings' || !!term;
    $('[data-empty]').hidden = n > 0;
    document.title = `${title} | Fettler Design`;
    const cur = tabs.find((t) => t.getAttribute('aria-current') === 'true');
    if (cur && animate) cur.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduce ? 'auto' : 'smooth' });
  }
  const go = (url) => {
    const run = () => { history.pushState(null, '', url); paint(true); };
    document.startViewTransition && !reduce ? document.startViewTransition(run) : run();
  };
  tabs.forEach((t) => t.addEventListener('click', (e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); q.value = ''; go(t.href); }));
  q.addEventListener('input', () => paint(false));
  $('[data-search]').addEventListener('submit', (e) => e.preventDefault());
  $('[data-clear]').addEventListener('click', () => { q.value = ''; go('shop.html'); q.focus(); });
  addEventListener('popstate', () => paint(true));
  q.value = state().q;
  paint(false);
}

// ---------- shade page ----------
if (page === 'product') {
  const P = JSON.parse($('#product').textContent);
  const form = $('[data-buy]');
  const imgs = $$('.pgal-main img'), thumbs = $$('[data-thumb]');
  const show = (id) => { imgs.forEach((i) => i.classList.toggle('is-on', i.dataset.photo === id)); thumbs.forEach((t) => (t.dataset.thumb === id ? t.setAttribute('aria-current', 'true') : t.removeAttribute('aria-current'))); };
  thumbs.forEach((t) => t.addEventListener('click', () => { show(t.dataset.thumb); $('[data-soon]').hidden = true; }));

  const finishOf = () => { const r = $('input[name=finish]:checked', form); return r ? r.value : ''; };
  function paintFinish(fromUser) {
    const f = finishOf(); if (!f) return;
    $('[data-finish-name]').textContent = f;
    const mine = (P.finishPhotos && P.finishPhotos[f]) || [];
    const soon = $('[data-soon]');
    if (mine.length) { show(mine[0]); soon.hidden = true; }
    else {
      const other = Object.keys(P.finishPhotos || {}).find((k) => k !== f && P.finishPhotos[k].length);
      show(other ? P.finishPhotos[other][0] : P.main);
      $('[data-soon-c]').style.background = P.hexes[f];
      $('[data-soon-n]').textContent = f + '.';
      $('[data-soon-shown]').textContent = other || 'the shade';
      soon.hidden = false;
    }
    if (fromUser) { const u = new URL(location.href); f === P.def ? u.searchParams.delete('finish') : u.searchParams.set('finish', P.ids[f]); history.replaceState(null, '', u); }
  }
  // a shared link can carry the finish
  const want = new URLSearchParams(location.search).get('finish');
  if (want) { const name = Object.keys(P.ids).find((n) => P.ids[n] === want); const r = name && $(`input[name=finish][value="${name}"]`, form); if (r) r.checked = true; }
  if (finishOf()) paintFinish(false);
  $$('input[name=finish]', form).forEach((r) => r.addEventListener('change', () => paintFinish(true)));

  const picked = (sel) => { const el = $(sel, form); if (!el) return null; const o = el.tagName === 'SELECT' ? el.selectedOptions[0] : (el.checked ? el : null); return o && o.value ? { id: o.value, name: o.dataset.name, price: +o.dataset.price } : null; };
  const addons = () => [picked('#fixing'), picked('input[name=adapter]'), picked('#bulb')].filter(Boolean);
  const qtyEl = $('#qty');
  const qty = () => Math.max(1, Math.min(20, parseInt(qtyEl.value, 10) || 1));
  function paintSum() {
    const ad = addons(), n = qty();
    const each = P.price + ad.reduce((t, a) => t + a.price, 0);
    const parts = [`${P.kind === 'shade' ? 'Shade' : P.short} ${money(P.price)}`, ...ad.map((a) => `${a.id.startsWith('fix') ? 'fixing' : a.id === 'adapter' ? 'adapter' : 'bulb'} ${money(a.price)}`)];
    $('[data-sum]').innerHTML = `<strong>${money(each * n)}</strong>${parts.length > 1 || n > 1 ? parts.join(' + ') + (n > 1 ? `, × ${n}` : '') : ''}`;
    const st = $('[data-sticky-sum]'); if (st) st.textContent = `${money(each * n)}${P.delivery ? ' + £' + P.delivery + ' delivery' : ''}`;
  }
  form.addEventListener('change', paintSum); form.addEventListener('input', paintSum);
  $$('[data-step]', form).forEach((b) => b.addEventListener('click', () => { qtyEl.value = Math.max(1, Math.min(20, qty() + +b.dataset.step)); paintSum(); }));
  paintSum();

  const label = $('[data-buy-label]'), buyBtn = $('.btn-buy');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = finishOf(), ad = addons(), opt = $('#option', form);
    const line = { key: [P.slug, f, opt ? opt.value : '', ...ad.map((a) => a.id)].join('|'), slug: P.slug, name: P.name, price: P.price, finish: f, option: opt ? `${opt.labels[0].textContent}: ${opt.value}` : '', photo: (f && P.finishPhotos && P.finishPhotos[f] && P.finishPhotos[f][0]) || P.main, qty: qty(), addons: ad, ships: P.delivery > 0 };
    basket.add(line); showAdded(line);
    buyBtn.classList.add('done'); label.textContent = 'Added';
    setTimeout(() => { buyBtn.classList.remove('done'); label.textContent = 'Add to basket'; }, 1800);
  });

  const share = $('[data-share]');
  share.addEventListener('click', async () => {
    const url = location.href, l = $('[data-share-label]');
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: document.title, url });
      else { await navigator.clipboard.writeText(url); l.textContent = 'Link copied'; setTimeout(() => { l.textContent = 'Share'; }, 2000); }
    } catch { l.textContent = 'Copy the address bar'; setTimeout(() => { l.textContent = 'Share'; }, 2500); }
  });

  // phones: keep Add to basket in view once the real button scrolls away
  const sticky = $('[data-sticky]');
  if (sticky) {
    sticky.hidden = false;
    new IntersectionObserver(([e]) => sticky.classList.toggle('show', !e.isIntersecting)).observe(buyBtn);
    $('[data-sticky-btn]').addEventListener('click', () => form.requestSubmit());
  }
}

// ---------- basket ----------
function lineHtml(l, i, editable) {
  const meta = [l.finish && `<li>Finish: <span>${l.finish}</span></li>`, l.option && `<li>${l.option}</li>`, ...(l.addons || []).map((a) => `<li>${a.name} <span>+${money(a.price)}</span></li>`)].filter(Boolean).join('');
  const name = l.slug ? `<a href="${ROOT}shades/${l.slug}.html">${l.name}</a>` : l.name;
  return `<article class="line" data-i="${i}"><img src="${ROOT}assets/img/${l.photo}-480.webp" alt="" width="112" height="112">
    <div><h2>${name}</h2><ul class="line-meta">${meta}</ul>
    ${editable ? `<div class="line-ctl"><div class="stepper"><button type="button" data-q="-1" aria-label="One fewer ${l.name}">−</button><input type="number" min="1" max="20" value="${l.qty}" aria-label="Quantity of ${l.name}" data-qty><button type="button" data-q="1" aria-label="One more ${l.name}">+</button></div><button type="button" class="linkish" data-remove>Remove</button></div>` : `<p class="line-meta">Quantity: ${l.qty}</p>`}</div>
    <p class="line-price">${money(basket.lineTotal(l))}</p></article>`;
}
if (page === 'basket') {
  const linesEl = $('[data-lines]'), sum = $('[data-summary]'), empty = $('[data-empty]');
  function paint() {
    const ls = basket.read();
    linesEl.innerHTML = ls.map((l, i) => lineHtml(l, i, true)).join('');
    sum.hidden = !ls.length; empty.hidden = !!ls.length;
    $('[data-items]').textContent = money(basket.items());
    $('[data-delivery]').textContent = basket.delivery() ? money(basket.delivery()) : 'Collection only';
    $('[data-total]').textContent = money(basket.items() + basket.delivery());
  }
  const setQty = (i, n) => { const ls = basket.read(); ls[i].qty = Math.max(1, Math.min(20, n)); basket.write(ls); paint(); };
  linesEl.addEventListener('click', (e) => {
    const row = e.target.closest('.line'); if (!row) return; const i = +row.dataset.i;
    if (e.target.closest('[data-q]')) setQty(i, basket.read()[i].qty + +e.target.closest('[data-q]').dataset.q);
    if (e.target.closest('[data-remove]')) { const done = () => { const ls = basket.read(); ls.splice(i, 1); basket.write(ls); paint(); }; if (reduce) done(); else { row.classList.add('out'); setTimeout(done, 280); } }
  });
  linesEl.addEventListener('change', (e) => { if (e.target.matches('[data-qty]')) setQty(+e.target.closest('.line').dataset.i, parseInt(e.target.value, 10) || 1); });
  paint();
}

// ---------- checkout placeholder and confirmation ----------
const sumRows = (items, delivery) => `<div><dt>Items</dt><dd>${money(items)}</dd></div><div><dt>${delivery ? 'UK delivery' : 'Collection'}</dt><dd>${delivery ? money(delivery) : 'Free'}</dd></div><div class="tot"><dt>Total</dt><dd>${money(items + delivery)}</dd></div>`;
if (page === 'checkout') {
  if (!basket.read().length) location.replace('basket.html');
  $('[data-co-sum]').innerHTML = sumRows(basket.items(), basket.delivery());
  $('[data-place]').addEventListener('click', () => {
    const order = { no: 'F' + String(Date.now()).slice(-5), lines: basket.read(), items: basket.items(), delivery: basket.delivery() };
    sessionStorage.setItem('fettler-order', JSON.stringify(order));
    basket.write([]); location.href = 'confirmed.html';
  });
}
if (page === 'confirmed') {
  let o = null; try { o = JSON.parse(sessionStorage.getItem('fettler-order')); } catch {}
  if (o) {
    $('[data-order-no]').textContent = o.no;
    $('[data-conf-sum]').innerHTML = o.lines.map((l, i) => lineHtml(l, i, false)).join('') + `<dl>${sumRows(o.items, o.delivery)}</dl>`;
  }
}

// ---------- contact form (prototype: validates, sends nothing) ----------
if (page === 'contact') {
  const f = $('[data-contact]');
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    let first = null;
    [['email', (v) => /^\S+@\S+\.\S+$/.test(v)], ['message', (v) => v.trim().length > 1]].forEach(([n, ok]) => {
      const el = f.elements[n], bad = !ok(el.value), err = $(`[data-err=${n}]`, f);
      el.setAttribute('aria-invalid', bad); err.hidden = !bad; if (bad && !first) first = el;
    });
    if (first) { first.focus(); $('[data-done]').hidden = true; return; }
    $('[data-done]').hidden = false;
  });
}
