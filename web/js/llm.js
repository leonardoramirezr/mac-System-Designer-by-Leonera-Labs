// Prompts for the two AI modes. "generate" returns a full diagram in the
// app's Mermaid dialect; "feedback" reviews the diagram and never edits it.
(function (g) {
  const SD = (g.SD = g.SD || {});

  function typeList() {
    return SD.catalog.categories
      .map((c) => {
        const types = SD.catalog.types.filter((t) => t.category === c.id).map((t) => `${t.id} (${t.label})`);
        return `  - ${c.label}: ${types.join(', ')}`;
      })
      .join('\n');
  }

  function kindList() {
    return SD.catalog.groupKinds
      .filter((k) => k.id !== 'generic')
      .map((k) => `${k.id} (${k.label})`)
      .join(', ');
  }

  function generateSystemPrompt() {
    return `You are a senior software architect working inside "System Designer", a macOS app that draws system design diagrams from Mermaid flowcharts.
Reply with exactly ONE \`\`\`mermaid code block that contains the COMPLETE updated diagram, and nothing else — no explanations before or after.

Strict dialect (the app parses it):
1. First line: \`flowchart LR\`. Second line (optional): \`%% title: <short diagram name>\`.
2. Declare every component once, on its own line:
     <id>@{ icon: "sd:<type>", label: "<Title>" }
   or, with a short description:
     <id>@{ icon: "sd:<type>", label: "<Title><br><small><description></small>" }
   <id>: lowercase letters, digits and underscores, starting with a letter (api, orders_db). Never use the words end, graph, subgraph, style, class, default as ids.
3. <type> must be one of these ids:
${typeList()}
   Use "generic" only when nothing fits.
4. Groups (cloud accounts, VPCs/VPNs, regions, clusters, trust zones, third parties) are subgraphs. Put the component declarations of the members inside:
     subgraph <group_id>["<Group title>"]
       <member declarations or nested subgraphs>
     end
   After all connections, tag each group with its kind: \`class <group_id> grp_<kind>\` where kind is one of: ${kindList()}.
5. Connections go after the declarations, only between component ids (never to a subgraph id):
     <from> --> <to>
     <from> -->|"<label>"| <to>
   Use -.-> for asynchronous or event-driven flows, ==> for the critical/high-volume path, <--> for two-way, --- for an undirected link.
6. Inside labels never use the characters " # * _ \` < > (except the <br><small> markup above).
7. Clients (web, mobile, frontend, desktop, user, iot) appear first so they end up on the left; data stores last.
8. Titles: 1–4 words. Descriptions: at most ~8 words. Connection labels: 1–3 words.
9. Write every title, description and label in the language the user writes in.

If a current diagram is provided, edit it to satisfy the request: keep the ids of components that stay, keep everything the user did not ask to change, and only add, remove or modify what is needed. If the request describes an unrelated new system, replace the diagram.`;
  }

  function feedbackSystemPrompt() {
    return `You are a principal engineer reviewing a system design diagram made in "System Designer".
The diagram is a Mermaid flowchart: components are declared as id@{ icon: "sd:<type>", label: "Title<br><small>description</small>" }, groups are subgraphs (cloud accounts, networks, regions…), and arrows are connections (-.-> async, ==> critical path), optionally labeled.
Give concise, actionable feedback in Markdown:
- Start with a one-line overall assessment.
- Then strengths, risks and gaps (single points of failure, scalability, data consistency, security, observability, cost) and concrete improvements.
- Refer to components by their titles, not ids.
- Do NOT output Mermaid or a rewritten diagram; the user will apply changes themselves.
Answer in the language of the user's message (Spanish if unclear). Keep it under ~350 words unless asked for more.`;
  }

  function diagramBlock(doc) {
    if (!doc.nodes.length && !doc.groups.length) return 'The current diagram is empty.';
    return 'Current diagram:\n```mermaid\n' + SD.sdll.serialize(doc, { header: false }).trim() + '\n```';
  }

  function buildMessages(mode, doc, prompt, history) {
    if (mode === 'feedback') {
      const msgs = [{ role: 'system', content: feedbackSystemPrompt() }];
      (history || []).slice(-6).forEach((m) => msgs.push({ role: m.role, content: m.content }));
      msgs.push({ role: 'user', content: `${diagramBlock(doc)}\n\n${prompt || 'Revisa este diseño y dame feedback.'}` });
      return msgs;
    }
    return [
      { role: 'system', content: generateSystemPrompt() },
      { role: 'user', content: `${diagramBlock(doc)}\n\nRequest: ${prompt}` },
    ];
  }

  // Parses a "generate" reply into a doc. Throws with a readable message.
  function parseGenerated(reply) {
    const code = SD.sdll.extractMermaid(reply);
    if (!code) throw new Error('La respuesta no contiene un diagrama Mermaid.');
    const parsed = SD.sdll.parse(code);
    if (!parsed.doc.nodes.length) throw new Error('El diagrama generado no tiene componentes.');
    const title = /^\s*%%\s*title\s*:\s*(.+)$/im.exec(code);
    return { doc: parsed.doc, warnings: parsed.warnings, title: title ? title[1].trim().slice(0, 80) : null, code };
  }

  function stripThinking(text) {
    return String(text || '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .trim();
  }

  SD.llm = { buildMessages, parseGenerated, stripThinking, generateSystemPrompt, feedbackSystemPrompt };
})(globalThis);
