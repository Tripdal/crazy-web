(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = (iso) => new Date(iso).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' });
  const fmtTime = (iso) => {
    const d = new Date(iso);
    const today = new Date().toDateString() === d.toDateString();
    return today
      ? d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // Volání API: api('chat/groups') → /api.php?r=chat/groups
  async function api(route, opts = {}) {
    const res = await fetch('/api.php?r=' + route, {
      method: opts.method || 'GET',
      headers: opts.method === 'POST' ? { 'Content-Type': 'application/json', 'X-CV': '1' } : undefined,
      body: opts.method === 'POST' ? JSON.stringify(opts.body || {}) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'Něco se pokazilo.'), { status: res.status });
    return data;
  }

  // ---------------- Navigace ----------------
  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('nav--solid', scrollY > 30);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  $('#navToggle').addEventListener('click', () => {
    const open = nav.classList.toggle('nav--open');
    $('#navToggle').setAttribute('aria-expanded', open);
  });
  $$('#navLinks a, #navLinks button').forEach((a) => a.addEventListener('click', () => nav.classList.remove('nav--open')));
  $('#year').textContent = new Date().getFullYear();

  // ---------------- Obsah webu ----------------
  const ICONS = {
    mail: '<path d="M3 5h18v14H3z" fill="none" stroke="currentColor" stroke-width="2"/><path d="m3 6 9 7 9-7" fill="none" stroke="currentColor" stroke-width="2"/>',
    phone: '<path fill="currentColor" d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z"/>',
    pin: '<path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"/>',
    clock: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2"/>',
    fb: '<path fill="currentColor" d="M14 8h3V4h-3c-2.8 0-4 1.7-4 4.3V10H7v4h3v8h4v-8h3l1-4h-4V8.5c0-.3.2-.5.5-.5z"/>',
    ig: '<rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.5" cy="6.5" r="1.3" fill="currentColor"/>',
  };
  const icon = (n) => `<span class="contact__icon"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">${ICONS[n]}</svg></span>`;

  let news = [];

  function renderSite({ settings: s, news: list }) {
    news = list;
    document.title = `${s.siteName} – taneční skupina`;
    $$('[data-site-name]').forEach((el) => (el.textContent = s.siteName));
    $$('[data-logo]').forEach((el) => (el.src = s.logo));
    $('link[rel=icon]').href = s.logo;
    $('#tagline').textContent = s.tagline;
    $('#heroBg').style.backgroundImage = s.heroImage ? `url("${s.heroImage}")` : '';
    $('#about').innerHTML = s.about;

    const items = [];
    if (s.trainingTimes) items.push(`<div class="contact__item">${icon('clock')}<div><small>Tréninky</small><span>${esc(s.trainingTimes)}</span></div></div>`);
    if (s.address) items.push(`<a class="contact__item" target="_blank" rel="noopener" href="https://mapy.cz/?q=${encodeURIComponent(s.address)}">${icon('pin')}<div><small>Kde nás najdete</small><span>${esc(s.address)}</span></div></a>`);
    if (s.contactEmail) items.push(`<a class="contact__item" href="mailto:${esc(s.contactEmail)}">${icon('mail')}<div><small>E‑mail</small><span>${esc(s.contactEmail)}</span></div></a>`);
    if (s.contactPhone) items.push(`<a class="contact__item" href="tel:${esc(s.contactPhone.replace(/\s/g, ''))}">${icon('phone')}<div><small>Telefon</small><span>${esc(s.contactPhone)}</span></div></a>`);
    if (s.facebookUrl) items.push(`<a class="contact__item" target="_blank" rel="noopener" href="${esc(s.facebookUrl)}">${icon('fb')}<div><small>Facebook</small><span>Sledujte nás</span></div></a>`);
    if (s.instagramUrl) items.push(`<a class="contact__item" target="_blank" rel="noopener" href="${esc(s.instagramUrl)}">${icon('ig')}<div><small>Instagram</small><span>Fotky a videa</span></div></a>`);
    $('#contact').innerHTML = items.join('');

    $('#newsList').innerHTML = list.length
      ? list.map((n, i) => `
        <button class="card ${i === 0 && n.image ? 'card--featured' : ''}" data-news="${n.id}">
          ${n.image ? `<img class="card__img" src="${esc(n.image)}" alt="" loading="lazy">` : `<div class="card__img card__img--empty">CRAZY</div>`}
          <div class="card__body">
            <time class="card__date">${fmtDate(n.createdAt)}${n.pinned ? '<span class="card__pin">📌 Připnuto</span>' : ''}</time>
            <h3 class="card__title">${esc(n.title)}</h3>
            <p class="card__excerpt">${esc(n.excerpt)}</p>
            <span class="card__more">Číst dál →</span>
          </div>
        </button>`).join('')
      : '<div class="news__empty">Zatím tu nejsou žádné aktuality. Brzy se to změní! 💃</div>';
  }

  const siteLoaded = api('site')
    .then(renderSite)
    .catch(() => ($('#newsList').innerHTML = '<div class="news__empty">Nepodařilo se načíst aktuality.</div>'));

  // ---------------- Detail aktuality ----------------
  const modal = $('#newsModal');
  function openNews(id) {
    const n = news.find((x) => x.id === id);
    if (!n) return;
    const contentHasCover = n.image && n.content.includes(n.image);
    $('#modalCover').hidden = !n.image || contentHasCover;
    $('#modalCover').src = n.image || '';
    $('#modalDate').textContent = fmtDate(n.createdAt);
    $('#modalTitle').textContent = n.title;
    $('#modalContent').innerHTML = n.content;
    modal.hidden = false;
    document.body.classList.add('no-scroll');
    $('.modal__box', modal).scrollTop = 0;
    $('.modal__close', modal).focus();
    history.replaceState(null, '', '#aktualita-' + id);
  }
  function closeNews() {
    modal.hidden = true;
    document.body.classList.remove('no-scroll');
    history.replaceState(null, '', '#aktuality');
  }
  $('#newsList').addEventListener('click', (e) => {
    const card = e.target.closest('[data-news]');
    if (card) openNews(card.dataset.news);
  });
  modal.addEventListener('click', (e) => e.target.closest('[data-close]') && closeNews());
  addEventListener('keydown', (e) => e.key === 'Escape' && !modal.hidden && closeNews());
  // Odkaz přímo na konkrétní aktualitu (#aktualita-ID)
  const deepLink = location.hash.match(/^#aktualita-(.+)$/);
  if (deepLink) siteLoaded.then(() => openNews(deepLink[1]));

  // ---------------- Chat ----------------
  const chat = $('#chat');
  const views = { join: $('#chatJoin'), groups: $('#chatGroups'), room: $('#chatRoom') };
  const state = { me: null, group: null, since: 0, timer: null, unread: 0 };

  function show(view) {
    Object.entries(views).forEach(([k, el]) => (el.hidden = k !== view));
    $('#chatBack').hidden = view !== 'room';
    if (view !== 'room') {
      $('#chatTitle').textContent = view === 'join' ? 'Vítej v chatu' : 'Vyber chat';
      $('#chatSubtitle').textContent = view === 'join' ? '' : 'Skupiny, kde si můžeš popovídat';
    }
  }

  function setOpen(open) {
    chat.classList.toggle('chat--open', open);
    $('#chatTab').setAttribute('aria-expanded', open);
    if (open) {
      state.unread = 0;
      updateBadge();
      if (!state.me) boot();
      setTimeout(() => (views.room.hidden ? $('input, button', $('.chat__view:not([hidden])')) : $('#compose textarea'))?.focus(), 350);
    }
  }
  $('#chatTab').addEventListener('click', () => setOpen(!chat.classList.contains('chat--open')));
  $('#chatClose').addEventListener('click', () => setOpen(false));
  $$('[data-open-chat]').forEach((b) => b.addEventListener('click', () => setOpen(true)));
  addEventListener('keydown', (e) => e.key === 'Escape' && modal.hidden && setOpen(false));

  function updateBadge() {
    let b = $('.badge', $('#chatTab'));
    if (!state.unread) return b?.remove();
    if (!b) $('#chatTab').insertAdjacentHTML('afterbegin', '<span class="badge"></span>');
    $('.badge', $('#chatTab')).textContent = state.unread;
  }

  let booted = false;
  async function boot() {
    if (booted) return;
    booted = true;
    state.me = await api('chat/me').catch(() => null);
    if (state.me) showGroups();
    else show('join');
  }

  views.join.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(views.join);
    $('#joinError').textContent = '';
    try {
      state.me = await api('chat/join', { method: 'POST', body: { name: f.get('name'), email: f.get('email'), consent: !!f.get('consent') } });
      showGroups();
    } catch (err) {
      $('#joinError').textContent = err.message;
    }
  });

  $('#chatLeave').addEventListener('click', async () => {
    await api('chat/leave', { method: 'POST' });
    views.join.name.value = state.me.name;
    views.join.email.value = state.me.email;
    state.me = null;
    show('join');
  });

  async function showGroups() {
    leaveRoom();
    $('#chatMe').textContent = state.me.name;
    show('groups');
    const groups = await api('chat/groups').catch(() => []);
    $('#groupList').innerHTML = groups.length
      ? groups.map((g) => `
        <li><button class="chat__group" data-group="${g.id}" data-name="${esc(g.name)}" data-desc="${esc(g.description)}">
          <span class="chat__avatar">${esc(g.name.slice(0, 1).toUpperCase())}</span>
          <div><strong>${esc(g.name)}</strong><small>${esc(g.description || (g.messageCount ? `${g.messageCount} zpráv` : 'Zatím žádné zprávy'))}</small></div>
        </button></li>`).join('')
      : '<li class="chat__none">Zatím tu nejsou žádné chaty. Brzy je vytvoříme!</li>';
  }

  $('#groupList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-group]');
    if (b) openRoom({ id: b.dataset.group, name: b.dataset.name, description: b.dataset.desc });
  });
  $('#chatBack').addEventListener('click', showGroups);

  const list = $('#messages');
  function msgHtml(m) {
    const mine = m.mine;
    return `<li class="msg ${mine ? 'msg--me' : ''} ${m.admin ? 'msg--admin' : ''}" data-id="${m.id}">
      <div class="msg__meta"><strong>${esc(mine ? 'Ty' : m.name)}</strong>${m.admin ? ' · tým' : ''} · ${fmtTime(m.createdAt)}</div>
      <div class="msg__bubble">${esc(m.text)}</div></li>`;
  }
  const scrollDown = () => (list.scrollTop = list.scrollHeight);

  // Nové zprávy se načítají opakovaně (polling) – funguje na každém hostingu.
  const POLL_OPEN = 3000;
  const POLL_CLOSED = 15000;

  function addMessages(msgs) {
    let added = 0;
    for (const m of msgs) {
      state.since = Math.max(state.since, m.seq);
      if ($(`[data-id="${m.id}"]`, list)) continue;
      $('.chat__none', list)?.remove();
      list.insertAdjacentHTML('beforeend', msgHtml(m));
      if (!m.mine) added++;
    }
    if (msgs.length) scrollDown();
    return added;
  }

  async function poll(first = false) {
    const group = state.group;
    if (!group) return;
    try {
      const data = await api(`chat/messages&group=${group.id}&since=${state.since}`);
      if (state.group !== group) return;
      if (first) list.innerHTML = data.messages.length ? '' : '<li class="chat__none">Buď první, kdo napíše! ✨</li>';
      // Zprávy smazané administrátorem zmizí i tady.
      const ids = new Set(data.ids);
      $$('[data-id]', list).forEach((el) => !ids.has(el.dataset.id) && el.remove());
      const added = addMessages(data.messages);
      if (!first && added && !chat.classList.contains('chat--open')) { state.unread += added; updateBadge(); }
    } catch (err) {
      if (state.group !== group) return;
      if (err.status === 404) { alert('Tento chat byl smazán.'); return showGroups(); }
      if (err.status === 401) { state.me = null; leaveRoom(); return show('join'); }
    }
    clearTimeout(state.timer);
    state.timer = setTimeout(poll, document.hidden || !chat.classList.contains('chat--open') ? POLL_CLOSED : POLL_OPEN);
  }

  function openRoom(group) {
    leaveRoom();
    state.group = group;
    state.since = 0;
    $('#chatTitle').textContent = group.name;
    $('#chatSubtitle').textContent = group.description || 'Skupinový chat';
    show('room');
    list.innerHTML = '<li class="chat__none">Načítám…</li>';
    poll(true);
  }

  function leaveRoom() {
    clearTimeout(state.timer);
    state.group = null;
  }

  // Po návratu na záložku / otevření chatu se hned podívá po nových zprávách.
  const pollNow = () => state.group && !document.hidden && (clearTimeout(state.timer), poll());
  document.addEventListener('visibilitychange', pollNow);
  $('#chatTab').addEventListener('click', pollNow);

  const compose = $('#compose');
  const ta = compose.text;
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); compose.requestSubmit(); }
  });
  compose.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = ta.value.trim();
    if (!text || !state.group) return;
    ta.value = '';
    ta.style.height = 'auto';
    try {
      await api('chat/send', { method: 'POST', body: { group: state.group.id, text } });
      // Načte novou zprávu i vše, co mezitím napsali ostatní.
      clearTimeout(state.timer);
      poll();
    } catch (err) {
      ta.value = text;
      alert(err.message);
      if (err.status === 401) { state.me = null; show('join'); }
    }
  });
})();
