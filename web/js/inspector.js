// Right-hand inspector for the current selection (component, connection,
// group or several items).
(function (g) {
  const SD = (g.SD = g.SD || {});
  const { h, icon, iconButton, segmented, autosize } = SD.ui;
  const M = SD.model;

  let root;
  let lastKey = '';

  const app = () => SD.app;
  const doc = () => SD.app.state.doc;

  function selectionKey() {
    return app()
      .state.selection.map((s) => s.kind + ':' + s.id)
      .join('|');
  }

  function field(label, control, hint) {
    return h('label.form-row', h('span.form-label', label), control, hint ? h('span.form-hint', hint) : null);
  }

  function textInput(value, onInput, opts) {
    const o = opts || {};
    const el = o.multiline
      ? autosize(h('textarea.field', { rows: 2, placeholder: o.placeholder || '', spellcheck: true }))
      : h('input.field', { type: 'text', placeholder: o.placeholder || '', spellcheck: false });
    el.value = value || '';
    if (o.name) el.dataset.field = o.name;
    el.addEventListener('input', () => onInput(el.value));
    if (o.onCommit) el.addEventListener('change', () => o.onCommit(el.value));
    if (!o.multiline) {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          el.blur();
          document.getElementById('canvas').focus({ preventScroll: true });
        }
      });
    }
    return el;
  }

  function selectInput(options, value, onChange) {
    const el = h(
      'select.field',
      options.map((o) => h('option', { value: o.value, disabled: !!o.disabled }, o.label))
    );
    el.value = value;
    el.addEventListener('change', () => onChange(el.value));
    return el;
  }

  // groups as an indented list, optionally excluding a subtree
  function groupOptions(exclude) {
    const d = doc();
    const out = [];
    const walk = (parent, depth) => {
      d.groups
        .filter((gr) => (gr.parent || null) === parent)
        .forEach((gr) => {
          if (exclude && exclude.has(gr.id)) return;
          out.push({ value: gr.id, label: `${'   '.repeat(depth)}${depth ? '└ ' : ''}${gr.title || gr.id}` });
          walk(gr.id, depth + 1);
        });
    };
    walk(null, 0);
    return out;
  }

  const nodeTitle = (id) => {
    const n = M.findNode(doc(), id);
    return n ? n.title || SD.catalog.type(n.type).label : id;
  };

  function header(iconName, kicker, title, round) {
    return h(
      'div.insp-head',
      h('span.insp-icon' + (round ? '.round' : ''), icon(iconName, 20, 1.6)),
      h('div.insp-titles', h('span.insp-kicker', kicker), h('span.insp-title', title)),
      iconButton('x', 'Cerrar (Esc)', () => app().select([]))
    );
  }

  function section(title, ...children) {
    return h('div.insp-section', title ? h('div.insp-section-title', title) : null, ...children);
  }

  // After a title edit, let the Mermaid id follow the title. Merged into the
  // same undo step as the typing.
  function syncId(kind, id) {
    app().mutate((d) => M.syncIdWithTitle(d, id), {
      coalesce: `${kind}:${id}:title`,
      source: 'rename',
      select: (next) => app().state.selection.map((s) => (s.kind === kind && s.id === id ? { kind, id: next } : s)),
    });
  }

  // ------------------------------------------------------------------- node

  function nodePanel(node) {
    const t = SD.catalog.type(node.type);
    const id = node.id;
    const head = header(t.icon, t.label, node.title || t.label, t.category === 'client');
    const changeType = h('button.link-btn', { type: 'button' }, 'Cambiar tipo');
    changeType.addEventListener('click', () =>
      SD.picker.open({
        anchor: changeType,
        title: 'Tipo de componente',
        current: node.type,
        align: 'right',
        onPick: (type) => app().mutate((d) => M.updateNode(d, id, { type }), { source: 'picker' }),
      })
    );
    head.querySelector('.insp-titles').appendChild(changeType);

    const title = textInput(node.title, (v) => app().mutate((d) => M.updateNode(d, id, { title: v }), { coalesce: `node:${id}:title`, source: 'inspector' }), {
      name: 'title',
      placeholder: t.label,
      onCommit: () => syncId('node', id),
    });
    const desc = textInput(node.description, (v) => app().mutate((d) => M.updateNode(d, id, { description: v }), { coalesce: `node:${id}:desc`, source: 'inspector' }), {
      name: 'description',
      placeholder: 'Qué hace, tecnología, notas…',
      multiline: true,
    });

    const groupSel = selectInput(
      [{ value: '', label: 'Ninguno' }, ...groupOptions(), { value: '__new__', label: 'Nuevo grupo…' }],
      node.group || '',
      (v) => {
        if (v === '__new__') {
          app().mutate((d) => M.addGroup(d, { title: 'Grupo' }, [id]), { select: (gid) => [{ kind: 'group', id: gid }] });
          setTimeout(() => focusField('title'), 30);
        } else {
          app().mutate((d) => M.setNodeGroup(d, id, v || null));
        }
      }
    );

    const edges = doc().edges.filter((e) => e.from === id || e.to === id);
    const conns = h(
      'div.conn-list',
      edges.length
        ? edges.map((e) => {
            const out = e.from === id;
            const other = out ? e.to : e.from;
            const label = textInput(e.label, (v) => app().mutate((d) => M.updateEdge(d, e.id, { label: v }), { coalesce: `edge:${e.id}:label`, source: 'inspector' }), {
              placeholder: 'Texto (opcional)',
            });
            return h(
              'div.conn',
              h(
                'div.conn-top',
                h('span.conn-dir', { title: out ? 'Saliente' : 'Entrante' }, icon(out ? 'arrow-right' : 'arrow-left', 14)),
                h('button.conn-node', { type: 'button', title: 'Seleccionar', onclick: () => app().select([{ kind: 'node', id: other }]) }, nodeTitle(other)),
                iconButton('pencil', 'Editar conexión', () => app().select([{ kind: 'edge', id: e.id }])),
                iconButton('trash-2', 'Eliminar conexión', () => app().mutate((d) => M.removeEdge(d, e.id)))
              ),
              label
            );
          })
        : h('div.muted-note', 'Sin conexiones. Usa los botones + del lienzo.')
    );

    const others = doc().nodes.filter((n) => n.id !== id);
    const connect = others.length
      ? selectInput(
          [{ value: '', label: 'Conectar con…' }, ...others.map((n) => ({ value: n.id, label: n.title || n.id }))],
          '',
          (v) => {
            if (v) app().mutate((d) => M.addEdge(d, id, v));
          }
        )
      : null;

    const vertical = doc().direction === 'TB' || doc().direction === 'BT';
    const addBtn = (side) => {
      const b = h(
        'button.btn.subtle',
        { type: 'button' },
        side === 'left' ? icon('arrow-left', 14) : null,
        h('span', side === 'left' ? (vertical ? 'Antes' : 'Izquierda') : vertical ? 'Después' : 'Derecha'),
        side === 'right' ? icon('arrow-right', 14) : null
      );
      b.addEventListener('click', () => app().openAddPicker(id, side, b));
      return b;
    };

    return [
      head,
      section(null, field('Título', title), field('Descripción', desc), field('Grupo', groupSel)),
      section('Añadir componente conectado', h('div.btn-row', addBtn('left'), addBtn('right'))),
      section('Conexiones', conns, connect),
      section(null, h('button.btn.danger.wide', { type: 'button', onclick: () => app().deleteSelection() }, icon('trash-2', 14), h('span', 'Eliminar componente'))),
    ];
  }

  // ------------------------------------------------------------------- edge

  function edgePanel(edge) {
    const id = edge.id;
    const nodes = doc().nodes.map((n) => ({ value: n.id, label: n.title || n.id }));
    const from = selectInput(nodes, edge.from, (v) => app().mutate((d) => M.updateEdge(d, id, { from: v })));
    const to = selectInput(nodes, edge.to, (v) => app().mutate((d) => M.updateEdge(d, id, { to: v })));
    const label = textInput(edge.label, (v) => app().mutate((d) => M.updateEdge(d, id, { label: v }), { coalesce: `edge:${id}:label`, source: 'inspector' }), {
      name: 'title',
      placeholder: 'p. ej. llama, publica, lee…',
    });
    const style = segmented(
      [
        { value: 'solid', label: 'Sólida', title: 'Llamada síncrona' },
        { value: 'dashed', label: 'Punteada', title: 'Asíncrona / eventos' },
        { value: 'thick', label: 'Gruesa', title: 'Ruta crítica' },
      ],
      edge.style,
      (v) => app().mutate((d) => M.updateEdge(d, id, { style: v }), { source: 'inspector' })
    );
    const arrow = segmented(
      [
        { value: 'end', icon: 'arrow-right', title: 'Un sentido' },
        { value: 'both', icon: 'arrow-left-right', title: 'Ambos sentidos' },
        { value: 'none', label: '—', title: 'Sin flecha' },
      ],
      edge.arrow,
      (v) => app().mutate((d) => M.updateEdge(d, id, { arrow: v }), { source: 'inspector' })
    );
    return [
      header('link', 'Conexión', `${nodeTitle(edge.from)} → ${nodeTitle(edge.to)}`),
      section(
        null,
        field('Texto en la línea', label),
        h('div.form-row', h('span.form-label', 'Desde / hacia'), h('div.from-to', from, iconButton('arrow-left-right', 'Invertir dirección', () => app().mutate((d) => M.reverseEdge(d, id))), to)),
        field('Estilo', style),
        field('Flecha', arrow)
      ),
      section(null, h('button.btn.danger.wide', { type: 'button', onclick: () => app().deleteSelection() }, icon('trash-2', 14), h('span', 'Eliminar conexión'))),
    ];
  }

  // ------------------------------------------------------------------ group

  function groupPanel(gr) {
    const id = gr.id;
    const kind = SD.catalog.groupKind(gr.kind);
    const title = textInput(gr.title, (v) => app().mutate((d) => M.updateGroup(d, id, { title: v }), { coalesce: `group:${id}:title`, source: 'inspector' }), {
      name: 'title',
      placeholder: 'p. ej. AWS, VPN interna, Región us-east-1',
      onCommit: () => syncId('group', id),
    });
    const desc = textInput(gr.description, (v) => app().mutate((d) => M.updateGroup(d, id, { description: v }), { coalesce: `group:${id}:desc`, source: 'inspector' }), {
      name: 'description',
      placeholder: 'Opcional',
      multiline: true,
    });
    const kinds = h(
      'div.kind-grid',
      SD.catalog.groupKinds.map((k) =>
        h(
          'button.kind' + (k.id === gr.kind ? '.on' : ''),
          { type: 'button', title: k.label, onclick: () => app().mutate((d) => M.updateGroup(d, id, { kind: k.id })) },
          icon(k.icon, 15),
          h('span', k.label)
        )
      )
    );
    const parent = selectInput(
      [{ value: '', label: 'Ninguno (nivel superior)' }, ...groupOptions(M.groupDescendants(doc(), id))],
      gr.parent || '',
      (v) => app().mutate((d) => M.setGroupParent(d, id, v || null))
    );

    const members = M.groupMembers(doc(), id);
    const memberRows = [
      ...members.groups.map((c) =>
        h(
          'div.member',
          icon(SD.catalog.groupKind(c.kind).icon, 14),
          h('button.conn-node', { type: 'button', onclick: () => app().select([{ kind: 'group', id: c.id }]) }, c.title || c.id),
          iconButton('x', 'Sacar del grupo', () => app().mutate((d) => M.setGroupParent(d, c.id, gr.parent || null)))
        )
      ),
      ...members.nodes.map((n) =>
        h(
          'div.member',
          icon(SD.catalog.type(n.type).icon, 14),
          h('button.conn-node', { type: 'button', onclick: () => app().select([{ kind: 'node', id: n.id }]) }, n.title || n.id),
          iconButton('x', 'Sacar del grupo', () => app().mutate((d) => M.setNodeGroup(d, n.id, gr.parent || null)))
        )
      ),
    ];
    const outside = doc().nodes.filter((n) => n.group !== id);
    const addExisting = outside.length
      ? selectInput([{ value: '', label: 'Mover componente aquí…' }, ...outside.map((n) => ({ value: n.id, label: n.title || n.id }))], '', (v) => {
          if (v) app().mutate((d) => M.setNodeGroup(d, v, id));
        })
      : null;
    const addNew = h('button.btn.subtle', { type: 'button' }, icon('plus', 14), h('span', 'Nuevo componente aquí'));
    addNew.addEventListener('click', () =>
      SD.picker.open({ anchor: addNew, title: `Añadir a “${gr.title}”`, align: 'right', onPick: (type) => app().addComponent(type, { group: id }) })
    );

    return [
      header(kind.icon, 'Grupo · ' + kind.label, gr.title || gr.id),
      section(null, field('Título', title), field('Descripción', desc), h('div.form-row', h('span.form-label', 'Tipo'), kinds), field('Dentro de', parent)),
      section('Contenido', memberRows.length ? h('div.member-list', memberRows) : h('div.muted-note', 'Grupo vacío.'), addExisting, h('div.btn-row', addNew)),
      section(
        null,
        h(
          'div.btn-row',
          h('button.btn.subtle', { type: 'button', onclick: () => app().mutate((d) => M.removeGroup(d, id, false), { select: () => [] }) }, icon('ungroup', 14), h('span', 'Desagrupar')),
          h(
            'button.btn.danger',
            {
              type: 'button',
              onclick: async () => {
                const count = doc().nodes.filter((n) => n.group && M.groupDescendants(doc(), id).has(n.group)).length;
                if (count) {
                  const ok = await SD.ui.confirm({
                    title: 'Eliminar grupo y contenido',
                    message: `Se eliminarán “${gr.title}” y ${count} componente(s) dentro de él.`,
                    confirmLabel: 'Eliminar',
                    danger: true,
                  });
                  if (!ok) return;
                }
                app().mutate((d) => M.removeGroup(d, id, true), { select: () => [] });
              },
            },
            icon('trash-2', 14),
            h('span', 'Eliminar todo')
          )
        )
      ),
    ];
  }

  // ------------------------------------------------------------------ multi

  function multiPanel(sel) {
    const nodes = sel.filter((s) => s.kind === 'node');
    return [
      h('div.insp-head', h('span.insp-icon', icon('combine', 20, 1.6)), h('div.insp-titles', h('span.insp-kicker', 'Selección'), h('span.insp-title', `${sel.length} elementos`)), iconButton('x', 'Cerrar (Esc)', () => app().select([]))),
      section(
        null,
        h(
          'div.multi-list',
          sel.map((s) => {
            const label = s.kind === 'node' ? nodeTitle(s.id) : s.kind === 'group' ? (M.findGroup(doc(), s.id) || {}).title : 'Conexión';
            return h('div.member', icon(s.kind === 'node' ? SD.catalog.type(M.findNode(doc(), s.id).type).icon : s.kind === 'group' ? 'square-dashed' : 'link', 14), h('span', label), iconButton('x', 'Quitar de la selección', () => app().toggleSelect(s)));
          })
        )
      ),
      section(
        null,
        h(
          'div.btn-col',
          nodes.length ? h('button.btn.primary.wide', { type: 'button', onclick: () => app().groupSelection() }, icon('square-dashed', 14), h('span', 'Agrupar en un grupo nuevo')) : null,
          nodes.length === 2 && sel.length === 2 ? h('button.btn.subtle.wide', { type: 'button', onclick: () => app().connectSelection() }, icon('link', 14), h('span', `Conectar ${nodeTitle(nodes[0].id)} → ${nodeTitle(nodes[1].id)}`)) : null,
          h('button.btn.danger.wide', { type: 'button', onclick: () => app().deleteSelection() }, icon('trash-2', 14), h('span', 'Eliminar selección'))
        )
      ),
    ];
  }

  // ----------------------------------------------------------------- render

  function build() {
    const sel = app().state.selection;
    SD.ui.clear(root);
    if (!sel.length) {
      root.hidden = true;
      return;
    }
    let content;
    if (sel.length > 1) content = multiPanel(sel);
    else if (sel[0].kind === 'node') content = nodePanel(M.findNode(doc(), sel[0].id));
    else if (sel[0].kind === 'edge') content = edgePanel(M.findEdge(doc(), sel[0].id));
    else content = groupPanel(M.findGroup(doc(), sel[0].id));
    SD.ui.append(root, h('div.insp-scroll', content));
    root.hidden = false;
  }

  // Keep the panel stable while the user types in it: only the header text
  // changes, everything else is rebuilt when the selection or structure moves.
  function refreshHeader() {
    const sel = app().state.selection;
    if (sel.length !== 1) return;
    const t = root.querySelector('.insp-title');
    if (!t) return;
    const s = sel[0];
    if (s.kind === 'node') {
      const n = M.findNode(doc(), s.id);
      if (n) t.textContent = n.title || SD.catalog.type(n.type).label;
    } else if (s.kind === 'group') {
      const gr = M.findGroup(doc(), s.id);
      if (gr) t.textContent = gr.title || gr.id;
    } else {
      const e = M.findEdge(doc(), s.id);
      if (e) t.textContent = `${nodeTitle(e.from)} → ${nodeTitle(e.to)}`;
    }
  }

  let building = false;
  let pending = null;

  function update(opts) {
    const o = opts || {};
    if (building) {
      pending = o;
      return;
    }
    if (selectionKey() === lastKey && o.source === 'inspector') {
      refreshHeader();
      return;
    }
    building = true;
    try {
      // Commit a field being edited first: its change handler may mutate the
      // doc (id sync), which re-enters here and is handled as `pending`.
      if (root.contains(document.activeElement)) document.activeElement.blur();
      const key = selectionKey();
      const scroll = root.querySelector('.insp-scroll');
      const top = key === lastKey && scroll ? scroll.scrollTop : 0;
      lastKey = key;
      build();
      const next = root.querySelector('.insp-scroll');
      if (next) next.scrollTop = top;
    } finally {
      building = false;
    }
    if (pending) {
      const p = pending;
      pending = null;
      update(Object.assign({}, p, { source: 'pending' }));
    }
    requestAnimationFrame(() => SD.app.updateOverlay());
  }

  function focusField(name) {
    const el = root && root.querySelector(`[data-field="${name}"]`);
    if (el) {
      el.focus();
      if (el.select) el.select();
    }
  }

  function init() {
    root = document.getElementById('inspector');
    SD.app.on('selection', update);
  }

  SD.inspector = { init, focusField };
})(globalThis);
