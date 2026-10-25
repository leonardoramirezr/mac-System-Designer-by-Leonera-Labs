const test = require('node:test');
const assert = require('node:assert/strict');

require('../web/js/icons.js');
require('../web/js/catalog.js');
require('../web/js/model.js');
require('../web/js/sdll.js');

const { model, sdll } = globalThis.SD;

const comparable = (d) => ({
  name: d.name,
  direction: d.direction,
  nodes: d.nodes,
  groups: d.groups,
  edges: d.edges.map(({ from, to, label, style, arrow }) => ({ from, to, label, style, arrow })),
});

function sample() {
  const doc = model.emptyDoc('Checkout');
  const web = model.addNode(doc, { type: 'web', title: 'Web App' });
  const api = model.addConnectedNode(doc, web, 'right', 'server').nodeId;
  model.updateNode(doc, api, { title: 'API', description: 'REST "v2"\nauth & rate limits' });
  const q = model.addConnectedNode(doc, api, 'right', 'queue').nodeId;
  const db = model.addConnectedNode(doc, api, 'right', 'sql-db').nodeId;
  const aws = model.addGroup(doc, { title: 'AWS Cloud', kind: 'cloud' }, [api, q]);
  const vpc = model.addGroup(doc, { title: 'VPC privada', kind: 'network', parent: aws }, [db]);
  const e = doc.edges.find((x) => x.from === web && x.to === api);
  model.updateEdge(doc, e.id, { label: 'llama' });
  model.updateEdge(doc, doc.edges.find((x) => x.to === q).id, { style: 'dashed', label: 'publica *eventos*' });
  return { doc, web, api, q, db, aws, vpc };
}

test('serialize writes icons, groups, labels and classes', () => {
  const { doc, api } = sample();
  const text = sdll.serialize(doc);
  assert.match(text, /^%% System Designer · sdll v1\n%% @meta \{.*"name":"Checkout".*\}\nflowchart LR\n/);
  assert.match(text, /web_app@\{ icon: "sd:web", form: "circle", label: "Web App", pos: "b", h: 46 \}/);
  assert.equal(api, 'servidor', 'ids come from the title at creation time and then stay stable');
  assert.match(text, /servidor@\{ icon: "sd:server", form: "rounded", label: "API<br><small>REST &quot;v2&quot;<br>auth &amp; rate limits<\/small>"/);
  assert.match(text, /subgraph aws_cloud\["AWS Cloud"\]\n {4}servidor@/);
  assert.match(text, /subgraph vpc_privada\["VPC privada"\]\n {6}base_de_datos_sql@/);
  assert.match(text, /web_app -->\|"llama"\| servidor/);
  assert.match(text, /servidor -\.->\|"publica &ast;eventos&ast;"\| cola/);
  assert.match(text, /class aws_cloud grp_cloud/);
  assert.match(text, /classDef grp_cloud fill:#eff6ff,stroke:#93c5fd,stroke-dasharray:5 4/);
});

test('parse(serialize(doc)) round-trips the model', () => {
  const { doc } = sample();
  const { doc: back, warnings } = sdll.parse(sdll.serialize(doc));
  assert.deepEqual(warnings, []);
  assert.deepEqual(comparable(back), comparable(doc));
});

test('external copy embeds icons as images and declares each icon id in the metadata', () => {
  const { doc, api } = sample();
  const text = sdll.serialize(doc, { external: true });
  assert.match(text, /^%% System Designer · sdll v1\n%% Generated with System Designer by Leonera Labs\n%% https:\/\/github\.com\/leonardoramirezr\/mac-System-Designer-by-Leonera-Labs\n%% Do not edit this by hand: you can import it into System Designer and edit it there\.\n%% @meta \{/);
  assert.doesNotMatch(text, /icon: "sd:/);
  assert.match(text, /servidor@\{ img: "data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+", label: "API<br><small>REST &quot;v2&quot;/);
  const meta = JSON.parse(/^%% @meta (.*)$/m.exec(text)[1]);
  assert.equal(meta.icons[api], 'sd:server');
  assert.equal(meta.icons.web_app, 'sd:web');
  assert.equal(Object.keys(meta.icons).length, doc.nodes.length);
  assert.doesNotMatch(sdll.serialize(doc), /"icons"/, 'the file format is unchanged');
});

test('external copy parses back to the same model and types', () => {
  const { doc } = sample();
  const { doc: back, warnings } = sdll.parse(sdll.serialize(doc, { external: true }));
  assert.deepEqual(warnings, []);
  assert.deepEqual(comparable(back), comparable(doc));
  assert.deepEqual(back.nodes.map((n) => n.type), doc.nodes.map((n) => n.type));
});

test('a node without a declared icon falls back to inference from its title', () => {
  const src = [
    '%% @meta {"format":"sdll","version":1,"name":"Ajeno"}',
    'flowchart LR',
    '  a@{ img: "data:image/svg+xml;base64,PHN2Zy8+", label: "Cola de pedidos" }',
  ].join('\n');
  const { doc } = sdll.parse(src);
  assert.equal(doc.nodes[0].type, 'queue');
});

test('round-trips awkward text', () => {
  const doc = model.emptyDoc('Raro');
  const n = model.addNode(doc, { type: 'service', title: 'C# svc #1; <b>x</b> _y_ `z` a|b \\ "q"' });
  const m = model.addNode(doc, { type: 'cache', title: 'Redis' });
  model.addEdge(doc, n, m, { label: 'get | set #ok; "x"' });
  const { doc: back } = sdll.parse(sdll.serialize(doc));
  assert.equal(back.nodes[0].title, doc.nodes[0].title);
  assert.equal(back.edges[0].label, 'get | set #ok; "x"');
});

test('empty groups survive and get a placeholder only when rendering', () => {
  const doc = model.emptyDoc();
  model.addNode(doc, { type: 'server' });
  model.addGroup(doc, { title: 'Vacío' }, []);
  assert.doesNotMatch(sdll.serialize(doc), /sdph_/);
  const render = sdll.serialize(doc, { placeholders: true });
  assert.match(render, /subgraph vacio\["Vacío"\]\n {4}sdph_vacio@\{ shape: text/);
  const { doc: back } = sdll.parse(render);
  assert.equal(back.groups.length, 1);
  assert.equal(back.nodes.length, 1);
});

test('parses typical LLM / hand-written Mermaid', () => {
  const src = [
    '```mermaid',
    'graph TD;',
    '  U((Usuario)) -->|HTTPS| CDN[CloudFront CDN]',
    '  CDN --> LB[Application Load Balancer]',
    '  subgraph "AWS us-east-1"',
    '    LB --> API1[API Service] & API2[API Service 2]',
    '    API1 -- consulta --> DB[(Postgres)]',
    '    API2 -.-> Q[[SQS Orders Queue]]',
    '    Q ==> W(Worker)',
    '    W --> S3[(Bucket S3)]',
    '  end',
    '  subgraph ext [Terceros]',
    '    PAY[fa:fa-credit-card Stripe]',
    '  end',
    '  W <--> PAY',
    '  API1 --- R[Redis cache]',
    '  classDef blue fill:#00f',
    '  class LB blue',
    '```',
  ].join('\n');
  const { doc } = sdll.parse(sdll.extractMermaid('Aquí tienes:\n' + src + '\nSaludos'));
  const byTitle = Object.fromEntries(doc.nodes.map((n) => [n.title, n]));
  assert.equal(doc.direction, 'TB');
  assert.equal(byTitle.Usuario.type, 'user');
  assert.equal(byTitle['CloudFront CDN'].type, 'cdn');
  assert.equal(byTitle['Application Load Balancer'].type, 'load-balancer');
  assert.equal(byTitle.Postgres.type, 'sql-db');
  assert.equal(byTitle['SQS Orders Queue'].type, 'queue');
  assert.equal(byTitle.Worker.type, 'worker');
  assert.equal(byTitle['Bucket S3'].type, 'bucket');
  assert.equal(byTitle.Stripe.type, 'payment');
  assert.equal(byTitle['Redis cache'].type, 'cache');

  const aws = doc.groups.find((g) => g.title === 'AWS us-east-1');
  assert.ok(aws);
  assert.equal(aws.kind, 'cloud');
  assert.equal(aws.id, 'aws_us_east_1');
  assert.equal(byTitle['API Service'].group, aws.id);
  assert.equal(byTitle.Postgres.group, aws.id);
  assert.equal(byTitle.Usuario.group, null);
  const ext = doc.groups.find((g) => g.id === 'ext');
  assert.equal(ext.title, 'Terceros');
  assert.equal(ext.kind, 'external');
  assert.equal(byTitle.Stripe.group, 'ext');

  const edge = (a, b) => doc.edges.find((e) => e.from === byTitle[a].id && e.to === byTitle[b].id);
  assert.equal(edge('Usuario', 'CloudFront CDN').label, 'HTTPS');
  assert.ok(edge('Application Load Balancer', 'API Service'));
  assert.ok(edge('Application Load Balancer', 'API Service 2'));
  assert.equal(edge('API Service', 'Postgres').label, 'consulta');
  assert.equal(edge('API Service 2', 'SQS Orders Queue').style, 'dashed');
  assert.equal(edge('SQS Orders Queue', 'Worker').style, 'thick');
  assert.equal(edge('Worker', 'Stripe').arrow, 'both');
  assert.equal(edge('API Service', 'Redis cache').arrow, 'none');
});

test('parses inline text arrows and edge ids', () => {
  const { doc } = sdll.parse('flowchart LR\nA --llama--> B\nB -. async .-> C\nC == sync ==> D\nD e1@--> E\ne1@{ animate: true }\nE<-->F');
  const labels = doc.edges.map((e) => [e.from, e.to, e.label, e.style, e.arrow].join(' '));
  assert.deepEqual(labels, [
    'A B llama solid end',
    'B C async dashed end',
    'C D sync thick end',
    'D E  solid end',
    'E F  solid both',
  ]);
  assert.equal(doc.nodes.length, 6);
});

test('rejects non-flowchart diagrams', () => {
  assert.throws(() => sdll.parse('sequenceDiagram\nA->>B: hi'), /flowchart/);
  assert.throws(() => sdll.parse('   \n%% only a comment\n'), /vacío/);
});

test('nested subgraphs listed by id and mapped ids', () => {
  const { doc } = sdll.parse(
    ['flowchart LR', 'subgraph inner [Inner]', 'a-b[Svc]', 'end', 'subgraph outer [Outer]', 'inner', 'end', 'x.y --> a-b', 'end_1 --> x.y'].join('\n')
  );
  assert.equal(doc.groups.find((g) => g.id === 'inner').parent, 'outer');
  const ids = doc.nodes.map((n) => n.id);
  assert.ok(ids.every((id) => model.isValidId(id)), ids.join(','));
  assert.equal(doc.edges.length, 2);
});

test('model operations keep the document consistent', () => {
  const { doc, api, q, aws, vpc } = sample();
  model.removeGroup(doc, aws, false);
  assert.equal(model.findNode(doc, api).group, null);
  assert.equal(model.findGroup(doc, vpc).parent, null);
  const g2 = model.addGroup(doc, { title: 'Outer' }, [q]);
  assert.equal(model.setGroupParent(doc, g2, g2), false);
  model.setGroupParent(doc, vpc, g2);
  assert.equal(model.setGroupParent(doc, g2, vpc), false, 'cycles are rejected');
  model.removeGroup(doc, g2, true);
  assert.equal(doc.groups.length, 0);
  assert.equal(model.findNode(doc, q), null);
  assert.ok(doc.edges.every((e) => model.findNode(doc, e.from) && model.findNode(doc, e.to)));
});

test('ids avoid Mermaid keywords', () => {
  const doc = model.emptyDoc();
  const a = model.addNode(doc, { type: 'server', title: 'end' });
  const b = model.addNode(doc, { type: 'server', title: 'end' });
  const c = model.addNode(doc, { type: 'server', title: '123' });
  assert.equal(a, 'n_end');
  assert.equal(b, 'n_end_2');
  assert.equal(c, 'n_123');
});

test('ids follow titles on rename and references are updated', () => {
  const doc = model.emptyDoc();
  const a = model.addNode(doc, { type: 'server' });
  const b = model.addNode(doc, { type: 'sql-db' });
  model.addEdge(doc, a, b);
  const gid = model.addGroup(doc, { title: 'Grupo' }, [a, b]);
  model.updateNode(doc, a, { title: 'Orders API' });
  assert.equal(model.syncIdWithTitle(doc, a), 'orders_api');
  assert.equal(doc.edges[0].from, 'orders_api');
  model.updateGroup(doc, gid, { title: 'AWS' });
  assert.equal(model.syncIdWithTitle(doc, gid), 'aws');
  assert.ok(doc.nodes.every((n) => n.group === 'aws'));
  assert.equal(model.syncIdWithTitle(doc, 'aws'), 'aws', 'no-op when already in sync');
});
