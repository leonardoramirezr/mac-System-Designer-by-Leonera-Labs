// Small DOM toolkit shared by the panels: element builder, icons, toasts,
// dialogs, popovers and a segmented control.
(function (g) {
  const SD = (g.SD = g.SD || {});

  // h('button.btn.primary', { onclick }, 'Label', child, ...)
  function h(spec, attrs, ...children) {
    const m = /^([a-z0-9-]*)((?:[.#][\w-]+)*)$/i.exec(spec) || [spec, spec, ''];
    const el = document.createElement(m[1] || 'div');
    const classes = [];
    (m[2].match(/[.#][\w-]+/g) || []).forEach((part) => {
      if (part[0] === '#') el.id = part.slice(1);
      else classes.push(part.slice(1));
    });
    if (classes.length) el.className = classes.join(' ');
    if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
      children.unshift(attrs);
      attrs = null;
    }
    if (attrs) {
      Object.entries(attrs).forEach(([k, v]) => {
        if (v === undefined || v === null || v === false) return;
        if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
        else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
      });
    }
    append(el, children);
    return el;
  }

  function append(el, children) {
    [children].flat(Infinity).forEach((c) => {
      if (c === null || c === undefined || c === false) return;
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    });
    return el;
  }

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';

  function iconSVG(name, size, strokeWidth) {
    const body = (SD.iconBodies && SD.iconBodies[name]) || '';
    const sw = strokeWidth || 1.75;
    return `<svg xmlns="${SVG_NS}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${body.replace(/stroke-width="2"/g, `stroke-width="${sw}"`)}</svg>`;
  }

  function icon(name, size, strokeWidth) {
    const span = document.createElement('span');
    span.className = 'icon';
    span.innerHTML = iconSVG(name, size || 16, strokeWidth);
    return span;
  }

  function iconButton(name, title, onclick, extraClass) {
    return h('button.icon-btn' + (extraClass ? '.' + extraClass : ''), { type: 'button', title, 'aria-label': title, onclick }, icon(name, 16));
  }

  // Segmented control: options = [{ value, label, icon, title }]
  function segmented(options, value, onchange, opts) {
    const root = h('div.segmented' + (opts && opts.small ? '.small' : ''), { role: 'radiogroup' });
    const set = (v) => {
      root.dataset.value = v;
      [...root.children].forEach((b) => {
        const on = b.dataset.value === v;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
    };
    options.forEach((o) => {
      const b = h(
        'button.segment',
        {
          type: 'button',
          role: 'radio',
          title: o.title || o.label || '',
          dataset: { value: o.value },
          onclick: () => {
            if (root.dataset.value === o.value) return;
            set(o.value);
            onchange(o.value);
          },
        },
        o.icon ? icon(o.icon, 14) : null,
        o.label ? h('span', o.label) : null
      );
      root.appendChild(b);
    });
    set(value);
    root.setValue = set;
    return root;
  }

  function autosize(textarea) {
    const fit = () => {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight + 2, 320) + 'px';
    };
    textarea.addEventListener('input', fit);
    requestAnimationFrame(fit);
    return textarea;
  }

  // ------------------------------------------------------------------ toasts

  function toast(message, opts) {
    const o = opts || {};
    const host = document.getElementById('toasts');
    const el = h(
      'div.toast' + (o.kind ? '.' + o.kind : ''),
      h('span.toast-text', message),
      o.action ? h('button.link-btn', { type: 'button', onclick: () => { o.action.run(); dismiss(); } }, o.action.label) : null
    );
    const dismiss = () => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 200);
    };
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add('shown'));
    setTimeout(dismiss, o.duration || (o.action ? 6000 : 3200));
    return dismiss;
  }

  // ----------------------------------------------------------------- dialogs

  function dialog({ title, body, actions, onClose, wide }) {
    const layer = document.getElementById('layer');
    const backdrop = h('div.backdrop');
    const box = h('div.dialog' + (wide ? '.wide' : ''), { role: 'dialog', 'aria-modal': 'true' });
    const close = (result) => {
      backdrop.remove();
      document.removeEventListener('keydown', onKey, true);
      if (onClose) onClose(result);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(null);
      }
    };
    document.addEventListener('keydown', onKey, true);
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) close(null);
    });
    append(box, [
      h('div.dialog-head', h('h2', title), iconButton('x', 'Cerrar', () => close(null))),
      h('div.dialog-body', body),
      actions && actions.length
        ? h(
            'div.dialog-actions',
            actions.map((a) =>
              h('button.btn' + (a.primary ? '.primary' : '') + (a.danger ? '.danger' : ''), { type: 'button', onclick: () => (a.run ? a.run(close) : close(a.value)) }, a.label)
            )
          )
        : null,
    ]);
    backdrop.appendChild(box);
    layer.appendChild(backdrop);
    const first = box.querySelector('input, textarea, select, .btn.primary');
    if (first) setTimeout(() => first.focus(), 30);
    return { close, box };
  }

  function confirm({ title, message, confirmLabel, danger }) {
    return new Promise((resolve) => {
      dialog({
        title,
        body: h('p.dialog-text', message),
        actions: [
          { label: 'Cancelar', value: false },
          { label: confirmLabel || 'Aceptar', value: true, primary: !danger, danger: !!danger },
        ],
        onClose: (v) => resolve(!!v),
      });
    });
  }

  function prompt({ title, label, value, placeholder, confirmLabel }) {
    return new Promise((resolve) => {
      const input = h('input.field', { type: 'text', value: value || '', placeholder: placeholder || '' });
      const d = dialog({
        title,
        body: h('label.form-row', h('span.form-label', label), input),
        actions: [
          { label: 'Cancelar', value: null },
          { label: confirmLabel || 'Aceptar', primary: true, run: (close) => close(input.value) },
        ],
        onClose: (v) => resolve(v === null || v === undefined ? null : String(v)),
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          d.close(input.value);
        }
      });
      setTimeout(() => input.select(), 40);
    });
  }

  // ---------------------------------------------------------------- popovers

  let openPopover = null;

  // anchor: Element or { x, y } in viewport coordinates
  function popover(content, anchor, opts) {
    closePopover();
    const o = opts || {};
    const layer = document.getElementById('layer');
    const el = h('div.popover' + (o.className ? '.' + o.className : ''), content);
    layer.appendChild(el);
    const place = () => {
      const r = anchor instanceof Element ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y, width: 0, height: 0 };
      const pw = el.offsetWidth;
      const ph = el.offsetHeight;
      const vw = g.innerWidth;
      const vh = g.innerHeight;
      let left = o.align === 'center' ? r.left + r.width / 2 - pw / 2 : o.align === 'right' ? r.right - pw : r.left;
      let top = o.placement === 'top' ? r.top - ph - 8 : r.bottom + 8;
      if (top + ph > vh - 8) top = Math.max(8, r.top - ph - 8);
      if (top < 8) top = 8;
      left = Math.max(8, Math.min(left, vw - pw - 8));
      el.style.left = left + 'px';
      el.style.top = top + 'px';
    };
    place();
    const onDown = (e) => {
      if (!el.contains(e.target) && !(anchor instanceof Element && anchor.contains(e.target))) closePopover();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closePopover();
      }
    };
    setTimeout(() => document.addEventListener('mousedown', onDown, true), 0);
    document.addEventListener('keydown', onKey, true);
    openPopover = {
      el,
      close() {
        document.removeEventListener('mousedown', onDown, true);
        document.removeEventListener('keydown', onKey, true);
        el.remove();
        if (o.onClose) o.onClose();
      },
    };
    requestAnimationFrame(() => el.classList.add('shown'));
    return openPopover;
  }

  function closePopover() {
    if (openPopover) {
      const p = openPopover;
      openPopover = null;
      p.close();
    }
  }

  function menu(items, anchor, opts) {
    const list = h(
      'div.menu',
      items.map((it) =>
        it === '-'
          ? h('div.menu-sep')
          : h(
              'button.menu-item' + (it.danger ? '.danger' : ''),
              { type: 'button', disabled: !!it.disabled, onclick: () => { closePopover(); it.run(); } },
              it.icon ? icon(it.icon, 15) : h('span.icon'),
              h('span.menu-label', it.label),
              it.shortcut ? h('span.menu-shortcut', it.shortcut) : null
            )
      )
    );
    return popover(list, anchor, opts);
  }

  function relativeTime(iso) {
    const t = new Date(iso).getTime();
    if (!t) return '';
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 45) return 'hace un momento';
    const m = Math.round(s / 60);
    if (m < 60) return `hace ${m} min`;
    const hrs = Math.round(m / 60);
    if (hrs < 24) return `hace ${hrs} h`;
    const d = Math.round(hrs / 24);
    if (d < 7) return d === 1 ? 'ayer' : `hace ${d} días`;
    return new Date(t).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const mod = isMac ? '⌘' : 'Ctrl+';

  SD.ui = {
    h,
    append,
    clear,
    icon,
    iconSVG,
    iconButton,
    segmented,
    autosize,
    toast,
    dialog,
    confirm,
    prompt,
    popover,
    closePopover,
    menu,
    relativeTime,
    isMac,
    mod,
  };
})(globalThis);
