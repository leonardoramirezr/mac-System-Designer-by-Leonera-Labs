// The .sdll format: a plain-text file that is a valid Mermaid flowchart, plus
// one metadata comment line. Mermaid ignores `%%` comments, so the file can be
// pasted into any Mermaid renderer as-is.
//
//   %% System Designer · sdll v1
//   %% @meta {"format":"sdll","version":1,"name":"Checkout", ...}
//   flowchart LR
//     web@{ icon: "sd:web", form: "circle", label: "Web", pos: "b", h: 46 }
//     subgraph aws["AWS"]
//       api@{ icon: "sd:server", form: "rounded", label: "API<br><small>REST</small>", pos: "b", h: 46 }
//     end
//     web -->|"llama"| api
//     class aws grp_cloud
//     classDef grp_cloud fill:#eff6ff,stroke:#93c5fd,stroke-dasharray:5 4
(function (g) {
  const SD = (g.SD = g.SD || {});
  const M = () => SD.model;

  const FORMAT_VERSION = 1;
  const HEADER = '%% System Designer · sdll v1';
  const ICON_PREFIX = 'sd';
  const ICON_SIZE = 46;
  const GROUP_CLASS_PREFIX = 'grp_';
  const PLACEHOLDER_PREFIX = 'sdph_';
  const TOOL_NAME = 'System Designer by Leonera Labs';
  const TOOL_URL = 'https://github.com/leonardoramirezr/mac-System-Designer-by-Leonera-Labs';
  // Light palette, as in the exported SVG: the external copy draws its icons with it.
  const EXPORT_COLORS = { tile: '#ffffff', tileBorder: '#d9d9de', icon: '#27272a' };
  const EXTERNAL_NOTES = [
    `%% Generated with ${TOOL_NAME}`,
    `%% ${TOOL_URL}`,
    '%% Do not edit this by hand: you can import it into System Designer and edit it there.',
  ];

  // ---------------------------------------------------------------- escaping

  // Mermaid turns `#word;` into entity placeholders and runs node labels
  // through Markdown, so `#`, `*`, `_` and backticks are written as named
  // HTML entities. Everything else that could end a quoted string or inject
  // markup is entity-encoded too.
  function escapeText(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/#/g, '&num;')
      .replace(/\*/g, '&ast;')
      .replace(/_/g, '&lowbar;')
      .replace(/`/g, '&grave;')
      .replace(/\\/g, '&bsol;');
  }

  function escapeInline(text) {
    return escapeText(String(text || '').replace(/\s*\r?\n\s*/g, ' ').trim());
  }

  function escapeMultiline(text) {
    return String(text || '')
      .trim()
      .split(/\r?\n/)
      .map((l) => escapeText(l.trim()))
      .filter((l, i, arr) => l || (i > 0 && i < arr.length - 1))
      .join('<br>');
  }

  const NAMED_ENTITIES = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", num: '#', ast: '*', lowbar: '_', grave: '`',
    bsol: '\\', nbsp: ' ', colon: ':', semi: ';', vert: '|', verbar: '|', lpar: '(', rpar: ')',
    lsqb: '[', rsqb: ']', lbrack: '[', rbrack: ']', lcub: '{', rcub: '}', lbrace: '{', rbrace: '}',
    excl: '!', quest: '?', plus: '+', equals: '=', percnt: '%', dollar: '$', commat: '@', hyphen: '-',
    period: '.', comma: ',', sol: '/', bull: '•', middot: '·', hellip: '…', ndash: '–', mdash: '—',
  };

  // Single pass, so text produced by one entity is never decoded again.
  function decodeEntities(text) {
    return String(text || '').replace(/&#x([0-9a-f]+);|&#(\d+);|&([a-z]+);|#(\d+);|#([a-z]+);/gi, (m, hex, dec, name, mdec, mname) => {
      if (hex) return safeCodePoint(parseInt(hex, 16));
      if (dec || mdec) return safeCodePoint(parseInt(dec || mdec, 10));
      const key = String(name || mname).toLowerCase();
      // Mermaid's `#name;` form only covers real entity names; leave `#tag;` text alone
      return NAMED_ENTITIES[key] !== undefined ? NAMED_ENTITIES[key] : m;
    });
  }

  function safeCodePoint(n) {
    try {
      return String.fromCodePoint(n);
    } catch (e) {
      return '';
    }
  }

  // --------------------------------------------------------------- serialize

  function nodeLabel(node) {
    const title = escapeInline(node.title) || escapeText(SD.catalog.type(node.type).label);
    const desc = escapeMultiline(node.description);
    return desc ? `${title}<br><small>${desc}</small>` : title;
  }

  function groupLabel(group) {
    const title = escapeInline(group.title) || escapeText(group.id);
    const desc = escapeMultiline(group.description);
    return desc ? `${title}<br><small>${desc}</small>` : title;
  }

  function edgeOperator(edge) {
    const ops = {
      solid: { none: '---', end: '-->', both: '<-->' },
      dashed: { none: '-.-', end: '-.->', both: '<-.->' },
      thick: { none: '===', end: '==>', both: '<==>' },
    };
    return (ops[edge.style] || ops.solid)[edge.arrow] || '-->';
  }

  // Children of a group (or of the top level when gid is null), ordered by
  // where their first node appears, so Mermaid keeps a stable layout.
  function orderedChildren(doc, gid) {
    const nodeIndex = new Map(doc.nodes.map((n, i) => [n.id, i]));
    const firstIndex = new Map();
    doc.groups.forEach((gr, gi) => {
      const all = M().groupDescendants(doc, gr.id);
      let min = Infinity;
      doc.nodes.forEach((n) => {
        if (n.group && all.has(n.group)) min = Math.min(min, nodeIndex.get(n.id));
      });
      firstIndex.set(gr.id, min === Infinity ? doc.nodes.length + gi : min);
    });
    const items = [];
    doc.nodes.forEach((n) => {
      if ((n.group || null) === gid) items.push({ kind: 'node', item: n, key: nodeIndex.get(n.id) });
    });
    doc.groups.forEach((gr) => {
      if ((gr.parent || null) === gid) items.push({ kind: 'group', item: gr, key: firstIndex.get(gr.id) + 0.5 });
    });
    return items.sort((a, b) => a.key - b.key);
  }

  // The component icon as a self-contained SVG image (tile plus glyph), so a
  // Mermaid renderer that does not know the `sd` icon pack still draws it.
  function iconDataUri(type) {
    const bodies = SD.iconBodies || {};
    const body = (bodies[SD.catalog.type(type).icon] || bodies.shapes || '')
      .replace(/currentColor/g, EXPORT_COLORS.icon)
      .replace(/stroke-width="2"/g, 'stroke-width="1.6"');
    const radius = SD.catalog.isClient(type) ? (ICON_SIZE - 1) / 2 : 10;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 ${ICON_SIZE} ${ICON_SIZE}">`
      + `<rect x="0.5" y="0.5" width="${ICON_SIZE - 1}" height="${ICON_SIZE - 1}" rx="${radius}" fill="${EXPORT_COLORS.tile}" stroke="${EXPORT_COLORS.tileBorder}"/>`
      + `<g transform="translate(11 11)" fill="none" stroke="${EXPORT_COLORS.icon}" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
    return 'data:image/svg+xml;base64,' + btoa(svg);
  }

  // Icon id of every component (`sd:server`), kept in the metadata of external copies.
  function iconIndex(doc) {
    const icons = {};
    doc.nodes.forEach((n) => {
      icons[n.id] = `${ICON_PREFIX}:${n.type}`;
    });
    return icons;
  }

  // External copies draw each component as an image, which any Mermaid renderer can show.
  function serializeNode(node, external) {
    if (external) return `${node.id}@{ img: "${iconDataUri(node.type)}", label: "${nodeLabel(node)}", pos: "b", h: ${ICON_SIZE} }`;
    const form = SD.catalog.isClient(node.type) ? 'circle' : 'rounded';
    return `${node.id}@{ icon: "${ICON_PREFIX}:${node.type}", form: "${form}", label: "${nodeLabel(node)}", pos: "b", h: ${ICON_SIZE} }`;
  }

  // options.palette: 'light' (files) or 'dark' (rendering in dark mode)
  // options.placeholders: render a hint inside empty groups (Mermaid would
  //   otherwise draw an empty subgraph as a plain box)
  // options.header: include the sdll header and metadata comment
  // options.external: the text copied to other Mermaid renderers. Icons are
  //   embedded as images; the metadata keeps each component's icon id and the
  //   header says where the diagram comes from. Implies the header.
  function serialize(doc, options) {
    const opts = Object.assign({ palette: 'light', placeholders: false, header: true, external: false }, options);
    const lines = [];
    if (opts.header || opts.external) {
      const meta = {
        format: 'sdll',
        version: FORMAT_VERSION,
        name: doc.name,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
      if (opts.external) meta.icons = iconIndex(doc);
      lines.push(HEADER);
      if (opts.external) lines.push(...EXTERNAL_NOTES);
      lines.push('%% @meta ' + JSON.stringify(meta));
    }
    lines.push(`flowchart ${doc.direction || 'LR'}`);

    const emit = (gid, depth) => {
      const pad = '  '.repeat(depth);
      const children = orderedChildren(doc, gid);
      children.forEach(({ kind, item }) => {
        if (kind === 'node') {
          lines.push(pad + serializeNode(item, opts.external));
        } else {
          lines.push(`${pad}subgraph ${item.id}["${groupLabel(item)}"]`);
          const before = lines.length;
          emit(item.id, depth + 1);
          if (lines.length === before && opts.placeholders) {
            lines.push(`${pad}  ${PLACEHOLDER_PREFIX}${item.id}@{ shape: text, label: "Grupo vacío" }`);
          }
          lines.push(`${pad}end`);
        }
      });
    };
    emit(null, 1);

    doc.edges.forEach((e) => {
      const label = e.label && e.label.trim() ? `|"${escapeInline(e.label)}"|` : '';
      lines.push(`  ${e.from} ${edgeOperator(e)}${label} ${e.to}`);
    });

    const byKind = {};
    doc.groups.forEach((gr) => {
      if (gr.kind && gr.kind !== 'generic') (byKind[gr.kind] = byKind[gr.kind] || []).push(gr.id);
    });
    const palette = SD.catalog.groupPalette[opts.palette] || SD.catalog.groupPalette.light;
    Object.keys(byKind).forEach((kind) => {
      lines.push(`  class ${byKind[kind].join(',')} ${GROUP_CLASS_PREFIX}${kind}`);
    });
    Object.keys(byKind).forEach((kind) => {
      const p = palette[kind] || palette.generic;
      lines.push(`  classDef ${GROUP_CLASS_PREFIX}${kind} fill:${p.fill},stroke:${p.stroke}${p.dash ? ',stroke-dasharray:5 4' : ''}`);
    });
    return lines.join('\n') + '\n';
  }

  // ------------------------------------------------------------------- parse

  class ParseError extends Error {}

  // Splits Mermaid source into statements on newlines and `;`, but not inside
  // quotes or brackets (labels and `@{ }` blocks may span lines).
  function splitStatements(text) {
    const out = [];
    let cur = '';
    let depth = 0;
    let quote = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quote) {
        cur += c;
        if (c === '"') quote = false;
        continue;
      }
      if (c === '"') {
        quote = true;
        cur += c;
        continue;
      }
      if (c === '[' || c === '(' || c === '{') depth++;
      else if ((c === ']' || c === ')' || c === '}') && depth > 0) depth--;
      if ((c === '\n' || c === ';') && depth === 0) {
        out.push(cur);
        cur = '';
        continue;
      }
      cur += c;
    }
    out.push(cur);
    if (depth !== 0 || quote) {
      // Unbalanced input: fall back to one statement per line so a single
      // bad label does not swallow the rest of the diagram.
      return text.split('\n');
    }
    return out;
  }

  function stripComments(text) {
    return text
      .split('\n')
      .filter((line) => !/^\s*%%/.test(line))
      .join('\n');
  }

  function extractFrontmatter(text) {
    const m = /^\s*---\s*\n([\s\S]*?)\n\s*---\s*(\n|$)/.exec(text);
    if (!m) return { body: text, title: null };
    const t = /^\s*title\s*:\s*(.+)$/m.exec(m[1]);
    return { body: text.slice(m[0].length), title: t ? t[1].trim().replace(/^["']|["']$/g, '') : null };
  }

  function readMeta(text) {
    const m = /^\s*%%\s*@meta\s+(\{.*\})\s*$/m.exec(text);
    if (!m) return {};
    try {
      const meta = JSON.parse(m[1]);
      return meta && typeof meta === 'object' ? meta : {};
    } catch (e) {
      return {};
    }
  }

  function unquote(s) {
    let t = String(s || '').trim();
    if (t.length >= 2 && ((t[0] === '"' && t[t.length - 1] === '"') || (t[0] === "'" && t[t.length - 1] === "'"))) {
      t = t.slice(1, -1);
    }
    if (t.length >= 2 && t[0] === '`' && t[t.length - 1] === '`') t = t.slice(1, -1);
    return t;
  }

  // Turns a Mermaid label into { title, description, iconHint }.
  function parseLabel(raw) {
    let t = unquote(raw);
    let iconHint = null;
    t = t.replace(/\bfa[bklrs]?:fa-([\w-]+)\s*/g, (_, name) => {
      if (!iconHint) iconHint = name.replace(/-/g, ' ');
      return '';
    });
    t = t.replace(/\\n/g, '\n').replace(/<br\s*\/?>/gi, '\n');
    let description = '';
    const small = /<small[^>]*>([\s\S]*?)<\/small>/i.exec(t);
    if (small) {
      description = small[1];
      t = t.replace(small[0], '');
    }
    t = t.replace(/<[^>]+>/g, '');
    description = description.replace(/<[^>]+>/g, '');
    t = decodeEntities(t).replace(/\*\*([^*]+)\*\*/g, '$1');
    description = decodeEntities(description);
    const lines = t
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    let title = lines.shift() || '';
    if (!small && lines.length) description = lines.join('\n');
    else if (lines.length) description = [lines.join('\n'), description].filter(Boolean).join('\n');
    description = description
      .split('\n')
      .map((l) => l.trim())
      .join('\n')
      .trim();
    return { title: title.trim(), description, iconHint };
  }

  function edgeLabelText(raw) {
    const l = parseLabel(raw);
    return [l.title, l.description].filter(Boolean).join(' ').replace(/\s+/g, ' ');
  }

  function parseShapeData(body) {
    const out = {};
    const re = /([A-Za-z_][\w-]*)\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^,}\n]*)/g;
    let m;
    while ((m = re.exec(body))) {
      let v = m[2].trim();
      if ((v[0] === '"' && v[v.length - 1] === '"') || (v[0] === "'" && v[v.length - 1] === "'")) {
        v = v.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'");
      }
      out[m[1].toLowerCase()] = v;
    }
    return out;
  }

  // Bracket shapes, longest openers first.
  const SHAPES = [
    ['(((', ')))', 'circle'],
    ['([', '])', 'stadium'],
    ['[[', ']]', 'subroutine'],
    ['[(', ')]', 'cylinder'],
    ['((', '))', 'circle'],
    ['{{', '}}', 'hexagon'],
    ['[/', '/]', 'parallelogram'],
    ['[/', '\\]', 'trapezoid'],
    ['[\\', '\\]', 'parallelogram'],
    ['[\\', '/]', 'trapezoid'],
    ['[', ']', 'rect'],
    ['(', ')', 'round'],
    ['{', '}', 'diamond'],
    ['>', ']', 'flag'],
  ];

  const CYLINDER_SHAPES = new Set(['cylinder', 'cyl', 'db', 'database', 'das', 'h-cyl', 'lin-cyl', 'disk']);

  const ID_RE = /^[A-Za-z0-9_À-ɏ]+(?:[.\-][A-Za-z0-9_À-ɏ]+)*/;

  function readBalanced(s, pos, open, close) {
    // s[pos] is just after `open`. Returns index just after `close`.
    let i = pos;
    let quote = false;
    let depth = 1;
    while (i < s.length) {
      const c = s[i];
      if (quote) {
        if (c === '"') quote = false;
        i++;
        continue;
      }
      if (c === '"') {
        quote = true;
        i++;
        continue;
      }
      if (s.startsWith(open, i) && open === '{') depth++;
      if (s.startsWith(close, i)) {
        depth--;
        if (depth === 0) return i + close.length;
      }
      i++;
    }
    return -1;
  }

  // Reads label text up to `close`, honoring a quoted label.
  function readShapeText(s, pos, close) {
    let i = pos;
    while (s[i] === ' ') i++;
    if (s[i] === '"') {
      const endQuote = s.indexOf('"', i + 1);
      if (endQuote >= 0) {
        const after = endQuote + 1;
        let j = after;
        while (s[j] === ' ') j++;
        if (s.startsWith(close, j)) return { text: s.slice(i, after), end: j + close.length };
      }
    }
    const end = s.indexOf(close, pos);
    if (end < 0) return null;
    return { text: s.slice(pos, end), end: end + close.length };
  }

  function parseNodeRef(s, pos) {
    const m = ID_RE.exec(s.slice(pos));
    if (!m) return null;
    const ref = { rawId: m[0], label: null, shape: null, data: null, cls: null };
    let i = pos + m[0].length;
    if (s.startsWith('@{', i)) {
      const end = readBalanced(s, i + 2, '{', '}');
      if (end > 0) {
        ref.data = parseShapeData(s.slice(i + 2, end - 1));
        if (ref.data.label !== undefined) ref.label = ref.data.label;
        ref.shape = ref.data.shape || (ref.data.icon ? 'icon' : null);
        i = end;
      }
    } else {
      for (const [open, close, shape] of SHAPES) {
        if (s.startsWith(open, i)) {
          const r = readShapeText(s, i + open.length, close);
          if (r) {
            ref.label = r.text;
            ref.shape = shape;
            i = r.end;
            break;
          }
        }
      }
    }
    const cls = /^:::([\w-]+)/.exec(s.slice(i));
    if (cls) {
      ref.cls = cls[1];
      i += cls[0].length;
    }
    return { ref, end: i };
  }

  const FULL_ARROW = /^([<ox])?(?:(-{2,})([>ox])|(-{3,})|(={2,})([>ox])|(={3,})|(-\.+-)([>ox])?|(~{3,}))/;

  function arrowProps(startHead, core, endHead) {
    const style = core[0] === '=' ? 'thick' : core.includes('.') ? 'dashed' : core[0] === '~' ? 'invisible' : 'solid';
    const hasStart = !!startHead;
    const hasEnd = !!endHead;
    return { style, start: hasStart, end: hasEnd };
  }

  function parseLink(s, pos) {
    let i = pos;
    while (s[i] === ' ' || s[i] === '\t') i++;
    const edgeId = /^([A-Za-z0-9_]+)@(?=[<ox]?(?:--|==|-\.|~~))/.exec(s.slice(i));
    if (edgeId) i += edgeId[0].length;
    const rest = s.slice(i);
    let m = FULL_ARROW.exec(rest);
    let label = null;
    let props = null;
    if (m) {
      const core = m[2] || m[4] || m[5] || m[7] || m[8] || m[10];
      const endHead = m[3] || m[6] || m[9] || null;
      props = arrowProps(m[1], core, endHead);
      i += m[0].length;
    } else {
      // Text between the arrow halves: `A -- text --> B`, `A -. text .-> B`
      const open = /^([<ox])?(--|==|-\.)/.exec(rest);
      if (!open) return null;
      const after = rest.slice(open[0].length);
      const closeRe = open[2] === '==' ? /(={2,})([>ox])|(={3,})/ : open[2] === '-.' ? /(\.+-)([>ox])?/ : /(-{2,})([>ox])|(-{3,})/;
      const c = closeRe.exec(after);
      if (!c) return null;
      label = after.slice(0, c.index).trim();
      const endHead = c[2] || null;
      props = arrowProps(open[1], open[2] === '-.' ? '-.-' : open[2], endHead);
      i += open[0].length + c.index + c[0].length;
    }
    while (s[i] === ' ' || s[i] === '\t') i++;
    if (s[i] === '|') {
      let j = i + 1;
      while (s[j] === ' ') j++;
      let end;
      if (s[j] === '"') {
        const q = s.indexOf('"', j + 1);
        end = q >= 0 ? s.indexOf('|', q + 1) : -1;
      } else {
        end = s.indexOf('|', i + 1);
      }
      if (end > i) {
        label = s.slice(i + 1, end);
        i = end + 1;
      }
    }
    return { props, label, edgeId: edgeId ? edgeId[1] : null, end: i };
  }

  function parseSubgraphHeader(rest) {
    const r = rest.trim();
    let m = /^([^\s["]+)\s*\[\s*([\s\S]*?)\s*\]\s*$/.exec(r);
    if (m) return { rawId: m[1], label: m[2] };
    m = /^"([\s\S]*)"$/.exec(r);
    if (m) return { rawId: null, label: m[0] };
    m = ID_RE.exec(r);
    if (m && m[0] === r) return { rawId: r, label: r };
    return { rawId: null, label: r };
  }

  function parse(source) {
    const warnings = [];
    let text = String(source || '').replace(/\r\n?/g, '\n');
    const meta = readMeta(text);
    const declaredIcons = meta.icons && typeof meta.icons === 'object' ? meta.icons : {};
    const fm = extractFrontmatter(text);
    text = stripComments(fm.body);

    const doc = M().emptyDoc(meta.name || fm.title || 'Diagrama importado');
    if (meta.createdAt) doc.createdAt = meta.createdAt;
    if (meta.updatedAt) doc.updatedAt = meta.updatedAt;

    const statements = splitStatements(text)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!statements.length) throw new ParseError('El diagrama está vacío.');

    const header = /^(flowchart|graph)(?:\s+(LR|RL|TB|TD|BT))?\s*$/i.exec(statements[0]);
    if (!header) {
      const kind = statements[0].split(/\s+/)[0];
      throw new ParseError(`Solo se admiten diagramas flowchart (se encontró "${kind}").`);
    }
    doc.direction = (header[2] || 'LR').toUpperCase() === 'TD' ? 'TB' : (header[2] || 'LR').toUpperCase();

    // id mapping: Mermaid ids may contain characters our ids do not allow
    const idMap = new Map();
    const usedIds = new Set();
    const mapId = (raw, preferred) => {
      if (idMap.has(raw)) return idMap.get(raw);
      let id = M().isValidId(raw) && !raw.startsWith(PLACEHOLDER_PREFIX) ? raw : M().slug(preferred || raw);
      if (usedIds.has(id)) {
        let n = 2;
        while (usedIds.has(`${id}_${n}`)) n++;
        id = `${id}_${n}`;
      }
      usedIds.add(id);
      idMap.set(raw, id);
      return id;
    };

    // Pre-pass: know every subgraph id before edges reference them.
    const groupRawIds = new Set();
    statements.slice(1).forEach((s) => {
      const m = /^subgraph\b\s*([\s\S]*)$/i.exec(s);
      if (m) {
        const h = parseSubgraphHeader(m[1]);
        groupRawIds.add(h.rawId || '__title__' + h.label);
      }
    });

    const nodesById = new Map();
    const groupsById = new Map();
    const assigned = new Set(); // node ids whose group came from a subgraph block
    const classOf = new Map();
    const stack = [];
    const rawEdges = [];

    const ensureNode = (rawId) => {
      const id = mapId(rawId);
      let node = nodesById.get(id);
      if (!node) {
        node = { id, type: null, title: '', description: '', group: null, _hint: '', _shape: null };
        nodesById.set(id, node);
        doc.nodes.push(node);
      }
      return node;
    };

    const edgeIds = new Set();
    const applyRef = (ref) => {
      // `e1@{ animate: true }` configures an edge declared as `A e1@--> B`
      if (edgeIds.has(ref.rawId) && ref.data) return { edgeMeta: true };
      if (groupRawIds.has(ref.rawId)) {
        const gid = mapId(ref.rawId);
        return { group: gid };
      }
      if (ref.rawId.startsWith(PLACEHOLDER_PREFIX)) return { placeholder: true };
      const node = ensureNode(ref.rawId);
      if (ref.label !== null) {
        const l = parseLabel(ref.label);
        node.title = l.title;
        node.description = l.description;
        if (l.iconHint) node._hint = l.iconHint;
      }
      if (ref.data && ref.data.icon) {
        const icon = String(ref.data.icon);
        const im = /^([\w-]+):([\w-]+)$/.exec(icon);
        if (im && im[1] === ICON_PREFIX && SD.catalog.hasType(im[2])) node.type = im[2];
        else node._hint = (im ? im[2] : icon).replace(/[-_]/g, ' ');
      }
      if (ref.shape) node._shape = ref.shape;
      if (ref.cls) classOf.set(node.id, ref.cls);
      if (stack.length && !assigned.has(node.id)) {
        node.group = stack[stack.length - 1];
        assigned.add(node.id);
      }
      return { node: node.id };
    };

    statements.slice(1).forEach((s) => {
      let m;
      if ((m = /^subgraph\b\s*([\s\S]*)$/i.exec(s))) {
        const h = parseSubgraphHeader(m[1]);
        const l = parseLabel(h.label);
        const id = mapId(h.rawId || '__title__' + h.label, h.rawId ? null : l.title);
        let gr = groupsById.get(id);
        if (!gr) {
          // a subgraph declared twice is reopened, as Mermaid does
          gr = { id, title: l.title || id, description: l.description, kind: null, parent: stack.length ? stack[stack.length - 1] : null };
          groupsById.set(id, gr);
          doc.groups.push(gr);
        }
        stack.push(id);
        return;
      }
      if (/^end$/i.test(s)) {
        if (stack.length) stack.pop();
        else warnings.push('"end" sin subgraph abierto.');
        return;
      }
      if (/^direction\s+\w+$/i.test(s)) return;
      if ((m = /^classDef\s+([\w-]+)\s+(.*)$/i.exec(s))) return;
      if ((m = /^class\s+([^\s]+)\s+([\w-]+)\s*$/i.exec(s))) {
        m[1].split(',').forEach((raw) => classOf.set(mapId(raw.trim()), m[2]));
        return;
      }
      if (/^(style|linkStyle|click|accTitle|accDescr|title)\b/i.test(s)) return;

      // node / edge chain
      let pos = 0;
      const readRefs = () => {
        const refs = [];
        for (;;) {
          while (s[pos] === ' ' || s[pos] === '\t') pos++;
          const r = parseNodeRef(s, pos);
          if (!r) break;
          refs.push(applyRef(r.ref));
          pos = r.end;
          while (s[pos] === ' ' || s[pos] === '\t') pos++;
          if (s[pos] === '&') {
            pos++;
            continue;
          }
          break;
        }
        return refs;
      };
      let left = readRefs();
      if (!left.length) {
        warnings.push(`No se pudo interpretar: ${s.slice(0, 80)}`);
        return;
      }
      // a subgraph listed inside another one becomes its child
      if (stack.length) {
        left.forEach((r) => {
          if (r.group && r.group !== stack[stack.length - 1]) {
            const gr = groupsById.get(r.group);
            if (gr) gr._parentFromList = stack[stack.length - 1];
          }
        });
      }
      for (;;) {
        const link = parseLink(s, pos);
        if (!link) break;
        if (link.edgeId) edgeIds.add(link.edgeId);
        pos = link.end;
        const right = readRefs();
        if (!right.length) {
          warnings.push(`Conexión incompleta: ${s.slice(0, 80)}`);
          break;
        }
        left.forEach((a) => {
          right.forEach((b) => {
            rawEdges.push({ a, b, props: link.props, label: link.label });
          });
        });
        left = right;
      }
      if (s.slice(pos).trim()) warnings.push(`Texto ignorado: ${s.slice(pos).trim().slice(0, 80)}`);
    });

    // groups referenced from another subgraph block
    doc.groups.forEach((gr) => {
      if (gr._parentFromList && !gr.parent) gr.parent = gr._parentFromList;
      delete gr._parentFromList;
    });

    rawEdges.forEach(({ a, b, props, label }) => {
      if (props.style === 'invisible') return;
      if (!a.node || !b.node) {
        warnings.push('Se omitió una conexión hacia un grupo (solo se conectan componentes).');
        return;
      }
      let from = a.node;
      let to = b.node;
      let arrow = props.start && props.end ? 'both' : props.end ? 'end' : props.start ? 'end' : 'none';
      if (props.start && !props.end) [from, to] = [to, from];
      doc.edges.push({
        id: 'e' + (doc.edges.length + 1),
        from,
        to,
        label: label !== null ? edgeLabelText(label) : '',
        style: props.style,
        arrow,
      });
    });

    // resolve node types
    doc.nodes.forEach((n) => {
      const text = `${n.id.replace(/_/g, ' ')} ${n.title}`;
      // external copies declare each icon in the metadata (`sd:server`)
      const declared = /^sd:([\w-]+)$/.exec(String(declaredIcons[n.id] || ''));
      if (!n.type && declared && SD.catalog.hasType(declared[1])) n.type = declared[1];
      if (!n.type) {
        if (n._hint) n.type = M().inferType(n._hint + ' ' + text, null);
        if (!n.type) {
          let t = M().inferType(text, null);
          if (n._shape && CYLINDER_SHAPES.has(n._shape) && (!t || SD.catalog.type(t).category !== 'data')) t = 'sql-db';
          n.type = t || 'service';
        }
      }
      if (!n.title) n.title = n.id;
      delete n._hint;
      delete n._shape;
    });

    // resolve group kinds from `class` lines or titles
    doc.groups.forEach((gr) => {
      const cls = classOf.get(gr.id);
      const km = cls && new RegExp('^' + GROUP_CLASS_PREFIX + '([\\w-]+)$').exec(cls);
      gr.kind = km && SD.catalog.hasGroupKind(km[1]) ? km[1] : M().inferGroupKind(`${gr.title} ${gr.id}`);
    });

    if (stack.length) warnings.push('Faltó cerrar algún subgraph con "end".');
    return { doc: M().normalize(doc), warnings };
  }

  // Pulls a Mermaid flowchart out of an LLM reply (code fence or bare text).
  function extractMermaid(reply) {
    let text = String(reply || '').replace(/<think>[\s\S]*?<\/think>/gi, '');
    const fences = [...text.matchAll(/```[ \t]*([\w-]*)[^\n]*\n([\s\S]*?)```/g)];
    const pick = fences.find((f) => /mermaid|sdll/i.test(f[1])) || fences.find((f) => /^\s*(%%.*\n\s*)*(flowchart|graph)\b/im.test(f[2]));
    if (pick) return pick[2].trim();
    const m = /^[ \t]*(flowchart|graph)\b[\s\S]*$/im.exec(text);
    if (m) return m[0].trim();
    return null;
  }

  function fileName(doc) {
    const base = String(doc.name || 'diagrama')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
    return (base || 'diagrama') + '.sdll';
  }

  SD.sdll = {
    FORMAT_VERSION,
    ICON_PREFIX,
    ICON_SIZE,
    PLACEHOLDER_PREFIX,
    GROUP_CLASS_PREFIX,
    ParseError,
    serialize,
    parse,
    parseLabel,
    extractMermaid,
    escapeText,
    decodeEntities,
    fileName,
  };
})(globalThis);
