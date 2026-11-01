/**
 * New Markdown offers the built-in Reveal.js and Beamer metadata starters.
 *
 * @covers src/services/new_document/builtins.ts,
 *   src/services/new_document/templates.ts,
 *   src/ui/new_document/dialog.ts
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual = null) => checks.push({ name, pass, actual });
  const sleep = t.sleep;
  const visible = (selector) => {
    const element = document.querySelector(selector);
    return element !== null && !element.classList.contains('hidden');
  };
  const until = async (ready, tries = 100) => {
    for (let attempt = 0; attempt < tries; attempt += 1) {
      if (ready()) return true;
      await sleep(50);
    }
    return false;
  };
  const answerSession = () => {
    const prompt = document.querySelector('[data-prompt]');
    if (prompt !== null && !prompt.classList.contains('hidden')) {
      prompt.querySelector('[data-prompt-no]')?.click();
    }
  };
  const read = async (path) => {
    const bytes = await invoke('plugin:fs|read_text_file', { path });
    return new TextDecoder().decode(bytes instanceof ArrayBuffer ? bytes : Uint8Array.from(bytes));
  };
  const create = async (template, name, expected) => {
    await invoke('plugin:event|emit', { event: 'new_markdown' });
    await until(() => visible('[data-new-document]'));
    const card = document.querySelector('[data-new-document]');
    const choice = card.querySelector('[data-new-document-template]');
    choice.value = template;
    card.querySelector('[data-new-document-name]').value = name;
    card.querySelector('[data-new-document-create]').click();
    await sleep(350);
    answerSession();
    await sleep(200);
    const text = await read(`${workspace}/${name}.md`);
    check(`${name}: the starter is written`, expected.every((line) => text.includes(line)), text);
    check(
      `${name}: the app still supplies its stamps`,
      /^date: \d{4}-\d{2}-\d{2}$/m.test(text) && /^id: \d{14}$/m.test(text),
      text.split('\n').slice(0, 18)
    );
  };

  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const folder = `yi-probe-new-note-presentation-${Date.now().toString(36)}`;
  const workspace = `${home}/${folder}`;
  let previous = null;
  try {
    try {
      await files.deleteEntry(workspace);
    } catch {
      // A previous cut-off run.
    }
    await files.createEntry(home, folder, false);
    previous = await t.openWorkspace(workspace);

    await invoke('plugin:event|emit', { event: 'new_markdown' });
    await until(() => visible('[data-new-document]'));
    const choices = [
      ...document.querySelector('[data-new-document-template]').options
    ].map((option) => ({ value: option.value, text: option.textContent }));
    check(
      'the card offers both presentation starters',
      choices.some((choice) => choice.value === 'builtin:revealjs') &&
        choices.some((choice) => choice.value === 'builtin:beamer'),
      choices
    );
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(120);

    await create(
      'builtin:revealjs',
      'reveal',
      ['theme: black', 'transition: slide', 'slide-level: 2', 'progress: true']
    );
    await create(
      'builtin:beamer',
      'beamer',
      [
        'theme: default',
        'colortheme: default',
        'fonttheme: default',
        'aspectratio: 169',
        'section-titles: true'
      ]
    );
  } finally {
    if (previous !== null) {
      await t.restoreWorkspace(previous);
    }
    try {
      await files.deleteEntry(workspace);
    } catch {
      // Nothing to tidy.
    }
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
