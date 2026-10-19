/**
 * Holds the window's manifest reader to the Rust test's fixture.
 *
 * The package manifest is written by Rust and read by Rust; the window only needs to know the same
 * fields exist. Both sides read `test/fixtures/templates/manifest.fixture.json`, so a field renamed
 * on one side fails here before a probe has to notice a package that will not open.
 */
import { readFileSync } from 'node:fs';
import { rolldown } from 'rolldown';

const bundle = await rolldown({
  input: 'src/ui/export/templates/manifest_rules.ts',
  logLevel: 'silent'
});
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const source = output[0].code;
const module = await import(`data:text/javascript,${encodeURIComponent(source)}`);
const fixture = JSON.parse(
  readFileSync('test/fixtures/templates/manifest.fixture.json', 'utf8')
);
const issues = module.manifestShapeIssues(fixture);
if (issues.length > 0) {
  console.error(issues.join('\n'));
  process.exit(1);
}
console.log(`template manifest: schema ${module.MANIFEST_SCHEMA}, fields agree with Rust's fixture`);
