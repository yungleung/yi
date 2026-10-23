/**
 * Heading level markers: every heading carries the supplied h1-h6 glyph in a fixed-size left
 * gutter, and the decoration never enters the document or takes a pointer.
 *
 * @covers src/ui/markdown/nodes/heading.ts, src/ui/markdown/nodes/heading_marker.ts,
 *   src/styles.css
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const paths = [
    [
      'M4.18 4.03v14.74m9.1-14.74v14.74m-9.1-7.47h9.1m0-7.27v14.74m-1.45 0h2.9m-2.9-14.74h2.9m-12 0h2.9m-2.9 14.74h2.9m12.07-2.65l1.3-1.15c.72-.65 1.08-.97 1.37-.84s.3.61.3 1.58v5'
    ],
    [
      'M17.54 15.26c.5-.54.99-.96 2.02-.96c1.82 0 2.11 1.9 1.2 2.84c-.53.56-1.7 1.39-2.61 2.18c-.45.38-.67.58-.55.9s.44.33 1.09.33h2.58M4.18 4.03v14.74m9.1-14.74v14.74m-9.1-7.47h9.1m0-7.27v14.74m-1.45 0h2.9m-2.9-14.74h2.9m-12 0h2.9m-2.9 14.74h2.9'
    ],
    [
      'M4.18 4.03v14.74m9.1-14.74v14.74m-9.1-7.47h9.1m0-7.27v14.74m-1.45 0h2.9m-2.9-14.74h2.9m-12 0h2.9m-2.9 14.74h2.9m12.01-3.73a2.2 2.2 0 0 1 1.75-.74c1.57 0 2.04 1.81 1.25 2.54c-.8.73-1.95.57-1.95.57',
      'M17.64 19.8c.43.42.85.75 1.75.75c1.57 0 2.04-1.81 1.25-2.55c-.8-.73-1.95-.56-1.95-.56'
    ],
    [
      'M20.44 21.18v-4.9c0-1.33 0-2-.36-2.11c-.35-.11-.72.45-1.47 1.56l-.93 1.39c-.46.68-.69 1.02-.55 1.29c.14.26.56.26 1.38.26h3.1M4.18 4.03v14.74m9.1-14.74v14.74m-9.1-7.47h9.1m0-7.27v14.74m-1.45 0h2.9m-12 0h2.9m6.2-14.74h2.9m-12 0h2.9'
    ],
    [
      'M4.18 4.03v14.74m9.1-14.74v14.74m-9.1-7.47h9.1m0-7.27v14.74m-1.45 0h2.9m-12 0h2.9m6.2-14.74h2.9m-12 0h2.9M17.78 21h1.6a1.76 1.76 0 1 0 0-3.53h-1.82v-1.52c0-.5 0-.74.08-.93a1 1 0 0 1 .51-.51c.2-.09.44-.09.93-.09h1.7'
    ],
    [
      'M4.18 4.03v14.74m9.1-14.74v14.74m-9.1-7.47h9.1m0-7.27v14.74m-1.45 0h2.9m-12 0h2.9m6.2-14.74h2.9m-12 0h2.9',
      'M17.38 19.23c0-1.24 0-4.35 2.88-5.2'
    ]
  ];
  const source = Array.from({ length: 6 }, (_, index) => `${'#'.repeat(index + 1)} Level ${index + 1}`).join(
    '\n\n'
  );
  await t.load(`${source}\n`);
  const headings = [...t.prose().querySelectorAll('h1,h2,h3,h4,h5,h6')];
  const markers = headings.map((heading) =>
    heading.querySelector(':scope > [data-heading-marker]')
  );
  check(
    'all six heading levels render a level marker',
    headings.length === 6 &&
      markers.length === 6 &&
      markers.every((marker, index) => marker?.getAttribute('data-heading-marker') === String(index + 1)),
    markers.map((marker) => marker?.getAttribute('data-heading-marker') ?? null)
  );

  const svgs = markers.map((marker) => marker?.querySelector('svg') ?? null);
  const drawn = svgs.map((svg) =>
    [...(svg?.querySelectorAll('path[stroke="currentColor"], g[stroke="currentColor"] path') ?? [])].map(
      (path) => path.getAttribute('d')
    )
  );
  check(
    'each marker draws the supplied SVG for its heading level',
    drawn.every((actual, index) => JSON.stringify(actual) === JSON.stringify(paths[index])) &&
      svgs.every((svg) => svg?.getAttribute('viewBox') === '0 0 24 24') &&
      (svgs[5]?.querySelector('circle') ?? null) !== null,
    drawn
  );

  const scale = Number.parseFloat(
    getComputedStyle(t.prose()).getPropertyValue('--md-page-scale') || '1'
  );
  const expectedSize = 16 * scale;
  const sizes = svgs.map((svg) => {
    const rect = svg?.getBoundingClientRect();
    return rect ? { width: rect.width, height: rect.height } : null;
  });
  check(
    'the glyphs share one page-scaled size instead of growing with heading type',
    sizes.every(
      (size) =>
        size !== null &&
        Math.abs(size.width - expectedSize) <= 1 &&
        Math.abs(size.height - expectedSize) <= 1
    ),
    { expectedSize, sizes }
  );
  t.prose().style.setProperty('--page-scale', '0.5');
  await t.sleep(40);
  const halfSizes = svgs.map((svg) => svg?.getBoundingClientRect().height ?? null);
  t.prose().style.removeProperty('--page-scale');
  await t.sleep(40);
  check(
    'and they follow the page scale rather than the window scale',
    halfSizes.every((height) => height !== null && Math.abs(height - 8) <= 1),
    halfSizes
  );

  const paddings = headings.map((heading) => getComputedStyle(heading).paddingInlineStart);
  const restingOpacity = markers.map((marker) =>
    marker === null ? null : getComputedStyle(marker).opacity
  );
  check(
    'headings keep their original indentation while their markers wait out of the way',
    paddings.every((padding) => padding === '0px') &&
      restingOpacity.every((opacity) => opacity === '0'),
    { paddings, restingOpacity }
  );

  const alignments = headings.map((heading, index) => {
    const marker = markers[index];
    const text = t.textNodesIn(heading)[0] ?? null;
    if (marker === null || text === null) {
      return null;
    }
    const markerRect = marker.getBoundingClientRect();
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, Math.min(1, text.data.length));
    const textRect = range.getBoundingClientRect();
    return {
      markerRight: markerRect.right,
      textLeft: textRect.left,
      markerCenter: markerRect.top + markerRect.height / 2,
      textCenter: textRect.top + textRect.height / 2
    };
  });
  check(
    'each glyph sits in a left gutter on the heading’s first line',
    alignments.every(
      (row) =>
        row !== null &&
        row.markerRight <= row.textLeft &&
        Math.abs(row.markerCenter - row.textCenter) <= 1.5
    ),
    alignments
  );

  const heading = headings[0];
  const marker = markers[0];
  const text = t.textNodesIn(heading)[0] ?? null;
  const bounds = (rect) => ({
    left: rect.left,
    right: rect.right,
    top: rect.top,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height
  });
  if (marker !== null && text !== null) {
    const textRange = document.createRange();
    textRange.setStart(text, 0);
    textRange.setEnd(text, Math.min(1, text.data.length));
    const before = {
      heading: bounds(heading.getBoundingClientRect()),
      text: bounds(textRange.getBoundingClientRect()),
      marker: bounds(marker.getBoundingClientRect()),
      opacity: getComputedStyle(marker).opacity
    };
    heading.dispatchEvent(new PointerEvent('pointerenter'));
    await t.sleep(180);
    const shown = {
      heading: bounds(heading.getBoundingClientRect()),
      text: bounds(textRange.getBoundingClientRect()),
      marker: bounds(marker.getBoundingClientRect()),
      opacity: getComputedStyle(marker).opacity
    };
    check(
      'hovering shows the marker by shifting only the marker into view',
      shown.opacity === '1' &&
        shown.marker.left > before.marker.left + 6 &&
        shown.marker.right <= shown.text.left &&
        shown.heading.left === before.heading.left &&
        shown.heading.right === before.heading.right &&
        shown.text.left === before.text.left,
      { before, shown }
    );
    heading.dispatchEvent(new PointerEvent('pointerleave'));
    await t.sleep(180);
    const left = {
      marker: bounds(marker.getBoundingClientRect()),
      opacity: getComputedStyle(marker).opacity
    };
    check(
      'leaving shifts the marker back out without moving the heading',
      left.opacity === '0' && Math.abs(left.marker.left - before.marker.left) <= 0.25,
      { before: before.marker, left }
    );
  } else {
    checks.push({
      name: 'the first heading exposes its marker and text',
      pass: false,
      actual: { marker, text }
    });
  }

  check(
    'the markers are decorative, non-interactive and absent from copied text',
    markers.every(
      (marker) =>
        marker?.getAttribute('aria-hidden') === 'true' &&
        getComputedStyle(marker).pointerEvents === 'none' &&
        marker.textContent === ''
    ) &&
      (await t.raw()) === `${source}\n`,
    markers.map((marker) => ({
      ariaHidden: marker?.getAttribute('aria-hidden') ?? null,
      pointerEvents: marker === null ? null : getComputedStyle(marker).pointerEvents,
      text: marker?.textContent ?? null
    }))
  );

  await t.click(headings[5], 0.99, 0.5);
  t.key('!');
  await t.sleep(120);
  const typed = await t.raw();
  check(
    'a heading still types where its text is clicked',
    typed === `${source}!\n`,
    typed
  );
  return { checks, failed: checks.filter((item) => !item.pass).map((item) => item.name) };
})()
