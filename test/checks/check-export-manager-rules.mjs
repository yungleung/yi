/**
 * Checks the Export Manager's pure rules: kind grouping, package compatibility and which actions are
 * available for the selected kind and inspected package.
 *
 * The UI is deliberately absent here. These rules consume only the export-kind/template vocabulary,
 * so the manager and the export card can render the same decisions without a DOM.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-export-manager-'));

async function bundleModule(input, name) {
  const bundle = await rolldown({ input, logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm' });
  await bundle.close();
  const file = join(directory, `${name}.mjs`);
  writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
  return import(file);
}

const rules = await bundleModule(
  'src/ui/export/manager/rules.ts',
  'manager_rules'
);

const failures = [];
const check = (name, actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `${name}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`
    );
  }
};

const kind = (name, group, overrides = {}) => ({
  kind: name,
  group,
  extension: name === 'latex' ? 'tex' : name,
  name_suffix: '',
  needs_pandoc: name !== 'markdown',
  takes_a_title: false,
  needs_a_language: false,
  names_its_body: false,
  carries_pictures: false,
  takes_a_page_size: false,
  paper_sizes: [],
  config_path: `/config/export.${name}.yaml`,
  config_exists: true,
  config_is_shipped: true,
  template_mode: ['revealjs', 'beamer', 'markdown'].includes(name) ? 'none' : 'text',
  ...overrides
});

const summary = (id, kindName, broken = false) => ({
  id,
  path: `/templates/${id}`,
  manifest: broken
    ? null
    : {
        schema: 1,
        id,
        name: id,
        kind: kindName,
        mode: 'template',
        origin: { type: 'folder' },
        template: 'template.tex',
        reference_doc: null,
        csl: null,
        assets: [],
        deliver: []
      },
  error: broken ? 'template.json is unreadable' : null,
  files: [{ name: 'template.tex', size: 12, editable: !broken }]
});

const kinds = [
  kind('docx', 'documents'),
  kind('latex', 'documents'),
  kind('revealjs', 'presentations'),
  kind('markdown', 'other')
];
const packages = [
  summary('alpha', 'docx'),
  summary('alpha-copy', 'docx'),
  {
    ...summary('broken-docx', 'docx'),
    error: 'The package entry is missing.'
  },
  summary('unreadable', 'unknown', true)
];

check(
  'groups follow the kind order and count broken packages',
  rules.managerGroups(kinds, packages).map((group) => ({
    group: group.group,
    rows: group.rows.map((row) => [
      row.info.kind,
      row.packages.map((item) => item.id),
      row.broken
    ])
  })),
  [
    {
      group: 'documents',
      rows: [
        ['docx', ['alpha', 'alpha-copy', 'broken-docx'], 1],
        ['latex', [], 0]
      ]
    },
    {
      group: 'presentations',
      rows: [['revealjs', [], 0]]
    },
    {
      group: 'other',
      rows: [['markdown', [], 0]]
    }
  ]
);
check(
  'a broken package with no readable kind is unassigned once',
  rules.unassignedPackages(kinds, packages).map((item) => item.id),
  ['unreadable']
);
check(
  'a readable package can be inspected, used, edited, validated and removed',
  rules.packageActionAvailability(kinds[0], '/bin/pandoc', packages[0]),
  {
    importPackage: true,
    createPackage: true,
    use: true,
    details: true,
    duplicate: true,
    edit: true,
    validate: true,
    testPdf: false,
    remove: true
  }
);
check(
  'a broken package remains inspectable and removable but not usable',
  rules.packageActionAvailability(kinds[0], '/bin/pandoc', packages[2]),
  {
    importPackage: true,
    createPackage: true,
    use: false,
    details: true,
    duplicate: false,
    edit: false,
    validate: false,
    testPdf: false,
    remove: true
  }
);
check(
  'without pandoc local package work remains and execution is disabled',
  rules.packageActionAvailability(kinds[0], null, packages[0]),
  {
    importPackage: true,
    createPackage: false,
    use: true,
    details: true,
    duplicate: true,
    edit: true,
    validate: false,
    testPdf: false,
    remove: true
  }
);
check(
  'a kind without template support has no package actions',
  rules.packageActionAvailability(kinds[2], '/bin/pandoc', null),
  {
    importPackage: false,
    createPackage: false,
    use: false,
    details: false,
    duplicate: false,
    edit: false,
    validate: false,
    testPdf: false,
    remove: false
  }
);
check(
  'a PDF-capable package enables Test PDF when pandoc is present',
  rules.packageActionAvailability(
    kind('pdf', 'documents'),
    '/bin/pandoc',
    summary('pdf-package', 'pdf')
  ),
  {
    importPackage: true,
    createPackage: true,
    use: true,
    details: true,
    duplicate: true,
    edit: true,
    validate: true,
    testPdf: true,
    remove: true
  }
);
check(
  'defaults can be edited whenever the kind has a file and restored only when it differs',
  {
    plain: rules.defaultsActionAvailability(kinds[0]),
    custom: rules.defaultsActionAvailability(
      kind('docx', 'documents', { config_is_shipped: false })
    ),
    markdown: rules.defaultsActionAvailability(kinds[3])
  },
  {
    plain: { edit: true, restore: false },
    custom: { edit: true, restore: true },
    markdown: { edit: false, restore: false }
  }
);
check(
  'a missing defaults file is editable but has nothing to restore',
  rules.defaultsActionAvailability(
    kind('docx', 'documents', { config_exists: false })
  ),
  { edit: true, restore: false }
);
check(
  'the defaults state follows pandoc, existence and shipped-ness',
  {
    none: rules.defaultsState(kinds[3]),
    missing: rules.defaultsState(
      kind('docx', 'documents', { config_exists: false })
    ),
    shipped: rules.defaultsState(kinds[0]),
    customized: rules.defaultsState(
      kind('docx', 'documents', { config_is_shipped: false })
    )
  },
  {
    none: 'none',
    missing: 'not-created',
    shipped: 'shipped',
    customized: 'customized'
  }
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('export manager rules: all checks passed');
