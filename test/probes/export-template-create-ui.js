/**
 * The card's **Create…**, and the library's details, duplicate and remove actions on the package
 * it made.
 */
(async () => {
  const t = window.__t;
  const api = await t.app('/src/api/templates.ts');
  const { configManager } = await t.app('/src/services/config_manager.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const sleep = t.sleep;
  const stamp = Date.now().toString(36);
  const name = `Probe created ${stamp}`;
  const renamed = `${name} renamed`;
  const before = await invoke('get_config');
  const visible = (selector) => {
    const element = document.querySelector(selector);
    return element !== null && !element.classList.contains('hidden');
  };
  const until = async (ready, tries = 120) => {
    for (let attempt = 0; attempt < tries; attempt += 1) {
      if (ready()) {
        return true;
      }
      await sleep(50);
    }
    return false;
  };
  const made = new Set();
  try {
    await invoke('plugin:event|emit', { event: 'export', payload: 'html' });
    await until(() => visible('[data-export-dialog]'));
    document.querySelector('[data-export-create-template]').click();
    check(
      'Create… asks for a name before pandoc is run',
      await until(() => visible('[data-template-create-default]')),
      { open: visible('[data-template-create-default]') }
    );
    document.querySelector('[data-template-create-name]').value = name;
    document.querySelector('[data-template-create-run]').click();
    check(
      'the generated package opens on its entry in the code panel',
      await until(() => visible('[data-template-editor]')),
      { editor: visible('[data-template-editor]') }
    );
    const created = (await api.exportTemplates()).find((summary) => summary.manifest?.name === name);
    if (created !== undefined) {
      made.add(created.id);
    }
    check(
      'the entry is pandoc’s template, not an empty file',
      created !== undefined &&
        document.querySelector('[data-template-file="template.html"]') !== null &&
        (await api.readTemplateFile(created.id, 'template.html')).includes('$body$'),
      { id: created?.id }
    );
    document.querySelector('[data-template-editor-close]').click();
    await sleep(200);
    check(
      'and the card remembers the new package for the HTML kind',
      (document.querySelector('[data-export-template]')?.textContent ?? '').includes(name) &&
        configManager.get()?.export_templates?.html === created.id,
      {
        shown: document.querySelector('[data-export-template]')?.textContent,
        remembered: configManager.get()?.export_templates?.html
      }
    );

    document.querySelector('[data-export-choose-template]').click();
    await until(() => visible('[data-template-library]'));
    document.querySelector(`[data-template-package-id="${created.id}"]`)?.click();
    document.querySelector('[data-template-details-button]').click();
    check(
      'Details opens the manifest’s editable facts',
      await until(() => visible('[data-template-details]')),
      { open: visible('[data-template-details]') }
    );
    document.querySelector('[data-template-details-name]').value = renamed;
    document.querySelector('[data-template-details-source]').value = 'https://example.test/source';
    document.querySelector('[data-template-details-license]').value = 'CC0 1.0';
    document.querySelector('[data-template-details-save]').click();
    await sleep(250);
    const updated = (await api.exportTemplates()).find((summary) => summary.id === created.id);
    check(
      'saving details changes the card and the manifest without changing the id',
      updated?.manifest?.name === renamed &&
        updated.manifest.origin.license === 'CC0 1.0' &&
        updated.manifest.origin.source === 'https://example.test/source',
      { manifest: updated?.manifest }
    );

    const countBefore = (await api.exportTemplates()).length;
    document.querySelector('[data-template-duplicate]').click();
    await sleep(250);
    const afterDuplicate = await api.exportTemplates();
    const copy = afterDuplicate.find(
      (summary) => summary.manifest?.name === `${renamed} copy`
    );
    if (copy !== undefined) {
      made.add(copy.id);
    }
    check(
      'Duplicate adds a package of its own and selects it',
      afterDuplicate.length === countBefore + 1 && copy !== undefined,
      { count: afterDuplicate.length, copy: copy?.manifest?.name }
    );

    document.querySelector('[data-template-remove]').click();
    await until(() => visible('[data-prompt]'));
    document.querySelector('[data-prompt-yes]').click();
    await sleep(250);
    check(
      'Remove asks first, then takes the selected package away',
      !(await api.exportTemplates()).some((summary) => summary.id === copy?.id),
      { copy: copy?.id }
    );
    made.delete(copy?.id);
    document.querySelector('[data-template-use]').click();
    await sleep(150);
    document.querySelector('[data-export-cancel]').click();
  } finally {
    for (const id of made) {
      try {
        await api.removeTemplate(id);
      } catch {
        // A package the probe never made, or already removed.
      }
    }
    await invoke('set_config', {
      cfg: { ...before, config_version: await invoke('get_current_config_version') }
    });
    await configManager.load();
  }
  return { checks, failed: checks.filter((entry) => !entry.pass).length };
})()
