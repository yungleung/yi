/**
 * Highlighted source follows the theme.
 *
 * The app shows highlighted source in four places — a fenced code block, the frontmatter,
 * a display formula's own text, and an inline formula's revealed source — and every one of
 * them has to be coloured by the theme rather than by a stylesheet drawn for one
 * background. This measures each of them in **both** themes: the tokens are there, the text
 * still reads back exactly (the highlighter may not change a character, because the caret
 * is placed by offset over it), the surface behind them is the theme's own `base-200`, and
 * every token keeps at least 4.5:1 against the surface it actually sits on. That last one
 * is the claim the fixed stylesheet could not make: measured against a light `base-200` its
 * tokens came out at 1.70–2.15:1.
 *
 * Contrast is only half of it. A palette can be legible and still useless — the first
 * version of this one mixed a quarter of each hue into the theme's foreground and every
 * token came out a pale grey, indistinguishable from the plain text it sat beside. So each
 * token is also held at 0.05 in oklab from the block's own plain colour; the quarter-mix
 * measured about 0.02 there, and this palette measures 0.07 and up.
 *
 * The one exception is a diff's deletion marker: the light theme has no red that reaches
 * 4.5:1 as text — its `error` is a surface colour — so that token is held at the 3:1 a
 * graphic is held to, and it stays recognisably red rather than being mixed down to a
 * grey that passed a number.
 *
 * Computed colours come back in the theme's own space (`oklch`, or `oklab` for a
 * `color-mix`), which no canvas will normalize, so the probe converts them itself.
 *
 * @covers src/styles.css, src/ui/markdown/nodes/frontmatter_highlight.ts,
 *   src/ui/markdown/nodes/code_block.ts, src/ui/markdown/nodes/latex_highlight.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });

  const encode = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  const parseColour = (value) => {
    const oklch = /^oklch\(\s*(-?[\d.]+)(%?)\s+(-?[\d.]+)\s+(-?[\d.]+)/.exec(value);
    if (oklch) {
      const lightness = Number(oklch[1]) / (oklch[2] === '%' ? 100 : 1);
      const hue = (Number(oklch[4]) * Math.PI) / 180;
      const chroma = Number(oklch[3]);
      return { L: lightness, a: chroma * Math.cos(hue), b: chroma * Math.sin(hue) };
    }
    const oklab = /^oklab\(\s*(-?[\d.]+)(%?)\s+(-?[\d.]+)\s+(-?[\d.]+)/.exec(value);
    if (oklab) {
      return {
        L: Number(oklab[1]) / (oklab[2] === '%' ? 100 : 1),
        a: Number(oklab[3]),
        b: Number(oklab[4])
      };
    }
    const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(value);
    if (rgb) return { rgb: [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] };
    return null;
  };
  const linear = (value) => {
    const colour = parseColour(value);
    if (!colour) return null;
    if (colour.rgb) {
      return colour.rgb.map((channel) => {
        const c = channel / 255;
        return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
    }
    const { L, a, b } = colour;
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.291485548 * b;
    const l = l_ ** 3;
    const m = m_ ** 3;
    const s = s_ ** 3;
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
    ];
  };
  const luminance = (value) => {
    const rgb = linear(value);
    if (!rgb) return null;
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  };
  const ratio = (a, b) => {
    const [first, second] = [luminance(a), luminance(b)];
    if (first === null || second === null) return null;
    const [high, low] = first > second ? [first, second] : [second, first];
    return (high + 0.05) / (low + 0.05);
  };
  const sameColour = (a, b) => {
    const [first, second] = [linear(a), linear(b)];
    if (!first || !second) return false;
    return first.every((channel, at) => Math.abs(channel - second[at]) < 0.002);
  };
  /** How far apart two colours are to the eye, as oklab distance. */
  const oklab = (value) => {
    const rgb = linear(value);
    if (!rgb) return null;
    const l = Math.cbrt(0.4122214708 * rgb[0] + 0.5363325363 * rgb[1] + 0.0514459929 * rgb[2]);
    const m = Math.cbrt(0.2119034982 * rgb[0] + 0.6806995451 * rgb[1] + 0.1073969566 * rgb[2]);
    const s = Math.cbrt(0.0883024619 * rgb[0] + 0.2817188376 * rgb[1] + 0.6299787005 * rgb[2]);
    return {
      L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
    };
  };
  const distance = (a, b) => {
    const [first, second] = [oklab(a), oklab(b)];
    if (!first || !second) return null;
    return Math.hypot(first.L - second.L, first.a - second.a, first.b - second.b);
  };
  const isTransparent = (value) => value === 'transparent' || /^rgba\(0, 0, 0, 0\)$/.test(value);
  /** The first surface behind an element that actually paints one. */
  const surfaceBehind = (element) => {
    for (let node = element; node; node = node.parentElement) {
      const background = getComputedStyle(node).backgroundColor;
      if (!isTransparent(background)) return background;
    }
    return getComputedStyle(document.body).backgroundColor;
  };

  const FRONTMATTER = '---\nid: 20240707122715\ntitle: "A note"\n---';
  const FENCE = '```ts\nconst a = 1;\n```';
  const DISPLAY = '$$\n\\frac{a}{b}\n$$';
  const INLINE = '$E = mc^2$';
  const document_ = [
    FRONTMATTER,
    '',
    FENCE,
    '',
    `inline ${INLINE} here`,
    '',
    DISPLAY,
    '',
    'tail',
    ''
  ].join('\n');
  await t.load(document_);

  const root = document.documentElement;
  const frontmatter = () => t.prose().querySelector('.markdown-frontmatter');
  const fence = () => t.prose().querySelector('pre.markdown-node');
  const inlineRendering = () => t.prose().querySelector('[data-display="false"]');
  const displayRendering = () => t.prose().querySelector('[data-display="true"]');

  /** The theme's own plain-text colour, which every token has to stand away from. */
  let plain = '';

  /** What one piece of highlighted source looks like right now. */
  const look = (element) => {
    if (!element) return null;
    const surface = surfaceBehind(element);
    const style = getComputedStyle(element);
    const tokens = [...element.querySelectorAll('[class*="hljs-"]')].map((span) => {
      const colour = getComputedStyle(span).color;
      return {
        token: span.className,
        colour,
        // A diff's deletion marker is the one token the light theme cannot give 4.5:1
        // to without turning its red into a grey (see the header).
        floor: span.classList.contains('hljs-deletion') ? 3 : 4.5,
        contrast: ratio(colour, surface),
        standsOff: distance(colour, plain)
      };
    });
    return {
      text: element.textContent,
      background: style.backgroundColor,
      // The box the prose gives a `pre`: the frontmatter has to wear the same one as a
      // fenced code block for "highlighted like a fenced code" to be true of the shape as
      // well as the colours. Margins are left out — the frontmatter is the document's
      // first block, and typography zeroes the first child's top margin.
      box: {
        padding: style.padding,
        borderRadius: style.borderRadius,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        whiteSpace: style.whiteSpace
      },
      surface,
      colours: tokens.map((entry) => entry.colour),
      tokens
    };
  };

  /** Everything the four surfaces are, in the theme that is set right now. */
  const measure = async () => {
    const out = { frontmatter: look(frontmatter()), codeFence: look(fence()) };
    await t.click(inlineRendering(), 0.5);
    await t.sleep(250);
    out.inlineMath = look(t.prose().querySelector('.markdown-math-source'));
    await t.click(displayRendering(), 0.5);
    await t.sleep(300);
    out.displayMath = look(t.prose().querySelector('.markdown-source-text'));
    return out;
  };

  const EXPECTED = {
    frontmatter: FRONTMATTER,
    codeFence: 'const a = 1;',
    inlineMath: INLINE,
    displayMath: DISPLAY
  };

  const seen = {};
  try {
    for (const theme of ['winter', 'dim']) {
      root.setAttribute('data-theme', theme);
      await t.sleep(120);
      const base200 = getComputedStyle(root).getPropertyValue('--color-base-200').trim();
      plain = getComputedStyle(root).getPropertyValue('--color-base-content').trim();
      const measured = await measure();
      seen[theme] = { base200, surfaces: measured };
      for (const [name, look_] of Object.entries(measured)) {
        const mark = `${theme}: ${name}`;
        check(`${mark} is highlighted, and shows its own text`, look_ !== null && look_.tokens.length > 0 && look_.text === EXPECTED[name], look_ === null ? null : { text: look_.text, tokens: look_.tokens.length });
        check(
          `${mark} sits on the theme's own surface`,
          look_ !== null && sameColour(look_.background, base200),
          look_ === null ? null : { background: look_.background, base200 }
        );
        const under = look_ === null ? [] : look_.tokens.filter(
          (entry) => entry.contrast === null || entry.contrast < entry.floor
        );
        check(
          `${mark}: every token keeps its contrast floor`,
          look_ !== null && under.length === 0,
          look_ === null
            ? null
            : {
                under: under.map((entry) => ({
                  token: entry.token,
                  contrast: entry.contrast === null ? null : Number(entry.contrast.toFixed(2)),
                  floor: entry.floor
                }))
              }
        );
        const tooClose = look_ === null ? [] : look_.tokens.filter(
          (entry) => entry.standsOff === null || entry.standsOff < 0.05
        );
        check(
          `${mark}: every token stands away from the plain text`,
          look_ !== null && tooClose.length === 0,
          look_ === null
            ? null
            : {
                tooClose: tooClose.map((entry) => ({
                  token: entry.token,
                  standsOff: entry.standsOff === null ? null : Number(entry.standsOff.toFixed(3))
                }))
              }
        );
      }
      check(
        `${theme}: the frontmatter wears the fenced code block's own box`,
        measured.frontmatter !== null &&
          JSON.stringify(measured.frontmatter.box) === JSON.stringify(measured.codeFence.box),
        { frontmatter: measured.frontmatter?.box, codeFence: measured.codeFence?.box }
      );
    }
  } finally {
    root.removeAttribute('data-theme');
    await t.sleep(80);
  }

  // The claim the user asked for, said as a measurement: the same markup is painted
  // differently by the two themes.
  for (const name of Object.keys(EXPECTED)) {
    const winter = seen.winter?.surfaces[name];
    const dim = seen.dim?.surfaces[name];
    check(
      `${name} is painted differently by the two themes`,
      Boolean(winter && dim) &&
        !sameColour(winter.background, dim.background) &&
        winter.colours.join() !== dim.colours.join(),
      winter && dim ? { winter: winter.background, dim: dim.background } : null
    );
  }

  return {
    seen,
    checks,
    failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name)
  };
})()
