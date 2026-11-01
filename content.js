(() => {
  if (window.__cngPlus) return;
  window.__cngPlus = true;

  // Campus = premier segment du chemin (/luminy/, ...)
  const seg = location.pathname.split('/').filter(Boolean)[0];
  if (!seg) return;
  const BASE = `/${seg}`;
  const API = `${BASE}/wp-json/wc/store/v1`;
  const body = document.body;
  const isShopPage =
    body.classList.contains('woocommerce-shop') ||
    body.classList.contains('tax-product_cat') ||
    body.classList.contains('home');
  const isSkipPage = /\/(cart|panier|checkout|commande|commander|mon-compte|my-account)\b/.test(location.pathname);
  if (isSkipPage) return;

  const F_ZONE = 'crouslocation-zonerecuperation-zone-recuperation';
  const F_DATE = 'crouslocation-zonerecuperation-date-recuperation';
  const F_HOUR = 'crouslocation-zonerecuperation-heure-recuperation';

  let cartChanged = false;
  const state = { products: [], cart: null, day: null, meal: 'MIDI', sel: {}, pickup: {} };

  async function api(path) {
    const r = await fetch(API + path, { credentials: 'same-origin' });
    const data = await r.json().catch(() => null);
    if (!r.ok) throw new Error((data && data.message) || `Erreur ${r.status}`);
    return data;
  }

  const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const decode = (s) => { const t = document.createElement('textarea'); t.innerHTML = s; return t.value; };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dmy = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const euro = (minor, unit = 2) => (Number(minor) / 10 ** unit).toFixed(2).replace('.', ',') + ' €';
  // "au Chalet (Entrée du RU de Luminy): 171 avenue…" -> "Chalet"
  const shortZone = (s) => cap(s.split(':')[0].replace(/\(.*?\)/g, '').replace(/^\s*(au|à la|à l'|aux|à)\s+/i, '').trim());
  const zoneDetail = (s) => { const m = s.split(':')[0].match(/\((.*?)\)/); return m ? m[1] : ''; };

  function parseName(name) {
    const n = decode(name);
    const meal = /\bsoir\b/i.test(n) ? 'SOIR' : /\bmidi\b/i.test(n) ? 'MIDI' : 'AUTRE';
    const m = n.match(/(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+(\d{1,2})\s+([a-zéû]+)\s+(\d{4})/i);
    let date = null, dayKey = 'autre', dayLabel = 'Autres';
    if (m) {
      const mi = MONTHS.indexOf(m[3].toLowerCase());
      if (mi >= 0) {
        date = new Date(+m[4], mi, +m[2]);
        dayKey = ymd(date);
        dayLabel = `${cap(m[1].toLowerCase())} ${+m[2]}`;
      }
    }
    const t = n.match(/\(([^)]+)\)\s*$/);
    const type = t ? t[1].trim().toLowerCase().replace('vg', 'végé') : '';
    return { full: n, meal, date, dayKey, dayLabel, type };
  }

  const TYPE_COLORS = {
    'végé': '#2f9e44', 'viande': '#c92a2a', 'pâtes': '#e67700', 'poisson': '#1971c2', 'oeuf': '#ae8a00', 'œuf': '#ae8a00'
  };
  const ATTR_LABEL = { entrees: 'Entrée', plats: 'Plat', dessert: 'Dessert' };
  const ATTR_ORDER = ['entrees', 'plats', 'dessert'];

  // Description HTML de la fiche -> { entrees: [...], plats: [...], dessert: [...], chaud, info }
  function parseDesc(html) {
    const out = { entrees: [], plats: [], dessert: [], chaud: false, info: '' };
    const doc = new DOMParser().parseFromString(html || '', 'text/html');
    let cur = null;
    doc.body.querySelectorAll('h1,h2,h3,h4,p,ul,ol').forEach((el) => {
      const txt = el.textContent.replace(/\s+/g, ' ').trim();
      if (!txt) return;
      if (el.tagName === 'UL' || el.tagName === 'OL') {
        if (cur) el.querySelectorAll('li').forEach((li) => {
          const t = li.textContent.replace(/\s+/g, ' ').trim();
          if (t) out[cur].push(t);
        });
        return;
      }
      if (/chauff/i.test(txt)) out.chaud = true;
      if (/^information/i.test(txt)) { out.info = txt.replace(/^information\s*:?\s*/i, ''); cur = null; }
      else if (/entr[ée]e/i.test(txt)) cur = 'entrees';
      else if (/\bplat/i.test(txt)) cur = 'plats';
      else if (/dessert/i.test(txt)) cur = 'dessert';
      else cur = null;
    });
    return out;
  }
  // Libellé détaillé d'une option : on prend la ligne de description correspondante
  function richLabel(desc, attrName, terms, idx) {
    const list = desc[attrName] || [];
    const norm = (x) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const t = norm(terms[idx].name).split(/[\s_-]+/).filter((w) => w.length > 2);
    const hit = list.find((l) => t.length && t.every((w) => norm(l).includes(w)));
    if (hit) return hit;
    return list.length === terms.length ? list[idx] : terms[idx].name;
  }

  // ---------- Récupération (plugin crouslocation) ----------
  // Les zones / horaires sont injectés en JS sur chaque fiche produit : on les lit.
  function grabVar(html, name) {
    const m = html.match(new RegExp('var ' + name + '\\s*=\\s*(.+?);\\s*\\n'));
    try { return m ? JSON.parse(m[1]) : null; } catch (e) { return null; }
  }

  // Jours de récupération possibles pour une zone (mêmes règles que le datepicker du site)
  function pickupDays(dispo, horaires) {
    const out = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (parseInt(dispo.typeDispo) === 2) {
      const d = new Date(dispo.dateDispo); d.setHours(0, 0, 0, 0);
      out.push(d);
    } else {
      for (let i = 0; i < 14 && out.length < 7; i++) {
        const d = new Date(today); d.setDate(d.getDate() + i);
        const jour = JOURS[d.getDay()];
        if (!horaires[jour] || !horaires[jour].ouvert) continue;
        if (parseInt(dispo.typeDispo) === 1 && dispo.jourSemaineDispo && dispo.jourSemaineDispo !== jour) continue;
        out.push(d);
      }
    }
    return out.filter((d) => d >= today && slotsFor(d, dispo, horaires).length);
  }

  function slotsFor(date, dispo, horaires) {
    const h = horaires[JOURS[date.getDay()]];
    if (!h || !h.ouvert) return [];
    const now = new Date();
    const res = [];
    for (const k in h.ouverture) {
      const c = h.ouverture[k];
      if (!c.de) continue;
      const cut = (c.cutoff !== '' ? c.cutoff : c.a).split(':');
      const lim = new Date(date.getTime());
      lim.setHours(parseInt(cut[0]), parseInt(cut[1]), 0, 0);
      const okSlot = parseInt(dispo.typeDispo) === 0 || dispo.creneaux == 0 || dispo.creneaux == k;
      if (okSlot && lim > now) res.push({ key: k, label: `${c.de}-${c.a}`, cutoff: c.cutoff });
    }
    return res;
  }

  async function loadPickup(p) {
    if (state.pickup[p.id]) return;
    state.pickup[p.id] = { loading: true };
    try {
      const html = await fetch(p.permalink, { credentials: 'same-origin' }).then((r) => r.text());
      const horaires = grabVar(html, 'horaires') || {};
      const dispos = grabVar(html, 'disposProduit') || [];
      // L'API ne renvoie pas toujours l'id de variante : on le lit dans le formulaire
      let variationId = p.variations && p.variations[0] ? p.variations[0].id : 0;
      const form = new DOMParser().parseFromString(html, 'text/html').querySelector('form.variations_form');
      try {
        const vars = JSON.parse(form.dataset.product_variations);
        const v = vars.find((x) => x.is_purchasable && x.is_in_stock) || vars[0];
        if (v) variationId = v.variation_id;
      } catch (e) {}
      const zones = dispos.map((d) => ({
        id: String(d.idZone),
        name: d.nomZone,
        days: pickupDays(d, horaires[d.idZone] || {}),
        dispo: d,
        horaires: horaires[d.idZone] || {}
      }));
      state.pickup[p.id] = { zones, variationId };
      // Pré-sélection quand il n'y a qu'un choix
      const sel = (state.sel[p.id] ||= {});
      const openZones = zones.filter((z) => z.days.length);
      if (!sel.zone && openZones.length === 1) sel.zone = openZones[0].id;
      autoPick(p);
    } catch (e) {
      state.pickup[p.id] = { error: true };
    }
    if (state.products.some((x) => x.id === p.id && x.meta.dayKey === state.day)) renderGrid();
  }

  function zoneOf(p) {
    const pk = state.pickup[p.id];
    const sel = state.sel[p.id] || {};
    return pk && pk.zones ? pk.zones.find((z) => z.id === sel.zone) : null;
  }

  function autoPick(p) {
    const sel = state.sel[p.id];
    const z = zoneOf(p);
    if (!z) { delete sel.date; delete sel.hour; return; }
    if (!sel.date || !z.days.some((d) => ymd(d) === sel.date)) {
      sel.date = z.days.length === 1 ? ymd(z.days[0]) : undefined;
      delete sel.hour;
    }
    const day = z.days.find((d) => ymd(d) === sel.date);
    const slots = day ? slotsFor(day, z.dispo, z.horaires) : [];
    if (sel.hour && !slots.some((s) => s.key === sel.hour)) delete sel.hour;
    if (!sel.hour && slots.length === 1) sel.hour = slots[0].key;
  }

  // ---------- UI ----------
  const host = document.createElement('div');
  host.id = 'cng-plus-host';
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: 'open' });

  root.innerHTML = `
  <style>
    :host { all: initial; }
    * { box-sizing: border-box; }
    .wrap {
      --bg: #f6f6f4; --card: #fff; --fg: #1d1d1f; --muted: #6b6b70; --line: #e4e4e0;
      --accent: #d6001c; --accent-fg: #fff; --chip: #f0f0ec; --chip-on: #1d1d1f; --chip-on-fg: #fff; --ok: #2f9e44;
      position: fixed; inset: 0; z-index: 2147483000; background: var(--bg); color: var(--fg);
      font: 15px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; overflow: auto;
      display: none;
    }
    @media (prefers-color-scheme: dark) {
      .wrap { --bg: #121214; --card: #1c1c1f; --fg: #f2f2f2; --muted: #9a9aa0; --line: #2c2c30;
        --chip: #2a2a2e; --chip-on: #f2f2f2; --chip-on-fg: #121214; }
    }
    .wrap.open { display: block; }
    header { position: sticky; top: 0; background: var(--bg); border-bottom: 1px solid var(--line); z-index: 2; }
    .bar, .nav, .layout { max-width: 1360px; margin: 0 auto; padding-left: 16px; padding-right: 16px; }
    .bar { padding-top: 14px; padding-bottom: 14px; display: flex; align-items: center; gap: 12px; }
    .logo { font-weight: 700; font-size: 18px; letter-spacing: -.01em; }
    .logo b { color: var(--accent); }
    .sp { flex: 1; }
    button { font: inherit; cursor: pointer; border: 0; border-radius: 10px; }
    .ghost { background: transparent; color: var(--muted); padding: 8px 10px; }
    .ghost:hover { color: var(--fg); }
    .cartbtn { background: var(--fg); color: var(--bg); padding: 8px 14px; font-weight: 600; display: flex; gap: 8px; align-items: center; }
    .badge { background: var(--accent); color: #fff; border-radius: 99px; min-width: 20px; height: 20px; padding: 0 6px; font-size: 12px; display: inline-grid; place-items: center; }
    .nav { padding-bottom: 12px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .days { display: flex; gap: 6px; overflow-x: auto; flex: 1; scrollbar-width: none; }
    .day { background: var(--chip); color: var(--fg); padding: 8px 14px; white-space: nowrap; font-weight: 500; }
    .day.on { background: var(--chip-on); color: var(--chip-on-fg); }
    .day small { opacity: .6; margin-left: 4px; }
    .seg { display: flex; background: var(--chip); border-radius: 10px; padding: 3px; }
    .seg button { background: transparent; color: var(--muted); padding: 6px 14px; border-radius: 8px; font-weight: 600; }
    .seg button.on { background: var(--card); color: var(--fg); box-shadow: 0 1px 2px rgba(0,0,0,.12); }
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 20px; padding-top: 20px; padding-bottom: 60px; align-items: start; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 14px; }
    .card { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
    .card.incart { border-color: var(--ok); }
    .type { align-self: flex-start; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; padding: 3px 9px; border-radius: 99px; color: #fff; }
    .plat { font-size: 19px; font-weight: 700; line-height: 1.25; }
    .plat::first-letter { text-transform: uppercase; }
    .grp label.t { display: block; font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; margin-bottom: 6px; }
    .opts { display: flex; flex-wrap: wrap; gap: 6px; }
    .opt { background: var(--chip); color: var(--fg); padding: 7px 11px; font-size: 14px; border-radius: 9px; text-align: left; }
    .opt.on { background: var(--chip-on); color: var(--chip-on-fg); }
    .pick { border-top: 1px dashed var(--line); padding-top: 12px; display: flex; flex-direction: column; gap: 10px; }
    .note { font-size: 13px; color: var(--muted); }
    .desc { font-size: 14px; color: var(--muted); margin-top: -6px; }
    .desc::first-letter { text-transform: uppercase; }
    .tag { display: inline-block; font-size: 12px; color: var(--muted); border: 1px solid var(--line); border-radius: 99px; padding: 2px 8px; margin-top: -4px; align-self: flex-start; }
    .info { background: var(--card); border: 1px solid var(--line); border-left: 3px solid #e67700; border-radius: 10px; padding: 10px 14px; font-size: 13px; color: var(--muted); margin-bottom: 14px; }
    .foot { display: flex; align-items: center; gap: 10px; margin-top: auto; padding-top: 4px; }
    .price { font-weight: 700; font-size: 17px; }
    .add { margin-left: auto; background: var(--accent); color: var(--accent-fg); padding: 10px 16px; font-weight: 700; }
    .add:disabled { opacity: .45; cursor: default; }
    .add.done { background: var(--ok); opacity: 1; }
    .empty, .loading { text-align: center; color: var(--muted); padding: 60px 0; }
    .side { position: sticky; top: 120px; background: var(--card); border: 1px solid var(--line); border-radius: 16px; display: flex; flex-direction: column; max-height: calc(100vh - 140px); }
    .dh { padding: 14px 16px; border-bottom: 1px solid var(--line); display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 16px; }
    .dl { flex: 1; overflow: auto; padding: 4px 16px; }
    .dl .empty { padding: 30px 0; }
    .dg { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin: 12px 0 2px; font-weight: 600; }
    .ci { padding: 10px 0; border-bottom: 1px solid var(--line); display: flex; gap: 10px; }
    .ci:last-child { border-bottom: 0; }
    .ci .n { font-weight: 600; }
    .ci .n::first-letter { text-transform: uppercase; }
    .ci .v, .ci .r { color: var(--muted); font-size: 13px; }
    .ci .r { margin-top: 2px; }
    .ci .x { margin-left: auto; background: transparent; color: var(--muted); font-size: 13px; padding: 2px 4px; align-self: flex-start; }
    .ci .x:hover { color: var(--accent); }
    .df { padding: 14px 16px; border-top: 1px solid var(--line); }
    .tot { display: flex; justify-content: space-between; font-weight: 700; font-size: 17px; margin-bottom: 12px; }
    .go { display: block; text-align: center; background: var(--accent); color: #fff; text-decoration: none; padding: 12px; border-radius: 10px; font-weight: 700; }
    .dclose, .cartbtn { display: none; }
    .drawer-bg { position: fixed; inset: 0; background: rgba(0,0,0,.35); display: none; z-index: 3; }
    @media (max-width: 900px) {
      .layout { grid-template-columns: 1fr; }
      .cartbtn, .dclose { display: flex; }
      .side { position: fixed; top: 0; right: 0; bottom: 0; width: min(420px, 100%); max-height: none; border-radius: 0; z-index: 4;
        transform: translateX(100%); transition: transform .2s; }
      .side.open { transform: none; }
      .drawer-bg.open { display: block; }
    }
    .toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: var(--fg); color: var(--bg);
      padding: 10px 16px; border-radius: 10px; z-index: 5; opacity: 0; transition: opacity .2s; pointer-events: none; max-width: 90vw; }
    .toast.show { opacity: 1; }
    .fab { position: fixed; bottom: 18px; right: 18px; z-index: 2147483000; background: #d6001c; color: #fff; font: 600 14px system-ui, sans-serif;
      padding: 12px 16px; border-radius: 99px; box-shadow: 0 4px 14px rgba(0,0,0,.25); }
  </style>
  <button class="fab" id="fab">Mode simple</button>
  <div class="wrap" id="wrap">
    <header>
      <div class="bar">
        <div class="logo">Crous &amp; Go<b>+</b></div>
        <div class="sp"></div>
        <button class="ghost" id="orig" title="Revenir au site d'origine">Site original</button>
        <button class="cartbtn" id="cartbtn">Panier <span class="badge" id="count">0</span></button>
      </div>
      <div class="nav">
        <div class="days" id="days"></div>
        <div class="seg" id="seg">
          <button data-m="MIDI">Midi</button><button data-m="SOIR">Soir</button>
        </div>
      </div>
    </header>
    <div class="layout">
      <main id="main"><div class="loading">Chargement des menus…</div></main>
      <aside class="side" id="side">
        <div class="dh">Mon panier <span class="badge" id="count2">0</span><span class="sp"></span><button class="ghost dclose" id="dclose">Fermer</button></div>
        <div class="dl" id="dlist"><div class="empty">Chargement…</div></div>
        <div class="df" id="dfoot"></div>
      </aside>
    </div>
    <div class="drawer-bg" id="dbg"></div>
    <div class="toast" id="toast"></div>
  </div>`;

  const $ = (id) => root.getElementById(id);
  const wrap = $('wrap');

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2600);
  }

  let loaded = false;
  function open() {
    wrap.classList.add('open');
    $('fab').style.display = 'none';
    document.documentElement.style.overflow = 'hidden';
    try { localStorage.setItem('cngPlusOff', '0'); } catch (e) {}
    if (!loaded) { loaded = true; load(); }
  }
  function close() {
    wrap.classList.remove('open');
    $('fab').style.display = '';
    document.documentElement.style.overflow = '';
    try { localStorage.setItem('cngPlusOff', '1'); } catch (e) {}
    if (cartChanged) location.reload();
  }
  $('fab').onclick = open;
  $('orig').onclick = close;

  // ---------- Données ----------
  async function load() {
    try {
      const [products, cart] = await Promise.all([fetchAllProducts(), api('/cart')]);
      state.products = products
        .filter((p) => p.is_purchasable && p.is_in_stock)
        .map((p) => ({ ...p, meta: parseName(p.name), desc: parseDesc(p.description) }));
      state.cart = cart;
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const keys = dayKeys();
      state.day = keys.find((k) => k === 'autre' || k >= ymd(today)) || keys[0];
      state.meal = state.day === ymd(today) && new Date().getHours() >= 14 ? 'SOIR' : 'MIDI';
      render();
    } catch (e) {
      $('main').innerHTML = `<div class="empty">Impossible de charger les menus : ${esc(e.message)}</div>`;
    }
  }

  async function fetchAllProducts() {
    let all = [], page = 1;
    while (page < 10) {
      const r = await api(`/products?per_page=100&page=${page}`);
      all = all.concat(r);
      if (r.length < 100) break;
      page++;
    }
    return all;
  }

  function dayKeys() {
    const set = new Set(state.products.map((p) => p.meta.dayKey));
    return [...set].sort((a, b) => (a === 'autre' ? 1 : b === 'autre' ? -1 : a.localeCompare(b)));
  }

  function cartItemOf(p) {
    if (!state.cart) return null;
    const vid = state.pickup[p.id] && state.pickup[p.id].variationId;
    return state.cart.items.find((i) =>
      i.id === p.id || i.id === vid || (p.variations || []).some((v) => v.id === i.id) || decode(i.name) === p.meta.full);
  }

  // ---------- Rendu ----------
  function render() {
    renderNav();
    renderGrid();
    renderCart();
  }

  function renderNav() {
    const keys = dayKeys();
    $('days').innerHTML = keys.map((k) => {
      const m = state.products.find((p) => p.meta.dayKey === k).meta;
      const n = state.cart ? state.cart.items.filter((i) => parseName(i.name).dayKey === k).length : 0;
      return `<button class="day ${k === state.day ? 'on' : ''}" data-k="${k}">${esc(m.dayLabel)}${n ? `<small>· ${n} ✓</small>` : ''}</button>`;
    }).join('');
    $('days').querySelectorAll('.day').forEach((b) => (b.onclick = () => { state.day = b.dataset.k; render(); }));
    const hasMeal = (m) => state.products.some((p) => p.meta.dayKey === state.day && p.meta.meal === m);
    $('seg').style.display = hasMeal('MIDI') || hasMeal('SOIR') ? '' : 'none';
    $('seg').querySelectorAll('button').forEach((b) => {
      b.classList.toggle('on', b.dataset.m === state.meal);
      b.disabled = !hasMeal(b.dataset.m);
      b.style.opacity = b.disabled ? '.4' : '';
      b.onclick = () => { state.meal = b.dataset.m; render(); };
    });
  }

  function attrsOf(p) {
    return [...(p.attributes || [])].sort((a, b) => {
      const ia = ATTR_ORDER.indexOf(a.name), ib = ATTR_ORDER.indexOf(b.name);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }

  const chip = (p, key, val, label, on) =>
    `<button class="opt ${on ? 'on' : ''}" data-p="${p.id}" data-a="${esc(key)}" data-v="${esc(val)}">${esc(label)}</button>`;

  function pickupHtml(p, sel) {
    const pk = state.pickup[p.id];
    if (!pk || pk.loading) return `<div class="pick"><div class="note">Chargement des créneaux de récupération…</div></div>`;
    if (pk.error) return `<div class="pick"><div class="note">Créneaux indisponibles — <a href="${esc(p.permalink)}" target="_blank">ouvrir la fiche</a></div></div>`;
    const zones = pk.zones.filter((z) => z.days.length);
    if (!zones.length) return `<div class="pick"><div class="note">Plus de créneau de récupération disponible pour cette formule.</div></div>`;
    let html = `<div class="grp"><label class="t">Zone de récupération</label><div class="opts">${
      zones.map((z) => chip(p, '_zone', z.id, shortZone(z.name), sel.zone === z.id)).join('')}</div>${
      zoneOf(p) && zoneDetail(zoneOf(p).name) ? `<div class="note" style="margin-top:4px">${esc(zoneDetail(zoneOf(p).name))}</div>` : ''}</div>`;
    const z = zoneOf(p);
    if (z) {
      html += `<div class="grp"><label class="t">Jour</label><div class="opts">${
        z.days.map((d) => chip(p, '_date', ymd(d), `${cap(JOURS[d.getDay()])} ${d.getDate()}/${d.getMonth() + 1}`, sel.date === ymd(d))).join('')}</div></div>`;
      const day = z.days.find((d) => ymd(d) === sel.date);
      if (day) {
        const slots = slotsFor(day, z.dispo, z.horaires);
        html += `<div class="grp"><label class="t">Heure</label><div class="opts">${
          slots.map((s) => chip(p, '_hour', s.key, s.label, sel.hour === s.key)).join('')}</div></div>`;
      }
    }
    return `<div class="pick">${html}</div>`;
  }

  function isReady(p) {
    const sel = state.sel[p.id] || {};
    return attrsOf(p).every((a) => sel[a.taxonomy]) && sel.zone && sel.date && sel.hour;
  }

  function renderGrid() {
    let list = state.products.filter((p) => p.meta.dayKey === state.day);
    const withMeal = list.filter((p) => p.meta.meal === state.meal);
    if (withMeal.length) list = withMeal;
    const order = ['végé', 'viande', 'poisson', 'pâtes', 'oeuf'];
    list.sort((a, b) => order.indexOf(a.meta.type) - order.indexOf(b.meta.type));
    if (!list.length) { $('main').innerHTML = '<div class="empty">Aucun menu disponible.</div>'; return; }

    list.forEach((p) => { if (!cartItemOf(p)) loadPickup(p); });

    const infos = [...new Set(list.map((p) => p.desc.info).filter(Boolean))];
    $('main').innerHTML = infos.map((i) => `<div class="info">${esc(i)}</div>`).join('') + `<div class="grid">${list.map((p) => {
      const attrs = attrsOf(p);
      const plat = attrs.find((a) => a.name === 'plats');
      const platDesc = plat && plat.terms.length === 1 ? richLabel(p.desc, 'plats', plat.terms, 0) : '';
      const shortDesc = platDesc && platDesc.length <= 45;
      const title = shortDesc ? platDesc : plat && plat.terms.length === 1 ? plat.terms[0].name : p.meta.full;
      const showDesc = platDesc && !shortDesc;
      const sel = (state.sel[p.id] ||= {});
      attrs.forEach((a) => { if (a.terms.length === 1) sel[a.taxonomy] = a.terms[0].slug; });
      const already = cartItemOf(p);
      const color = TYPE_COLORS[p.meta.type] || '#555';
      let inner;
      if (already) {
        const vals = (already.variation || []).map((v) => cap(v.value)).join(' · ');
        const rec = pickupText(already);
        inner = `<div class="note">${esc(vals)}${rec ? `<br>${esc(rec)}` : ''}</div>`;
      } else {
        inner = attrs.filter((a) => a.terms.length > 1).map((a) => `
          <div class="grp"><label class="t">${esc(ATTR_LABEL[a.name] || a.name)}</label>
            <div class="opts">${a.terms.map((t, i) => chip(p, a.taxonomy, t.slug, cap(richLabel(p.desc, a.name, a.terms, i)), sel[a.taxonomy] === t.slug)).join('')}</div>
          </div>`).join('') + pickupHtml(p, sel);
      }
      const ready = isReady(p);
      return `<div class="card ${already ? 'incart' : ''}">
        ${p.meta.type ? `<span class="type" style="background:${color}">${esc(p.meta.type)}</span>` : ''}
        <div class="plat">${esc(title)}</div>
        ${showDesc ? `<div class="desc">${esc(platDesc)}</div>` : ''}
        ${p.desc.chaud ? '<span class="tag">Peut être réchauffé sur place</span>' : ''}
        ${inner}
        <div class="foot">
          <span class="price">${euro(p.prices.price, p.prices.currency_minor_unit)}</span>
          <button class="add ${already ? 'done' : ''}" data-add="${p.id}" ${!ready || already ? 'disabled' : ''}>
            ${already ? 'Dans le panier ✓' : ready ? 'Ajouter' : 'Complète tes choix'}
          </button>
        </div>
      </div>`;
    }).join('')}</div>`;

    $('main').querySelectorAll('.opt').forEach((b) => (b.onclick = () => {
      const p = state.products.find((x) => x.id === +b.dataset.p);
      const sel = state.sel[p.id];
      const k = b.dataset.a;
      if (k === '_zone') sel.zone = b.dataset.v;
      else if (k === '_date') sel.date = b.dataset.v;
      else if (k === '_hour') sel.hour = b.dataset.v;
      else sel[k] = b.dataset.v;
      if (k === '_zone' || k === '_date') autoPick(p);
      renderGrid();
    }));
    $('main').querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => add(+b.dataset.add, b)));
  }

  // Ajout via le formulaire classique de la fiche produit : c'est le seul moyen
  // pour que le plugin enregistre zone / jour / heure de récupération.
  async function add(pid, btn) {
    const p = state.products.find((x) => x.id === pid);
    const sel = state.sel[pid];
    const z = zoneOf(p);
    btn.disabled = true; btn.textContent = 'Ajout…';
    try {
      const before = state.cart ? state.cart.items_count : 0;
      const fd = new FormData();
      attrsOf(p).forEach((a) => fd.append(`attribute_${a.taxonomy}`, sel[a.taxonomy]));
      fd.append(F_ZONE, z.id);
      const [y, m, d] = sel.date.split('-').map(Number);
      fd.append(F_DATE, dmy(new Date(y, m - 1, d)));
      fd.append(F_HOUR, sel.hour);
      fd.append('quantity', '1');
      fd.append('add-to-cart', String(p.id));
      fd.append('product_id', String(p.id));
      fd.append('variation_id', String(state.pickup[p.id].variationId || 0));
      const html = await fetch(p.permalink, { method: 'POST', body: fd, credentials: 'same-origin' }).then((r) => r.text());
      state.cart = await api('/cart');
      if (state.cart.items_count <= before) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const err = doc.querySelector('.woocommerce-error, .wc-block-components-notice-banner.is-error');
        throw new Error(err ? err.textContent.trim().replace(/\s+/g, ' ') : "L'ajout n'a pas fonctionné");
      }
      cartChanged = true;
      toast('Ajouté au panier');
      render();
    } catch (e) {
      toast(e.message);
      btn.disabled = false; btn.textContent = 'Ajouter';
    }
  }

  async function removeItem(key) {
    try {
      const r = await fetch(`${API}/cart/remove-item`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Nonce: await storeNonce() },
        body: JSON.stringify({ key })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || 'Erreur');
      state.cart = data;
      cartChanged = true;
      toast('Retiré du panier');
      render();
    } catch (e) { toast(e.message); }
  }

  async function storeNonce() {
    const r = await fetch(`${API}/cart`, { credentials: 'same-origin' });
    return r.headers.get('Nonce') || r.headers.get('X-WC-Store-API-Nonce') || '';
  }

  function pickupText(item) {
    const g = (re) => ((item.item_data || []).find((d) => re.test(d.name)) || {}).value || '';
    const zone = shortZone(decode(g(/zone/i)));
    const hour = g(/heure/i);
    const day = g(/jour/i);
    return [zone, day && hour ? `${day} · ${hour}` : day || hour].filter(Boolean).join(' — ');
  }

  function renderCart() {
    const c = state.cart;
    if (!c) return;
    $('count').textContent = c.items_count;
    $('count2').textContent = c.items_count;
    const items = c.items.map((i) => ({ i, m: parseName(i.name) }))
      .sort((a, b) => (a.m.dayKey + a.m.meal).localeCompare(b.m.dayKey + b.m.meal));
    let lastDay = null;
    $('dlist').innerHTML = items.length ? items.map(({ i, m }) => {
      const head = m.dayKey !== lastDay ? `<div class="dg">${esc(m.dayLabel)}</div>` : '';
      lastDay = m.dayKey;
      const plat = (i.variation || []).find((v) => /plat/i.test(v.attribute));
      const others = (i.variation || []).filter((v) => v !== plat).map((v) => cap(v.value)).join(' · ');
      const rec = pickupText(i);
      return `${head}<div class="ci"><div>
        <div class="n">${m.meal === 'SOIR' ? 'Soir' : 'Midi'} — ${esc(plat ? plat.value : m.type)}</div>
        <div class="v">${esc(others)}</div>
        ${rec ? `<div class="r">${esc(rec)}</div>` : ''}</div>
        <button class="x" data-k="${esc(i.key)}" title="Retirer">✕</button></div>`;
    }).join('') : '<div class="empty">Panier vide</div>';
    $('dlist').querySelectorAll('.x').forEach((b) => (b.onclick = () => removeItem(b.dataset.k)));
    const t = c.totals;
    $('dfoot').innerHTML = items.length
      ? `<div class="tot"><span>Total</span><span>${euro(t.total_price, t.currency_minor_unit)}</span></div>
         <a class="go" href="${BASE}/cart/">Valider la commande</a>`
      : '';
  }

  const toggleDrawer = (on) => { $('side').classList.toggle('open', on); $('dbg').classList.toggle('open', on); };
  $('cartbtn').onclick = () => toggleDrawer(true);
  $('dclose').onclick = () => toggleDrawer(false);
  $('dbg').onclick = () => toggleDrawer(false);

  let off = false;
  try { off = localStorage.getItem('cngPlusOff') === '1'; } catch (e) {}
  if (isShopPage && !off) open();
})();
