// Klipp popup UI. Vanilla JS; talks to main through window.klipp (preload).
(() => {
  const api = window.klipp;
  const mac = api.platform === 'darwin';
  if (mac) document.documentElement.classList.add('darwin');

  const $ = (id) => document.getElementById(id);
  const els = { search: $('search'), tabs: $('tabs'), list: $('list'), preview: $('preview'), status: $('status') };

  const state = {
    view: 'history',
    query: '',
    items: [],
    groups: [],
    cursor: 0,            // keyboard cursor (index into items)
    selected: new Set(),  // multi-selection (ids); empty => cursor item is the selection
    anchor: 0,
    editing: null,        // { id } while the preview holds a textarea
    renaming: null,       // clip id with an inline title input
    addingGroup: false,
    renamingGroup: null,
  };

  const cmdKey = (e) => (mac ? e.metaKey : e.ctrlKey);

  // ---------- data ----------
  async function refresh() {
    const [items, groups] = await Promise.all([api.list(state.view, state.query), api.groups()]);
    state.items = items;
    state.groups = groups;
    if (state.view !== 'history' && state.view !== 'pinned' && !groups.some(g => g.id === state.view)) {
      state.view = 'pinned';
      return refresh();
    }
    const ids = new Set(items.map(i => i.id));
    for (const id of state.selected) if (!ids.has(id)) state.selected.delete(id);
    state.cursor = Math.min(state.cursor, Math.max(0, items.length - 1));
    render();
  }

  let refreshTimer = null;
  const refreshSoon = () => {
    if (refreshTimer) return;
    refreshTimer = setTimeout(() => { refreshTimer = null; refresh(); }, 60);
  };

  const current = () => state.items[state.cursor];
  const selectedIds = () => {
    if (state.selected.size > 0) return state.items.filter(i => state.selected.has(i.id)).map(i => i.id);
    const c = current();
    return c ? [c.id] : [];
  };

  // ---------- rendering ----------
  function timeAgo(ts) {
    const s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 60) return 'nu';
    if (s < 3600) return `${Math.floor(s / 60)} min`;
    if (s < 86400) return `${Math.floor(s / 3600)} tim`;
    if (s < 7 * 86400) return `${Math.floor(s / 86400)} d`;
    return new Date(ts).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
  }

  function renderTabs() {
    const tabs = els.tabs;
    tabs.replaceChildren();
    const mk = (label, view, extra = {}) => {
      const b = document.createElement('button');
      b.className = 'tab' + (view === state.view ? ' active' : '') + (extra.className ? ' ' + extra.className : '');
      b.textContent = label;
      b.title = extra.title ?? label;
      b.dataset.view = view ?? '';
      tabs.append(b);
      return b;
    };
    mk('Historik', 'history');
    mk('Fästa', 'pinned');
    for (const g of state.groups) {
      const b = mk(g.name, g.id);
      b.dataset.group = g.id;
      if (state.renamingGroup === g.id) {
        const input = inlineInput(g.name, async (value) => {
          state.renamingGroup = null;
          if (value && value !== g.name) await api.renameGroup(g.id, value);
          refresh();
        });
        b.replaceWith(input);
        input.focus(); input.select();
      }
    }
    if (state.addingGroup) {
      const input = inlineInput('', async (value) => {
        state.addingGroup = false;
        if (value) {
          const g = await api.addGroup(value);
          if (g) {
            const ids = state.pendingGroupIds ?? [];
            for (const id of ids) await api.moveToGroup(id, g.id);
            state.view = g.id;
          }
        }
        state.pendingGroupIds = null;
        refresh();
      });
      input.placeholder = 'Ny grupp';
      tabs.append(input);
      input.focus();
    } else {
      mk('+', null, { className: 'add', title: 'Ny grupp' });
    }
  }

  function inlineInput(value, done) {
    const input = document.createElement('input');
    input.className = 'tab-input';
    input.value = value;
    let finished = false;
    const finish = (commit) => {
      if (finished) return;
      finished = true;
      done(commit ? input.value.trim() : null);
      els.search.focus();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') finish(true);
      else if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
    return input;
  }

  function renderRow(item, index) {
    const row = document.createElement('div');
    row.className = 'row';
    row.dataset.id = item.id;
    row.dataset.index = String(index);
    row.setAttribute('role', 'option');
    const isSel = state.selected.size > 0 ? state.selected.has(item.id) : index === state.cursor;
    if (isSel) row.classList.add('selected');
    row.setAttribute('aria-selected', String(isSel));

    const icon = document.createElement('div');
    icon.className = 'icon';
    if (item.kind === 'image') {
      const img = document.createElement('img');
      img.src = `klipp://thumb/${item.id}`;
      img.alt = '';
      icon.append(img);
    } else {
      icon.textContent = item.kind === 'file' ? '📄' : (item.hasRich ? 'A' : 'T');
    }

    const body = document.createElement('div');
    body.className = 'body';
    if (state.renaming === item.id) {
      const input = inlineInput(item.title ?? '', async (value) => {
        state.renaming = null;
        if (value !== null) await api.update(item.id, { title: value });
        refresh();
      });
      input.style.width = '100%';
      body.append(input);
      queueMicrotask(() => { input.focus(); input.select(); });
    } else {
      if (item.title) {
        const t = document.createElement('div');
        t.className = 'title';
        t.textContent = item.title;
        body.append(t);
      }
      const text = document.createElement('div');
      text.className = 'text';
      text.textContent = item.kind === 'image'
        ? `Bild ${item.width}×${item.height}`
        : (item.preview || (item.kind === 'file' ? '(fil)' : '(tomt)'));
      body.append(text);
    }

    const meta = document.createElement('div');
    meta.className = 'meta';
    if (index < 9) {
      const n = document.createElement('span');
      n.className = 'num';
      n.textContent = String(index + 1);
      meta.append(n);
    }
    if (item.pinned) {
      const p = document.createElement('span');
      p.className = 'pin';
      p.textContent = '●';
      p.title = 'Fäst';
      meta.append(p);
    }
    const time = document.createElement('span');
    time.textContent = timeAgo(item.lastUsedAt);
    meta.append(time);

    row.append(icon, body, meta);
    return row;
  }

  function renderList() {
    const list = els.list;
    list.replaceChildren();
    if (state.items.length === 0) {
      const e = document.createElement('div');
      e.className = 'empty';
      e.textContent = state.query ? 'Inget klipp matchar sökningen.'
        : state.view === 'history' ? 'Kopiera något så dyker det upp här.'
        : 'Inga fästa klipp här ännu. Högerklicka på ett klipp och välj Fäst.';
      list.append(e);
      return;
    }
    const frag = document.createDocumentFragment();
    state.items.forEach((item, i) => frag.append(renderRow(item, i)));
    list.append(frag);
    const sel = list.querySelector(`.row[data-index="${state.cursor}"]`);
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }

  function renderPreview() {
    const p = els.preview;
    if (state.editing) return; // textarea owns the pane
    p.replaceChildren();
    const item = current();
    if (!item) return;
    if (item.kind === 'image') {
      const img = document.createElement('img');
      img.src = `klipp://image/${item.id}`;
      img.alt = `Bild ${item.width}×${item.height}`;
      p.append(img);
    } else {
      p.textContent = item.preview;
    }
  }

  function renderStatus() {
    const s = els.status;
    const n = state.selected.size;
    const left = n > 1 ? `${n} markerade` : `${state.items.length} klipp`;
    const right = n > 1 ? 'Enter klistrar in alla' : 'Enter klistrar in · ⇧Enter ren text';
    s.replaceChildren();
    const a = document.createElement('span'); a.textContent = left;
    const b = document.createElement('span'); b.textContent = right;
    s.append(a, b);
  }

  function render() {
    renderTabs();
    renderList();
    renderPreview();
    renderStatus();
  }

  // ---------- actions ----------
  function moveCursor(delta) {
    if (state.items.length === 0) return;
    state.cursor = (state.cursor + delta + state.items.length) % state.items.length;
    state.selected.clear();
    state.anchor = state.cursor;
    renderList();
    renderPreview();
    renderStatus();
  }

  async function paste(ids, plain) {
    if (!ids.length) return;
    await api.paste(ids, plain);
    state.selected.clear();
  }

  function setView(view) {
    state.view = view;
    state.cursor = 0;
    state.selected.clear();
    refresh();
  }

  function cycleView(delta) {
    const views = ['history', 'pinned', ...state.groups.map(g => g.id)];
    const i = Math.max(0, views.indexOf(state.view));
    setView(views[(i + delta + views.length) % views.length]);
  }

  function startEdit(id) {
    const item = state.items.find(i => i.id === id);
    if (!item || item.kind === 'image') return;
    state.editing = { id };
    api.getFullText(id).then((text) => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.addEventListener('keydown', async (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') { stopEdit(); }
        else if (e.key === 'Enter' && cmdKey(e)) {
          try { await api.update(id, { text: ta.value }); stopEdit(); }
          catch (err) { ta.title = err.message; }
        }
      });
      els.preview.replaceChildren(ta);
      ta.focus();
    });
  }
  function stopEdit() {
    state.editing = null;
    els.search.focus();
    refresh();
  }

  async function removeSelected() {
    const ids = selectedIds().filter(id => !state.items.find(i => i.id === id)?.pinned);
    if (!ids.length) return;
    await api.remove(ids);
    state.selected.clear();
  }

  // ---------- events ----------
  els.search.addEventListener('input', () => {
    state.query = els.search.value;
    state.cursor = 0;
    state.selected.clear();
    refresh();
  });

  document.addEventListener('keydown', (e) => {
    if (state.editing || state.renaming || state.addingGroup || state.renamingGroup) return;
    const k = e.key;
    if (k === 'ArrowDown') { e.preventDefault(); moveCursor(1); return; }
    if (k === 'ArrowUp') { e.preventDefault(); moveCursor(-1); return; }
    if (k === 'Escape') { e.preventDefault(); api.hide(); return; }
    if (k === 'Enter') { e.preventDefault(); paste(selectedIds(), e.shiftKey); return; }
    if (cmdKey(e) && /^[1-9]$/.test(k)) {
      e.preventDefault();
      const item = state.items[Number(k) - 1];
      if (item) paste([item.id], e.shiftKey);
      return;
    }
    if (cmdKey(e) && (k === '[' || k === ']')) { e.preventDefault(); cycleView(k === ']' ? 1 : -1); return; }
    if (e.ctrlKey && k === 'Tab') { e.preventDefault(); cycleView(e.shiftKey ? -1 : 1); return; }
    if (cmdKey(e) && k === 'Backspace') { e.preventDefault(); removeSelected(); return; }
    if (cmdKey(e) && (k === 'm' || k === 'M')) { e.preventDefault(); api.showContextMenu(selectedIds()); return; }
    if (cmdKey(e) && (k === 'e' || k === 'E')) { e.preventDefault(); const c = current(); if (c) startEdit(c.id); return; }
    if (cmdKey(e) && (k === 'p' || k === 'P')) { e.preventDefault(); const c = current(); if (c) api.togglePin(c.id); return; }
    if (cmdKey(e) && (k === 'a' || k === 'A')) {
      e.preventDefault();
      state.selected = new Set(state.items.map(i => i.id));
      renderList(); renderStatus();
      return;
    }
    if (document.activeElement !== els.search && !cmdKey(e) && !e.altKey && k.length === 1) {
      els.search.focus();
    }
  });

  els.list.addEventListener('click', (e) => {
    const row = e.target.closest('.row');
    if (!row) return;
    const index = Number(row.dataset.index);
    const id = row.dataset.id;
    if (e.shiftKey) {
      const [a, b] = [Math.min(state.anchor, index), Math.max(state.anchor, index)];
      state.selected = new Set(state.items.slice(a, b + 1).map(i => i.id));
      state.cursor = index;
    } else if (cmdKey(e)) {
      if (state.selected.size === 0) state.selected.add(state.items[state.cursor].id);
      if (state.selected.has(id)) state.selected.delete(id); else state.selected.add(id);
      state.cursor = index;
    } else {
      state.selected.clear();
      state.cursor = index;
      state.anchor = index;
    }
    renderList(); renderPreview(); renderStatus();
    els.search.focus();
  });

  els.list.addEventListener('dblclick', (e) => {
    const row = e.target.closest('.row');
    if (row) paste([row.dataset.id], e.shiftKey);
  });

  els.list.addEventListener('contextmenu', (e) => {
    const row = e.target.closest('.row');
    if (!row) return;
    e.preventDefault();
    const id = row.dataset.id;
    if (!state.selected.has(id)) {
      state.selected.clear();
      state.cursor = Number(row.dataset.index);
      state.anchor = state.cursor;
      renderList(); renderPreview(); renderStatus();
    }
    api.showContextMenu(selectedIds());
  });

  els.tabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    if (tab.classList.contains('add')) {
      state.addingGroup = true;
      renderTabs();
      return;
    }
    setView(tab.dataset.view);
  });

  els.tabs.addEventListener('contextmenu', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab || !tab.dataset.group) return;
    e.preventDefault();
    api.showGroupMenu(tab.dataset.group);
  });

  api.onShown(() => {
    state.query = '';
    els.search.value = '';
    state.cursor = 0;
    state.selected.clear();
    state.editing = null;
    state.renaming = null;
    state.addingGroup = false;
    state.renamingGroup = null;
    els.search.focus();
    refresh();
  });

  api.onChanged(() => refreshSoon());

  api.onCommand((command, arg) => {
    if (command === 'rename') { state.renaming = arg; renderList(); }
    else if (command === 'edit') { state.cursor = Math.max(0, state.items.findIndex(i => i.id === arg)); renderList(); startEdit(arg); }
    else if (command === 'newGroup') { state.pendingGroupIds = arg; state.addingGroup = true; renderTabs(); }
    else if (command === 'renameGroup') { state.renamingGroup = arg; renderTabs(); }
  });

  els.search.focus();
  refresh();
})();
