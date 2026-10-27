// Критерии оценки (значения — data/ratings.json, шкала 0–10)
const CRIT = {
  taste: 'Вкусопередача',
  nicotine: 'Качество никотина',
  strength: 'Крепость',
  ice: 'Холодок',
};
let ratings = {};

const $ = s => document.querySelector(s);
const view = $('#view');
const dock = $('#dock');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let data = null;
let route = null;

// Инерционная прокрутка колёсиком/тачпадом; на телефоне остаётся нативная
// В Safari родная прокрутка (тачпад) и так инерционная — своя только добавила бы задержку
const isSafari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);
let lenis = null;
if (!reduced && window.Lenis && !isSafari) {
  lenis = new window.Lenis({ lerp: 0.075, smoothWheel: true });
  const raf = t => { lenis.raf(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const wait = ms => new Promise(r => setTimeout(r, ms));
function plural(n, forms) {
  const m10 = n % 10, m100 = n % 100;
  return forms[m10 === 1 && m100 !== 11 ? 0 : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? 1 : 2];
}
const longest = s => Math.max(...s.split(/\s+/).map(w => w.length));
const flavorsWord = n => `${n} ${plural(n, ['вкус', 'вкуса', 'вкусов'])}`;
function updatedText(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const day = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `обновлено ${day} в ${time}`;
}

const fmt = n => n.toFixed(1).replace('.', ',');

// Шкалы характеристик: на карточке — компактные, на странице бренда — большой график с осью
// Строки графика: крепость — отдельной строкой на каждую группу (Light / Strong / …),
// значение — число или диапазон [от, до]
function rateRows(b, keys) {
  const r = ratings[b.slug];
  if (!r) return [];
  const rows = [];
  for (const k of keys) {
    const v = r[k];
    if (k === 'strength' && v && typeof v === 'object' && !Array.isArray(v)) {
      for (const g of b.groups || []) if (g.key in v) rows.push({ label: CRIT.strength, sub: g.label, v: v[g.key] });
    } else if (typeof v === 'number' || Array.isArray(v)) rows.push({ label: CRIT[k], v });
  }
  return rows;
}
const clamp10 = n => Math.max(0, Math.min(10, n));
const valText = v => Array.isArray(v) ? `${v[0]}–${v[1]}` : fmt(v);

function rateHTML(b, keys, big) {
  const rows = rateRows(b, keys);
  if (!rows.length) return '';
  const html = rows.map((row, i) => {
    const [lo, hi] = Array.isArray(row.v) ? row.v : [row.v, row.v];
    return `
    <div class="rate-row${lo !== hi ? ' range' : ''}" style="--v:${clamp10(hi) / 10};--lo:${hi ? clamp10(lo) / clamp10(hi) : 1};--i:${i}">
      <span class="rate-label">${row.label}${row.sub ? `<small>${esc(row.sub)}</small>` : ''}</span>
      <span class="rate-track"><span class="rate-fill"></span></span>
      <span class="rate-val" data-lo="${lo}" data-v="${hi}">${fmt(0)}</span>
    </div>`;
  }).join('');
  const axis = big ? `<div class="rate-axis" aria-hidden="true">${[0, 2, 4, 6, 8, 10].map(n => `<span>${n}</span>`).join('')}</div>` : '';
  const label = rows.map(row => `${row.label}${row.sub ? ' ' + row.sub : ''}: ${valText(row.v)} из 10`).join(', ');
  return `<div class="rate${big ? ' rate--big' : ''}" role="img" aria-label="${esc(label)}">${html}${axis}</div>`;
}

// Полоски заполняются, когда график появляется на экране; числа отсчитываются синхронно
function playRate(el) {
  el.classList.add('in');
  const big = el.classList.contains('rate--big');
  el.querySelectorAll('.rate-val').forEach((v, i) => {
    const target = +v.dataset.v, lo = +v.dataset.lo;
    const show = e => { v.textContent = lo !== target ? `${fmt(lo * e)}–${fmt(target * e)}` : fmt(target * e); };
    const done = () => { v.textContent = lo !== target ? `${lo}–${target}` : fmt(target); };
    if (reduced) { done(); return; }
    const t0 = performance.now() + (big ? 250 : 0) + i * 140, dur = big ? 2400 : 2000;
    const tick = now => {
      const k = Math.min(Math.max((now - t0) / dur, 0), 1);
      show(1 - Math.pow(1 - k, 4));
      if (k < 1) requestAnimationFrame(tick); else done();
    };
    requestAnimationFrame(tick);
  });
}
const rateIO = 'IntersectionObserver' in window
  ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { rateIO.unobserve(e.target); playRate(e.target); } }), { threshold: 0.35 })
  : null;
function observeRates() { view.querySelectorAll('.rate').forEach(el => rateIO ? rateIO.observe(el) : playRate(el)); }

function homeHTML() {
  const total = data.brands.reduce((s, b) => s + b.count, 0);
  const cards = data.brands.map((b, i) => {
    return `<a class="card lg-static" href="#/${b.slug}" style="--d:${Math.min(i, 15) * 35}ms">
      <span class="card-name" style="--n:${longest(b.name)}">${esc(b.name)}</span>
      <span class="card-meta">${flavorsWord(b.count)}</span>
      ${rateHTML(b, ['taste', 'nicotine', 'ice'], false)}
    </a>`;
  }).join('');
  return `
    <section class="home-hero">
      <p class="eyebrow">В наличии</p>
      <h1>Жидкости</h1>
      <p class="lead">${data.brands.length} ${plural(data.brands.length, ['бренд', 'бренда', 'брендов'])}, ${flavorsWord(total)}. Показываем только то, что сейчас есть на полке.</p>
    </section>
    <nav class="grid" aria-label="Бренды">${cards}</nav>`;
}

function brandHTML(b) {
  // Группы по крепости, в которых сейчас что-то есть. Две и больше — страница делится на разделы,
  // чипы переключают крепость; одна — как раньше, чипы по линейкам.
  const groups = (b.groups || []).map(g => ({ ...g, lines: b.lines.filter(l => l.group === g.key) })).filter(g => g.lines.length);
  const split = groups.length > 1;
  let i = 0;
  const lineHTML = (l, titled) => `
    <section class="line" data-line="${esc(l.group + '|' + l.name)}">
      ${titled ? `<h3>${esc(l.name)} <span>${l.flavors.length}</span></h3>` : ''}
      <ul class="flavors">${l.flavors.map(f => `<li style="--d:${Math.min(i++, 28) * 16}ms">${esc(f)}</li>`).join('')}</ul>
    </section>`;
  const count = g => g.lines.reduce((n, l) => n + l.flavors.length, 0);
  const lines = split
    ? groups.map(g => `
      <section class="group" data-group="${esc(g.key)}">
        <h2 class="group-title">${esc(g.label)} <span>${flavorsWord(count(g))}</span></h2>
        <div class="group-lines">${g.lines.map(l => lineHTML(l, g.lines.length > 1)).join('')}</div>
      </section>`).join('')
    : b.lines.map(l => lineHTML(l, b.lines.length > 1)).join('');
  const chipList = split ? groups.map(g => [`g:${g.key}`, g.label]) : b.lines.length > 1 ? b.lines.map(l => [`l:${l.group}|${l.name}`, l.name]) : [];
  const chips = chipList.length ? `<div class="chips${split ? ' chips--nav lg-regular' : ''}" role="group" aria-label="${split ? 'Крепость' : 'Линейки'}">
      <button class="chip on" data-f="" aria-pressed="true">Все</button>
      ${chipList.map(([f, name]) => `<button class="chip" data-f="${esc(f)}" aria-pressed="false">${esc(name)}</button>`).join('')}
    </div>` : '';
  return `
    <section class="brand-hero">
      <h1 class="brand-name" style="--n:${longest(b.name)}">${esc(b.name)}</h1>
    </section>
    <section class="panel lg-static">
      <div class="panel-head"><span class="count">${flavorsWord(b.count)}</span><span class="upd">${esc(updatedText(data.updated))}</span></div>
      ${ratings[b.slug] ? `<div class="spec"><p class="spec-title">Характеристики <span>шкала от 0 до 10</span></p>${rateHTML(b, ['taste', 'nicotine', 'strength', 'ice'], true)}</div>` : ''}
      ${chips}
      <div class="lines">${lines}</div>
    </section>`;
}

function dockHTML(idx) {
  const n = data.brands.length;
  const prev = data.brands[(idx - 1 + n) % n], next = data.brands[(idx + 1) % n];
  return `
    <a class="dock-btn side" href="#/${prev.slug}" aria-label="Предыдущий бренд: ${esc(prev.name)}"><span class="arr">‹</span><span class="dock-name">${esc(prev.name)}</span></a>
    <a class="dock-btn home" href="#/">Все бренды</a>
    <a class="dock-btn side" href="#/${next.slug}" aria-label="Следующий бренд: ${esc(next.name)}"><span class="dock-name">${esc(next.name)}</span><span class="arr">›</span></a>`;
}

// Плавная прокрутка к точке (Lenis на ПК, родная плавная — в Safari и на телефоне)
function smoothTo(y) {
  y = Math.max(0, y);
  if (lenis) lenis.scrollTo(y, { duration: 1.1, easing: t => 1 - Math.pow(1 - t, 4) });
  else window.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' });
}

let spy = null;
function bindChips() {
  const bar = view.querySelector('.chips');
  if (!bar) return;
  const chips = [...bar.querySelectorAll('.chip')];
  const setOn = c => chips.forEach(x => { const on = x === c; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });

  // Несколько крепостей: чипы — навигация. Все разделы на странице, нажатие плавно листает к нужному,
  // при прокрутке подсвечивается раздел, который сейчас на экране.
  if (bar.classList.contains('chips--nav')) {
    const groups = [...view.querySelectorAll('.group')];
    const offset = () => bar.offsetHeight + 36;
    let lockUntil = 0;
    chips.forEach(c => c.addEventListener('click', () => {
      const key = c.dataset.f.slice(2);
      const target = key ? groups.find(g => g.dataset.group === key) : view.querySelector('.lines');
      setOn(c);
      lockUntil = performance.now() + 1300;          // пока едем — подсветку не перебиваем
      smoothTo(target.getBoundingClientRect().top + scrollY - offset());
      c.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduced ? 'auto' : 'smooth' });
    }));
    let raf = 0;
    spy = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (performance.now() < lockUntil || !bar.isConnected) return;
        const line = offset() + 4;
        let cur = '';
        for (const g of groups) if (g.getBoundingClientRect().top <= line) cur = g.dataset.group;
        // долистали до конца, а последний раздел короткий и не дошёл до верха — всё равно он
        if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4 && groups.at(-1).getBoundingClientRect().top < innerHeight * 0.6) cur = groups.at(-1).dataset.group;
        const c = chips.find(x => x.dataset.f === (cur ? 'g:' + cur : ''));
        if (c && !c.classList.contains('on')) { setOn(c); c.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); }
      });
    };
    return;
  }

  // Одна крепость, несколько линеек: чипы фильтруют линейки, как раньше
  chips.forEach(c => c.addEventListener('click', () => {
    const f = c.dataset.f;
    setOn(c);
    view.querySelectorAll('.line').forEach(l => {
      const show = !f || l.dataset.line === f.slice(2);
      if (show && l.hidden) { l.hidden = false; l.classList.remove('appear'); void l.offsetWidth; l.classList.add('appear'); }
      else if (!show) l.hidden = true;
    });
  }));
}
addEventListener('scroll', () => spy && spy(), { passive: true });

async function render() {
  if (!data) return;                      // адрес сменили до загрузки данных — отрисуем после неё
  const slug = location.hash.replace(/^#\/?/, '');
  const idx = data.brands.findIndex(b => b.slug === slug);
  const b = data.brands[idx];
  const next = b ? b.slug : 'home';
  if (next === route) return;
  const first = route === null;
  route = next;

  if (!first && !reduced) { view.classList.add('out'); await wait(220); if (route !== next) return; }
  view.innerHTML = b ? brandHTML(b) : homeHTML();
  document.body.dataset.page = b ? 'brand' : 'home';
  document.title = b ? `${b.name} — жидкости в наличии` : 'Жидкости в наличии';
  dock.innerHTML = b ? dockHTML(idx) : '';
  dock.hidden = !b;
  lenis ? lenis.scrollTo(0, { immediate: true, force: true }) : window.scrollTo(0, 0);
  spy = null;
  if (b) bindChips();
  observeRates();

  view.classList.remove('out');
  view.classList.add('in');
  requestAnimationFrame(() => requestAnimationFrame(() => view.classList.remove('in')));
}

function step(dir) {
  if (!data || route === 'home' || route === null) return;
  const n = data.brands.length;
  const i = data.brands.findIndex(b => b.slug === route);
  location.hash = '#/' + data.brands[(i + dir + n) % n].slug;
}

addEventListener('keydown', e => {
  if (e.target.closest('input, textarea')) return;
  if (e.key === 'ArrowRight') step(1);
  else if (e.key === 'ArrowLeft') step(-1);
  else if (e.key === 'Escape' && route !== 'home') location.hash = '#/';
});

// Свайп влево/вправо на странице бренда — соседний бренд
let tx = 0, ty = 0, tt = 0;
addEventListener('touchstart', e => { const t = e.touches[0]; tx = t.clientX; ty = t.clientY; tt = Date.now(); }, { passive: true });
addEventListener('touchend', e => {
  if (route === 'home' || e.target.closest('.chips')) return;
  const t = e.changedTouches[0], dx = t.clientX - tx, dy = t.clientY - ty;
  if (Date.now() - tt < 600 && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) step(dx < 0 ? 1 : -1);
}, { passive: true });

addEventListener('hashchange', render);

(async () => {
  try {
    const r = await fetch('data/stock.json', { cache: 'no-cache' });
    data = await r.json();
    // Эти бренды — в самом низу главной (и в конце листания)
    const LAST = ['skala', 'monashka', 'bryzgi'];
    data.brands.sort((a, b) => LAST.indexOf(a.slug) - LAST.indexOf(b.slug));
    try { ratings = await (await fetch('data/ratings.json', { cache: 'no-cache' })).json(); } catch { ratings = {}; }
    $('#updated').textContent = updatedText(data.updated);
    render();
  } catch (e) {
    view.innerHTML = `<section class="home-hero"><h1>Не удалось загрузить</h1><p class="lead">Файл data/stock.json не найден.</p></section>`;
  }
})();
