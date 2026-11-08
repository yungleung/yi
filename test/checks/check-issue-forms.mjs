/**
 * Holds GitHub issue forms to the repository's bug, feature and template contracts.
 *
 * Example: deleting the Yi version field from the bug form fails this check before
 * the form is published on GitHub.
 */
import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';

const root = '.github/ISSUE_TEMPLATE';
const files = {
  bug: `${root}/bug_report.yml`,
  feature: `${root}/feature_request.yml`,
  template: `${root}/template_package.yml`
};
const failures = [];
const check = (name, pass) => {
  if (!pass) failures.push(name);
};

for (const [kind, path] of Object.entries(files)) {
  check(`${kind} issue form exists`, existsSync(path));
  if (!existsSync(path)) continue;
  const form = parse(readFileSync(path, 'utf8'));
  check(`${kind} form has a name`, typeof form?.name === 'string' && form.name.length > 0);
  check(
    `${kind} form has a description`,
    typeof form?.description === 'string' && form.description.length > 0
  );
  check(`${kind} form has a title prefix`, typeof form?.title === 'string');
  check(`${kind} form has labels`, Array.isArray(form?.labels) && form.labels.length > 0);
  check(`${kind} form has body fields`, Array.isArray(form?.body) && form.body.length > 0);

  const ids = (form?.body ?? []).map((entry) => entry?.id).filter(Boolean);
  check(`${kind} field ids are unique`, new Set(ids).size === ids.length);
  check(
    `${kind} has a required checkbox acknowledgement`,
    form?.body?.some(
      (entry) =>
        entry.type === 'checkboxes' &&
        entry.attributes?.options?.some((option) => option.required === true)
    )
  );
}

const bodyIds = (form) => new Set((form?.body ?? []).map((entry) => entry?.id).filter(Boolean));
if (existsSync(files.bug)) {
  const form = parse(readFileSync(files.bug, 'utf8'));
  const ids = bodyIds(form);
  check(
    'the bug form captures version, platform, reproduction, expected and actual behaviour',
    ['yi_version', 'platform', 'steps', 'expected', 'actual'].every((id) => ids.has(id))
  );
  check(
    'the bug form routes usage questions to Q&A',
    form.body.some(
      (entry) =>
        entry.type === 'markdown' &&
        entry.attributes?.value?.includes('discussions/categories/q-a')
    )
  );
}
if (existsSync(files.feature)) {
  const form = parse(readFileSync(files.feature, 'utf8'));
  const ids = bodyIds(form);
  check(
    'the feature form captures the problem, proposal and affected workflow',
    ['problem', 'proposal', 'workflow'].every((id) => ids.has(id))
  );
  check(
    'the feature form points early ideas to Ideas',
    form.body.some(
      (entry) =>
        entry.type === 'markdown' &&
        entry.attributes?.value?.includes('discussions/categories/ideas')
    )
  );
}
if (existsSync(files.template)) {
  const form = parse(readFileSync(files.template, 'utf8'));
  const ids = bodyIds(form);
  const kind = form?.body?.find((entry) => entry.id === 'export_kind');
  check(
    'the template form captures package, versions and validation details',
    ['export_kind', 'package', 'yi_version', 'pandoc_version', 'validation'].every((id) =>
      ids.has(id)
    )
  );
  check(
    'the template form offers every template-backed export kind',
    ['HTML', 'LaTeX', 'PDF', 'EPUB', 'Word', 'OpenDocument'].every((label) =>
      kind?.attributes?.options?.includes(label)
    )
  );
  check(
    'the template form routes open-ended help to Templates',
    form.body.some(
      (entry) =>
        entry.type === 'markdown' &&
        entry.attributes?.value?.includes('discussions/categories/templates')
    )
  );
}

const chooserPath = `${root}/config.yml`;
check('the issue-template chooser exists', existsSync(chooserPath));
if (existsSync(chooserPath)) {
  const chooser = parse(readFileSync(chooserPath, 'utf8'));
  check('the chooser disables blank issues', chooser?.blank_issues_enabled === false);
  check(
    'the chooser links to discussions, documentation and contribution guidance',
    [
      'https://github.com/yungleung/yi/discussions/categories/q-a',
      'https://github.com/yungleung/yi/discussions/categories/ideas',
      'https://github.com/yungleung/yi/discussions/categories/show-and-tell',
      'https://yungleung.github.io/yi/documentation/en-page.html',
      'https://github.com/yungleung/yi/blob/main/CONTRIBUTING.md'
    ].every((url) => chooser?.contact_links?.some((link) => link.url === url))
  );
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('issue forms: bug, feature and template intake contracts are valid');
