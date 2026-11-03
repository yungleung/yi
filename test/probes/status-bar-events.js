/**
 * Status-bar visibility follows typed facts rather than holding a widget reference.
 *
 * Example: beginning and finishing an export announces activity counts; the status item
 * appears and disappears in response, with no caller reaching into its DOM.
 *
 * @covers src/services/export_activity.ts,
 *   src/ui/status_bar/export_progress.ts,
 *   src/services/events/contracts.ts
 */
(async () => {
  const t = window.__t;
  const { exportActivity } = await t.app('/src/services/export_activity.ts');
  const { t: words } = await t.app('/src/services/i18n.ts');
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({
      name,
      actual,
      expected,
      pass: JSON.stringify(actual) === JSON.stringify(expected)
    });
  const progress = () => document.querySelector('[data-export-progress]');

  check('the status starts hidden', progress()?.classList.contains('hidden'), true);
  const finish = exportActivity.begin();
  await t.sleep(20);
  check('beginning work shows the status', progress()?.classList.contains('hidden'), false);
  check('and marks it busy', progress()?.getAttribute('aria-busy'), 'true');

  finish();
  finish();
  await t.sleep(20);
  check('finishing work hides the status', progress()?.classList.contains('hidden'), true);
  check('and marks it idle', progress()?.getAttribute('aria-busy'), 'false');

  await t.load('one two three\n');
  const wordCount = () =>
    document.querySelector('[data-status-words]')?.textContent ?? null;
  let counted = null;
  for (let attempt = 0; attempt < 40 && counted !== words('status.words', { count: 3 }); attempt += 1) {
    await t.sleep(50);
    counted = wordCount();
  }
  check('a loaded document updates the word count through its event', counted, words('status.words', { count: 3 }));

  return {
    checks,
    failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name)
  };
})()
