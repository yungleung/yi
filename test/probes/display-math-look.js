/** What a formula's source view looks like, next to a fenced code block. */
(async () => {
  const t = window.__t;
  const look = (element) => {
    if (!element) {
      return null;
    }
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      tag: element.tagName,
      fontFamily: style.fontFamily.split(',')[0],
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      whiteSpace: style.whiteSpace,
      marginTop: style.marginTop,
      marginBottom: style.marginBottom,
      padding: style.padding,
      background: style.backgroundColor,
      radius: style.borderRadius,
      overflowX: style.overflowX,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      scrollWidth: element.scrollWidth
    };
  };
  const doc = [
    'text',
    '',
    '```ts',
    'const a = 1;',
    '```',
    '',
    '$$',
    '\\frac{d}{dx}(\\sin x) = \\cos x',
    '$$',
    '',
    'tail'
  ].join('\n') + '\n';
  await t.load(doc);
  const code = look(t.prose().querySelector('pre'));
  const rendered = look(t.prose().querySelector('[data-display="true"]'));
  await t.click(t.prose().querySelector('[data-display="true"]'), 0.5, 0.5);
  await t.sleep(300);
  const source = look(t.prose().querySelector('.markdown-source-text'));
  return { code, rendered, source };
})()
