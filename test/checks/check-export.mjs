/**
 * Checks the export's shared pre-process (`ui/export/preprocess.ts`) in Node. Three rules, each about
 * what the *app* knows and the converting side does not:
 *
 * - a wikilink is written as the words it renders as — the title the author gave it, or the title of
 *   the document it names, or its target;
 * - an image's destination is written as the file the app resolves it to, absolute and encoded, so
 *   the picture pandoc embeds is the picture the page showed: a destination read from the document's
 *   folder, from the image folder, spelled with `%20` or with spaces, or naming a file that is not
 *   there at all;
 * - and, for the kind whose conversion *is* this pre-process, a citation is written as the words it
 *   reads as and the works it names are listed under them — the app's own rendering, where citeproc
 *   would be doing it on the other side.
 *
 * The parse is what says where those spans *are*, so the shapes that are deliberately not one are
 * asserted here too: a fence's body, an inline code span, frontmatter, a link's brackets, and a
 * citation inside a fence. The run itself — pandoc against the app's defaults file — is
 * `test/probes/export-docx.js` and `test/probes/export-pandoc-arguments.js`, and the kind the app
 * writes is `test/probes/export-markdown.js`.
 *
 * The bundle is built for Node (`platform`), because the browser build of
 * `decode-named-character-reference` decodes entities by making a DOM element.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-export-'));
const bundle = await rolldown({
  input: 'src/ui/export/preprocess.ts',
  logLevel: 'silent',
  platform: 'node'
});
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const file = join(directory, 'preprocess.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { exportSource } = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

/**
 * A workspace with these titles and these files, and what was asked about at all: every title the
 * pre-process looked up, and every path it looked for.
 */
function workspace({ titles = {}, files = [], document: documentFolder = '/notes', images = null } = {}) {
  const asked = [];
  const looked = [];
  const fetched = [];
  return {
    asked,
    looked,
    fetched,
    titleOf: async (target) => {
      asked.push(target);
      return titles[target] ?? null;
    },
    bases: { document: documentFolder, images },
    exists: async (path) => {
      looked.push(path);
      return files.includes(path);
    },
    // A picture on the web: the app fetches it itself, and this stands in for that fetch.
    fetchRemote: async (url) => {
      fetched.push(url);
      return url.includes('unfetchable') ? null : `/export/tmp/remote/${url.split('/').pop()}.png`;
    }
  };
}

const render = async (text, answers = {}) => {
  const notes = workspace(answers);
  const rendered = await exportSource(text, {
    kind: answers.kind ?? 'latex',
    translate: (key) => (key === 'reference.figure' ? 'Figure' : key),
    titleOf: notes.titleOf,
    bases: notes.bases,
    exists: notes.exists,
    fetchRemote: notes.fetchRemote,
    imageTarget: answers.imageTarget,
    citations: answers.citations ?? null
  });
  return { rendered, asked: notes.asked, looked: notes.looked, fetched: notes.fetched };
};

// --- what a wikilink reads as ------------------------------------------------------------------

{
  const { rendered, asked } = await render('See [[target|the name I chose]].', {
    titles: { target: 'The Other Note' }
  });
  check('a title the author wrote wins over the document it names', rendered, 'See the name I chose.');
  check('and a link that names its own text is not resolved at all', asked, []);
}

{
  const { rendered, asked } = await render('See [[target]].', { titles: { target: 'The Other Note' } });
  check('a bare target reads as the title of the document it names', rendered, 'See The Other Note.');
  check('which is one question to the workspace', asked, ['target']);
}

{
  const { rendered } = await render('See [[nowhere]].');
  check('and a target no document answers is written as itself', rendered, 'See nowhere.');
}

{
  const { rendered } = await render('See [[target]].', { titles: { target: '' } });
  check('an empty title counts as no answer rather than as nothing to write', rendered, 'See target.');
}

{
  const { rendered, asked } = await render('[[a]] and [[a]] and [[b|b]].', { titles: { a: 'A' } });
  check(
    'one target is resolved once however many links name it',
    rendered,
    'A and A and b.'
  );
  check('and only the targets that need an answer are asked about', asked, ['a']);
}

// --- the rest of the note is untouched ---------------------------------------------------------

{
  const note = [
    '---',
    'title: A note about [[target]]',
    '---',
    '',
    '# A note about [[target]]',
    '',
    'The alias: [[target|an alias]] and the citation [@doe2001].',
    '',
    '![a picture](shot.png) and a [link](https://example.com/[[not a link]]).',
    '',
    'Inline `[[code]]` stays, and so does a fence:',
    '',
    '```md',
    '[[still code]]',
    '```',
    '',
    '> A quote with [[target]].',
    '',
    '- a list item with [[target|an alias]]',
    ''
  ].join('\n');
  const { rendered } = await render(note, { titles: { target: 'The Other Note' } });
  check(
    'a wikilink is written where it stands, and nothing else in the note moves',
    rendered,
    [
      '---',
      'title: A note about [[target]]',
      '---',
      '',
      '# A note about The Other Note',
      '',
      'The alias: an alias and the citation [@doe2001].',
      '',
      '![a picture](shot.png) and a [link](https://example.com/[[not a link]]).',
      '',
      'Inline `[[code]]` stays, and so does a fence:',
      '',
      '```md',
      '[[still code]]',
      '```',
      '',
      '> A quote with The Other Note.',
      '',
      '- a list item with an alias',
      ''
    ].join('\n')
  );
}

{
  const { rendered } = await render('No links here. Only [one] bracket.\n');
  check('a note with no wikilink is handed on character for character', rendered, 'No links here. Only [one] bracket.\n');
}

{
  const crossreferences =
    '# Start\n\n' +
    'See [Methods](#methods).\n\n' +
    '## Methods {#methods .unnumbered data-owner=demo}\n';
  const { rendered } = await render(crossreferences);
  check(
    'native fragment links and heading attributes are handed on character for character',
    rendered,
    crossreferences
  );
}

{
  const figure =
    'See [#fig:model].\n\n' +
    '![Model overview](shot.png){#fig:model .wide owner=demo}\n';
  const { rendered } = await render(figure, {
    kind: 'markdown',
    files: ['/notes/shot.png']
  });
  check(
    'processed markdown renders a figure as HTML with its number and target',
    rendered,
    'See [Figure 1](#fig:model).\n\n' +
      '<figure id="fig:model" class="wide" data-owner="demo">\n' +
      '  <img src="/notes/shot.png" alt="Model overview">\n' +
      '  <figcaption>Figure 1. Model overview</figcaption>\n' +
      '</figure>\n'
  );
}

{
  const table =
    'See [#tbl:results].\n\n' +
    '| Name | Result |\n' +
    '| :--- | ---: |\n' +
    '| *alpha* | `x & y` |\n\n' +
    ': **Results** {#tbl:results .margin owner=demo}\n';
  const { rendered } = await render(table, { kind: 'markdown' });
  check(
    'processed Markdown renders a captioned table as numbered, aligned HTML',
    rendered,
    'See [Table 1](#tbl:results).\n\n' +
      '<table id="tbl:results" class="margin" data-owner="demo">\n' +
      '  <caption>Table 1. <strong>Results</strong></caption>\n' +
      '  <thead>\n' +
      '    <tr>\n' +
      '      <th style="text-align: left">Name</th>\n' +
      '      <th style="text-align: right">Result</th>\n' +
      '    </tr>\n' +
      '  </thead>\n' +
      '  <tbody>\n' +
      '    <tr>\n' +
      '      <td style="text-align: left"><em>alpha</em></td>\n' +
      '      <td style="text-align: right"><code>x &amp; y</code></td>\n' +
      '    </tr>\n' +
      '  </tbody>\n' +
      '</table>\n'
  );
}

{
  const table =
    'See [#tbl:results].\n\n' +
    '| Name | Result |\n' +
    '| --- | --- |\n' +
    '| alpha | one |\n\n' +
    ': Results {#tbl:results .margin owner=demo}\n';
  const { rendered } = await render(table, { kind: 'html' });
  check(
    'HTML gets Pandoc’s native table with only the visible number added to its caption',
    rendered,
    'See [Table 1](#tbl:results).\n\n' +
      '| Name | Result |\n' +
      '| --- | --- |\n' +
      '| alpha | one |\n\n' +
      ': Table 1. Results {#tbl:results .margin owner=demo}\n'
  );
}

{
  const table =
    'See [#tbl:results].\n\n' +
    '| Name | Result |\n' +
    '| --- | --- |\n' +
    '| alpha | one |\n\n' +
    ': Results {#tbl:results .margin owner=demo}\n';
  const { rendered } = await render(table, { kind: 'docx' });
  check(
    'DOCX wraps an identified table and moves its ID off the visible caption',
    rendered,
    'See [Table 1](#tbl:results).\n\n' +
      '::: {#tbl:results .table-target}\n' +
      '| Name | Result |\n' +
      '| --- | --- |\n' +
      '| alpha | one |\n\n' +
      ': Table 1. Results {.margin owner="demo"}\n' +
      ':::\n'
  );
}

{
  const table = '| A |\n| --- |\n| 1 |\n: Only a caption\n';
  const { rendered } = await render(table, { kind: 'epub' });
  check(
    'a caption without an ID is numbered but has no target',
    rendered,
    '| A |\n| --- |\n| 1 |\n: Table 1. Only a caption\n'
  );
}

{
  const table = '| A |\n| --- |\n| 1 |\n: {#tbl:only}\n';
  const { rendered } = await render(table, { kind: 'odt' });
  check(
    'an ID without caption still gets a target and a visible number',
    rendered,
    '::: {#tbl:only .table-target}\n' +
      '| A |\n' +
      '| --- |\n' +
      '| 1 |\n' +
      ': Table 1.\n' +
      ':::\n'
  );
}

{
  const table = '| A |\n| --- |\n| 1 |\n';
  const { rendered } = await render(table, { kind: 'docx' });
  check('an ordinary table is left unchanged', rendered, table);
}

{
  const table =
    'See [#tbl:results].\n\n' +
    '| Name | Result |\n' +
    '| --- | --- |\n' +
    '| alpha | one |\n\n' +
    ': Results {#tbl:results .margin owner=demo}\n';
  for (const kind of ['latex', 'pdf']) {
    const { rendered } = await render(table, { kind });
    check(
      `${kind} automatic table references use the native counter`,
      rendered,
      'See \\yiTableRef{tbl:results}.\n\n' +
        '| Name | Result |\n' +
        '| --- | --- |\n' +
        '| alpha | one |\n\n' +
        ': Results {#tbl:results .margin owner=demo}\n'
    );
  }
}

{
  const manual =
    'See [the results](#tbl:results).\n\n' +
    '| A |\n' +
    '| --- |\n' +
    '| 1 |\n' +
    ': Results {#tbl:results}\n';
  for (const kind of ['latex', 'pdf']) {
    const { rendered } = await render(manual, { kind });
    check(`${kind} keeps an author's manual table link text`, rendered, manual);
  }
}

{
  const equation =
    'See [#eq:system].\n\n' +
    '[$$\n' +
    '\\begin{align}\n' +
    'x&=1\\\\\n' +
    'y&=2\n' +
    '\\end{align}\n' +
    '$$]{#eq:system .wide owner=demo}\n';
  const { rendered } = await render(equation, { kind: 'html' });
  check(
    'HTML lowers a labeled environment to a target layout table',
    rendered,
    'See [Equation (1)](#eq:system).\n\n' +
      '<div id="eq:system" class="equation-target equation-layout wide" data-owner="demo">\n' +
      '<table class="equation-layout" role="presentation" style="width: 100%; border: none; border-collapse: collapse;">\n' +
      '<tbody style="border: none;">\n' +
      '<tr>\n' +
      '<td class="equation-math-cell" style="width: 90%; border: none; vertical-align: middle;">\n\n' +
      '$$\n' +
      '\\begin{aligned}\n' +
      'x&=1\\\\\n' +
      'y&=2\n' +
      '\\end{aligned}\n' +
      '$$\n\n' +
      '</td>\n' +
      '<td class="equation-number-cell" style="width: 10%; min-width: 4em; border: none; text-align: left; vertical-align: middle;">\n\n' +
      '\\(1\\)\n\n' +
      '</td>\n' +
      '</tr>\n' +
      '</tbody>\n' +
      '</table>\n' +
      '</div>\n'
  );

  for (const kind of ['docx', 'odt']) {
    const { rendered } = await render(equation, { kind });
    const rows = rendered.split('\n').filter((line) => line.startsWith('| '));
    check(
      `${kind} uses a native one-row two-cell equation table`,
      [
        rendered.startsWith(
          'See [Equation (1)](#eq:system).\n\n' +
            '::: {#eq:system .equation-target .equation-layout .wide owner="demo"}\n'
        ),
        rows.length,
        (rows[0]?.match(/\|/g) ?? []).length,
        rows[0]?.includes(
          '$$\\begin{aligned} x&=1\\\\ y&=2 \\end{aligned}$$'
        ) ?? false,
        rows[0]?.includes('\\(1\\)') ?? false
      ],
      [true, 1, 3, true, true]
    );
  }
}

{
  const equation =
    'See [#eq:system].\n\n' +
    '[$$\n' +
    '\\begin{align}\n' +
    'x&=1\\\\\n' +
    'y&=2\n' +
    '\\end{align}\n' +
    '$$]{#eq:system}\n';
  for (const kind of ['latex', 'pdf']) {
    const { rendered } = await render(equation, { kind });
    check(
      `${kind} uses one native equation and a counter-backed reference`,
      rendered,
      'See \\yiEquationRef{eq:system}.\n\n' +
        '$$\n' +
        '\\begin{equation}\n' +
        '\\begin{aligned}\n' +
        'x&=1\\\\\n' +
        'y&=2\n' +
        '\\end{aligned}\n' +
        '\\label{eq:system}\n' +
        '\\end{equation}\n' +
        '$$\n'
    );
  }
}

{
  const align =
    '$$\n' +
    '\\begin{align}\n' +
    'x&=1\\\\\n' +
    'y&=2\n' +
    '\\end{align}\n' +
    '$$\n';
  const { rendered } = await render(align, { kind: 'html' });
  check(
    'an unlabeled environment is handed on with its native numbering suppressed',
    rendered,
    '<div class="equation-layout">\n' +
      '<table class="equation-layout" role="presentation" style="width: 100%; border: none; border-collapse: collapse;">\n' +
      '<tbody style="border: none;">\n' +
      '<tr>\n' +
      '<td class="equation-math-cell" style="width: 90%; border: none; vertical-align: middle;">\n\n' +
      '$$\n' +
      '\\begin{align*}\n' +
      'x&=1\\\\\n' +
      'y&=2\n' +
      '\\end{align*}\n' +
      '$$\n\n' +
      '</td>\n' +
      '<td class="equation-number-cell" style="width: 10%; min-width: 4em; border: none; text-align: left; vertical-align: middle;">\n\n' +
      '\n\n' +
      '</td>\n' +
      '</tr>\n' +
      '</tbody>\n' +
      '</table>\n' +
      '</div>\n'
  );
}

{
  const plain = '$$\nE=mc^2\n$$\n';
  const { rendered } = await render(plain, { kind: 'html' });
  check(
    'plain display math also receives the shared reserved-cell layout',
    [
      rendered.startsWith('<div class="equation-layout">\n'),
      rendered.includes('<td class="equation-math-cell"'),
      rendered.includes('E=mc^2'),
      rendered.includes('min-width: 4em; border: none; text-align: left;')
    ],
    [true, true, true, true]
  );
}

{
  const equations =
    'See [#eq:system].\n\n' +
    '[$$\n\\begin{align}\nx&=1\n\\end{align}\n$$]{#eq:system}\n\n' +
    '$$\n\\begin{gather}\nu=v\n\\end{gather}\n$$\n';
  const { rendered } = await render(equations, { kind: 'html' });
  check(
    'a labeled equation does not hide a following unlabeled environment lowering',
    rendered.includes('\\begin{gather*}') && !rendered.includes('\\begin{gather}\n'),
    true
  );
}

{
  const wrapped = '[$$\nE=mc^2\n$$]{}\n';
  const { rendered } = await render(wrapped, { kind: 'docx' });
  check(
    'an empty attribute wrapper keeps the shared layout without a target',
    [
      rendered.startsWith('::: {.equation-layout}\n'),
      rendered.includes('| $$E=mc^2$$'),
      (rendered.match(/\|/g) ?? []).length === 3
    ],
    [true, true, true]
  );
}

{
  const equation =
    'See [#eq:plain].\n\n' +
    '[$$\nE=mc^2\n$$]{#eq:plain}\n';
  const { rendered } = await render(equation, { kind: 'markdown' });
  check(
    'processed Markdown emits an equation target containing MathML',
    [
      rendered.includes('See [Equation (1)](#eq:plain).'),
      rendered.includes('<div id="eq:plain" class="equation-target equation-layout">'),
      rendered.includes('<table class="equation-layout" role="presentation"'),
      rendered.includes('min-width: 4em; border: none; text-align: left;'),
      rendered.includes('<math xmlns="http://www.w3.org/1998/Math/MathML"'),
      rendered.includes('annotation encoding="application/x-tex">E=mc^2</annotation>'),
      rendered.includes('<span class="equation-number">(1)</span>')
    ],
    [true, true, true, true, true, true, true]
  );
}

{
  const figure =
    'See [#fig:model].\n\n' +
    '![Model overview](shot.png){#fig:model .wide owner=demo}\n';
  const { rendered } = await render(figure, {
    kind: 'html',
    files: ['/notes/shot.png']
  });
  check(
    'Pandoc-written figure formats get one target wrapper and a numbered caption',
    rendered,
    'See [Figure 1](#fig:model).\n\n' +
      '::: {#fig:model}\n' +
      '![Figure 1. Model overview](/notes/shot.png){.wide owner="demo"}\n' +
      ':::\n'
  );
}

{
  const figure =
    'See [#fig:model].\n\n' +
    '![Model overview](shot.png){#fig:model .wide owner=demo}\n';
  const { rendered } = await render(figure, {
    kind: 'latex',
    files: ['/notes/shot.png']
  });
  check(
    'LaTeX keeps the native numbered figure and removes no ID',
    rendered,
    'See [Figure 1](#fig:model).\n\n' +
      '![Model overview](/notes/shot.png){#fig:model .wide owner="demo"}\n'
  );
}

{
  const { rendered } = await render('A fence only:\n\n```\n[[target]]\n```\n', {
    titles: { target: 'Nope' }
  });
  check('and a wikilink that is a fence’s body is not a wikilink', rendered, 'A fence only:\n\n```\n[[target]]\n```\n');
}

// --- what an image's destination becomes --------------------------------------------------------

{
  const { rendered } = await render('Beside the note: ![shot.png](shot.png)', {
    files: ['/notes/shot.png']
  });
  check('an image beside the note is written as its own absolute path', rendered, 'Beside the note: ![shot.png](/notes/shot.png)');
}

{
  const { rendered } = await render('Beside the note: ![shot.png](shot.png)', {
    files: ['/notes/shot.png'],
    imageTarget: (_file, destination) => destination
  });
  check(
    'an exporter with portable assets writes the destination it will copy',
    rendered,
    'Beside the note: ![shot.png](shot.png)'
  );
}

{
  const { rendered } = await render('In the image folder: ![shot.png](shot.png)', {
    files: ['/pics/shot.png'],
    images: '/pics'
  });
  check('and one the image folder holds is found there', rendered, 'In the image folder: ![shot.png](/pics/shot.png)');
}

{
  const { looked } = await render('![a](shot.png)', { files: ['/notes/shot.png'] });
  check('the document’s own folder is tried before the settings’ image folder', looked, ['/notes/shot.png']);
}

{
  const written = '![a](shot with space.png)';
  const { rendered } = await render(written, { files: ['/notes/shot with space.png'] });
  check(
    'a name with a space is written encoded, so markdown reads the path as one destination',
    rendered,
    '![a](/notes/shot%20with%20space.png)'
  );
}

{
  const { rendered } = await render('![a](<shot with space.png>)', {
    files: ['/notes/shot with space.png']
  });
  check('however the author spelled it, wrapped or not', rendered, '![a](/notes/shot%20with%20space.png)');
}

{
  const { rendered } = await render('![a](shot%20with%20space.png)', {
    files: ['/notes/shot with space.png']
  });
  check('and a path copied as a browser spells it names the file it means', rendered, '![a](/notes/shot%20with%20space.png)');
}

{
  const name = 'a(1) b#c%.png';
  // A name with a space in it is written `<…>`-wrapped by the app, and this one holds every
  // character a destination could mean something else by.
  const { rendered } = await render(`![a](<${name}>)`, { files: [`/notes/${name}`] });
  check(
    'every character a destination could mean something else by is encoded',
    rendered,
    '![a](/notes/a(1)%20b%23c%25.png)'
  );
}

{
  // Parentheses balance, so markdown reads this one plainly — and it is still rewritten, because
  // what the app resolved is the answer, not what the characters looked like.
  const { rendered } = await render('![a](a(1).png)', { files: ['/notes/a(1).png'] });
  check('a destination markdown can read plainly is written as the path all the same', rendered, '![a](/notes/a(1).png)');
}

{
  const { rendered } = await render('![shot.png](shot.png "the picture")', {
    files: ['/notes/shot.png']
  });
  check('a title after the destination stays a title', rendered, '![shot.png](/notes/shot.png "the picture")');
}

{
  const { rendered } = await render('![a\\]b](shot.png)', { files: ['/notes/shot.png'] });
  check('and a bracket in the alt text is escaped, so the image is still one image', rendered, '![a\\]b](/notes/shot.png)');
}

{
  const written = '![gone.png](gone.png)';
  const { rendered } = await render(written, { files: [] });
  check('an image whose file is not there is left exactly as the author wrote it', rendered, written);
}

{
  const written = '![web](https://example.com/shot.png) and ![data](data:image/png;base64,AAAA)';
  const { rendered, looked, fetched } = await render(written, {
    // A picture on the web is fetched by the app — pandoc may not be able to (`export-web-image.js`
    // is that story with a real document) — and this one came back as a file.
  });
  check(
    'and one that names a picture on the web is written as the file the app fetched',
    rendered,
    '![web](/export/tmp/remote/shot.png.png) and ![data](data:image/png;base64,AAAA)'
  );
  check('nor is a local file looked for, for either of them', looked, []);
  check(
    'and a data URL is not fetched — pandoc reads those itself',
    fetched,
    ['https://example.com/shot.png']
  );
}

{
  const written = '![gone](https://example.com/unfetchable.png)';
  const { rendered } = await render(written);
  check('a picture the app cannot fetch is left exactly as the author wrote it', rendered, written);
}

{
  const { fetched } = await render('![a](https://example.com/pic.png) and ![b](https://example.com/pic.png)', {});
  check('and one URL is fetched once, however many images name it', fetched, ['https://example.com/pic.png']);
}

{
  const written = '```\n![a](shot.png)\n```\n';
  const { rendered } = await render(written, { files: ['/notes/shot.png'] });
  check('an image inside a fence is code, not an image', rendered, written);
}

// --- the two rules together ---------------------------------------------------------------------

{
  const { rendered } = await render('[[target]] then ![shot.png](shot.png) then [[target|a name]]\n', {
    titles: { target: 'The Other Note' },
    files: ['/notes/shot.png']
  });
  check(
    'a note with both is rewritten once, in one pass over the text',
    rendered,
    'The Other Note then ![shot.png](/notes/shot.png) then a name\n'
  );
}

// --- and the third rule, for the kind whose conversion is the app's own ---------------------------

{
  // What the app hands a *pandoc* kind: the citations stay as the author wrote them, and citeproc
  // renders them (and appends the list) on the other side.
  const { rendered } = await render('See [@doe2001] and @smith2020.');
  check('with no citation rendering asked for, a citation is left exactly as written', rendered, 'See [@doe2001] and @smith2020.');
}

{
  const asked = [];
  const citations = {
    render: (source) => `«${source}»`,
    references: (sources) => {
      asked.push(...sources);
      return sources.map((source) => `entry for ${source}`);
    },
    title: 'References'
  };
  const { rendered } = await render('See [@doe2001] and @smith2020.\n', { citations });
  check(
    'when the app converts, a citation is written as its own words and the works it names listed under them',
    rendered,
    'See «[@doe2001]» and «@smith2020».\n\n## References\n\n- entry for [@doe2001]\n- entry for @smith2020\n'
  );
  check('and the list is asked about each citation once, in the order they are written', asked, [
    '[@doe2001]',
    '@smith2020'
  ]);
}

{
  const asked = [];
  const citations = {
    render: (source) => `«${source}»`,
    references: (sources) => {
      asked.push(...sources);
      return [];
    },
    title: 'References'
  };
  const { rendered } = await render(
    'One [@a], again [@a], and a fence:\n\n```\n[@notacitation]\n```\n',
    { citations }
  );
  check('one work named twice is asked about once, and a fence is not a citation', asked, ['[@a]']);
  check(
    'and a note whose works are listed under nothing gets no list',
    rendered,
    'One «[@a]», again «[@a]», and a fence:\n\n```\n[@notacitation]\n```\n'
  );
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('export: all checks passed');
