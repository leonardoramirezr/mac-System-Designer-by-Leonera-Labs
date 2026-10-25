// Application state and commands. The flow is always:
//   UI action → model mutation → Mermaid source → render → re-attach selection.
(function (g) {
  const SD = (g.SD = g.SD || {});
  const { h, icon, iconButton, toast } = SD.ui;
  const M = SD.model;

  const state = {
    doc: M.emptyDoc(),
    docId: null,
    selection: [], // [{ kind: 'node' | 'edge' | 'group', id }]
    library: [],
    lastSavedContent: null,
    saveStatus: 'idle', // idle | pending | saving | saved | error
    sidebar: { open: true, tab: 'library' },
  };

  const history = { past: [], future: [], lastKey: null, lastTime: 0 };
  const listeners = {};
  let rendered = { nodeEls: new Map(), groupEls: new Map(), edgeEls: new Map() };

  function on(type, fn) {
    (listeners[type] = listeners[type] || []).push(fn);
  }
  function emit(type, arg) {
    (listeners[type] || []).forEach((fn) => {
      try {
        fn(arg);
      } catch (e) {
        console.error(e);
      }
    });
  }

  function uuid() {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const x = [...b].map((v) => v.toString(16).padStart(2, '0')).join('');
    return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`.toUpperCase();
  }

  function isEditable(el) {
    return !!(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)));
  }

  // ----------------------------------------------------------------- history

  const signature = (doc) => JSON.stringify(Object.assign({}, doc, { updatedAt: 0 }));

  // Applies fn(doc) as one undoable step.
  //   coalesce: key that merges rapid edits of the same field into one step
  //   source:   who changed it ('inspector' panels skip rebuilding themselves)
  //   select:   function(result) → new selection
  //   focus:    function(result) → node id to keep in view after rendering
  function mutate(fn, opts) {
    const o = opts || {};
    const before = JSON.stringify(state.doc);
    const beforeSig = signature(state.doc);
    const beforeSel = state.selection.slice();
    const result = fn(state.doc);
    if (signature(state.doc) === beforeSig) {
      state.doc = JSON.parse(before);
      return result;
    }
    const now = Date.now();
    const merge = o.coalesce && history.lastKey === o.coalesce && now - history.lastTime < 2500;
    if (!merge) {
      history.past.push({ doc: before, selection: beforeSel });
      if (history.past.length > 300) history.past.shift();
    }
    history.lastKey = o.coalesce || null;
    history.lastTime = now;
    history.future = [];
    if (o.select) state.selection = o.select(result) || [];
    docChanged(Object.assign({}, o, { focusId: o.focus ? o.focus(result) : null }));
    return result;
  }

  function restore(entry, opts) {
    state.doc = M.normalize(JSON.parse(entry.doc));
    state.selection = entry.selection || [];
    history.lastKey = null;
    docChanged(Object.assign({ source: 'history' }, opts));
  }

  function undo() {
    const active = document.activeElement;
    if (isEditable(active)) {
      document.execCommand('undo');
      return;
    }
    const entry = history.past.pop();
    if (!entry) return;
    history.future.push({ doc: JSON.stringify(state.doc), selection: state.selection.slice() });
    restore(entry);
  }

  function redo() {
    const active = document.activeElement;
    if (isEditable(active)) {
      document.execCommand('redo');
      return;
    }
    const entry = history.future.pop();
    if (!entry) return;
    history.past.push({ doc: JSON.stringify(state.doc), selection: state.selection.slice() });
    restore(entry);
  }

  function resetHistory() {
    history.past = [];
    history.future = [];
    history.lastKey = null;
  }

  // --------------------------------------------------------------- selection

  function validSelection(sel) {
    return sel.filter((s) =>
      s.kind === 'node' ? M.findNode(state.doc, s.id) : s.kind === 'edge' ? M.findEdge(state.doc, s.id) : M.findGroup(state.doc, s.id)
    );
  }

  function select(items, opts) {
    state.selection = validSelection(items || []);
    applySelection();
    emit('selection', opts || {});
    // the inspector may now cover the selected component
    const only = state.selection.length === 1 && state.selection[0].kind === 'node' ? rendered.nodeEls.get(state.selection[0].id) : null;
    if (only) requestAnimationFrame(() => SD.canvas.ensureVisible(tileRect(only)));
  }

  function toggleSelect(item) {
    const i = state.selection.findIndex((s) => s.kind === item.kind && s.id === item.id);
    const next = state.selection.slice();
    if (i >= 0) next.splice(i, 1);
    else next.push(item);
    select(next);
  }

  const selected = (kind) => state.selection.filter((s) => s.kind === kind).map((s) => s.id);

  function applySelection() {
    const sel = new Set(state.selection.map((s) => s.kind + ':' + s.id));
    rendered.edgeEls.forEach((els, id) => {
      const on = sel.has('edge:' + id);
      els.path.classList.toggle('sd-selected', on);
      if (els.label) (els.label.closest('.edgeLabel') || els.label).classList.toggle('sd-selected', on);
    });
    rendered.nodeEls.forEach((el, id) => el.classList.toggle('sd-selected', sel.has('node:' + id)));
    rendered.groupEls.forEach((el, id) => el.classList.toggle('sd-selected', sel.has('group:' + id)));
    updateOverlay();
  }

  // ----------------------------------------------------------------- overlay

  const overlay = () => document.getElementById('overlay');

  function tileRect(nodeEl) {
    const tile = nodeEl.querySelector(':scope > g:first-child') || nodeEl;
    return tile.getBoundingClientRect();
  }

  function updateOverlay() {
    const host = overlay();
    if (!host) return;
    SD.ui.clear(host);
    const base = host.getBoundingClientRect();
    const rel = (r, pad) => ({ left: r.left - base.left - pad, top: r.top - base.top - pad, width: r.width + pad * 2, height: r.height + pad * 2 });
    const place = (el, r) => {
      el.style.left = r.left + 'px';
      el.style.top = r.top + 'px';
      el.style.width = r.width + 'px';
      el.style.height = r.height + 'px';
      return el;
    };
    state.selection.forEach((s) => {
      if (s.kind === 'node') {
        const el = rendered.nodeEls.get(s.id);
        const node = M.findNode(state.doc, s.id);
        if (!el || !node) return;
        const r = rel(tileRect(el), 4);
        host.appendChild(place(h('div.sel-ring' + (SD.catalog.isClient(node.type) ? '.round' : '')), r));
      } else if (s.kind === 'group') {
        const el = rendered.groupEls.get(s.id);
        const rect = el && el.querySelector(':scope > rect');
        if (!rect) return;
        host.appendChild(place(h('div.sel-ring.group'), rel(rect.getBoundingClientRect(), 3)));
      }
    });
    const nodes = selected('node');
    if (state.selection.length === 1 && nodes.length === 1) {
      const el = rendered.nodeEls.get(nodes[0]);
      if (!el) return;
      const r = tileRect(el);
      const vertical = state.doc.direction === 'TB' || state.doc.direction === 'BT';
      const gap = 32;
      const cx = r.left + r.width / 2 - base.left;
      const cy = r.top + r.height / 2 - base.top;
      const sides = vertical
        ? [
            { side: 'left', x: cx, y: r.top - base.top - gap, title: 'Añadir antes (arriba)' },
            { side: 'right', x: cx, y: r.bottom - base.top + gap, title: 'Añadir después (abajo)' },
          ]
        : [
            { side: 'left', x: r.left - base.left - gap, y: cy, title: 'Añadir a la izquierda' },
            { side: 'right', x: r.right - base.left + gap, y: cy, title: 'Añadir a la derecha' },
          ];
      sides.forEach((s) => {
        const b = h(
          'button.add-handle',
          {
            type: 'button',
            title: s.title,
            'aria-label': s.title,
            onclick: (e) => {
              e.stopPropagation();
              openAddPicker(nodes[0], s.side, b);
            },
          },
          icon('plus', 14, 2.2)
        );
        b.style.left = s.x + 'px';
        b.style.top = s.y + 'px';
        host.appendChild(b);
      });
    }
  }

  // ---------------------------------------------------------------- rendering

  let rendering = false;
  let queued = null;
  let renderTimer = null;

  function scheduleRender(opts) {
    clearTimeout(renderTimer);
    if (opts && opts.coalesce) renderTimer = setTimeout(() => renderNow(opts), 160);
    else renderNow(opts || {});
  }

  async function renderNow(opts) {
    if (rendering) {
      queued = Object.assign(queued || {}, opts, { fit: (queued && queued.fit) || (opts && opts.fit) });
      return;
    }
    rendering = true;
    const o = opts || {};
    try {
      const r = await SD.render.render(state.doc);
      rendered = r.finish(r.svg);
      SD.canvas.setContent(r.svg, r);
      document.getElementById('canvas').classList.toggle('has-content', state.doc.nodes.length + state.doc.groups.length > 0);
      applySelection();
      const focusEl = o.focusId ? rendered.nodeEls.get(o.focusId) : null;
      SD.canvas.afterRender(focusEl, { fit: o.fit, instant: o.instant });
      setRenderError(null);
    } catch (e) {
      console.error(e);
      setRenderError(e);
    } finally {
      rendering = false;
    }
    if (queued) {
      const q = queued;
      queued = null;
      renderNow(q);
    }
  }

  function setRenderError(err) {
    let badge = document.getElementById('render-error');
    if (!err) {
      if (badge) badge.remove();
      return;
    }
    if (!badge) {
      badge = h('div.render-error#render-error');
      document.getElementById('app').appendChild(badge);
    }
    badge.id = 'render-error';
    badge.textContent = 'No se pudo dibujar el diagrama: ' + String((err && err.message) || err).split('\n')[0];
  }

  // ---------------------------------------------------------------- changes

  function docChanged(opts) {
    const o = opts || {};
    state.selection = validSelection(state.selection);
    scheduleRender(o);
    scheduleSave();
    updateEmptyState();
    updateChrome();
    emit('doc', o);
    emit('selection', o);
  }

  function updateChrome() {
    const name = document.getElementById('doc-name');
    if (name && document.activeElement !== name) name.value = state.doc.name;
    if (name) sizeNameInput(name);
    const undoBtn = document.getElementById('btn-undo');
    const redoBtn = document.getElementById('btn-redo');
    if (undoBtn) undoBtn.disabled = !history.past.length;
    if (redoBtn) redoBtn.disabled = !history.future.length;
    SD.bridge.setWindowTitle(state.doc.name).catch(() => {});
  }

  function sizeNameInput(input) {
    const probe = sizeNameInput.probe || (sizeNameInput.probe = h('span.name-probe'));
    if (!probe.isConnected) document.body.appendChild(probe);
    probe.textContent = input.value || input.placeholder || ' ';
    input.style.width = Math.min(Math.max(probe.offsetWidth + 18, 80), 320) + 'px';
  }

  // ----------------------------------------------------------------- saving

  // Every change is written right away (one write in flight, the latest
  // state queued behind it), so quitting the app never waits on the page.
  let saving = null;
  let saveAgain = false;

  const shouldPersist = () => !!state.docId || state.doc.nodes.length > 0 || state.doc.groups.length > 0;

  function setSaveStatus(s) {
    state.saveStatus = s;
    const el = document.getElementById('save-status');
    if (!el) return;
    el.dataset.status = s;
    el.textContent = { saved: 'Guardado', error: 'Sin guardar' }[s] || '';
  }

  function scheduleSave() {
    if (!shouldPersist()) return;
    if (saving) {
      saveAgain = true;
      return;
    }
    saving = (async () => {
      do {
        saveAgain = false;
        await writeOnce();
      } while (saveAgain);
    })().finally(() => {
      saving = null;
    });
  }

  async function writeOnce() {
    if (!shouldPersist()) return;
    if (!state.docId) state.docId = uuid();
    const id = state.docId;
    const content = SD.sdll.serialize(state.doc);
    if (content === state.lastSavedContent) {
      setSaveStatus('saved');
      return;
    }
    try {
      const res = await SD.bridge.saveDiagram(id, state.doc.name, content);
      if (id !== state.docId) return;
      state.lastSavedContent = content;
      const known = state.library.find((d) => d.id === id);
      const reorder = !known || known.name !== state.doc.name || (state.library[0] && state.library[0].id !== id);
      const entry = { id, name: state.doc.name, updatedAt: (res && res.updatedAt) || new Date().toISOString() };
      state.library = [entry, ...state.library.filter((d) => d.id !== id)];
      if (!known) SD.bridge.setPref('lastOpened', id).catch(() => {});
      setSaveStatus('saved');
      if (reorder) emit('library');
    } catch (e) {
      if (state.saveStatus !== 'error') toast('No se pudo guardar: ' + (e.message || e), { kind: 'error' });
      setSaveStatus('error');
    }
  }

  async function flushSave() {
    while (saving) await saving;
  }

  async function save() {
    scheduleSave();
    await flushSave();
  }

  // ---------------------------------------------------------------- library

  async function refreshLibrary() {
    try {
      state.library = (await SD.bridge.listDiagrams()) || [];
    } catch (e) {
      state.library = [];
      toast('No se pudo leer la biblioteca: ' + (e.message || e), { kind: 'error' });
    }
    emit('library');
  }

  function loadDoc(doc, id, opts) {
    state.doc = M.normalize(doc);
    state.docId = id || null;
    state.selection = [];
    state.lastSavedContent = id ? SD.sdll.serialize(state.doc) : null;
    resetHistory();
    setSaveStatus(id ? 'saved' : 'idle');
    docChanged({ source: 'load', fit: true, instant: !(opts && opts.animate) });
    if (id) SD.bridge.setPref('lastOpened', id).catch(() => {});
  }

  async function openDiagram(id) {
    if (id === state.docId) return;
    await flushSave();
    try {
      const res = await SD.bridge.loadDiagram(id);
      const { doc, warnings } = SD.sdll.parse(res.content);
      loadDoc(doc, id);
      if (warnings.length) toast(`Abierto con ${warnings.length} advertencia(s).`);
    } catch (e) {
      toast('No se pudo abrir: ' + (e.message || e), { kind: 'error' });
    }
    emit('library');
  }

  async function newDiagram() {
    await flushSave();
    loadDoc(M.emptyDoc(), null);
    emit('library');
  }

  // Imports .sdll / Mermaid text as a new diagram in the library.
  async function importText(name, content) {
    let parsed;
    try {
      parsed = SD.sdll.parse(content);
    } catch (e) {
      toast('No se pudo importar: ' + (e.message || e), { kind: 'error' });
      return false;
    }
    await flushSave();
    const doc = parsed.doc;
    const hasMetaName = /^\s*%%\s*@meta\s+\{.*"name"/m.test(content);
    if (!hasMetaName && name) doc.name = String(name).replace(/\.(sdll|mmd|mermaid|txt)$/i, '');
    loadDoc(doc, null, { animate: true });
    await save();
    toast(parsed.warnings.length ? `Importado con ${parsed.warnings.length} advertencia(s).` : `Importado “${doc.name}”.`);
    return true;
  }

  async function importFile() {
    try {
      const file = await SD.bridge.importFile();
      if (file && file.content !== undefined) await importText(file.name, file.content);
    } catch (e) {
      toast('No se pudo abrir el archivo: ' + (e.message || e), { kind: 'error' });
    }
  }

  async function openFiles(files) {
    for (const f of files || []) await importText(f.name, f.content);
  }

  async function exportSdll() {
    try {
      const res = await SD.bridge.exportFile(SD.sdll.fileName(state.doc), SD.sdll.serialize(state.doc), 'text/plain');
      if (res && res.saved) toast('Exportado como .sdll');
    } catch (e) {
      toast('No se pudo exportar: ' + (e.message || e), { kind: 'error' });
    }
  }

  async function exportSvg() {
    try {
      const svg = await SD.render.exportSVG(state.doc);
      const res = await SD.bridge.exportFile(SD.sdll.fileName(state.doc).replace(/\.sdll$/, '.svg'), svg, 'image/svg+xml');
      if (res && res.saved) toast('Exportado como SVG');
    } catch (e) {
      toast('No se pudo exportar: ' + (e.message || e), { kind: 'error' });
    }
  }

  async function copyMermaid() {
    const text = SD.sdll.serialize(state.doc, { external: true });
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } });
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast('Mermaid copiado al portapapeles');
  }

  // ---------------------------------------------------------------- actions

  function addComponent(typeId, opts) {
    const o = opts || {};
    return mutate(
      (doc) => {
        if (o.group) return M.addNode(doc, { type: typeId, group: o.group });
        return M.addNode(doc, { type: typeId });
      },
      { select: (id) => [{ kind: 'node', id }], focus: (id) => id }
    );
  }

  function addAdjacent(nodeId, side, typeId) {
    return mutate((doc) => M.addConnectedNode(doc, nodeId, side, typeId), {
      select: (r) => (r ? [{ kind: 'node', id: r.nodeId }] : []),
      focus: (r) => r && r.nodeId,
    });
  }

  function openAddPicker(nodeId, side, anchor) {
    const vertical = state.doc.direction === 'TB' || state.doc.direction === 'BT';
    const label = side === 'left' ? (vertical ? 'Añadir antes' : 'Añadir a la izquierda') : vertical ? 'Añadir después' : 'Añadir a la derecha';
    SD.picker.open({
      anchor,
      title: label,
      align: side === 'left' ? 'right' : 'left',
      onPick: (type) => addAdjacent(nodeId, side, type),
    });
  }

  function openComponentPicker(anchor) {
    const groupSel = selected('group');
    SD.picker.open({
      anchor: anchor || document.getElementById('btn-add'),
      title: groupSel.length === 1 ? 'Añadir al grupo' : 'Añadir componente',
      onPick: (type) => addComponent(type, groupSel.length === 1 ? { group: groupSel[0] } : {}),
    });
  }

  function deleteSelection() {
    if (!state.selection.length) return;
    const sel = state.selection.slice();
    mutate(
      (doc) => {
        sel.forEach((s) => {
          if (s.kind === 'node') M.removeNode(doc, s.id);
          else if (s.kind === 'edge') M.removeEdge(doc, s.id);
          else if (s.kind === 'group') M.removeGroup(doc, s.id, false);
        });
      },
      { select: () => [] }
    );
  }

  function groupSelection() {
    const nodes = selected('node');
    const groups = selected('group');
    const members = [...nodes, ...groups];
    const id = mutate((doc) => M.addGroup(doc, { title: 'Grupo' }, members), {
      select: (gid) => [{ kind: 'group', id: gid }],
    });
    setTimeout(() => SD.inspector.focusField('title'), 30);
    return id;
  }

  function connectSelection() {
    const nodes = selected('node');
    if (nodes.length !== 2) return;
    mutate((doc) => M.addEdge(doc, nodes[0], nodes[1]), { select: (id) => (id ? [{ kind: 'edge', id }] : []) });
  }

  // Replaces the diagram content (AI generation, Mermaid editor) as one step.
  function replaceContent(newDoc, opts) {
    const o = opts || {};
    mutate(
      (doc) => {
        doc.nodes = newDoc.nodes;
        doc.edges = newDoc.edges;
        doc.groups = newDoc.groups;
        doc.direction = newDoc.direction || doc.direction;
        if (o.name) doc.name = o.name;
        doc.updatedAt = new Date().toISOString();
      },
      { select: () => [], fit: true, source: o.source || 'replace' }
    );
  }

  function navigate(dir) {
    const nodes = selected('node');
    const id = nodes[0];
    if (!id) {
      if (state.doc.nodes[0]) select([{ kind: 'node', id: state.doc.nodes[0].id }]);
      return;
    }
    let next = null;
    if (dir === 'right') next = (state.doc.edges.find((e) => e.from === id) || {}).to;
    else if (dir === 'left') next = (state.doc.edges.find((e) => e.to === id) || {}).from;
    else {
      // siblings: nodes sharing a parent through an edge
      const parent = (state.doc.edges.find((e) => e.to === id) || {}).from;
      const sibs = parent ? state.doc.edges.filter((e) => e.from === parent).map((e) => e.to) : state.doc.nodes.map((n) => n.id);
      const i = sibs.indexOf(id);
      if (i >= 0 && sibs.length > 1) next = sibs[(i + (dir === 'down' ? 1 : -1) + sibs.length) % sibs.length];
    }
    if (next) {
      select([{ kind: 'node', id: next }]);
      const el = rendered.nodeEls.get(next);
      if (el) SD.canvas.ensureVisible(el.getBoundingClientRect());
    }
  }

  function toggleSidebar(tab) {
    if (tab && (!state.sidebar.open || state.sidebar.tab !== tab)) {
      state.sidebar.open = true;
      state.sidebar.tab = tab;
    } else if (tab) {
      state.sidebar.open = false;
    } else {
      state.sidebar.open = !state.sidebar.open;
    }
    SD.bridge.setPref('sidebar', JSON.stringify(state.sidebar)).catch(() => {});
    emit('sidebar');
    requestAnimationFrame(updateOverlay);
    // the sidebar animates its width; refit once it settles
    setTimeout(() => {
      if (SD.canvas.isFollowing()) SD.canvas.fit();
      updateOverlay();
    }, 240);
  }

  const commands = {
    undo,
    redo,
    save: () => save().then(() => toast('Guardado')),
    new: newDiagram,
    import: importFile,
    export: exportSdll,
    exportSvg,
    copyMermaid,
    addComponent: () => openComponentPicker(),
    group: groupSelection,
    connect: connectSelection,
    delete: deleteSelection,
    fit: () => SD.canvas.fit(),
    zoomIn: () => SD.canvas.zoomStep(1),
    zoomOut: () => SD.canvas.zoomStep(-1),
    toggleSidebar: () => toggleSidebar(),
    showLibrary: () => toggleSidebar('library'),
    showCode: () => toggleSidebar('code'),
    focusAI: () => SD.ai.focus(),
    settings: () => SD.settings.open(),
    selectAll: () => select(state.doc.nodes.map((n) => ({ kind: 'node', id: n.id }))),
  };

  function command(name, arg) {
    const fn = commands[name];
    if (!fn) return false;
    Promise.resolve(fn(arg)).catch((e) => toast(String(e.message || e), { kind: 'error' }));
    return true;
  }

  // --------------------------------------------------------------- keyboard

  function onKeyDown(e) {
    if (document.querySelector('.backdrop')) return; // dialogs handle their own keys
    const mod = e.metaKey || e.ctrlKey;
    const editing = isEditable(e.target);
    if (mod && !e.altKey) {
      const k = e.key.toLowerCase();
      const map = {
        z: e.shiftKey ? 'redo' : 'undo',
        y: 'redo',
        s: 'save',
        o: 'import',
        n: 'new',
        e: e.shiftKey ? 'exportSvg' : 'export',
        k: 'addComponent',
        g: 'group',
        0: 'fit',
        '=': 'zoomIn',
        '+': 'zoomIn',
        '-': 'zoomOut',
        j: 'focusAI',
        ',': 'settings',
        b: 'toggleSidebar',
        a: 'selectAll',
      };
      const cmd = map[k];
      if (!cmd) return;
      if (editing && (cmd === 'undo' || cmd === 'redo' || cmd === 'group' || cmd === 'selectAll')) return;
      e.preventDefault();
      command(cmd);
      return;
    }
    if (editing) {
      if (e.key === 'Escape') e.target.blur();
      return;
    }
    if (e.target.closest && e.target.closest('.popover')) return;
    const nodes = selected('node');
    switch (e.key) {
      case 'Delete':
      case 'Backspace':
        if (state.selection.length) {
          e.preventDefault();
          deleteSelection();
        }
        break;
      case 'Escape':
        select([]);
        break;
      case 'Tab':
        if (nodes.length === 1) {
          e.preventDefault();
          const b = overlay().querySelectorAll('.add-handle')[e.shiftKey ? 0 : 1];
          openAddPicker(nodes[0], e.shiftKey ? 'left' : 'right', b || document.getElementById('btn-add'));
        }
        break;
      case 'Enter':
        if (state.selection.length === 1) {
          e.preventDefault();
          SD.inspector.focusField('title');
        }
        break;
      case 'ArrowRight':
      case 'ArrowLeft':
      case 'ArrowUp':
      case 'ArrowDown':
        if (!e.shiftKey) {
          e.preventDefault();
          navigate(e.key.slice(5).toLowerCase());
        }
        break;
      default:
    }
  }

  // ----------------------------------------------------------------- chrome

  function buildTopbar() {
    const left = document.getElementById('topbar-left');
    const right = document.getElementById('topbar-right');
    const name = h('input.doc-name#doc-name', {
      type: 'text',
      spellcheck: false,
      placeholder: 'Diagrama sin título',
      'aria-label': 'Nombre del diagrama',
      value: state.doc.name,
    });
    name.addEventListener('input', () => {
      sizeNameInput(name);
      mutate((doc) => {
        doc.name = name.value.trim() || 'Diagrama sin título';
      }, { coalesce: 'doc:name', source: 'topbar' });
    });
    name.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') name.blur();
    });
    name.addEventListener('blur', () => {
      name.value = state.doc.name;
      sizeNameInput(name);
    });

    SD.ui.append(left, [
      h('div.pill.toolbar',
        iconButton('panel-left', `Barra lateral (${SD.ui.mod}B)`, () => toggleSidebar(), 'sidebar-toggle'),
        h('span.toolbar-sep'),
        name,
        h('span.save-status#save-status'),
      ),
      h('div.pill.toolbar',
        h('button.tool-btn#btn-add', { type: 'button', title: `Añadir componente (${SD.ui.mod}K)`, onclick: (e) => openComponentPicker(e.currentTarget) }, icon('plus', 16), h('span.btn-label', 'Componente')),
        h('button.tool-btn#btn-group', { type: 'button', title: `Agrupar selección (${SD.ui.mod}G)`, onclick: () => groupOrPick() }, icon('square-dashed', 16), h('span.btn-label', 'Grupo')),
        h('span.toolbar-sep'),
        h('button.icon-btn#btn-undo', { type: 'button', title: `Deshacer (${SD.ui.mod}Z)`, 'aria-label': 'Deshacer', onclick: () => undo(), disabled: true }, icon('undo-2', 16)),
        h('button.icon-btn#btn-redo', { type: 'button', title: `Rehacer (⇧${SD.ui.mod}Z)`, 'aria-label': 'Rehacer', onclick: () => redo(), disabled: true }, icon('redo-2', 16))
      ),
    ]);

    const exportBtn = h('button.tool-btn', { type: 'button', title: 'Exportar' }, icon('download', 16), h('span.btn-label', 'Exportar'));
    exportBtn.addEventListener('click', () =>
      SD.ui.menu(
        [
          { label: 'Exportar .sdll…', icon: 'file-text', shortcut: `${SD.ui.mod}E`, run: exportSdll },
          { label: 'Exportar SVG…', icon: 'image', shortcut: `⇧${SD.ui.mod}E`, run: exportSvg },
          '-',
          { label: 'Copiar Mermaid', icon: 'copy', run: copyMermaid },
          { label: 'Importar .sdll…', icon: 'upload', shortcut: `${SD.ui.mod}O`, run: importFile },
        ],
        exportBtn,
        { align: 'right' }
      )
    );
    SD.ui.append(right, [
      h('div.pill.toolbar',
        h('button.tool-btn#btn-code', { type: 'button', title: 'Ver y editar el código Mermaid', onclick: () => toggleSidebar('code') }, icon('code', 16), h('span.btn-label', 'Mermaid')),
        exportBtn
      ),
    ]);
  }

  // "Grupo": groups the selection, or asks which components to start with.
  function groupOrPick() {
    if (selected('node').length || selected('group').length) {
      groupSelection();
      return;
    }
    if (!state.doc.nodes.length) {
      mutate((doc) => M.addGroup(doc, { title: 'Grupo' }, []), { select: (gid) => [{ kind: 'group', id: gid }] });
      setTimeout(() => SD.inspector.focusField('title'), 30);
      return;
    }
    toast('Selecciona componentes (⇧ clic para varios) y pulsa Grupo. Se creó un grupo vacío.', { duration: 4200 });
    mutate((doc) => M.addGroup(doc, { title: 'Grupo' }, []), { select: (gid) => [{ kind: 'group', id: gid }] });
  }

  function buildZoombar() {
    const bar = h('div.pill.toolbar.zoombar#zoombar');
    document.getElementById('topbar-right').prepend(bar);
    const pct = h('button.zoom-pct', { type: 'button', title: 'Ajustar a la vista (⌘0)', onclick: () => SD.canvas.fit() }, '100%');
    SD.ui.append(bar, [
      iconButton('zoom-out', 'Alejar (⌘−)', () => SD.canvas.zoomStep(-1)),
      pct,
      iconButton('zoom-in', 'Acercar (⌘+)', () => SD.canvas.zoomStep(1)),
      h('span.toolbar-sep'),
      iconButton('scan', 'Ver todo (⌘0)', () => SD.canvas.fit()),
    ]);
    SD.canvas.on('change', (v) => {
      pct.textContent = Math.round(v.k * 100) + '%';
      updateOverlay();
    });
  }

  function updateEmptyState() {
    const el = document.getElementById('empty-state');
    const empty = !state.doc.nodes.length && !state.doc.groups.length;
    el.hidden = !empty;
    if (!empty || el.childElementCount) return;
    const quick = ['web', 'mobile', 'frontend', 'server', 'sql-db', 'queue', 'bucket', 'cache'];
    SD.ui.append(el, [
      h('div.empty-mark', icon('waypoints', 26, 1.5)),
      h('h1', 'Diseña tu sistema'),
      h('p', 'Agrega un componente para empezar. Después usa los botones + de cada lado para seguir construyendo, o describe tu sistema a la IA.'),
      h(
        'div.empty-grid',
        quick.map((id) => {
          const t = SD.catalog.type(id);
          return h(
            'button.empty-item',
            { type: 'button', onclick: () => addComponent(id) },
            h('span.picker-icon' + (t.category === 'client' ? '.round' : ''), icon(t.icon, 20, 1.6)),
            h('span', t.label)
          );
        })
      ),
      h('button.link-btn', { type: 'button', onclick: (e) => openComponentPicker(e.currentTarget) }, 'Más componentes…'),
    ]);
  }

  function onCanvasClick(e) {
    const t = e.target;
    const nodeEl = t.closest && t.closest('[data-sd-node]');
    const edgeEl = !nodeEl && t.closest && t.closest('[data-sd-edge]');
    const groupEl = !nodeEl && !edgeEl && t.closest && t.closest('[data-sd-group]');
    const item = nodeEl
      ? { kind: 'node', id: nodeEl.getAttribute('data-sd-node') }
      : edgeEl
        ? { kind: 'edge', id: edgeEl.getAttribute('data-sd-edge') }
        : groupEl
          ? { kind: 'group', id: groupEl.getAttribute('data-sd-group') }
          : null;
    if (!item) {
      if (!e.shift && !e.meta) select([]);
      return;
    }
    if (e.shift || e.meta) toggleSelect(item);
    else select([item]);
  }

  let markReady;
  const ready = new Promise((resolve) => (markReady = resolve));

  // Exercises the native bridge and the renderer end to end. Used by
  // `SystemDesigner --self-test <dir>` in CI; never runs during normal use.
  async function selfTest() {
    await ready;
    const report = { ok: true, native: SD.bridge.isNative, userAgent: navigator.userAgent, steps: [] };
    const step = async (name, fn, optional) => {
      try {
        const value = await fn();
        report.steps.push({ name, ok: true, value });
      } catch (e) {
        if (!optional) report.ok = false;
        report.steps.push({ name, ok: false, optional: !!optional, error: String((e && e.message) || e) });
      }
    };
    const sample = [
      'flowchart LR',
      '  web@{ icon: "sd:web", label: "Web" }',
      '  mobile@{ icon: "sd:mobile", label: "Móvil" }',
      '  subgraph aws["AWS"]',
      '    api@{ icon: "sd:server", label: "API<br><small>REST</small>" }',
      '    q@{ icon: "sd:queue", label: "Cola" }',
      '    db@{ icon: "sd:sql-db", label: "Postgres" }',
      '  end',
      '  web -->|"llama"| api',
      '  mobile --> api',
      '  api -.->|"publica"| q',
      '  api --> db',
      '  class aws grp_cloud',
    ].join('\n');
    await step('render', async () => {
      await importText('Self-test.sdll', sample);
      await new Promise((r) => setTimeout(r, 600));
      const n = rendered.nodeEls.size;
      if (n !== state.doc.nodes.length) throw new Error(`rendered ${n} of ${state.doc.nodes.length} nodes`);
      if (!document.querySelector('#world svg .sd-group')) throw new Error('group not rendered');
      return { nodes: n, edges: rendered.edgeEls.size, groups: rendered.groupEls.size };
    });
    await step('select+overlay', async () => {
      select([{ kind: 'node', id: 'api' }]);
      await new Promise((r) => setTimeout(r, 100));
      const handles = document.querySelectorAll('#overlay .add-handle').length;
      if (handles !== 2) throw new Error(`expected 2 add handles, got ${handles}`);
      return handles;
    });
    await step('addAdjacent', async () => {
      addAdjacent('api', 'right', 'cache');
      await new Promise((r) => setTimeout(r, 500));
      return state.doc.nodes.length;
    });
    await step('library', async () => {
      await flushSave();
      const list = await SD.bridge.listDiagrams();
      const mine = list.find((d) => d.id === state.docId);
      if (!mine) throw new Error('saved diagram not listed');
      const loaded = await SD.bridge.loadDiagram(state.docId);
      if (!/sd:cache/.test(loaded.content)) throw new Error('saved content is stale');
      return { count: list.length, name: mine.name };
    });
    await step('prefs', async () => {
      await SD.bridge.setPref('selftest', 'ok');
      const v = await SD.bridge.getPref('selftest');
      await SD.bridge.setPref('selftest', null);
      if (v !== 'ok') throw new Error('pref roundtrip failed: ' + v);
      return v;
    });
    await step('secrets', async () => SD.bridge.hasSecrets(['selftest-none']));
    await step('exportSVG', async () => (await SD.render.exportSVG(state.doc)).length);
    await step('llmModels (itera, public endpoint)', async () => (await SD.bridge.llmModels({ provider: 'itera', baseURL: '' })).length, true);
    return report;
  }

  async function start() {
    const canvasEl = document.getElementById('canvas');
    SD.canvas.init(canvasEl);
    SD.canvas.on('click', onCanvasClick);
    canvasEl.addEventListener('dblclick', (e) => {
      const nodeEl = e.target.closest('[data-sd-node]');
      const groupEl = !nodeEl && e.target.closest('[data-sd-group]');
      if (nodeEl || groupEl) {
        select([nodeEl ? { kind: 'node', id: nodeEl.getAttribute('data-sd-node') } : { kind: 'group', id: groupEl.getAttribute('data-sd-group') }]);
        SD.inspector.focusField('title');
      } else if (!e.target.closest('#overlay button')) {
        SD.canvas.fit();
      }
    });
    document.addEventListener('keydown', onKeyDown);

    try {
      const sb = JSON.parse((await SD.bridge.getPref('sidebar')) || 'null');
      if (sb && typeof sb === 'object') state.sidebar = { open: !!sb.open, tab: sb.tab === 'code' ? 'code' : 'library' };
    } catch (e) {
      /* default sidebar */
    }

    buildTopbar();
    buildZoombar();
    SD.sidebar.init();
    SD.inspector.init();
    await SD.ai.init();
    updateEmptyState();

    if (g.matchMedia) {
      g.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => renderNow({}));
    }

    await refreshLibrary();
    let pending = [];
    try {
      pending = (await SD.bridge.takePendingFiles()) || [];
    } catch (e) {
      pending = [];
    }
    if (pending.length) {
      await openFiles(pending);
    } else {
      let lastId = null;
      try {
        lastId = await SD.bridge.getPref('lastOpened');
      } catch (e) {
        lastId = null;
      }
      const target = state.library.find((d) => d.id === lastId) || state.library[0];
      if (target) await openDiagram(target.id);
      else loadDoc(M.emptyDoc(), null);
    }
    document.body.classList.add('ready');
    markReady();
  }

  SD.app = {
    state,
    on,
    emit,
    mutate,
    undo,
    redo,
    select,
    toggleSelect,
    selected,
    command,
    save,
    flushSave,
    openDiagram,
    newDiagram,
    importText,
    importFile,
    openFiles,
    exportSdll,
    exportSvg,
    copyMermaid,
    refreshLibrary,
    addComponent,
    addAdjacent,
    openAddPicker,
    openComponentPicker,
    deleteSelection,
    groupSelection,
    connectSelection,
    replaceContent,
    toggleSidebar,
    updateOverlay,
    canUndo: () => history.past.length > 0,
    rendered: () => rendered,
    uuid,
    selfTest,
    isEditingText: () => isEditable(document.activeElement),
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(globalThis);
