// Bridge to the native macOS shell (WKScriptMessageHandlerWithReply named
// "native"). When the page runs in a regular browser (development), a local
// fallback keeps everything working with localStorage, downloads and fetch.
(function (g) {
  const SD = (g.SD = g.SD || {});

  const handler = g.webkit && g.webkit.messageHandlers && g.webkit.messageHandlers.native;
  const isNative = !!handler;

  // Base URLs of the built-in providers. The native side enforces the same
  // values so a stored API key is only ever sent to its own provider.
  const PROVIDERS = {
    groq: { name: 'Groq', baseURL: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-120b', keyHint: 'gsk_…' },
    openai: { name: 'OpenAI', baseURL: 'https://api.openai.com/v1', model: 'gpt-5-mini', keyHint: 'sk-…' },
    itera: { name: 'Itera Compute', baseURL: 'https://api.iteracompute.com/v1', model: 'deepseek/deepseek-v4.1-flash', keyHint: '' },
    custom: { name: 'Personalizado', baseURL: 'http://localhost:11434/v1', model: '', keyHint: 'opcional' },
  };

  function nativeCall(action, payload) {
    return handler.postMessage({ action, payload: payload || {} });
  }

  // ------------------------------------------------------------ web fallback

  const ls = {
    get(key) {
      try {
        return g.localStorage.getItem(key);
      } catch (e) {
        return null;
      }
    },
    set(key, value) {
      try {
        if (value === null || value === undefined) g.localStorage.removeItem(key);
        else g.localStorage.setItem(key, value);
      } catch (e) {
        /* storage unavailable */
      }
    },
  };

  function webIndex() {
    try {
      return JSON.parse(ls.get('sd.index') || '[]');
    } catch (e) {
      return [];
    }
  }

  function download(name, content, type) {
    const blob = new Blob([content], { type: type || 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  }

  function pickFile() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.sdll,.mmd,.mermaid,.txt,text/plain';
      input.onchange = () => {
        const file = input.files && input.files[0];
        if (!file) return resolve(null);
        file.text().then((content) => resolve({ name: file.name, content }));
      };
      input.click();
    });
  }

  const controllers = new Map();

  async function webChat({ provider, baseURL, model, messages, requestId }) {
    const key = ls.get('sd.secret.' + provider) || '';
    const ctrl = new AbortController();
    controllers.set(requestId, ctrl);
    try {
      const res = await fetch(baseURL.replace(/\/+$/, '') + '/chat/completions', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, key ? { Authorization: 'Bearer ' + key } : {}),
        body: JSON.stringify({ model, messages, stream: false }),
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data.error && data.error.message) || `HTTP ${res.status}`);
      const msg = data.choices && data.choices[0] && data.choices[0].message;
      return { content: (msg && msg.content) || '' };
    } finally {
      controllers.delete(requestId);
    }
  }

  async function webModels({ provider, baseURL }) {
    const key = ls.get('sd.secret.' + provider) || '';
    const res = await fetch(baseURL.replace(/\/+$/, '') + '/models', {
      headers: key ? { Authorization: 'Bearer ' + key } : {},
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data.error && data.error.message) || `HTTP ${res.status}`);
    return (data.data || []).map((m) => m.id).filter(Boolean).sort();
  }

  const web = {
    async listDiagrams() {
      return webIndex().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    },
    async loadDiagram({ id }) {
      const content = ls.get('sd.diagram.' + id);
      if (content === null) throw new Error('El diagrama ya no existe.');
      return { id, content };
    },
    async saveDiagram({ id, name, content }) {
      const updatedAt = new Date().toISOString();
      ls.set('sd.diagram.' + id, content);
      const index = webIndex().filter((d) => d.id !== id);
      index.push({ id, name, updatedAt });
      ls.set('sd.index', JSON.stringify(index));
      return { id, updatedAt };
    },
    async deleteDiagram({ id }) {
      ls.set('sd.diagram.' + id, null);
      ls.set('sd.index', JSON.stringify(webIndex().filter((d) => d.id !== id)));
      return true;
    },
    async exportFile({ name, content, type }) {
      download(name, content, type);
      return { saved: true };
    },
    async importFile() {
      return pickFile();
    },
    async getPref({ key }) {
      return ls.get('sd.pref.' + key);
    },
    async setPref({ key, value }) {
      ls.set('sd.pref.' + key, value);
      return true;
    },
    async setSecret({ account, value }) {
      ls.set('sd.secret.' + account, value || null);
      return true;
    },
    async hasSecrets({ accounts }) {
      const out = {};
      accounts.forEach((a) => (out[a] = !!ls.get('sd.secret.' + a)));
      return out;
    },
    llmChat: webChat,
    async llmCancel({ requestId }) {
      const c = controllers.get(requestId);
      if (c) c.abort();
      return true;
    },
    llmModels: webModels,
    async setWindowTitle({ title }) {
      document.title = title ? `${title} — System Designer` : 'System Designer';
      return true;
    },
    async takePendingFiles() {
      return [];
    },
    async openURL({ url }) {
      g.open(url, '_blank', 'noopener');
      return true;
    },
  };

  async function call(action, payload) {
    if (isNative) return nativeCall(action, payload);
    if (!web[action]) throw new Error('Acción no disponible: ' + action);
    return web[action](payload || {});
  }

  SD.bridge = {
    isNative,
    PROVIDERS,
    call,
    listDiagrams: () => call('listDiagrams'),
    loadDiagram: (id) => call('loadDiagram', { id }),
    saveDiagram: (id, name, content) => call('saveDiagram', { id, name, content }),
    deleteDiagram: (id) => call('deleteDiagram', { id }),
    exportFile: (name, content, type) => call('exportFile', { name, content, type }),
    importFile: () => call('importFile'),
    getPref: (key) => call('getPref', { key }),
    setPref: (key, value) => call('setPref', { key, value }),
    setSecret: (account, value) => call('setSecret', { account, value }),
    hasSecrets: (accounts) => call('hasSecrets', { accounts }),
    llmChat: (req) => call('llmChat', req),
    llmCancel: (requestId) => call('llmCancel', { requestId }),
    llmModels: (req) => call('llmModels', req),
    setWindowTitle: (title) => call('setWindowTitle', { title }),
    takePendingFiles: () => call('takePendingFiles'),
    openURL: (url) => call('openURL', { url }),
  };
})(globalThis);
