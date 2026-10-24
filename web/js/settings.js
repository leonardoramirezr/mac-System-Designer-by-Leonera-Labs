// LLM provider settings. Every provider speaks the OpenAI-compatible
// /chat/completions API; API keys are stored by the native side (Keychain).
(function (g) {
  const SD = (g.SD = g.SD || {});
  const { h, icon } = SD.ui;

  const P = SD.bridge.PROVIDERS;
  let config = defaults();
  const listeners = [];

  function defaults() {
    return {
      active: 'groq',
      providers: Object.fromEntries(Object.keys(P).map((id) => [id, { model: P[id].model, baseURL: P[id].baseURL, name: id === 'custom' ? '' : P[id].name }])),
    };
  }

  async function load() {
    try {
      const raw = await SD.bridge.getPref('llm');
      const saved = raw ? JSON.parse(raw) : null;
      if (saved && typeof saved === 'object') {
        const d = defaults();
        Object.keys(P).forEach((id) => Object.assign(d.providers[id], (saved.providers || {})[id] || {}));
        // only the custom provider's URL is editable
        Object.keys(P).forEach((id) => {
          if (id !== 'custom') d.providers[id].baseURL = P[id].baseURL;
        });
        d.active = P[saved.active] ? saved.active : d.active;
        config = d;
      }
    } catch (e) {
      config = defaults();
    }
  }

  function persist() {
    SD.bridge.setPref('llm', JSON.stringify(config)).catch(() => {});
    listeners.forEach((fn) => fn());
  }

  function providerName(id) {
    if (id === 'custom') return (config.providers.custom && config.providers.custom.name) || P.custom.name;
    return P[id].name;
  }

  function current() {
    const id = config.active;
    const p = config.providers[id] || {};
    return { provider: id, name: providerName(id), baseURL: id === 'custom' ? p.baseURL || P.custom.baseURL : P[id].baseURL, model: (p.model || '').trim() };
  }

  function setActive(id) {
    if (!P[id]) return;
    config.active = id;
    persist();
  }

  async function open(opts) {
    const o = opts || {};
    let has = {};
    try {
      has = await SD.bridge.hasSecrets(Object.keys(P));
    } catch (e) {
      has = {};
    }
    const draft = JSON.parse(JSON.stringify(config));
    const keyEdits = {};
    const cards = {};

    const radio = (id) => {
      const r = h('input', { type: 'radio', name: 'provider', value: id, checked: draft.active === id });
      r.addEventListener('change', () => {
        draft.active = id;
        Object.entries(cards).forEach(([cid, c]) => c.classList.toggle('active', cid === id));
      });
      return r;
    };

    const providerCard = (id) => {
      const p = draft.providers[id];
      const list = h('datalist', { id: 'models-' + id });
      const model = h('input.field', { type: 'text', value: p.model || '', placeholder: 'id del modelo', spellcheck: false, list: 'models-' + id });
      model.setAttribute('list', 'models-' + id);
      model.addEventListener('input', () => (p.model = model.value.trim()));
      const note = h('span.form-hint');
      const loadBtn = h('button.btn.subtle.small', { type: 'button' }, 'Cargar modelos');
      loadBtn.addEventListener('click', async () => {
        loadBtn.disabled = true;
        note.textContent = 'Consultando /models…';
        try {
          if (keyEdits[id] !== undefined) await SD.bridge.setSecret(id, keyEdits[id]);
          const baseURL = id === 'custom' ? p.baseURL : P[id].baseURL;
          const models = (await SD.bridge.llmModels({ provider: id, baseURL })) || [];
          SD.ui.clear(list);
          models.forEach((m) => list.appendChild(h('option', { value: m })));
          note.textContent = models.length ? `${models.length} modelos disponibles. Escribe para filtrar.` : 'El proveedor no devolvió modelos.';
          if (models.length && !p.model) {
            model.value = models[0];
            p.model = models[0];
          }
        } catch (e) {
          note.textContent = 'No se pudo cargar: ' + (e.message || e);
        } finally {
          loadBtn.disabled = false;
        }
      });

      const key = h('input.field', {
        type: 'password',
        placeholder: has[id] ? '•••••••• (guardada)' : P[id].keyHint || 'API key',
        autocomplete: 'off',
        spellcheck: false,
      });
      key.addEventListener('input', () => (keyEdits[id] = key.value.trim()));
      const removeKey = has[id]
        ? h('button.link-btn', { type: 'button', onclick: () => { keyEdits[id] = ''; key.value = ''; key.placeholder = 'Se eliminará al guardar'; } }, 'Quitar')
        : null;

      const rows = [];
      if (id === 'custom') {
        const name = h('input.field', { type: 'text', value: p.name || '', placeholder: 'Ollama, LM Studio, vLLM…', spellcheck: false });
        name.addEventListener('input', () => (p.name = name.value.trim()));
        const base = h('input.field.mono', { type: 'text', value: p.baseURL || '', placeholder: 'https://host/v1', spellcheck: false });
        base.addEventListener('input', () => (p.baseURL = base.value.trim()));
        rows.push(h('label.form-row', h('span.form-label', 'Nombre'), name));
        rows.push(h('label.form-row', h('span.form-label', 'URL base (compatible con OpenAI)'), base));
      }
      rows.push(h('div.form-row', h('span.form-label', 'API key', removeKey), key));
      rows.push(h('div.form-row', h('span.form-label', 'Modelo'), h('div.inline-row', model, loadBtn), note, list));

      const card = h(
        'div.provider' + (draft.active === id ? '.active' : ''),
        h(
          'label.provider-head',
          radio(id),
          h('span.provider-name', id === 'custom' ? 'Personalizado' : P[id].name),
          h('span.provider-url', id === 'custom' ? 'Cualquier API compatible con OpenAI' : P[id].baseURL + '/chat/completions'),
          has[id] ? h('span.badge', icon('lock', 11), 'Key guardada') : null
        ),
        h('div.provider-body', rows)
      );
      cards[id] = card;
      if (o.focus === id) setTimeout(() => key.focus(), 60);
      return card;
    };

    const body = h(
      'div.settings',
      o.message ? h('div.notice', o.message) : null,
      h('p.dialog-text', 'Elige el proveedor que usará el asistente. Todos usan la API compatible con OpenAI (', h('code', '/v1/chat/completions'), ').'),
      Object.keys(P).map(providerCard),
      h('p.form-hint', SD.bridge.isNative ? 'Las API keys se guardan en el Llavero de macOS y solo se envían a su proveedor.' : 'Modo navegador: las API keys se guardan en localStorage de este navegador.')
    );

    SD.ui.dialog({
      title: 'Asistente de IA',
      body,
      wide: true,
      actions: [
        { label: 'Cancelar', value: null },
        {
          label: 'Guardar',
          primary: true,
          run: async (close) => {
            try {
              for (const [id, value] of Object.entries(keyEdits)) await SD.bridge.setSecret(id, value);
              config = draft;
              persist();
              close(true);
              SD.ui.toast('Ajustes guardados');
            } catch (e) {
              SD.ui.toast('No se pudo guardar la API key: ' + (e.message || e), { kind: 'error' });
            }
          },
        },
      ],
    });
  }

  SD.settings = {
    load,
    current,
    providerName,
    setActive,
    open,
    onChange(fn) {
      listeners.push(fn);
    },
  };
})(globalThis);
