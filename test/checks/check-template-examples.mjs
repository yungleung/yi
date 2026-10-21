/**
 * The six complete template packages kept beside the tests as authoring examples.
 *
 * Each package has to carry its own valid manifest, a real entry and any file that manifest names.
 * When Pandoc is available the check also converts one paragraph through the text templates and
 * reference documents, so an example cannot drift into something that merely looks plausible.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';

const root = 'test/fixtures/templates/examples';
const kinds = ['html', 'latex', 'pdf', 'epub', 'docx', 'odt'];
const failures = [];
const check = (name, pass, actual = null) => {
  if (!pass) failures.push(actual === null ? name : `${name}\n  actual: ${JSON.stringify(actual)}`);
};

check('the examples have a guide', existsSync(join(root, 'README.md')));
for (const kind of kinds) {
  const folder = join(root, kind);
  const manifestPath = join(folder, 'template.json');
  check(`${kind}: the package has its own reading guide`, existsSync(join(folder, 'README.md')));
  check(`${kind}: the package has template.json`, existsSync(manifestPath));
  if (!existsSync(manifestPath)) continue;
  let manifest = null;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    check(`${kind}: template.json is valid JSON`, false, error.message);
    continue;
  }
  check(`${kind}: manifest schema is 1`, manifest.schema === 1, manifest.schema);
  check(`${kind}: package kind matches its folder`, manifest.kind === kind, manifest.kind);
  check(`${kind}: package id is stable`, manifest.id === `example-${kind}`, manifest.id);
  check(`${kind}: manifest name is present`, typeof manifest.name === 'string' && manifest.name.length > 0);
  check(
    `${kind}: exactly one entry matches the mode`,
    manifest.mode === 'reference-doc'
      ? manifest.reference_doc !== null && manifest.template === null
      : manifest.template !== null && manifest.reference_doc === null
  );
  const entry = manifest.mode === 'reference-doc' ? manifest.reference_doc : manifest.template;
  check(`${kind}: the entry exists`, typeof entry === 'string' && existsSync(join(folder, entry)), entry);
  if (typeof entry === 'string' && existsSync(join(folder, entry))) {
    if (manifest.mode === 'reference-doc') {
      const bytes = readFileSync(join(folder, entry));
      check(`${kind}: the reference document is a ZIP container`, bytes[0] === 0x50 && bytes[1] === 0x4b);
    } else {
      const text = readFileSync(join(folder, entry), 'utf8');
      check(`${kind}: the template has Pandoc’s body variable`, text.includes('$body$'));
    }
  }
  for (const asset of [...(manifest.assets ?? []), manifest.csl].filter(Boolean)) {
    check(`${kind}: asset ${asset} exists`, existsSync(join(folder, asset)), asset);
  }
  const defaults = join(folder, 'defaults.yaml');
  check(`${kind}: the example includes defaults.yaml`, existsSync(defaults));
  if (existsSync(defaults)) {
    try {
      const parsed = parse(readFileSync(defaults, 'utf8'));
      check(`${kind}: defaults.yaml is a mapping`, parsed !== null && typeof parsed === 'object');
      check(
        `${kind}: defaults.yaml asks for no shell escape`,
        !JSON.stringify(parsed).toLowerCase().includes('shell-escape')
      );
    } catch (error) {
      check(`${kind}: defaults.yaml parses`, false, error.message);
    }
  }
  const metadata = join(folder, 'metadata.yaml');
  check(`${kind}: the example includes metadata.yaml`, existsSync(metadata));
  if (existsSync(metadata)) {
    try {
      const parsed = parse(readFileSync(metadata, 'utf8'));
      check(`${kind}: metadata.yaml is a mapping`, parsed !== null && typeof parsed === 'object');
      if (kind === 'docx' || kind === 'odt') {
        for (const key of ['title', 'subtitle', 'author', 'date', 'abstract']) {
          check(
            `${kind}: metadata.yaml demonstrates ${key}`,
            Object.prototype.hasOwnProperty.call(parsed, key)
          );
        }
      }
    } catch (error) {
      check(`${kind}: metadata.yaml parses`, false, error.message);
    }
  }
}

const pandoc = spawnSync('pandoc', ['--version'], { encoding: 'utf8' });
if (pandoc.status !== 0) {
  console.log('template examples: structure passed; pandoc is not installed, so conversion was skipped');
} else {
  for (const kind of kinds) {
    const folder = join(root, kind);
    const manifestPath = join(folder, 'template.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const format =
      kind === 'epub' ? 'epub3' : kind === 'pdf' ? 'latex' : kind;
    const args = ['--from=markdown', `--to=${format}`, '--standalone'];
    let output = null;
    let outputFolder = null;
    if (manifest.mode === 'reference-doc') {
      args.push(`--reference-doc=${join(folder, manifest.reference_doc)}`);
      args.push(`--metadata-file=${join(folder, 'metadata.yaml')}`);
      outputFolder = mkdtempSync(join(tmpdir(), `yi-template-${kind}-`));
      output = join(outputFolder, `out.${kind}`);
      args.push(`--output=${output}`);
    } else {
      args.push(`--template=${join(folder, manifest.template)}`);
    }
    if (kind === 'epub') args.push('--metadata=title:Example', '--metadata=lang:en');
    const converted = spawnSync('pandoc', args, {
      input: '# Example\n\nOne paragraph.\n',
      encoding: 'utf8'
    });
    check(
      `${kind}: Pandoc converts a paragraph with the example`,
      converted.status === 0 &&
        (output === null ? converted.stdout.length > 0 : existsSync(output)),
      converted.stderr.trim()
    );
    if (output !== null && existsSync(output)) {
      const entry = kind === 'docx' ? 'word/document.xml' : 'content.xml';
      const unpacked = spawnSync('unzip', ['-p', output, entry], { encoding: 'utf8' });
      const required =
        kind === 'docx'
          ? ['Title', 'Subtitle', 'Author', 'Date', 'AbstractTitle', 'Abstract']
          : ['Title', 'Subtitle', 'Author', 'Date', 'Abstract'];
      check(
        `${kind}: the reference document receives every metadata style`,
        unpacked.status === 0 &&
          required.every((style) => unpacked.stdout.includes(`\"${style}\"`)),
        required.filter((style) => !unpacked.stdout.includes(`\"${style}\"`))
      );
      if (outputFolder !== null) {
        rmSync(outputFolder, { recursive: true, force: true });
      }
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`template examples: ${kinds.length} packages passed`);
