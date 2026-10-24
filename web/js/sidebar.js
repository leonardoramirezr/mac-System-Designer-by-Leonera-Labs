// Left sidebar: the diagram library and the live Mermaid (.sdll) source.
(function (g) {
  const SD = (g.SD = g.SD || {});
  const { h, icon, iconButton, segmented } = SD.ui;

  let root;
  let tabs;
  let body;
  let code = null; // { textarea, status, applyBtn, dirty }

  const app = () => SD.app;

  function layout() {
    const s = app().state.sidebar;
    root.hidden = !s.open;
    root.classList.toggle('code-mode', s.tab === 'code');
    document.body.classList.toggle('sidebar-open', s.open);
    document.body.classList.toggle('sidebar-code', s.open && s.tab === 'code');
    if (tabs) tabs.setValue(s.tab);
    const btn = document.getElementById('btn-code');
    if (btn) btn.classList.toggle('on', s.open && s.tab === 'code');
    draw();
  }

  function draw() {
    if (root.hidden) return;
    const tab = app().state.sidebar.tab;
    if (tab === 'code') drawCode();
    else drawLibrary();
  }

  // ---------------------------------------------------------------- library

  function itemMenu(d, anchor) {
    SD.ui.menu(
      [
        { label: 'Abrir', icon: 'folder-open', run: () => app().openDiagram(d.id) },
        { label: 'Renombrar…', icon: 'pencil', run: () => rename(d) },
        { label: 'Duplicar', icon: 'copy', run: () => duplicate(d) },
        { label: 'Exportar .sdll…', icon: 'download', run: () => exportItem(d) },
        '-',
        { label: 'Eliminar…', icon: 'trash-2', danger: true, run: () => remove(d) },
      ],
      anchor,
      { align: 'right' }
    );
  }

  async function rename(d) {
    const name = await SD.ui.prompt({ title: 'Renombrar diagrama', label: 'Nombre', value: d.name, confirmLabel: 'Renombrar' });
    if (name === null || !name.trim()) return;
    if (d.id === app().state.docId) {
      app().mutate((doc) => {
        doc.name = name.trim();
      });
      await app().save();
      return;
    }
    try {
      const res = await SD.bridge.loadDiagram(d.id);
      const { doc } = SD.sdll.parse(res.content);
      doc.name = name.trim();
      await SD.bridge.saveDiagram(d.id, doc.name, SD.sdll.serialize(doc));
      await app().refreshLibrary();
    } catch (e) {
      SD.ui.toast('No se pudo renombrar: ' + (e.message || e), { kind: 'error' });
    }
  }

  async function duplicate(d) {
    try {
      await app().flushSave();
      const res = await SD.bridge.loadDiagram(d.id);
      const { doc } = SD.sdll.parse(res.content);
      doc.name = doc.name + ' (copia)';
      doc.createdAt = doc.updatedAt = new Date().toISOString();
      const id = app().uuid();
      await SD.bridge.saveDiagram(id, doc.name, SD.sdll.serialize(doc));
      await app().refreshLibrary();
      await app().openDiagram(id);
    } catch (e) {
      SD.ui.toast('No se pudo duplicar: ' + (e.message || e), { kind: 'error' });
    }
  }

  async function exportItem(d) {
    try {
      await app().flushSave();
      const res = await SD.bridge.loadDiagram(d.id);
      await SD.bridge.exportFile(SD.sdll.fileName({ name: d.name }), res.content, 'text/plain');
    } catch (e) {
      SD.ui.toast('No se pudo exportar: ' + (e.message || e), { kind: 'error' });
    }
  }

  async function remove(d) {
    const ok = await SD.ui.confirm({
      title: 'Eliminar diagrama',
      message: `“${d.name}” se eliminará de la biblioteca. Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      await SD.bridge.deleteDiagram(d.id);
      const wasCurrent = d.id === app().state.docId;
      await app().refreshLibrary();
      if (wasCurrent) {
        app().state.docId = null;
        const next = app().state.library[0];
        if (next) await app().openDiagram(next.id);
        else await app().newDiagram();
      }
    } catch (e) {
      SD.ui.toast('No se pudo eliminar: ' + (e.message || e), { kind: 'error' });
    }
  }

  function drawLibrary() {
    SD.ui.clear(body);
    const { library, docId } = app().state;
    const list = [...library];
    if (!docId) list.unshift({ id: null, name: app().state.doc.name, updatedAt: null, unsaved: true });
    const head = h(
      'div.side-head',
      h('span.side-title', 'Diagramas'),
      iconButton('file-plus', `Nuevo diagrama (${SD.ui.mod}N)`, () => app().newDiagram()),
      iconButton('upload', `Importar .sdll (${SD.ui.mod}O)`, () => app().importFile())
    );
    const items = h(
      'div.lib-list',
      list.map((d) => {
        const current = d.id === docId || (d.unsaved && !docId);
        const more = iconButton('ellipsis', 'Más acciones', (e) => {
          e.stopPropagation();
          itemMenu(d, more);
        });
        if (d.unsaved) more.hidden = true;
        const row = h(
          'div.lib-item' + (current ? '.current' : ''),
          {
            role: 'button',
            tabindex: 0,
            onclick: () => d.id && app().openDiagram(d.id),
            ondblclick: () => d.id && rename(d),
            onkeydown: (e) => {
              if (e.key === 'Enter' && d.id) app().openDiagram(d.id);
            },
          },
          h('span.lib-icon', icon('file-text', 15)),
          h('span.lib-text', h('span.lib-name', d.name || 'Sin título'), h('span.lib-meta', d.unsaved ? 'Sin guardar' : SD.ui.relativeTime(d.updatedAt))),
          more
        );
        return row;
      })
    );
    const foot = h(
      'div.side-foot',
      SD.bridge.isNative ? 'Guardado automático en la biblioteca de la app.' : 'Modo navegador: los diagramas se guardan en este navegador.'
    );
    SD.ui.append(body, [head, list.length ? items : h('div.muted-note.pad', 'Aún no hay diagramas.'), foot]);
  }

  // ------------------------------------------------------------------- code

  function drawCode() {
    if (code && body.contains(code.textarea)) {
      syncCode();
      return;
    }
    SD.ui.clear(body);
    const textarea = h('textarea.code-editor', { spellcheck: false, autocapitalize: 'off', autocomplete: 'off', wrap: 'off', 'aria-label': 'Código Mermaid' });
    const status = h('div.code-status');
    const applyBtn = h('button.btn.primary', { type: 'button', disabled: true }, icon('check', 14), h('span', 'Aplicar'));
    const revertBtn = h('button.btn.subtle', { type: 'button', disabled: true }, 'Descartar');
    code = { textarea, status, applyBtn, revertBtn, dirty: false };
    textarea.addEventListener('input', () => {
      code.dirty = true;
      applyBtn.disabled = false;
      revertBtn.disabled = false;
      validate();
    });
    textarea.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        apply();
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        document.execCommand('insertText', false, '  ');
      }
    });
    applyBtn.addEventListener('click', apply);
    revertBtn.addEventListener('click', () => {
      code.dirty = false;
      syncCode(true);
    });
    SD.ui.append(body, [
      h(
        'div.side-head',
        h('span.side-title', 'Mermaid'),
        h('span.side-sub', '.sdll'),
        iconButton('copy', 'Copiar', () => app().copyMermaid()),
        iconButton('download', 'Exportar .sdll', () => app().exportSdll())
      ),
      h('p.side-help', 'Este es el archivo del diagrama. Cada acción en el lienzo lo modifica; también puedes editarlo y aplicar los cambios.'),
      textarea,
      status,
      h('div.code-actions', revertBtn, applyBtn),
    ]);
    syncCode(true);
  }

  function syncCode(force) {
    if (!code) return;
    const text = SD.sdll.serialize(app().state.doc);
    if (code.dirty && !force) {
      code.status.className = 'code-status warn';
      code.status.textContent = 'El diagrama cambió desde el lienzo. “Descartar” recarga el código actual.';
      return;
    }
    code.dirty = false;
    code.applyBtn.disabled = true;
    code.revertBtn.disabled = true;
    if (code.textarea.value !== text) {
      const { scrollTop, scrollLeft } = code.textarea;
      code.textarea.value = text;
      code.textarea.scrollTop = scrollTop;
      code.textarea.scrollLeft = scrollLeft;
    }
    code.status.className = 'code-status';
    code.status.textContent = `${app().state.doc.nodes.length} componentes · ${app().state.doc.edges.length} conexiones · ${app().state.doc.groups.length} grupos`;
  }

  function validate() {
    try {
      const { warnings } = SD.sdll.parse(code.textarea.value);
      code.status.className = 'code-status' + (warnings.length ? ' warn' : ' ok');
      code.status.textContent = warnings.length ? warnings.slice(0, 2).join(' · ') : 'Sintaxis válida. ⌘↩ para aplicar.';
      code.applyBtn.disabled = false;
    } catch (e) {
      code.status.className = 'code-status error';
      code.status.textContent = e.message || String(e);
      code.applyBtn.disabled = true;
    }
  }

  function apply() {
    if (!code || !code.dirty) return;
    let parsed;
    try {
      parsed = SD.sdll.parse(code.textarea.value);
    } catch (e) {
      code.status.className = 'code-status error';
      code.status.textContent = e.message || String(e);
      return;
    }
    const meta = /^\s*%%\s*@meta\s+\{.*"name"/m.test(code.textarea.value);
    code.dirty = false;
    app().replaceContent(parsed.doc, { name: meta ? parsed.doc.name : null, source: 'code' });
    SD.ui.toast('Cambios aplicados', { action: { label: 'Deshacer', run: () => app().undo() } });
  }

  function init() {
    root = document.getElementById('sidebar');
    tabs = segmented(
      [
        { value: 'library', label: 'Diagramas' },
        { value: 'code', label: 'Mermaid' },
      ],
      app().state.sidebar.tab,
      (v) => app().toggleSidebar(v),
      { small: true }
    );
    body = h('div.side-body');
    SD.ui.append(root, [h('div.side-tabs', tabs), body]);
    app().on('sidebar', layout);
    app().on('library', () => {
      if (app().state.sidebar.tab === 'library') draw();
    });
    app().on('doc', (o) => {
      if (app().state.sidebar.tab === 'code' && !root.hidden) {
        if (o && o.source === 'code') code && (code.dirty = false);
        syncCode(o && o.source === 'code');
      } else if (app().state.sidebar.tab === 'library' && !root.hidden && (!app().state.docId || (o && o.source === 'topbar'))) {
        drawLibrary();
      }
    });
    layout();
  }

  SD.sidebar = { init };
})(globalThis);
