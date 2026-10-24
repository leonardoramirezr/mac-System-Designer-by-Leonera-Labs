// Component and group catalog. Each component type maps to a Lucide icon and is
// written into Mermaid as `icon: "sd:<type>"`, so the type survives a round trip.
(function (g) {
  const SD = (g.SD = g.SD || {});

  const categories = [
    { id: 'client', label: 'Clientes' },
    { id: 'compute', label: 'Cómputo' },
    { id: 'network', label: 'Red' },
    { id: 'data', label: 'Datos' },
    { id: 'messaging', label: 'Mensajería' },
    { id: 'platform', label: 'Plataforma' },
  ];

  // keywords feed both the picker search and type inference when parsing
  // Mermaid that was not written by this app (LLM output, hand edits).
  const types = [
    { id: 'web', label: 'Web', category: 'client', icon: 'globe', keywords: ['web', 'web app', 'webapp', 'browser', 'navegador', 'sitio', 'website', 'www'] },
    { id: 'mobile', label: 'Móvil', category: 'client', icon: 'smartphone', keywords: ['mobile', 'movil', 'móvil', 'ios', 'android', 'app movil', 'phone', 'celular'] },
    { id: 'frontend', label: 'Frontend', category: 'client', icon: 'app-window', keywords: ['frontend', 'front-end', 'spa', 'react', 'vue', 'angular', 'next.js', 'nextjs', 'svelte', 'ui'] },
    { id: 'desktop', label: 'Escritorio', category: 'client', icon: 'monitor', keywords: ['desktop', 'escritorio', 'electron', 'macos app', 'windows app'] },
    { id: 'user', label: 'Usuario', category: 'client', icon: 'user', keywords: ['user', 'usuario', 'cliente', 'customer', 'actor', 'person', 'admin'] },
    { id: 'iot', label: 'Dispositivo IoT', category: 'client', icon: 'cpu', keywords: ['iot', 'device', 'dispositivo', 'sensor', 'edge device'] },

    { id: 'server', label: 'Servidor', category: 'compute', icon: 'server', keywords: ['server', 'servidor', 'backend', 'api', 'vm', 'ec2', 'host', 'monolith', 'monolito', 'web server', 'app server', 'application server', 'servidor web'] },
    { id: 'service', label: 'Microservicio', category: 'compute', icon: 'box', keywords: ['service', 'servicio', 'microservice', 'microservicio', 'svc'] },
    { id: 'function', label: 'Función serverless', category: 'compute', icon: 'square-function', keywords: ['function', 'función', 'funcion', 'lambda', 'serverless', 'cloud function', 'faas'] },
    { id: 'container', label: 'Contenedor', category: 'compute', icon: 'container', keywords: ['container', 'contenedor', 'docker', 'ecs', 'fargate', 'pod'] },
    { id: 'kubernetes', label: 'Kubernetes', category: 'compute', icon: 'ship-wheel', keywords: ['kubernetes', 'k8s', 'eks', 'gke', 'aks', 'cluster'] },
    { id: 'worker', label: 'Worker', category: 'compute', icon: 'cog', keywords: ['worker', 'consumer', 'consumidor', 'job', 'processor', 'procesador'] },
    { id: 'scheduler', label: 'Cron / Scheduler', category: 'compute', icon: 'timer', keywords: ['cron', 'scheduler', 'programador', 'schedule', 'batch'] },

    { id: 'load-balancer', label: 'Balanceador de carga', category: 'network', icon: 'split', keywords: ['load balancer', 'balanceador', 'lb', 'alb', 'elb', 'nlb', 'haproxy'] },
    { id: 'api-gateway', label: 'API Gateway', category: 'network', icon: 'waypoints', keywords: ['gateway', 'api gateway', 'kong', 'apigee', 'bff'] },
    { id: 'cdn', label: 'CDN', category: 'network', icon: 'radio-tower', keywords: ['cdn', 'cloudfront', 'akamai', 'fastly', 'edge', 'cloudflare'] },
    { id: 'dns', label: 'DNS', category: 'network', icon: 'signpost', keywords: ['dns', 'route53', 'route 53', 'domain', 'dominio'] },
    { id: 'firewall', label: 'Firewall / WAF', category: 'network', icon: 'brick-wall', keywords: ['firewall', 'waf', 'cortafuegos', 'security group'] },
    { id: 'proxy', label: 'Proxy', category: 'network', icon: 'arrow-left-right', keywords: ['proxy', 'reverse proxy', 'nginx', 'envoy', 'traefik', 'sidecar'] },

    { id: 'sql-db', label: 'Base de datos SQL', category: 'data', icon: 'database', keywords: ['sql', 'database', 'base de datos', 'db', 'postgres', 'postgresql', 'mysql', 'mariadb', 'rds', 'aurora', 'sqlite', 'oracle', 'sql server'] },
    { id: 'nosql-db', label: 'Base de datos NoSQL', category: 'data', icon: 'braces', keywords: ['nosql', 'mongo', 'mongodb', 'dynamo', 'dynamodb', 'cassandra', 'firestore', 'couchbase', 'document db', 'cosmos'] },
    { id: 'cache', label: 'Caché', category: 'data', icon: 'zap', keywords: ['cache', 'caché', 'redis', 'memcached', 'elasticache', 'valkey'] },
    { id: 'bucket', label: 'Bucket / Objetos', category: 'data', icon: 'archive', keywords: ['bucket', 's3', 'blob', 'object storage', 'gcs', 'almacenamiento de objetos', 'minio'] },
    { id: 'storage', label: 'Disco / Archivos', category: 'data', icon: 'hard-drive', keywords: ['disk', 'disco', 'storage', 'file storage', 'efs', 'nfs', 'volume', 'volumen', 'filesystem'] },
    { id: 'warehouse', label: 'Data Warehouse', category: 'data', icon: 'warehouse', keywords: ['warehouse', 'data warehouse', 'snowflake', 'bigquery', 'redshift', 'data lake', 'lakehouse'] },
    { id: 'search', label: 'Motor de búsqueda', category: 'data', icon: 'search', keywords: ['search', 'búsqueda', 'busqueda', 'elasticsearch', 'opensearch', 'solr', 'algolia', 'index'] },
    { id: 'vector-db', label: 'Base vectorial', category: 'data', icon: 'chart-scatter', keywords: ['vector', 'vectorial', 'embeddings', 'pinecone', 'weaviate', 'qdrant', 'pgvector', 'milvus'] },

    { id: 'queue', label: 'Cola', category: 'messaging', icon: 'list-end', keywords: ['queue', 'cola', 'sqs', 'rabbitmq', 'rabbit', 'mq', 'activemq', 'job queue'] },
    { id: 'pubsub', label: 'Pub/Sub / Tópico', category: 'messaging', icon: 'megaphone', keywords: ['pubsub', 'pub/sub', 'topic', 'tópico', 'sns', 'broadcast', 'fan-out', 'fanout'] },
    { id: 'stream', label: 'Stream / Event bus', category: 'messaging', icon: 'waves', keywords: ['stream', 'kafka', 'kinesis', 'event bus', 'eventbridge', 'events', 'eventos', 'pulsar', 'nats'] },
    { id: 'webhook', label: 'Webhook', category: 'messaging', icon: 'webhook', keywords: ['webhook', 'callback'] },
    { id: 'email', label: 'Email', category: 'messaging', icon: 'mail', keywords: ['email', 'correo', 'smtp', 'ses', 'sendgrid', 'mailgun'] },
    { id: 'notification', label: 'Notificaciones', category: 'messaging', icon: 'bell', keywords: ['notification', 'notificación', 'notificaciones', 'push', 'fcm', 'apns', 'sms', 'twilio'] },

    { id: 'auth', label: 'Auth / Identidad', category: 'platform', icon: 'key-round', keywords: ['auth', 'authentication', 'autenticación', 'identity', 'identidad', 'oauth', 'sso', 'cognito', 'auth0', 'keycloak', 'iam', 'login'] },
    { id: 'secrets', label: 'Secretos / KMS', category: 'platform', icon: 'vault', keywords: ['secret', 'secrets', 'secretos', 'kms', 'vault', 'key management'] },
    { id: 'monitoring', label: 'Monitoreo', category: 'platform', icon: 'activity', keywords: ['monitoring', 'monitoreo', 'metrics', 'métricas', 'prometheus', 'grafana', 'datadog', 'cloudwatch', 'observability', 'alerting'] },
    { id: 'logs', label: 'Logs', category: 'platform', icon: 'scroll-text', keywords: ['logs', 'logging', 'log', 'elk', 'loki', 'splunk', 'audit'] },
    { id: 'analytics', label: 'Analítica', category: 'platform', icon: 'chart-column', keywords: ['analytics', 'analítica', 'analitica', 'bi', 'dashboard', 'reporting', 'reportes'] },
    { id: 'payment', label: 'Pagos', category: 'platform', icon: 'credit-card', keywords: ['payment', 'pagos', 'pago', 'stripe', 'paypal', 'billing', 'checkout'] },
    { id: 'ml', label: 'Modelo IA / ML', category: 'platform', icon: 'brain', keywords: ['ml', 'ai', 'ia', 'llm', 'model', 'modelo', 'inference', 'openai', 'machine learning', 'recommendation'] },
    { id: 'external', label: 'API externa', category: 'platform', icon: 'plug', keywords: ['external', 'externo', 'third party', 'third-party', 'tercero', 'terceros', 'saas', 'partner'] },
    { id: 'generic', label: 'Genérico', category: 'platform', icon: 'shapes', keywords: ['generic', 'genérico', 'component', 'componente', 'other', 'otro'] },
  ];

  const groupKinds = [
    { id: 'generic', label: 'Genérico', icon: 'square-dashed', keywords: [] },
    { id: 'cloud', label: 'Nube', icon: 'cloud', keywords: ['aws', 'gcp', 'azure', 'cloud', 'nube', 'google cloud', 'oracle cloud', 'digitalocean'] },
    { id: 'network', label: 'Red / VPN', icon: 'network', keywords: ['vpc', 'vpn', 'subnet', 'subred', 'network', 'red', 'private', 'privada', 'lan', 'vnet'] },
    { id: 'region', label: 'Región / Zona', icon: 'map-pin', keywords: ['region', 'región', 'zone', 'zona', 'az', 'availability', 'datacenter', 'data center', 'on-prem', 'on premise'] },
    { id: 'cluster', label: 'Clúster', icon: 'ship-wheel', keywords: ['cluster', 'clúster', 'kubernetes', 'k8s', 'namespace'] },
    { id: 'security', label: 'Zona segura', icon: 'shield', keywords: ['dmz', 'security', 'seguridad', 'secure', 'trust', 'pci', 'boundary'] },
    { id: 'external', label: 'Externo', icon: 'globe', keywords: ['external', 'externo', 'third party', 'terceros', 'internet', 'public', 'pública', 'publica'] },
  ];

  // Tints for group backgrounds. Exported files use the light palette so
  // they look right in any Mermaid renderer; the app swaps in the dark one.
  const groupPalette = {
    light: {
      generic: { fill: '#f4f4f5', stroke: '#d4d4d8', dash: false },
      cloud: { fill: '#eff6ff', stroke: '#93c5fd', dash: true },
      network: { fill: '#f0fdf4', stroke: '#86efac', dash: true },
      region: { fill: '#fffbeb', stroke: '#fcd34d', dash: true },
      cluster: { fill: '#f5f3ff', stroke: '#c4b5fd', dash: false },
      security: { fill: '#fef2f2', stroke: '#fca5a5', dash: true },
      external: { fill: '#fafafa', stroke: '#a1a1aa', dash: true },
    },
    dark: {
      generic: { fill: '#232326', stroke: '#3f3f46', dash: false },
      cloud: { fill: '#16233a', stroke: '#2f5ea8', dash: true },
      network: { fill: '#142a1d', stroke: '#2f7a4b', dash: true },
      region: { fill: '#2b2414', stroke: '#8a6a1f', dash: true },
      cluster: { fill: '#221d36', stroke: '#5b4bab', dash: false },
      security: { fill: '#2d1717', stroke: '#9b3d3d', dash: true },
      external: { fill: '#1e1e21', stroke: '#52525b', dash: true },
    },
  };

  // Icons used by the interface itself (toolbar, panels).
  const uiIcons = [
    'plus', 'square-dashed', 'undo-2', 'redo-2', 'code', 'sparkles', 'panel-left', 'zoom-in', 'zoom-out',
    'scan', 'trash-2', 'x', 'settings', 'arrow-up', 'chevron-down', 'search', 'file-plus', 'upload', 'download',
    'copy', 'ellipsis', 'link', 'pencil', 'check', 'loader-circle', 'message-square', 'wand-sparkles',
    'arrow-left-right', 'arrow-right', 'arrow-left', 'circle-stop', 'ungroup', 'combine', 'file-text',
    'folder-open', 'circle-plus', 'lock', 'image',
  ];

  const typeById = Object.fromEntries(types.map((t) => [t.id, t]));
  const groupKindById = Object.fromEntries(groupKinds.map((k) => [k.id, k]));

  SD.catalog = {
    categories,
    types,
    groupKinds,
    groupPalette,
    uiIcons,
    type(id) {
      return typeById[id] || typeById.generic;
    },
    hasType(id) {
      return Object.prototype.hasOwnProperty.call(typeById, id);
    },
    groupKind(id) {
      return groupKindById[id] || groupKindById.generic;
    },
    hasGroupKind(id) {
      return Object.prototype.hasOwnProperty.call(groupKindById, id);
    },
    isClient(typeId) {
      return SD.catalog.type(typeId).category === 'client';
    },
  };
})(globalThis);
