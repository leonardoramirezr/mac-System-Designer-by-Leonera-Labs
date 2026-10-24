// Diagram model and the mutations the UI can perform on it. Every user action
// goes through one of these functions; the result is serialized to Mermaid
// and re-rendered, so nodes are never positioned by hand.
(function (g) {
  const SD = (g.SD = g.SD || {});

  // Words Mermaid's flowchart grammar treats specially; never use them as ids.
  const RESERVED = new Set([
    'end', 'graph', 'flowchart', 'subgraph', 'style', 'class', 'classdef', 'click', 'linkstyle',
    'default', 'direction', 'call', 'href', 'callback', 'interpolate', 'tb', 'td', 'bt', 'rl', 'lr',
    'accTitle', 'accDescr',
  ].map((w) => w.toLowerCase()));

  const EDGE_STYLES = ['solid', 'dashed', 'thick'];
  const EDGE_ARROWS = ['end', 'both', 'none'];

  function now() {
    return new Date().toISOString();
  }

  function emptyDoc(name) {
    const t = now();
    return {
      name: name || 'Diagrama sin título',
      direction: 'LR',
      nodes: [],
      edges: [],
      groups: [],
      createdAt: t,
      updatedAt: t,
    };
  }

  function clone(doc) {
    return JSON.parse(JSON.stringify(doc));
  }

  function slug(text) {
    let s = String(text || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32)
      .replace(/_+$/g, '');
    if (!s) s = 'n';
    if (/^[0-9]/.test(s) || RESERVED.has(s)) s = 'n_' + s;
    // Mermaid reads `o`/`x` right after an arrow as an arrowhead; the
    // serializer always puts a space there, but avoid single letters anyway.
    if (s === 'o' || s === 'x') s = 'n_' + s;
    return s;
  }

  function isValidId(id) {
    return typeof id === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(id) && !RESERVED.has(id.toLowerCase());
  }

  function takenIds(doc) {
    const s = new Set();
    doc.nodes.forEach((n) => s.add(n.id));
    doc.groups.forEach((gr) => s.add(gr.id));
    return s;
  }

  function uniqueId(doc, base) {
    const taken = takenIds(doc);
    const root = slug(base);
    if (!taken.has(root)) return root;
    for (let i = 2; ; i++) {
      const id = `${root}_${i}`;
      if (!taken.has(id)) return id;
    }
  }

  function nextEdgeId(doc) {
    let max = 0;
    doc.edges.forEach((e) => {
      const m = /^e(\d+)$/.exec(e.id);
      if (m) max = Math.max(max, Number(m[1]));
    });
    return 'e' + (max + 1);
  }

  const findNode = (doc, id) => doc.nodes.find((n) => n.id === id) || null;
  const findGroup = (doc, id) => doc.groups.find((gr) => gr.id === id) || null;
  const findEdge = (doc, id) => doc.edges.find((e) => e.id === id) || null;

  function touch(doc) {
    doc.updatedAt = now();
  }

  function addNode(doc, props, position) {
    const type = SD.catalog.hasType(props.type) ? props.type : 'generic';
    const title = (props.title || SD.catalog.type(type).label).trim();
    const node = {
      id: props.id && isValidId(props.id) && !takenIds(doc).has(props.id) ? props.id : uniqueId(doc, title),
      type,
      title,
      description: props.description || '',
      group: props.group && findGroup(doc, props.group) ? props.group : null,
    };
    let index = doc.nodes.length;
    if (position && position.after) {
      const i = doc.nodes.findIndex((n) => n.id === position.after);
      if (i >= 0) index = i + 1;
    } else if (position && position.before) {
      const i = doc.nodes.findIndex((n) => n.id === position.before);
      if (i >= 0) index = i;
    }
    doc.nodes.splice(index, 0, node);
    touch(doc);
    return node.id;
  }

  // Adds a component on the left (`side === 'left'`: new --> anchor) or right
  // (anchor --> new) of an existing one. Clients never inherit the anchor's
  // group: they live outside clouds/networks by nature.
  function addConnectedNode(doc, anchorId, side, type) {
    const anchor = findNode(doc, anchorId);
    if (!anchor) return null;
    const group = SD.catalog.isClient(type) ? null : anchor.group;
    const nodeId = addNode(doc, { type, group }, side === 'left' ? { before: anchorId } : { after: anchorId });
    const edgeId = side === 'left' ? addEdge(doc, nodeId, anchorId) : addEdge(doc, anchorId, nodeId);
    return { nodeId, edgeId };
  }

  function updateNode(doc, id, patch) {
    const node = findNode(doc, id);
    if (!node) return;
    if (patch.type !== undefined && SD.catalog.hasType(patch.type)) node.type = patch.type;
    if (patch.title !== undefined) node.title = String(patch.title);
    if (patch.description !== undefined) node.description = String(patch.description);
    if (patch.group !== undefined) setNodeGroup(doc, id, patch.group);
    touch(doc);
  }

  function removeNode(doc, id) {
    doc.nodes = doc.nodes.filter((n) => n.id !== id);
    doc.edges = doc.edges.filter((e) => e.from !== id && e.to !== id);
    touch(doc);
  }

  function addEdge(doc, from, to, props) {
    if (!findNode(doc, from) || !findNode(doc, to)) return null;
    const p = props || {};
    const edge = {
      id: nextEdgeId(doc),
      from,
      to,
      label: p.label || '',
      style: EDGE_STYLES.includes(p.style) ? p.style : 'solid',
      arrow: EDGE_ARROWS.includes(p.arrow) ? p.arrow : 'end',
    };
    doc.edges.push(edge);
    touch(doc);
    return edge.id;
  }

  function updateEdge(doc, id, patch) {
    const edge = findEdge(doc, id);
    if (!edge) return;
    if (patch.label !== undefined) edge.label = String(patch.label);
    if (EDGE_STYLES.includes(patch.style)) edge.style = patch.style;
    if (EDGE_ARROWS.includes(patch.arrow)) edge.arrow = patch.arrow;
    if (patch.from !== undefined && findNode(doc, patch.from)) edge.from = patch.from;
    if (patch.to !== undefined && findNode(doc, patch.to)) edge.to = patch.to;
    touch(doc);
  }

  function reverseEdge(doc, id) {
    const edge = findEdge(doc, id);
    if (!edge) return;
    [edge.from, edge.to] = [edge.to, edge.from];
    touch(doc);
  }

  function removeEdge(doc, id) {
    doc.edges = doc.edges.filter((e) => e.id !== id);
    touch(doc);
  }

  // Group ids from `gid` down through all nested groups.
  function groupDescendants(doc, gid) {
    const out = new Set([gid]);
    let grew = true;
    while (grew) {
      grew = false;
      doc.groups.forEach((gr) => {
        if (gr.parent && out.has(gr.parent) && !out.has(gr.id)) {
          out.add(gr.id);
          grew = true;
        }
      });
    }
    return out;
  }

  function groupAncestors(doc, gid) {
    const out = [];
    const seen = new Set();
    let cur = findGroup(doc, gid);
    while (cur && cur.parent && !seen.has(cur.parent)) {
      seen.add(cur.parent);
      out.push(cur.parent);
      cur = findGroup(doc, cur.parent);
    }
    return out;
  }

  // Deepest group that contains every given node (null = top level).
  function commonGroup(doc, nodeIds) {
    const chains = nodeIds
      .map((id) => findNode(doc, id))
      .filter(Boolean)
      .map((n) => (n.group ? [n.group, ...groupAncestors(doc, n.group)] : []));
    if (!chains.length) return null;
    const [first, ...rest] = chains;
    return first.find((gid) => rest.every((c) => c.includes(gid))) || null;
  }

  function addGroup(doc, props, memberIds) {
    const members = (memberIds || []).filter((id) => findNode(doc, id) || findGroup(doc, id));
    const nodeMembers = members.filter((id) => findNode(doc, id));
    const title = (props.title || 'Grupo').trim();
    let parent = props.parent !== undefined ? props.parent : commonGroup(doc, nodeMembers);
    if (parent && !findGroup(doc, parent)) parent = null;
    const group = {
      id: uniqueId(doc, title),
      title,
      kind: SD.catalog.hasGroupKind(props.kind) ? props.kind : inferGroupKind(title),
      description: props.description || '',
      parent,
    };
    doc.groups.push(group);
    members.forEach((id) => {
      if (findNode(doc, id)) findNode(doc, id).group = group.id;
      else if (id !== group.id) setGroupParent(doc, id, group.id);
    });
    touch(doc);
    return group.id;
  }

  function updateGroup(doc, id, patch) {
    const gr = findGroup(doc, id);
    if (!gr) return;
    if (patch.title !== undefined) gr.title = String(patch.title);
    if (patch.description !== undefined) gr.description = String(patch.description);
    if (patch.kind !== undefined && SD.catalog.hasGroupKind(patch.kind)) gr.kind = patch.kind;
    if (patch.parent !== undefined) setGroupParent(doc, id, patch.parent);
    touch(doc);
  }

  function setGroupParent(doc, id, parentId) {
    const gr = findGroup(doc, id);
    if (!gr) return false;
    if (!parentId) {
      gr.parent = null;
      return true;
    }
    if (!findGroup(doc, parentId) || groupDescendants(doc, id).has(parentId)) return false;
    gr.parent = parentId;
    return true;
  }

  function setNodeGroup(doc, nodeId, groupId) {
    const node = findNode(doc, nodeId);
    if (!node) return;
    node.group = groupId && findGroup(doc, groupId) ? groupId : null;
    touch(doc);
  }

  // Removes a group. Its contents move up to the parent unless
  // `withContents` is set, in which case nested groups and nodes go too.
  function removeGroup(doc, id, withContents) {
    const gr = findGroup(doc, id);
    if (!gr) return;
    if (withContents) {
      const all = groupDescendants(doc, id);
      const doomed = new Set(doc.nodes.filter((n) => n.group && all.has(n.group)).map((n) => n.id));
      doc.nodes = doc.nodes.filter((n) => !doomed.has(n.id));
      doc.edges = doc.edges.filter((e) => !doomed.has(e.from) && !doomed.has(e.to));
      doc.groups = doc.groups.filter((x) => !all.has(x.id));
    } else {
      doc.nodes.forEach((n) => {
        if (n.group === id) n.group = gr.parent;
      });
      doc.groups.forEach((x) => {
        if (x.parent === id) x.parent = gr.parent;
      });
      doc.groups = doc.groups.filter((x) => x.id !== id);
    }
    touch(doc);
  }

  function groupMembers(doc, gid) {
    return {
      nodes: doc.nodes.filter((n) => n.group === gid),
      groups: doc.groups.filter((x) => x.parent === gid),
    };
  }

  function textScore(text, keywords) {
    const hay = ' ' + String(text || '').toLowerCase().replace(/[_\-]+/g, ' ') + ' ';
    let best = 0;
    keywords.forEach((k) => {
      const kw = k.toLowerCase();
      const re = new RegExp('(^|[^a-z0-9áéíóúñ])' + kw.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '([^a-z0-9áéíóúñ]|$)');
      if (re.test(hay)) best = Math.max(best, kw.length + 1);
    });
    return best;
  }

  // Broad types lose ties against specific ones ("Auth Service" is auth).
  const WEAK_TYPES = new Set(['server', 'service', 'generic', 'user']);

  // Best-effort guess of a component type from free text (id + label).
  function inferType(text, fallback) {
    let best = null;
    let bestScore = 0;
    SD.catalog.types.forEach((t) => {
      let score = Math.max(textScore(text, t.keywords), textScore(text, [t.id.replace('-', ' ')]));
      if (WEAK_TYPES.has(t.id)) score *= 0.5;
      if (score > bestScore) {
        best = t.id;
        bestScore = score;
      }
    });
    return best || fallback || 'service';
  }

  function inferGroupKind(text) {
    let best = 'generic';
    let bestScore = 0;
    SD.catalog.groupKinds.forEach((k) => {
      const score = textScore(text, k.keywords);
      if (score > bestScore) {
        best = k.id;
        bestScore = score;
      }
    });
    return best;
  }

  // Renames a node or group id to match its title (keeps the Mermaid source
  // readable). Returns the new id.
  function syncIdWithTitle(doc, id) {
    const node = findNode(doc, id);
    const group = node ? null : findGroup(doc, id);
    const item = node || group;
    if (!item || !String(item.title || '').trim()) return id;
    const base = slug(item.title);
    if (id === base || new RegExp('^' + base + '_\\d+$').test(id)) return id;
    const taken = takenIds(doc);
    taken.delete(id);
    let next = base;
    for (let i = 2; taken.has(next); i++) next = `${base}_${i}`;
    if (node) {
      node.id = next;
      doc.edges.forEach((e) => {
        if (e.from === id) e.from = next;
        if (e.to === id) e.to = next;
      });
    } else {
      group.id = next;
      doc.nodes.forEach((n) => {
        if (n.group === id) n.group = next;
      });
      doc.groups.forEach((x) => {
        if (x.parent === id) x.parent = next;
      });
    }
    touch(doc);
    return next;
  }

  // Repairs anything a parser or an older file might leave inconsistent.
  function normalize(doc) {
    const d = Object.assign(emptyDoc(), doc);
    d.direction = ['LR', 'RL', 'TB', 'TD', 'BT'].includes(d.direction) ? (d.direction === 'TD' ? 'TB' : d.direction) : 'LR';
    const groupIds = new Set();
    d.groups = (d.groups || []).filter((gr) => {
      if (!gr || !isValidId(gr.id) || groupIds.has(gr.id)) return false;
      groupIds.add(gr.id);
      gr.title = String(gr.title || gr.id);
      gr.kind = SD.catalog.hasGroupKind(gr.kind) ? gr.kind : 'generic';
      gr.description = String(gr.description || '');
      return true;
    });
    d.groups.forEach((gr) => {
      if (!gr.parent || !groupIds.has(gr.parent) || gr.parent === gr.id) gr.parent = null;
    });
    // break parent cycles
    d.groups.forEach((gr) => {
      const seen = new Set([gr.id]);
      let cur = gr;
      while (cur.parent) {
        if (seen.has(cur.parent)) {
          cur.parent = null;
          break;
        }
        seen.add(cur.parent);
        cur = d.groups.find((x) => x.id === cur.parent);
      }
    });
    const nodeIds = new Set();
    d.nodes = (d.nodes || []).filter((n) => {
      if (!n || !isValidId(n.id) || nodeIds.has(n.id) || groupIds.has(n.id)) return false;
      nodeIds.add(n.id);
      n.type = SD.catalog.hasType(n.type) ? n.type : 'generic';
      n.title = String(n.title || '');
      n.description = String(n.description || '');
      n.group = n.group && groupIds.has(n.group) ? n.group : null;
      return true;
    });
    let counter = 0;
    const edgeIds = new Set();
    d.edges = (d.edges || []).filter((e) => e && nodeIds.has(e.from) && nodeIds.has(e.to));
    d.edges.forEach((e) => {
      if (!e.id || edgeIds.has(e.id)) e.id = 'e' + ++counter;
      edgeIds.add(e.id);
      e.label = String(e.label || '');
      e.style = EDGE_STYLES.includes(e.style) ? e.style : 'solid';
      e.arrow = EDGE_ARROWS.includes(e.arrow) ? e.arrow : 'end';
    });
    // make sure generated ids stay unique after the renumbering above
    const seenEdge = new Set();
    d.edges.forEach((e) => {
      while (seenEdge.has(e.id)) e.id = 'e' + ++counter;
      seenEdge.add(e.id);
    });
    return d;
  }

  SD.model = {
    EDGE_STYLES,
    EDGE_ARROWS,
    emptyDoc,
    clone,
    slug,
    isValidId,
    uniqueId,
    findNode,
    findGroup,
    findEdge,
    addNode,
    addConnectedNode,
    updateNode,
    removeNode,
    addEdge,
    updateEdge,
    reverseEdge,
    removeEdge,
    addGroup,
    updateGroup,
    removeGroup,
    setGroupParent,
    setNodeGroup,
    groupDescendants,
    groupAncestors,
    groupMembers,
    commonGroup,
    inferType,
    inferGroupKind,
    syncIdWithTitle,
    normalize,
  };
})(globalThis);
