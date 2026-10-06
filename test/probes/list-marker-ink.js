/**
 * A list's marker is legible on the page it is drawn on.
 *
 * The typography plugin draws bullets and numbers from a palette made for one light background: a
 * 50 %-alpha grey measured 2.4:1 against the sheet and 2.6:1 against dim's paper — a dot the reader
 * can barely see, which reads as "the decoration disappears". `styles.css` mixes the marker's ink
 * from the theme's own text (`base-content` into `base-100`), the way the highlighted source and the
 * fence labels do, and this holds it in both themes.
 *
 * Markers are painted by the engine, not by the DOM, so the colour is read from `::marker` and
 * flattened over the page it sits on with a canvas (which parses whatever colour syntax the engine
 * just gave us); the contrast is then the WCAG ratio of the two, and the floor is the 3:1 one a
 * graphical object is held to.
 *
 * @covers src/styles.css: the list marker's ink
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });

  /** The colour a foreground over a background actually paints, through the engine's own parser. */
  const flatten = (foreground, background) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d');
    context.fillStyle = background;
    context.fillRect(0, 0, 1, 1);
    context.fillStyle = foreground;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    return [r, g, b];
  };
  const luminance = ([r, g, b]) => {
    const channel = (value) => {
      const c = value / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const contrast = (foreground, background) => {
    const [high, low] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (high + 0.05) / (low + 0.05);
  };

  const root = document.documentElement;
  const previousTheme = root.dataset.theme ?? null;
  await t.useLayout('page');
  await t.load('# Lists\n\n- item one\n\n- \n\n1. item\n\n2. \n\n* item\n\ntail\n');
  await t.sleep(350);

  const markerColours = () =>
    [...t.prose().querySelectorAll('li')].map((item) => getComputedStyle(item, '::marker').color);

  for (const theme of ['winter', 'dim']) {
    root.setAttribute('data-theme', theme);
    await t.sleep(200);
    const page = getComputedStyle(t.prose()).backgroundColor;
    const colours = markerColours();
    check(`${theme}: every item draws a marker`, colours.length >= 4 && colours.every((c) => c !== ''), true);
    const ratios = colours.map((colour) => Number(contrast(flatten(colour, page), flatten(page, page)).toFixed(2)));
    checks.push({
      name: `${theme}: and every marker stands off the page (3:1)`,
      actual: ratios,
      expected: `every ratio ≥ 3 against ${page}`,
      pass: ratios.every((ratio) => ratio >= 3)
    });
  }

  if (previousTheme === null) {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', previousTheme);
  }
  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
