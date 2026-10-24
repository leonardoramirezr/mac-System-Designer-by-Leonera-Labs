// Component picker: searchable grid of component types, grouped by category.
(function (g) {
  const SD = (g.SD = g.SD || {});
  const { h, icon, popover, closePopover } = SD.ui;

  function normalize(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  }

  function matches(type, q) {
    if (!q) return true;
    const hay = normalize([type.label, type.id, ...type.keywords].join(' '));
    return normalize(q)
      .split(/\s+/)
      .filter(Boolean)
      .every((w) => hay.includes(w));
  }

  // open({ anchor, title, onPick(typeId), current })
  function open(opts) {
    const search = h('input.picker-search', { type: 'search', placeholder: 'Buscar componente…', spellcheck: false, 'aria-label': 'Buscar componente' });
    const list = h('div.picker-list');
    const root = h(
      'div.picker',
      opts.title ? h('div.picker-title', opts.title) : null,
      h('div.picker-search-wrap', icon('search', 14), search),
      list
    );
    let items = [];
    let active = 0;

    const pick = (typeId) => {
      closePopover();
      opts.onPick(typeId);
    };

    const setActive = (i) => {
      if (!items.length) return;
      active = (i + items.length) % items.length;
      items.forEach((b, j) => b.classList.toggle('active', j === active));
      items[active].scrollIntoView({ block: 'nearest' });
    };

    const draw = () => {
      SD.ui.clear(list);
      const q = search.value.trim();
      items = [];
      SD.catalog.categories.forEach((cat) => {
        const types = SD.catalog.types.filter((t) => t.category === cat.id && matches(t, q));
        if (!types.length) return;
        list.appendChild(h('div.picker-cat', cat.label));
        const grid = h('div.picker-grid');
        types.forEach((t) => {
          const b = h(
            'button.picker-item' + (t.id === opts.current ? '.current' : ''),
            { type: 'button', title: t.label, onclick: () => pick(t.id), dataset: { type: t.id } },
            h('span.picker-icon' + (t.category === 'client' ? '.round' : ''), icon(t.icon, 20, 1.6)),
            h('span.picker-label', t.label)
          );
          b.addEventListener('mouseenter', () => setActive(items.indexOf(b)));
          items.push(b);
          grid.appendChild(b);
        });
        list.appendChild(grid);
      });
      if (!items.length) list.appendChild(h('div.picker-empty', 'Sin resultados'));
      active = 0;
      if (items.length && q) items[0].classList.add('active');
    };

    search.addEventListener('input', draw);
    search.addEventListener('keydown', (e) => {
      const cols = 3;
      if (e.key === 'Enter') {
        e.preventDefault();
        if (items[active]) pick(items[active].dataset.type);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setActive(active + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setActive(active - 1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive(active + cols);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive(active - cols);
      }
    });
    draw();
    const pop = popover(root, opts.anchor, { className: 'picker-pop', align: opts.align || 'left', placement: opts.placement });
    search.focus({ preventScroll: true });
    return pop;
  }

  SD.picker = { open };
})(globalThis);
