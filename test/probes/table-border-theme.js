/**
 * The table border follows the theme and stays legible against the page.
 *
 * @covers src/styles.css
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({
      name,
      actual,
      expected,
      pass: JSON.stringify(actual) === JSON.stringify(expected)
    });
  const rgb = (colour) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d');
    context.fillStyle = colour;
    context.fillRect(0, 0, 1, 1);
    return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)];
  };
  const luminance = (colour) => {
    const channel = (value) => {
      const c = value / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const [r, g, b] = rgb(colour).map(channel);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (one, two) => {
    const [high, low] = [luminance(one), luminance(two)].sort((a, b) => b - a);
    return (high + 0.05) / (low + 0.05);
  };
  await t.load('| A | B |\n| --- | --- |\n| 1 | 2 |\n');
  const root = document.documentElement;
  const previous = root.dataset.theme ?? null;
  const seen = {};
  for (const theme of ['winter', 'dim']) {
    root.setAttribute('data-theme', theme);
    await t.sleep(150);
    const table = t.prose().querySelector('table.markdown-table');
    const cell = t.prose().querySelector('table.markdown-table th');
    const prose = t.prose();
    seen[theme] = {
      border: getComputedStyle(cell).borderTopColor,
      page: getComputedStyle(prose).backgroundColor,
      cell: getComputedStyle(cell).backgroundColor,
      base100: getComputedStyle(root).getPropertyValue('--color-base-100').trim(),
      base200: getComputedStyle(root).getPropertyValue('--color-base-200').trim(),
      base300: getComputedStyle(root).getPropertyValue('--color-base-300').trim(),
      baseContent: getComputedStyle(root).getPropertyValue('--color-base-content').trim(),
      table: table !== null
    };
  }
  if (previous === null) {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', previous);
  }
  check(
    'the light table border is slightly darker than its page',
    brightness(seen.winter.border) < brightness(seen.winter.page),
    true
  );
  check(
    'the dark table border is inverted and is lighter than its page',
    brightness(seen.dim.border) > brightness(seen.dim.page),
    true
  );
  check(
    'the inverted dark border remains visible',
    contrast(seen.dim.border, seen.dim.page) >= 3,
    true
  );
  return {
    checks,
    failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name),
    seen
  };
})()
