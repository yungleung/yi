/**
 * The Export Manager: its native-menu event, kind sidebar, defaults and unsupported states.
 *
 * @needs-workspace — export-kind information names fixture/user export files.
 */
(async () => {
  const t = window.__t;
  const { t: words } = await t.app('/src/services/i18n.ts');
  const templates = await t.app('/src/api/templates.ts');
  const exportApi = await t.app('/src/api/export.ts');
  const { configManager } = await t.app('/src/services/config_manager.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const manager = () => document.querySelector('[data-export-manager]');
  const visible = (element) =>
    element !== null && !element.classList.contains('hidden');
  const kindButton = (kind) =>
    document.querySelector(`[data-export-manager-kind="${CSS.escape(kind)}"]`);
  const text = () => manager()?.textContent ?? '';
  const openManager = async () => {
    if (!visible(manager())) {
      await invoke('plugin:event|emit', { event: 'manage_export_templates' });
      await t.sleep(250);
    }
  };
  const exportDialogVisible = () =>
    document.querySelector('[data-export-dialog]')?.classList.contains('hidden') === false;
  const waitFor = async (ready, tries = 50) => {
    for (let attempt = 0; attempt < tries; attempt += 1) {
      if (ready()) {
        return true;
      }
      await t.sleep(50);
    }
    return false;
  };

  if (visible(manager())) {
    document.querySelector('[data-export-manager-close]')?.click();
    await t.sleep(120);
  }

  const priorTemplates = (await invoke('get_config')).export_templates ?? {};
  const withoutHtml = { ...priorTemplates };
  delete withoutHtml.html;
  await configManager.update({ export_templates: withoutHtml });
  const fixture = `${window.__probePaths.checkout}test/fixtures/templates/html-marker`;
  const proposal = await templates.inspectTemplate(fixture);
  const alpha = await templates.importTemplate({
    source: fixture,
    name: `Manager Alpha ${Date.now().toString(36)}`,
    kind: 'html',
    entry: proposal.entry,
    source_url: null,
    license: 'CC0-1.0',
    map_title: false,
    map_author: false
  });
  const beta = await templates.importTemplate({
    source: fixture,
    name: `Manager Beta ${Date.now().toString(36)}`,
    kind: 'html',
    entry: proposal.entry,
    source_url: null,
    license: 'CC0-1.0',
    map_title: false,
    map_author: false
  });
  const created = [alpha.id, beta.id];
  const cleanupPackages = async (ids, exportTemplates) => {
    await configManager.update({ export_templates: exportTemplates });
    for (const id of ids) {
      try {
        await templates.removeTemplate(id);
      } catch {
        // Already removed by the probe.
      }
    }
  };

  try {
    await openManager();

  check('the native menu event opens the manager', visible(manager()), {
    visible: visible(manager())
  });
  const panel = document.querySelector('[data-export-manager-panel]');
  const navigation = document.querySelector('[data-export-manager-navigation]');
  const page = document.querySelector('[data-export-manager-page]');
  const panelRect = panel?.getBoundingClientRect() ?? null;
  const navigationRect = navigation?.getBoundingClientRect() ?? null;
  const pageRect = page?.getBoundingClientRect() ?? null;
  check(
    'the two-pane manager fits the window with the kind page beside its sidebar',
    panelRect !== null &&
      panelRect.width <= window.innerWidth &&
      panelRect.height <= window.innerHeight &&
      navigationRect !== null &&
      pageRect !== null &&
      pageRect.left >= navigationRect.right - 1,
    { panelRect, navigationRect, pageRect, window: [window.innerWidth, window.innerHeight] }
  );
  const listedKinds = [...document.querySelectorAll('[data-export-manager-kind]')].map(
    (row) => row.dataset.exportManagerKind
  );
  check(
    'the sidebar lists every kind in its group',
    JSON.stringify(listedKinds) ===
      JSON.stringify(['docx', 'odt', 'latex', 'html', 'epub', 'pdf', 'revealjs', 'beamer', 'markdown']),
    { listedKinds }
  );
  check(
    'the first kind is selected and its summary is shown',
    kindButton('docx')?.getAttribute('aria-current') === 'true' &&
      text().includes(words('export.kind.docx')) &&
      text().includes(words('template.pandocDefault')),
    { first: kindButton('docx')?.getAttribute('aria-current'), text: text().slice(0, 160) }
  );
  const editDefaults = document.querySelector('[data-export-manager-edit-defaults]');
  check(
    'the shipped defaults are named and offered for editing without a restore action',
    editDefaults !== null &&
      document.querySelector('[data-export-manager-defaults-state]')?.textContent ===
        words('exportManager.shipped') &&
      document.querySelector('[data-export-manager-restore-defaults]') === null,
    {
      edit: editDefaults !== null,
      state: document.querySelector('[data-export-manager-defaults-state]')?.textContent ?? null,
      restore: document.querySelector('[data-export-manager-restore-defaults]') !== null
    }
  );
  editDefaults?.click();
  await t.sleep(250);
  check(
    'Edit opens the existing defaults editor',
    document.querySelector('[data-template-editor]')?.classList.contains('hidden') === false &&
      document
        .querySelector('[data-template-editor-title]')
        ?.textContent?.includes(words('export.kind.docx')) === true,
    {
      open: document.querySelector('[data-template-editor]')?.classList.contains('hidden') === false,
      title: document.querySelector('[data-template-editor-title]')?.textContent ?? null
    }
  );
  document.querySelector('[data-template-editor-close]')?.click();
  await t.sleep(180);
  check(
    'closing the defaults editor returns to the manager',
    document.querySelector('[data-template-editor]')?.classList.contains('hidden') === true &&
      visible(manager()),
    {
      editorOpen:
        document.querySelector('[data-template-editor]')?.classList.contains('hidden') === false,
      managerOpen: visible(manager())
    }
  );

    kindButton('html')?.click();
    await t.sleep(120);
    const alphaRow = document.querySelector(
      `[data-template-package="${CSS.escape(alpha.id)}"]`
    );
    alphaRow?.click();
    await t.sleep(120);
    const inspectedAlphaRow = document.querySelector(
      `[data-template-package="${CSS.escape(alpha.id)}"]`
    );
    const beforeUse = await invoke('get_config');
    check(
      'inspecting a package does not activate it',
      (beforeUse.export_templates ?? {}).html === undefined &&
        inspectedAlphaRow?.dataset.templateInspected === 'true' &&
        inspectedAlphaRow?.dataset.templateActive === 'false',
      {
        active: inspectedAlphaRow?.dataset.templateActive,
        inspected: inspectedAlphaRow?.dataset.templateInspected,
        config: beforeUse.export_templates
      }
    );

    document.querySelector('[data-template-primary]')?.click();
    await t.sleep(250);
    const afterUse = await invoke('get_config');
    check(
      'Use This Template persists the inspected package',
      afterUse.export_templates?.html === alpha.id &&
        document.querySelector(
          `[data-template-package="${CSS.escape(alpha.id)}"]`
        )?.dataset.templateActive === 'true',
      { configured: afterUse.export_templates?.html ?? null, expected: alpha.id }
    );

    document.querySelector('[data-export-manager-close]')?.click();
    await t.sleep(120);
    await exportApi.exportKinds();
    await invoke('plugin:event|emit', { event: 'export', payload: 'html' });
    const cardOpened = await waitFor(exportDialogVisible);
    check(
      'the export card reads the package selected in the manager',
      cardOpened &&
        document.querySelector('[data-export-dialog]')?.textContent?.includes(
          alpha.manifest?.name ?? alpha.id
        ) === true,
      {
        open: exportDialogVisible(),
        text: document.querySelector('[data-export-dialog]')?.textContent?.slice(0, 240) ?? null
      }
    );
    document.querySelector('[data-export-cancel]')?.click();
    await t.sleep(120);

    await openManager();
    kindButton('html')?.click();
    await t.sleep(120);
    document.querySelector('[data-template-default]')?.click();
    document.querySelector('[data-template-primary]')?.click();
    await t.sleep(250);
    const cleared = await invoke('get_config');
    check(
      'Pandoc’s default clears the kind selection',
      cleared.export_templates?.html === undefined,
      { configured: cleared.export_templates?.html ?? null }
    );

  kindButton('markdown')?.click();
  await t.sleep(120);
  check(
    'plain Markdown explains that it has neither defaults nor template packages',
    text().includes(words('export.kind.markdown')) &&
      text().includes(words('exportManager.noConversionSettings')) &&
      text().includes(words('exportManager.noTemplateSupport')),
    { text: text().slice(0, 240) }
  );

  kindButton('revealjs')?.click();
  await t.sleep(120);
  check(
    'Reveal.js has conversion settings but no template-package support',
    text().includes(words('export.kind.revealjs')) &&
      text().includes(words('exportManager.defaults')) &&
      text().includes(words('exportManager.noTemplateSupport')),
    { text: text().slice(0, 240) }
  );
    document.querySelector('[data-export-manager-close]')?.click();
    await t.sleep(120);
  } finally {
    await cleanupPackages(created, priorTemplates);
  }

  return {
    checks,
    failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name)
  };
})()
