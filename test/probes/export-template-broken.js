/**
 * A package whose manifest is newer than this build is still listed with the reason and can be
 * selected and removed; it cannot be used or edited.
 */
(async () => {
  const t = window.__t;
  const api = await t.app('/src/api/templates.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const sleep = t.sleep;
  const checkout = window.__probePaths.checkout;
  const stamp = Date.now().toString(36);
  const before = await invoke('get_config');
  const visible = (selector) => {
    const element = document.querySelector(selector);
    return element !== null && !element.classList.contains('hidden');
  };
  const until = async (ready, tries = 100) => {
    for (let attempt = 0; attempt < tries; attempt += 1) {
      if (ready()) {
        return true;
      }
      await sleep(50);
    }
    return false;
  };
  let id = null;
  try {
    const pkg = await api.importTemplate({
      source: `${checkout}test/fixtures/templates/html-marker`,
      name: `Probe broken manifest ${stamp}`,
      kind: 'html',
      entry: 'kit.html',
      source_url: null,
      license: null,
      map_title: false,
      map_author: false
    });
    id = pkg.id;
    const manifest = JSON.stringify(
      { ...pkg.manifest, schema: 2, name: 'A newer package' },
      null,
      2
    );
    await window.__TAURI_INTERNALS__.invoke(
      'plugin:fs|write_text_file',
      new TextEncoder().encode(manifest),
      { headers: { path: encodeURIComponent(`${pkg.path}/template.json`) } }
    );
    const listed = (await api.exportTemplates()).find((summary) => summary.id === id);
    check(
      'a newer manifest is listed with the schema version in its reason',
      listed?.manifest === null && (listed.error ?? '').includes('2'),
      { error: listed?.error }
    );

    await invoke('plugin:event|emit', { event: 'export', payload: 'html' });
    await until(() => visible('[data-export-dialog]'));
    document.querySelector('[data-export-choose-template]').click();
    await until(() => visible('[data-template-library]'));
    const row = document.querySelector(`[data-template-package-id="${id}"]`);
    check(
      'the broken package can be selected even though it cannot be used',
      row !== null && row.disabled === false,
      { row: row !== null, disabled: row?.disabled }
    );
    row.click();
    await sleep(100);
    check(
      'Use is refused while read-only Details and Remove are offered',
      document.querySelector('[data-template-use]').disabled === true &&
        document.querySelector('[data-template-details-button]').disabled === false &&
        document.querySelector('[data-template-remove]').disabled === false,
      {
        use: document.querySelector('[data-template-use]').disabled,
        details: document.querySelector('[data-template-details-button]').disabled,
        remove: document.querySelector('[data-template-remove]').disabled
      }
    );
    document.querySelector('[data-template-details-button]').click();
    await until(() => visible('[data-broken-template-details]'));
    check(
      'and Details explains the broken manifest without an editable form',
      document
        .querySelector('[data-broken-template-details]')
        ?.textContent?.includes(id) === true &&
        document
          .querySelector('[data-broken-template-details]')
          ?.textContent?.includes('2') === true &&
        document.querySelector('[data-template-details-form]') === null,
      {
        details:
          document
            .querySelector('[data-broken-template-details]')
            ?.textContent?.slice(0, 180) ?? null
      }
    );
    document.querySelector('[data-broken-template-details-close]').click();
    await sleep(100);
    document.querySelector('[data-template-remove]').click();
    await until(() => visible('[data-prompt]'));
    document.querySelector('[data-prompt-yes]').click();
    await sleep(200);
    check(
      'and removing it takes the broken package out of the library',
      !(await api.exportTemplates()).some((summary) => summary.id === id)
    );
    id = null;
    document.querySelector('[data-template-cancel]').click();
    document.querySelector('[data-export-cancel]').click();
  } finally {
    if (id !== null) {
      try {
        await api.removeTemplate(id);
      } catch {
        // A package the probe never made, or already removed.
      }
    }
    await invoke('set_config', {
      cfg: { ...before, config_version: await invoke('get_current_config_version') }
    });
  }
  return { checks, failed: checks.filter((entry) => !entry.pass).length };
})()
