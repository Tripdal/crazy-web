(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = (iso) => new Date(iso).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });
  const fmtDateTime = (iso) => new Date(iso).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  async function api(url, opts = {}) {
    const isForm = opts.body instanceof FormData;
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers: opts.body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body ? (isForm ? opts.body : JSON.stringify(opts.body)) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !url.endsWith('/login')) showLogin();
    if (!res.ok) throw new Error(data.error || 'Něco se pokazilo, zkuste to znovu.');
    return data;
  }

  // ---------------- Toasty a dialog ----------------
  function toast(text, type = 'ok') {
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.textContent = text;
    $('#toasts').append(el);
    while ($('#toasts').children.length > 3) $('#toasts').firstChild.remove();
    setTimeout(() => el.remove(), type === 'err' ? 5000 : 2600);
  }
  const fail = (err) => toast(err.message, 'err');

  function confirmDialog(title, text, yes = 'Smazat') {
    const d = $('#dialog');
    $('#dialogTitle').textContent = title;
    $('#dialogText').textContent = text;
    $('#dialogYes').textContent = yes;
    d.hidden = false;
    $('#dialogYes').focus();
    return new Promise((resolve) => {
      const done = (val) => { d.hidden = true; d.onclick = null; removeEventListener('keydown', onKey); resolve(val); };
      const onKey = (e) => e.key === 'Escape' && done(false);
      addEventListener('keydown', onKey);
      d.onclick = (e) => {
        const b = e.target.closest('[data-answer]');
        if (b) done(b.dataset.answer === 'yes');
        else if (e.target === d) done(false);
      };
    });
  }

  // ---------------- Nahrávání obrázků ----------------
  async function uploadFile(file, opts = '') {
    const fd = new FormData();
    fd.append('file', file);
    const { url } = await api('/api/admin/upload' + opts, { method: 'POST', body: fd });
    return url;
  }

  // Klikací / přetahovací pole pro obrázek.
  function dropzone(el, { onChange, query = '' }) {
    const input = $('input[type=file]', el);
    const img = $('img', el);
    const remove = $('.dropzone__remove', el);
    const set = (url) => {
      img.src = url || '';
      if (!url) img.removeAttribute('src');
      el.classList.toggle('dropzone--has', !!url);
    };
    const handle = async (file) => {
      if (!file) return;
      if (!file.type.startsWith('image/')) return toast('Vyberte prosím obrázek.', 'err');
      el.classList.add('dropzone--busy');
      try {
        const url = await uploadFile(file, query);
        set(url);
        onChange(url);
      } catch (err) { fail(err); }
      el.classList.remove('dropzone--busy');
    };
    el.addEventListener('click', (e) => { if (!e.target.closest('.dropzone__remove')) input.click(); });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    input.addEventListener('change', () => { handle(input.files[0]); input.value = ''; });
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('dropzone--over'); });
    el.addEventListener('dragleave', () => el.classList.remove('dropzone--over'));
    el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('dropzone--over'); handle(e.dataTransfer.files[0]); });
    remove?.addEventListener('click', () => { set(''); onChange(''); });
    return { set };
  }

  // ---------------- Editor (Quill) ----------------
  const TOOLBAR = [
    [{ header: [2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ color: [] }, { background: [] }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    [{ align: [] }],
    ['link', 'image', 'video'],
    ['blockquote'],
    ['clean'],
  ];
  const TITLES = {
    '.ql-bold': 'Tučně (Ctrl+B)', '.ql-italic': 'Kurzíva (Ctrl+I)', '.ql-underline': 'Podtržení (Ctrl+U)', '.ql-strike': 'Přeškrtnutí',
    '.ql-color': 'Barva textu', '.ql-background': 'Barva pozadí', '.ql-list[value=ordered]': 'Číslovaný seznam', '.ql-list[value=bullet]': 'Odrážky',
    '.ql-align': 'Zarovnání', '.ql-link': 'Vložit odkaz', '.ql-image': 'Vložit obrázek nebo GIF', '.ql-video': 'Vložit video z YouTube',
    '.ql-blockquote': 'Citace', '.ql-clean': 'Odstranit formátování', '.ql-header': 'Velikost nadpisu',
  };

  function createEditor(selector, placeholder) {
    let quill;
    const insertImages = async (index, files) => {
      for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        toast('Nahrávám obrázek…', 'info');
        try {
          const url = await uploadFile(file);
          quill.insertEmbed(index, 'image', url, 'user');
          quill.setSelection(++index, 0, 'user');
        } catch (err) { fail(err); }
      }
    };
    quill = new Quill(selector, {
      theme: 'snow',
      placeholder,
      modules: {
        toolbar: {
          container: TOOLBAR,
          handlers: {
            image() {
              const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', multiple: true });
              input.onchange = () => insertImages((quill.getSelection(true) || { index: quill.getLength() }).index, [...input.files]);
              input.click();
            },
          },
        },
        // Obrázky přetažené nebo vložené přes Ctrl+V se nahrají na server.
        uploader: {
          mimetypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
          handler: (range, files) => insertImages(range.index, files),
        },
      },
    });
    const toolbar = quill.getModule('toolbar').container;
    Object.entries(TITLES).forEach(([sel, t]) => $$(sel, toolbar).forEach((b) => b.setAttribute('title', t)));
    $('.ql-tooltip input', quill.container.parentNode)?.setAttribute('data-video', 'Odkaz na video');

    return {
      quill,
      get html() {
        if (!quill.getText().trim() && !quill.root.querySelector('img, iframe')) return '';
        return quill.getSemanticHTML().replace(/&nbsp;/g, ' ');
      },
      set html(v) {
        quill.setContents(quill.clipboard.convert({ html: v || '' }), 'silent');
        quill.history.clear();
      },
    };
  }

  // ---------------- Přihlášení ----------------
  let started = false;
  function showLogin() {
    $('#app').hidden = true;
    $('#login').hidden = false;
    $('#loginForm').password.focus();
  }

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button', e.target);
    btn.disabled = true;
    $('#loginError').textContent = '';
    try {
      await api('/api/admin/login', { method: 'POST', body: { password: e.target.password.value } });
      e.target.reset();
      start();
    } catch (err) {
      $('#loginError').textContent = err.message;
    }
    btn.disabled = false;
  });

  $('#logout').addEventListener('click', async () => {
    if (newsDirty() && !(await confirmDialog('Neuložené změny', 'Máte rozepsanou aktualitu. Opravdu se odhlásit?', 'Odhlásit'))) return;
    await api('/api/admin/logout', { method: 'POST' });
    location.reload();
  });

  // ---------------- Záložky ----------------
  function openTab(name) {
    $$('.tab').forEach((t) => t.classList.toggle('tab--active', t.dataset.tab === name));
    $$('.panel').forEach((p) => (p.hidden = p.dataset.panel !== name));
    history.replaceState(null, '', '#' + name);
    if (name === 'chats') loadGroups();
  }
  $$('.tab').forEach((t) => t.addEventListener('click', () => openTab(t.dataset.tab)));

  // =============================================================
  // AKTUALITY
  // =============================================================
  let newsItems = [];
  let current = null; // { id?, title, content, cover, published, pinned }
  let snapshot = '';
  let newsEditor;
  let coverZone;
  const form = $('#newsForm');

  const readForm = () => ({
    title: form.title.value.trim(),
    content: newsEditor.html,
    cover: current?.cover || '',
    published: form.published.checked,
    pinned: form.pinned.checked,
  });
  const newsDirty = () => !!current && JSON.stringify(readForm()) !== snapshot;

  function setStatus() {
    const s = $('#newsStatus');
    if (!current) return;
    if (newsDirty()) { s.textContent = '● Neuložené změny'; s.className = 'editor__status editor__status--dirty'; }
    else if (current.id) { s.textContent = `✓ Uloženo · naposledy ${fmtDateTime(current.updatedAt)}`; s.className = 'editor__status editor__status--saved'; }
    else { s.textContent = 'Nová aktualita'; s.className = 'editor__status'; }
  }

  function renderNewsList() {
    $('#newsList').innerHTML = newsItems.length
      ? newsItems.map((n) => `
        <li><button class="news-item ${current?.id === n.id ? 'news-item--active' : ''}" data-id="${n.id}">
          ${n.image ? `<img class="news-item__img" src="${esc(n.image)}" alt="">` : '<span class="news-item__img">📰</span>'}
          <span class="news-item__text">
            <strong>${esc(n.title)}</strong>
            <small>${fmtDate(n.createdAt)}</small>${n.published ? '' : '<span class="tag tag--draft">Koncept</span>'}${n.pinned ? '<span class="tag tag--pin">📌</span>' : ''}
          </span>
        </button></li>`).join('')
      : '<li class="news-none">Zatím žádné aktuality.</li>';
  }

  async function loadNews() {
    newsItems = await api('/api/admin/news');
    renderNewsList();
  }

  function editNews(item) {
    current = item ? { ...item } : { title: '', content: '', cover: '', published: true, pinned: false };
    $('#newsEmpty').hidden = true;
    form.hidden = false;
    form.title.value = current.title;
    newsEditor.html = current.content;
    coverZone.set(current.cover);
    form.published.checked = current.published;
    form.pinned.checked = current.pinned;
    $('#deleteNews').hidden = !current.id;
    snapshot = JSON.stringify(readForm());
    setStatus();
    renderNewsList();
    if (!current.id) form.title.focus();
  }

  async function guardDirty() {
    return !newsDirty() || confirmDialog('Neuložené změny', 'Rozepsané změny se ztratí. Chcete pokračovat?', 'Zahodit změny');
  }

  $('#newNews').addEventListener('click', async () => { if (await guardDirty()) editNews(null); });
  $('#newsList').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-id]');
    if (!b || b.dataset.id === current?.id) return;
    if (await guardDirty()) editNews(newsItems.find((n) => n.id === b.dataset.id));
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = readForm();
    if (!data.title) return toast('Doplňte prosím nadpis.', 'err');
    if (!data.content) return toast('Napište prosím nějaký text.', 'err');
    const btn = $('button[type=submit]', form);
    btn.disabled = true;
    try {
      const saved = current.id
        ? await api(`/api/admin/news/${current.id}`, { method: 'PUT', body: data })
        : await api('/api/admin/news', { method: 'POST', body: data });
      await loadNews();
      editNews(saved);
      toast(saved.published ? 'Uloženo a zveřejněno 🎉' : 'Uloženo jako koncept');
    } catch (err) { fail(err); }
    btn.disabled = false;
  });

  $('#deleteNews').addEventListener('click', async () => {
    if (!current?.id) return;
    if (!(await confirmDialog('Smazat aktualitu?', `„${current.title}“ bude nenávratně odstraněna.`))) return;
    try {
      await api(`/api/admin/news/${current.id}`, { method: 'DELETE' });
      current = null;
      form.hidden = true;
      $('#newsEmpty').hidden = false;
      await loadNews();
      toast('Aktualita smazána');
    } catch (err) { fail(err); }
  });

  // Ctrl+S uloží
  addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's' && !form.hidden && !$('[data-panel=news]').hidden) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  addEventListener('beforeunload', (e) => { if (newsDirty()) e.preventDefault(); });

  // =============================================================
  // CHATY
  // =============================================================
  let groups = [];
  let drawerGroup = null;
  let editingGroup = null;

  async function loadGroups() {
    try { groups = await api('/api/admin/groups'); renderGroups(); } catch (err) { fail(err); }
  }

  function renderGroups() {
    $('#groups').innerHTML = groups.length
      ? groups.map((g) => editingGroup === g.id ? `
        <form class="group group__edit" data-edit="${g.id}">
          <input name="name" value="${esc(g.name)}" maxlength="60" required>
          <input name="description" value="${esc(g.description)}" placeholder="Popis" maxlength="200">
          <div class="group__edit-actions"><button class="btn btn--primary">Uložit</button><button type="button" class="btn btn--light" data-cancel>Zrušit</button></div>
        </form>` : `
        <div class="group">
          <div class="group__head">
            <span class="group__avatar">${esc(g.name.slice(0, 1).toUpperCase())}</span>
            <div><strong>${esc(g.name)}</strong><small>${g.messageCount} ${g.messageCount === 1 ? 'zpráva' : g.messageCount >= 2 && g.messageCount <= 4 ? 'zprávy' : 'zpráv'}${g.lastMessageAt ? ' · poslední ' + fmtDateTime(g.lastMessageAt) : ''}</small></div>
          </div>
          <p>${esc(g.description)}</p>
          <div class="group__actions">
            <button class="btn btn--light" data-act="open" data-id="${g.id}">💬 Zprávy</button>
            <button class="btn btn--light" data-act="edit" data-id="${g.id}">✏️ Upravit</button>
            <button class="btn btn--danger-ghost" data-act="delete" data-id="${g.id}">🗑 Smazat</button>
          </div>
        </div>`).join('')
      : '<div class="empty groups-empty"><div class="empty__icon">💬</div><h2>Zatím žádné chaty</h2><p>Vytvořte první skupinu formulářem výše – návštěvníci webu ji hned uvidí.</p></div>';
  }

  $('#groupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = $('button', f);
    btn.disabled = true;
    try {
      await api('/api/admin/groups', { method: 'POST', body: { name: f.name.value, description: f.description.value } });
      f.reset();
      toast('Skupina vytvořena');
      await loadGroups();
    } catch (err) { fail(err); }
    btn.disabled = false;
    f.name.focus();
  });

  $('#groups').addEventListener('click', async (e) => {
    if (e.target.closest('[data-cancel]')) { editingGroup = null; return renderGroups(); }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const g = groups.find((x) => x.id === b.dataset.id);
    if (b.dataset.act === 'edit') { editingGroup = g.id; renderGroups(); $('[data-edit] input').focus(); }
    if (b.dataset.act === 'open') openDrawer(g);
    if (b.dataset.act === 'delete') {
      if (!(await confirmDialog('Smazat skupinu?', `Skupina „${g.name}“ a všech ${g.messageCount} zpráv v ní bude nenávratně odstraněno.`))) return;
      try { await api(`/api/admin/groups/${g.id}`, { method: 'DELETE' }); toast('Skupina smazána'); loadGroups(); } catch (err) { fail(err); }
    }
  });

  $('#groups').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await api(`/api/admin/groups/${f.dataset.edit}`, { method: 'PUT', body: { name: f.name.value, description: f.description.value } });
      editingGroup = null;
      toast('Uloženo');
      loadGroups();
    } catch (err) { fail(err); }
  });

  async function openDrawer(g) {
    drawerGroup = g;
    $('#drawerTitle').textContent = g.name;
    $('#drawer').hidden = false;
    await loadMessages();
    $('#adminCompose').text.focus();
  }
  async function loadMessages() {
    const msgs = await api(`/api/admin/groups/${drawerGroup.id}/messages`).catch((err) => (fail(err), []));
    const list = $('#adminMsgs');
    list.innerHTML = msgs.length
      ? msgs.map((m) => `
        <li class="admin-msg ${m.admin ? 'admin-msg--team' : ''}">
          <div class="admin-msg__body">
            <div class="admin-msg__meta"><strong>${esc(m.name)}</strong>${m.admin ? ' · tým' : m.email ? ` · <a href="mailto:${esc(m.email)}">${esc(m.email)}</a>` : ''} · ${fmtDateTime(m.createdAt)}</div>
            <div class="admin-msg__text">${esc(m.text)}</div>
          </div>
          <button data-del="${m.id}" title="Smazat zprávu">🗑</button>
        </li>`).join('')
      : '<li class="news-none">V této skupině zatím nikdo nepsal.</li>';
    list.scrollTop = list.scrollHeight;
  }
  $('#drawer').addEventListener('click', async (e) => {
    if (e.target.closest('[data-close-drawer]')) { $('#drawer').hidden = true; loadGroups(); return; }
    const del = e.target.closest('[data-del]');
    if (del && (await confirmDialog('Smazat zprávu?', 'Zpráva zmizí i návštěvníkům webu.'))) {
      try { await api(`/api/admin/groups/${drawerGroup.id}/messages/${del.dataset.del}`, { method: 'DELETE' }); loadMessages(); } catch (err) { fail(err); }
    }
  });
  $('#adminCompose').addEventListener('submit', async (e) => {
    e.preventDefault();
    const ta = e.target.text;
    try {
      await api(`/api/admin/groups/${drawerGroup.id}/messages`, { method: 'POST', body: { text: ta.value } });
      ta.value = '';
      loadMessages();
    } catch (err) { fail(err); }
  });
  $('#adminCompose').text.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.target.form.requestSubmit(); }
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#drawer').hidden && $('#dialog').hidden) { $('#drawer').hidden = true; loadGroups(); } });

  // =============================================================
  // NASTAVENÍ
  // =============================================================
  let settings = {};
  let aboutEditor;
  const sForm = $('#settingsForm');
  const imageZones = {};

  function fillSettings(s) {
    settings = { ...s };
    ['siteName', 'tagline', 'contactEmail', 'contactPhone', 'address', 'trainingTimes', 'facebookUrl', 'instagramUrl'].forEach((k) => (sForm[k].value = s[k] || ''));
    aboutEditor.html = s.about;
    imageZones.logo.set(s.logo);
    imageZones.heroImage.set(s.heroImage);
    $$('[data-logo]').forEach((el) => (el.src = s.logo));
  }

  sForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = { ...settings, about: aboutEditor.html };
    ['siteName', 'tagline', 'contactEmail', 'contactPhone', 'address', 'trainingTimes', 'facebookUrl', 'instagramUrl'].forEach((k) => (body[k] = sForm[k].value));
    try { fillSettings(await api('/api/admin/settings', { method: 'PUT', body })); toast('Nastavení uloženo'); } catch (err) { fail(err); }
  });

  $('#passwordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try { await api('/api/admin/password', { method: 'POST', body: { current: f.current.value, next: f.next.value } }); f.reset(); toast('Heslo změněno'); } catch (err) { fail(err); }
  });

  // =============================================================
  // Start
  // =============================================================
  async function start() {
    $('#login').hidden = true;
    $('#app').hidden = false;
    if (!started) {
      started = true;
      newsEditor = createEditor('#newsEditor', 'Napište, co se děje… 💃');
      aboutEditor = createEditor('#aboutEditor', 'Pár slov o skupině…');
      newsEditor.quill.on('text-change', setStatus);
      form.addEventListener('input', setStatus);
      coverZone = dropzone($('#coverDrop'), { onChange: (url) => { current.cover = url; setStatus(); } });
      imageZones.logo = dropzone($('[data-img-field=logo]'), { query: '?logo=1', onChange: (url) => (settings.logo = url || '/img/logo.svg') });
      imageZones.heroImage = dropzone($('[data-img-field=heroImage]'), { onChange: (url) => (settings.heroImage = url) });
    }
    const tab = location.hash.slice(1);
    openTab(['news', 'chats', 'settings'].includes(tab) ? tab : 'news');
    try {
      const [site] = await Promise.all([api('/api/site'), loadNews()]);
      fillSettings(site.settings);
    } catch (err) { fail(err); }
  }

  fetch('/api/site').then((r) => r.json()).then(({ settings: s }) => $$('[data-logo]').forEach((el) => (el.src = s.logo))).catch(() => {});
  api('/api/admin/me').then(({ admin }) => (admin ? start() : showLogin())).catch(showLogin);
})();
