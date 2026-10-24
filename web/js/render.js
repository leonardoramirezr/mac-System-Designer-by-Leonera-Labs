// Mermaid rendering: theme from CSS tokens, the component icon pack, and a
// post-processing pass that tags SVG elements with model ids for selection.
(function (g) {
  const SD = (g.SD = g.SD || {});

  const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Inter, "Segoe UI", system-ui, sans-serif';
  let counter = 0;
  let packRegistered = false;

  function registerPack() {
    if (packRegistered) return;
    const icons = {};
    SD.catalog.types.forEach((t) => {
      const body = SD.iconBodies[t.icon] || SD.iconBodies.shapes;
      icons[t.id] = { body: body.replace(/stroke-width="2"/g, 'stroke-width="1.6"') };
    });
    g.mermaid.registerIconPacks([{ name: SD.sdll.ICON_PREFIX, icons: { prefix: SD.sdll.ICON_PREFIX, width: 24, height: 24, icons } }]);
    packRegistered = true;
  }

  function token(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function isDark() {
    return !!(g.matchMedia && g.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function palette(exporting) {
    if (!exporting) {
      return {
        canvas: token('--canvas', '#f6f6f7'),
        tile: token('--tile', '#ffffff'),
        tileBorder: token('--tile-border', '#d9d9de'),
        icon: token('--icon', '#27272a'),
        text: token('--text', '#18181b'),
        muted: token('--muted', '#8e8e96'),
        edge: token('--edge', '#9a9aa3'),
        edgeText: token('--edge-text', '#6b6b73'),
        groupFill: token('--group-fill', '#f0f0f2'),
        groupStroke: token('--group-stroke', '#d4d4d8'),
        groupTitle: token('--group-title', '#3f3f46'),
      };
    }
    // explicit light palette for exports
    return {
      canvas: '#ffffff', tile: '#ffffff', tileBorder: '#d9d9de', icon: '#27272a', text: '#18181b', muted: '#8e8e96',
      edge: '#9a9aa3', edgeText: '#6b6b73', groupFill: '#f4f4f5', groupStroke: '#d4d4d8', groupTitle: '#3f3f46',
    };
  }

  function themeCSS(p) {
    return `
      .nodeLabel p, .edgeLabel p, .cluster-label p { margin: 0; }
      .icon-shape .labelBkg, .icon-shape .label foreignObject > div, .icon-shape .label p, .icon-shape .nodeLabel { background: transparent !important; }
      .icon-shape .label rect { fill: transparent !important; }
      .icon-shape .nodeLabel { color: ${p.text}; font-size: 12.5px; font-weight: 600; letter-spacing: -0.005em; }
      .icon-shape .nodeLabel small { display: block; margin-top: 1px; color: ${p.muted}; font-size: 11px; font-weight: 400; line-height: 1.35; letter-spacing: 0; }
      .icon-shape > g:first-child > path:last-child { stroke: ${p.tileBorder} !important; stroke-width: 1px !important; }
      .icon-shape > g:first-child > path:first-child { fill: ${p.tile} !important; }
      .cluster rect { fill: ${p.groupFill}; stroke: ${p.groupStroke}; stroke-width: 1px; }
      .cluster-label .nodeLabel, .cluster-label span { color: ${p.groupTitle} !important; font-size: 12px; font-weight: 600; letter-spacing: -0.005em; }
      .cluster-label small { display: block; color: ${p.muted}; font-size: 11px; font-weight: 400; }
      .flowchart-link { stroke: ${p.edge}; }
      .edge-thickness-normal { stroke-width: 1.3px; }
      .edge-thickness-thick { stroke-width: 2.6px; }
      .edge-pattern-dashed { stroke-dasharray: 5 4; }
      .marker, marker path { fill: ${p.edge} !important; stroke: ${p.edge} !important; }
      .edgeLabel, .edgeLabel p, .edgeLabel .labelBkg { background-color: ${p.canvas} !important; color: ${p.edgeText} !important; font-size: 11.5px; }
      .edgeLabel rect { fill: ${p.canvas} !important; opacity: 1 !important; }
      .sd-placeholder .nodeLabel, .sd-placeholder span { color: ${p.muted} !important; font-size: 11.5px; font-style: italic; font-weight: 400; }
      .sd-group-icon { color: ${p.groupTitle}; }
    `;
  }

  function configure(dark, exporting) {
    const p = palette(exporting);
    g.mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
      theme: 'base',
      darkMode: dark === undefined ? isDark() : dark,
      fontFamily: FONT,
      themeVariables: {
        fontFamily: FONT,
        fontSize: '13px',
        background: p.canvas,
        primaryColor: p.tile,
        mainBkg: p.tile,
        primaryBorderColor: p.tileBorder,
        nodeBorder: p.icon,
        primaryTextColor: p.text,
        textColor: p.text,
        lineColor: p.edge,
        clusterBkg: p.groupFill,
        clusterBorder: p.groupStroke,
        titleColor: p.groupTitle,
        edgeLabelBackground: p.canvas,
        tertiaryColor: p.groupFill,
      },
      themeCSS: themeCSS(p),
      flowchart: {
        htmlLabels: true,
        curve: 'basis',
        padding: 14,
        nodeSpacing: 44,
        rankSpacing: 70,
        diagramPadding: 28,
        wrappingWidth: 170,
        useMaxWidth: false,
        subGraphTitleMargin: { top: 6, bottom: 10 },
      },
    });
    return p;
  }

  // Tags rendered SVG elements with model ids and adds hit areas and group icons.
  function postProcess(svg, doc, svgId, p, dark) {
    const nodeIds = new Set(doc.nodes.map((n) => n.id));
    const nodeEls = new Map();
    const re = new RegExp('^' + svgId + '-flowchart-(.+)-\\d+$');
    svg.querySelectorAll('g[id]').forEach((el) => {
      const m = re.exec(el.id);
      if (!m) return;
      const id = m[1];
      if (nodeIds.has(id)) {
        el.classList.add('sd-node');
        el.setAttribute('data-sd-node', id);
        nodeEls.set(id, el);
      } else if (id.startsWith(SD.sdll.PLACEHOLDER_PREFIX)) {
        el.classList.add('sd-placeholder');
        el.setAttribute('data-sd-group', id.slice(SD.sdll.PLACEHOLDER_PREFIX.length));
      }
    });

    const groupEls = new Map();
    doc.groups.forEach((gr) => {
      const el = svg.querySelector(`g.cluster[id="${svgId}-${gr.id}"]`);
      if (!el) return;
      el.classList.add('sd-group');
      el.setAttribute('data-sd-group', gr.id);
      groupEls.set(gr.id, el);
      const rect = el.querySelector(':scope > rect');
      const label = el.querySelector(':scope > .cluster-label');
      if (rect) {
        rect.setAttribute('rx', '12');
        rect.setAttribute('ry', '12');
      }
      if (rect && label) {
        // left-align the title and put the group kind icon before it
        const x = parseFloat(rect.getAttribute('x')) || 0;
        const y = parseFloat(rect.getAttribute('y')) || 0;
        const t = /translate\(\s*([-\d.]+)[ ,]+([-\d.]+)\s*\)/.exec(label.getAttribute('transform') || '');
        const ly = t ? parseFloat(t[2]) : y;
        label.setAttribute('transform', `translate(${x + 32}, ${ly + 4})`);
        const kind = SD.catalog.groupKind(gr.kind);
        const ns = 'http://www.w3.org/2000/svg';
        const ig = document.createElementNS(ns, 'g');
        ig.setAttribute('class', 'sd-group-icon');
        ig.setAttribute('transform', `translate(${x + 12}, ${ly + 7})`);
        ig.innerHTML = SD.ui.iconSVG(kind.icon, 15, 1.9);
        ig.style.color = p.groupTitle;
        el.insertBefore(ig, label);
      }
    });

    // edges are rendered in definition order, which is doc.edges order
    const edgeEls = new Map();
    const paths = [...svg.querySelectorAll('path[data-edge="true"], path.flowchart-link')].filter((pth, i, arr) => arr.indexOf(pth) === i);
    const used = new Set();
    doc.edges.forEach((e, i) => {
      const prefix = `L_${e.from}_${e.to}_`;
      let path = paths[i] && (paths[i].getAttribute('data-id') || '').startsWith(prefix) ? paths[i] : null;
      if (!path) path = paths.find((pth) => !used.has(pth) && (pth.getAttribute('data-id') || '').startsWith(prefix)) || null;
      if (!path) return;
      used.add(path);
      const dataId = path.getAttribute('data-id');
      path.classList.add('sd-edge');
      path.setAttribute('data-sd-edge', e.id);
      const hit = path.cloneNode(false);
      hit.removeAttribute('id');
      hit.removeAttribute('marker-end');
      hit.removeAttribute('marker-start');
      hit.removeAttribute('style');
      hit.setAttribute('class', 'sd-edge-hit');
      hit.setAttribute('data-sd-edge', e.id);
      path.parentNode.insertBefore(hit, path);
      const labelEl = dataId && svg.querySelector(`.edgeLabel .label[data-id="${dataId}"]`);
      if (labelEl) {
        const host = labelEl.closest('.edgeLabel') || labelEl;
        host.classList.add('sd-edge-label');
        host.setAttribute('data-sd-edge', e.id);
      }
      edgeEls.set(e.id, { path, label: labelEl || null });
    });
    tintEdgeLabels(svg, doc, groupEls, p, dark);
    return { nodeEls, groupEls, edgeEls };
  }

  // Edge labels get a background so the line does not cross the text; inside
  // a group that background has to match the group's fill, not the canvas.
  function tintEdgeLabels(svg, doc, groupEls, p, dark) {
    const pal = SD.catalog.groupPalette[dark ? 'dark' : 'light'];
    const boxes = [];
    groupEls.forEach((el, gid) => {
      const rect = el.querySelector(':scope > rect');
      const gr = SD.model.findGroup(doc, gid);
      if (!rect || !gr) return;
      const x = parseFloat(rect.getAttribute('x'));
      const y = parseFloat(rect.getAttribute('y'));
      const w = parseFloat(rect.getAttribute('width'));
      const hh = parseFloat(rect.getAttribute('height'));
      const fill = gr.kind && gr.kind !== 'generic' ? pal[gr.kind].fill : p.groupFill;
      boxes.push({ x, y, w, h: hh, area: w * hh, fill });
    });
    if (!boxes.length) return;
    svg.querySelectorAll('g.edgeLabel').forEach((lab) => {
      const t = /translate\(\s*([-\d.]+)[ ,]+([-\d.]+)\s*\)/.exec(lab.getAttribute('transform') || '');
      if (!t) return;
      const cx = parseFloat(t[1]);
      const cy = parseFloat(t[2]);
      const inside = boxes.filter((b) => cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h).sort((a, b) => a.area - b.area)[0];
      if (!inside) return;
      lab.querySelectorAll('p, .labelBkg, span.edgeLabel').forEach((el) => el.style.setProperty('background-color', inside.fill, 'important'));
      lab.querySelectorAll('rect').forEach((el) => el.style.setProperty('fill', inside.fill, 'important'));
    });
  }

  // Renders the doc and returns a detached SVG element plus lookup maps.
  async function render(doc, opts) {
    const o = opts || {};
    registerPack();
    const dark = o.dark === undefined ? isDark() : o.dark;
    const p = configure(dark, !!o.exporting);
    const id = 'sdm' + ++counter;
    const source = SD.sdll.serialize(doc, { header: false, placeholders: true, palette: dark ? 'dark' : 'light' });
    let result;
    try {
      result = await g.mermaid.render(id, source);
    } finally {
      ['#' + id, '#d' + id, '#i' + id].forEach((sel) => {
        const stray = document.querySelector(sel);
        if (stray && !stray.closest('#world')) stray.remove();
      });
    }
    const holder = document.createElement('div');
    holder.innerHTML = result.svg;
    const svg = holder.querySelector('svg');
    const vb = (svg.getAttribute('viewBox') || '0 0 100 100').split(/[\s,]+/).map(Number);
    const width = vb[2];
    const height = vb[3];
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.style.maxWidth = 'none';
    return { svg, id, width, height, source, palette: p, finish: (attached) => postProcess(attached || svg, doc, id, p, dark) };
  }

  // Standalone, light-themed SVG for exporting.
  async function exportSVG(doc) {
    const r = await render(doc, { dark: false, exporting: true });
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-99999px;top:0;';
    host.appendChild(r.svg);
    document.body.appendChild(host);
    try {
      r.finish(r.svg);
      r.svg.querySelectorAll('.sd-edge-hit').forEach((el) => el.remove());
      r.svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      const vb = r.svg.getAttribute('viewBox').split(/[\s,]+/).map(Number);
      bg.setAttribute('x', vb[0]);
      bg.setAttribute('y', vb[1]);
      bg.setAttribute('width', vb[2]);
      bg.setAttribute('height', vb[3]);
      bg.setAttribute('fill', '#ffffff');
      r.svg.insertBefore(bg, r.svg.firstChild);
      return new XMLSerializer().serializeToString(r.svg);
    } finally {
      host.remove();
      configure();
    }
  }

  SD.render = { render, exportSVG, isDark, configure };
})(globalThis);
