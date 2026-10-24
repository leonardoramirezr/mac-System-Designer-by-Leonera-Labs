// AI bar at the bottom of the canvas. A segmented control picks the mode:
// "Generar" edits the diagram, "Feedback" only answers about it.
(function (g) {
  const SD = (g.SD = g.SD || {});
  const { h, icon, segmented, toast } = SD.ui;

  let mode = 'generate';
  let input;
  let sendBtn;
  let card;
  let cardBody;
  let chip;
  let statusLine;
  let modeControl;
  let running = null;
  const thread = []; // feedback conversation: { role, content }

  const PLACEHOLDER = {
    generate: 'Describe un sistema o un cambio…',
    feedback: 'Pregunta algo, o envía para una revisión…',
  };

  function setMode(m) {
    mode = m === 'feedback' ? 'feedback' : 'generate';
    if (modeControl) modeControl.setValue(mode);
    if (input) {
      input.placeholder = PLACEHOLDER[mode];
      updateSend();
    }
    document.getElementById('ai').dataset.mode = mode;
    SD.bridge.setPref('aiMode', mode).catch(() => {});
  }

  function updateChip() {
    if (!chip) return;
    const cfg = SD.settings.current();
    SD.ui.clear(chip);
    SD.ui.append(chip, [h('span.chip-provider', cfg.name), cfg.model ? h('span.chip-model', cfg.model) : h('span.chip-model.missing', 'sin modelo'), icon('chevron-down', 12)]);
  }

  function updateSend() {
    if (!sendBtn) return;
    SD.ui.clear(sendBtn);
    if (running) {
      sendBtn.appendChild(icon('circle-stop', 16));
      sendBtn.title = 'Detener';
      sendBtn.disabled = false;
      sendBtn.classList.add('busy');
    } else {
      sendBtn.appendChild(icon('arrow-up', 16, 2.2));
      sendBtn.title = mode === 'generate' ? 'Generar (↩)' : 'Pedir feedback (↩)';
      sendBtn.disabled = mode === 'generate' && !input.value.trim();
      sendBtn.classList.remove('busy');
    }
  }

  function autogrow() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 140) + 'px';
  }

  function showCard(show) {
    card.hidden = !show;
    document.getElementById('ai').classList.toggle('with-card', !!show);
  }

  function addMessage(role, content, extra) {
    const el =
      role === 'user'
        ? h('div.msg.user', content)
        : role === 'error'
          ? h('div.msg.error', h('div.msg-error-title', icon('x', 14), h('span', content)), extra || null)
          : h('div.msg.assistant.md');
    if (role === 'assistant') el.innerHTML = SD.markdown.render(content);
    cardBody.appendChild(el);
    showCard(true);
    requestAnimationFrame(() => {
      cardBody.scrollTop = cardBody.scrollHeight;
    });
    return el;
  }

  function setStatus(text) {
    statusLine.textContent = text || '';
    statusLine.hidden = !text;
  }

  const isDefaultName = (name) => !name || /^Diagrama (sin título|importado)$/.test(name);

  async function send() {
    if (running) {
      cancel();
      return;
    }
    const prompt = input.value.trim();
    if (mode === 'generate' && !prompt) {
      input.focus();
      return;
    }
    const cfg = SD.settings.current();
    if (!cfg.model) {
      SD.settings.open({ message: 'Elige un modelo para usar la IA.' });
      return;
    }
    if (cfg.provider !== 'custom') {
      let has = {};
      try {
        has = await SD.bridge.hasSecrets([cfg.provider]);
      } catch (e) {
        has = {};
      }
      if (!has[cfg.provider]) {
        SD.settings.open({ message: `Agrega tu API key de ${cfg.name} para usar la IA.`, focus: cfg.provider });
        return;
      }
    }

    const requestId = SD.app.uuid();
    const runMode = mode;
    running = { requestId, cancelled: false };
    updateSend();
    input.disabled = true;
    setStatus(runMode === 'generate' ? `Generando con ${cfg.name}…` : `Analizando el diseño con ${cfg.name}…`);
    document.getElementById('ai').classList.add('running');
    const doc = SD.app.state.doc;
    if (runMode === 'feedback') addMessage('user', prompt || 'Revisión general del diseño');

    let reply = '';
    try {
      const messages = SD.llm.buildMessages(runMode, doc, prompt, thread);
      const res = await SD.bridge.llmChat({ provider: cfg.provider, baseURL: cfg.baseURL, model: cfg.model, messages, requestId });
      reply = SD.llm.stripThinking(res && res.content);
      if (running.cancelled) return;
      if (!reply) throw new Error('El modelo respondió vacío.');
      if (runMode === 'generate') {
        const out = SD.llm.parseGenerated(reply);
        const name = isDefaultName(SD.app.state.doc.name) && out.title ? out.title : null;
        SD.app.replaceContent(out.doc, { name, source: 'ai' });
        input.value = '';
        toast(out.warnings.length ? `Diagrama actualizado (${out.warnings.length} advertencia(s))` : 'Diagrama actualizado con IA', {
          action: { label: 'Deshacer', run: () => SD.app.undo() },
        });
      } else {
        thread.push({ role: 'user', content: prompt || 'Revisa este diseño y dame feedback.' }, { role: 'assistant', content: reply });
        addMessage('assistant', reply);
        input.value = '';
      }
    } catch (e) {
      if (running && running.cancelled) return;
      const details = reply
        ? h('details.raw', h('summary', 'Ver respuesta del modelo'), h('pre', reply))
        : null;
      addMessage('error', String((e && e.message) || e), details);
    } finally {
      const wasCancelled = running && running.cancelled;
      running = null;
      input.disabled = false;
      setStatus('');
      document.getElementById('ai').classList.remove('running');
      autogrow();
      updateSend();
      if (wasCancelled) toast('Solicitud cancelada');
      else input.focus();
    }
  }

  function cancel() {
    if (!running) return;
    running.cancelled = true;
    SD.bridge.llmCancel(running.requestId).catch(() => {});
  }

  function providerMenu() {
    const cfg = SD.settings.current();
    SD.ui.menu(
      [
        ...Object.keys(SD.bridge.PROVIDERS).map((id) => ({
          label: SD.settings.providerName(id),
          icon: id === cfg.provider ? 'check' : null,
          run: () => {
            SD.settings.setActive(id);
            updateChip();
          },
        })),
        '-',
        { label: 'Configurar proveedores…', icon: 'settings', shortcut: `${SD.ui.mod},`, run: () => SD.settings.open() },
      ],
      chip,
      { placement: 'top', align: 'right' }
    );
  }

  async function init() {
    const host = document.getElementById('ai');
    try {
      const saved = await SD.bridge.getPref('aiMode');
      if (saved) mode = saved === 'feedback' ? 'feedback' : 'generate';
    } catch (e) {
      /* default */
    }
    await SD.settings.load();

    modeControl = segmented(
      [
        { value: 'generate', label: 'Generar', icon: 'wand-sparkles', title: 'La IA crea o modifica el diagrama' },
        { value: 'feedback', label: 'Feedback', icon: 'message-square', title: 'La IA revisa el diseño sin editarlo' },
      ],
      mode,
      setMode
    );
    input = h('textarea.ai-input', { rows: 1, spellcheck: true, 'aria-label': 'Mensaje para la IA' });
    input.addEventListener('input', () => {
      autogrow();
      updateSend();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        send();
      }
    });
    sendBtn = h('button.send-btn', { type: 'button', onclick: send });
    chip = h('button.chip', { type: 'button', title: 'Proveedor y modelo', onclick: providerMenu });
    statusLine = h('div.ai-status', { hidden: true });

    cardBody = h('div.ai-card-body');
    cardBody.addEventListener('click', (e) => {
      const a = e.target.closest('a[href]');
      if (a) {
        e.preventDefault();
        SD.bridge.openURL(a.getAttribute('href')).catch(() => {});
      }
    });
    card = h(
      'div.ai-card.panel',
      { hidden: true },
      h(
        'div.ai-card-head',
        icon('sparkles', 14),
        h('span', 'Asistente'),
        h('span.spacer'),
        h('button.link-btn', { type: 'button', onclick: () => { thread.length = 0; SD.ui.clear(cardBody); showCard(false); } }, 'Limpiar'),
        SD.ui.iconButton('x', 'Ocultar', () => showCard(false))
      ),
      cardBody
    );

    SD.ui.append(host, [
      card,
      h('div.ai-bar.panel', h('div.ai-row', modeControl, h('div.ai-input-wrap', input), chip, sendBtn), statusLine),
    ]);
    setMode(mode);
    updateChip();
    SD.settings.onChange(updateChip);
  }

  function focus() {
    if (input) input.focus();
  }

  SD.ai = { init, focus, setMode };
})(globalThis);
