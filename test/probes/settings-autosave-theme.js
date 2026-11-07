/**
 * The settings pages save their own answers, and appearance belongs with them.
 *
 * Example: choosing Dark applies daisyUI's dim theme immediately, typing a bibliography
 * path persists after the short edit pause, and the New Note page edits YAML in CodeMirror
 * without a Save button.
 *
 * @covers src/ui/settings/index.ts, src/services/theme.ts
 */
(async () => {
  const t = window.__t;
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const { configManager } = await t.app('/src/services/config_manager.ts');
  const { applyTheme, themeFor } = await t.app('/src/services/theme.ts');
  const { DEFAULT_TEMPLATE } = await t.app('/src/services/new_document/index.ts');
  const {
    CitationSettings,
    GeneralSettings,
    NewDocumentSettings
  } = await t.app('/src/ui/settings/index.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const before = await invoke('get_config');
  const root = document.documentElement;
  const previousTheme = root.dataset.theme ?? null;
  const previousColorScheme = root.style.colorScheme;
  const saveButtons = (element) => element.querySelectorAll('button.btn-primary').length;
  const waitFor = async (ready) => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (ready()) return true;
      await t.sleep(50);
    }
    return false;
  };

  try {
    await configManager.update({
      theme: 'auto',
      image_folder: '',
      bibliography_file: '',
      csl_style: '',
      new_file_frontmatter: null
    });
    applyTheme('auto');

    const general = new GeneralSettings();
    await t.sleep(150);
    const appearance = [...general.element.querySelectorAll('[data-theme-choice]')];
    check(
      'General offers Auto, Light and Dark with no Save button',
      appearance.map((choice) => choice.value).join(',') === 'auto,light,dark' &&
        saveButtons(general.element) === 0,
      {
        choices: appearance.map((choice) => choice.value),
        saveButtons: saveButtons(general.element)
      }
    );
    const dark = appearance.find((choice) => choice.value === 'dark');
    dark.checked = true;
    dark.dispatchEvent(new Event('change', { bubbles: true }));
    check(
      'Dark applies immediately and persists',
      (await waitFor(() => root.dataset.theme === 'dim')) &&
        (await invoke('get_config')).theme === 'dark',
      { theme: root.dataset.theme, stored: (await invoke('get_config')).theme }
    );
    const light = appearance.find((choice) => choice.value === 'light');
    light.checked = true;
    light.dispatchEvent(new Event('change', { bubbles: true }));
    check(
      'Light applies immediately and persists',
      (await waitFor(() => root.dataset.theme === 'winter')) &&
        (await invoke('get_config')).theme === 'light',
      { theme: root.dataset.theme, stored: (await invoke('get_config')).theme }
    );
    const auto = appearance.find((choice) => choice.value === 'auto');
    auto.checked = true;
    auto.dispatchEvent(new Event('change', { bubbles: true }));
    check(
      'Auto removes the explicit theme and persists',
      (await waitFor(() => root.dataset.theme === undefined)) &&
        (await invoke('get_config')).theme === 'auto',
      { theme: root.dataset.theme ?? null, stored: (await invoke('get_config')).theme }
    );
    await configManager.update({ theme: 'dark' });
    check(
      'the main window applies a theme changed by config news',
      await waitFor(() => root.dataset.theme === 'dim'),
      root.dataset.theme ?? null
    );
    await configManager.update({ theme: 'auto' });
    const images = general.element.querySelector('[data-image-folder]');
    images.value = '~/Pictures/Settings Probe';
    images.dispatchEvent(new Event('input', { bubbles: true }));
    check(
      'the image folder saves after typing pauses',
      await waitFor(
        () => configManager.get()?.image_folder === '~/Pictures/Settings Probe'
      ),
      (await invoke('get_config')).image_folder
    );

    const citation = new CitationSettings();
    await t.sleep(150);
    check(
      'Citation has no Save button',
      saveButtons(citation.element) === 0,
      saveButtons(citation.element)
    );
    const bibliography = citation.element.querySelector('input[type="text"]');
    bibliography.value = '~/Documents/probe.bib';
    bibliography.dispatchEvent(new Event('input', { bubbles: true }));
    check(
      'the bibliography path saves after typing pauses',
      await waitFor(
        () => configManager.get()?.bibliography_file === '~/Documents/probe.bib'
      ),
      (await invoke('get_config')).bibliography_file
    );
    const style = citation.element.querySelector('select');
    style.value = 'vancouver';
    style.dispatchEvent(new Event('change', { bubbles: true }));
    check(
      'the citation style saves immediately',
      await waitFor(() => configManager.get()?.csl_style === 'vancouver'),
      (await invoke('get_config')).csl_style
    );

    const note = new NewDocumentSettings();
    await t.sleep(180);
    check(
      'New Note embeds the YAML CodeMirror editor and has no Save button',
      note.element.querySelector('[data-new-file-frontmatter] .cm-editor') !== null &&
        note.element.querySelector('.cm-gutters') !== null &&
        saveButtons(note.element) === 0,
      {
        editor: note.element.querySelector('.cm-editor') !== null,
        gutters: note.element.querySelector('.cm-gutters') !== null,
        saveButtons: saveButtons(note.element)
      }
    );
    const changed = `${note.view.state.doc.toString()}\nstatus: drafting`;
    note.view.dispatch({ changes: { from: 0, to: note.view.state.doc.length, insert: changed } });
    check(
      'editing the frontmatter saves it automatically',
      await waitFor(() => configManager.get()?.new_file_frontmatter === changed),
      (await invoke('get_config')).new_file_frontmatter
    );
    note.element.querySelector('[data-new-file-reset]').click();
    check(
      'Reset restores and persists the app-owned default',
      (await waitFor(() => configManager.get()?.new_file_frontmatter === null)) &&
        note.view.state.doc.toString() === DEFAULT_TEMPLATE,
      {
        stored: (await invoke('get_config')).new_file_frontmatter,
        shown: note.view.state.doc.toString()
      }
    );
  } finally {
    await invoke('set_config', {
      cfg: { ...before, config_version: await invoke('get_current_config_version') }
    });
    await configManager.load();
    applyTheme(themeFor(configManager.get()));
    if (previousTheme === null) {
      delete root.dataset.theme;
    } else {
      root.dataset.theme = previousTheme;
    }
    root.style.colorScheme = previousColorScheme;
  }
  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
