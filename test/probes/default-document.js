/**
 * The editor's demo document is the fixture file, byte for byte.
 *
 * @covers src/ui/markdown/markdown_editor.ts: the startup document
 * @fixture test/fixtures/workspace/default-document.md
 *
 * Run with: npm run probe -- --with-doc test/fixtures/workspace/default-document.md test/probes/default-document.js
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const document = await t.raw();
  check('the editor holds the fixture document', document, window.__probeDoc ?? null);
  check('and the fixture is not empty', document.length > 500, true);
  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
