/**
 * Inline revealable sources with arbitrary text wrap inside the prose column.
 *
 * A source view preserves the author's spaces, but a destination or identifier with no spaces
 * is still one unbreakable word unless the view creates a break opportunity. A long URL in a
 * link or image therefore used to paint through the right edge of the page instead of wrapping
 * like the prose around it. Hard-break and thematic-break sources consist only of their markers;
 * these cases cover the revealable nodes whose source can contain an unbroken token.
 *
 * @covers src/styles.css, src/ui/markdown/nodes/, src/ui/markdown/source_mode/
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const long = 'w'.repeat(180);
  const label = 'n'.repeat(120);

  const cases = [
    {
      name: 'link',
      document: `Before [title](https://example.com/${long}) after.`,
      rendered: 'a.markdown-link',
      source: '.markdown-link-source'
    },
    {
      name: 'image',
      document: `Before ![alt](https://example.com/${long}.png) after.`,
      rendered: 'img',
      source: '.markdown-image-source'
    },
    {
      name: 'strong',
      document: `Before **${long}** after.`,
      rendered: 'strong',
      source: '.markdown-strong-source'
    },
    {
      name: 'emphasis',
      document: `Before *${long}* after.`,
      rendered: 'em',
      source: '.markdown-emphasis-source'
    },
    {
      name: 'strikethrough',
      document: `Before ~~${long}~~ after.`,
      rendered: 'del',
      source: '.markdown-delete-source'
    },
    {
      name: 'inline code',
      document: `Before \`${long}\` after.`,
      rendered: 'code',
      source: '.markdown-inline-code-source'
    },
    {
      name: 'inline math',
      document: `Before $${long}$ after.`,
      rendered: '[data-math]',
      source: '.markdown-math-source'
    },
    {
      name: 'auto reference',
      document: `Before [#${long}] after.`,
      rendered: 'a[data-auto-reference]',
      source: '.markdown-auto-reference-source'
    },
    {
      name: 'citation',
      document: `Before [@${long}] after.`,
      rendered: '.markdown-citation',
      source: '.markdown-citation-source'
    },
    {
      name: 'wikilink',
      document: `Before [[${long}]] after.`,
      rendered: '.markdown-wikilink',
      source: '.markdown-wikilink-source'
    },
    {
      name: 'footnote reference',
      document: `Body[^${label}].`,
      rendered: '[data-footnote-ref]',
      source: '.markdown-footnote-source'
    },
    {
      name: 'footnote label',
      document: '',
      rendered: '[data-footnote-def].markdown-footnote-label',
      source: '.markdown-footnote-label.markdown-source-view'
    }
  ];

  /** The line boxes and right edge of a source view's text inside its block. */
  const textBox = (source) => {
    const range = document.createRange();
    range.selectNodeContents(source);
    const rects = [...range.getClientRects()].filter(
      (rect) => rect.width > 0 && rect.height > 0
    );
    const block = source.closest('.markdown-block');
    const bounds = (block ?? t.prose()).getBoundingClientRect();
    return {
      lines: new Set(rects.map((rect) => Math.round(rect.top))).size,
      left: Math.round(Math.min(...rects.map((rect) => rect.left))),
      right: Math.round(Math.max(...rects.map((rect) => rect.right))),
      blockLeft: Math.round(bounds.left),
      blockRight: Math.round(bounds.right)
    };
  };

  await t.load(
    `# Target\n\n${cases
      .map((entry) => entry.document)
      .filter(Boolean)
      .join('\n\n')}\n\n[^${label}]: The note.\n`
  );

  for (const entry of cases) {
    const rendered = t.prose().querySelector(entry.rendered);
    check(`${entry.name}: rendered node is mounted`, rendered !== null, entry.rendered);
    if (rendered === null) {
      continue;
    }

    await t.click(rendered, 0.5);
    await t.sleep(80);
    const source = t.prose().querySelector(entry.source);
    check(`${entry.name}: source mode is open`, source !== null, entry.source);
    if (source === null) {
      continue;
    }

    const box = textBox(source);
    check(`${entry.name}: the long source wraps onto more than one line`, box.lines > 1, box);
    check(
      `${entry.name}: every wrapped line stays inside the prose column`,
      box.left >= box.blockLeft - 1 && box.right <= box.blockRight + 1,
      box
    );
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
