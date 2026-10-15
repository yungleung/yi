window.__t = (() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const prose = () => $('.prose');
  const scroller = () => $('.markdown-scroller') ?? prose().closest('.overflow-auto');
  const blocks = () => [...prose().querySelectorAll('.markdown-block')];
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const textNodesIn = (element) => {
    const out = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) out.push(node);
    return out;
  };

  /** The whole raw document, read through Select All + copy. */
  const raw = async () => {
    await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'select_all' });
    await sleep(120);
    const dt = new DataTransfer();
    scroller().dispatchEvent(
      new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true })
    );
    window.getSelection()?.removeAllRanges();
    return dt.getData('text/plain');
  };

  /** Loads a document into the editor. */
  const load = async (markdown) => {
    // The emit's promise can hang when the app falls back to its slower IPC
    // path, so wait for it with a bound instead of awaiting it forever.
    const before = window.__opened ?? 0;
    void window.__TAURI_INTERNALS__.invoke('plugin:event|emit', {
      event: 'document_opened',
      payload: markdown
    }).then(() => {
      window.__opened = (window.__opened ?? 0) + 1;
    });
    for (let attempt = 0; attempt < 60 && (window.__opened ?? 0) === before; attempt += 1) {
      await sleep(50);
    }
    await sleep(250);
  };

  const key = (name) =>
    scroller().dispatchEvent(
      new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true })
    );

  /**
   * Points the app at a workspace folder, the way opening one does, and hands back the
   * config it had so the probe can put it back.
   *
   * A probe that drives the tree needs a folder it may write to and that is not the
   * repository's own fixtures: it makes one with the app's own commands, points the app at it
   * with this, and removes it when it is done. Put it under the home directory: the app reads
   * a document's text through the file plugin, which is scoped to `$HOME/**`
   * (`src-tauri/capabilities/default.json`), while the folder commands that list and write are
   * not — so a workspace in `/private/tmp` can be listed, written and never opened.
   */
  const openWorkspace = async (path) => {
    const previous = await window.__TAURI_INTERNALS__.invoke('get_config');
    const cfg = {
      ...previous,
      workspace: path,
      config_version: await window.__TAURI_INTERNALS__.invoke('get_current_config_version')
    };
    await window.__TAURI_INTERNALS__.invoke('set_config', { cfg });
    // The app's own manager holds the config in memory, and what reads it — the wikilink
    // resolver, the new-note card's folder list — must see the folder the probe just pointed
    // the app at. Writing the file alone would leave them on the workspace the app started on.
    const { configManager } = await app('/src/services/config_manager.ts');
    await configManager.load();
    await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', {
      event: 'workspace_changed',
      payload: path
    });
    await sleep(800);
    return previous;
  };

  /** Puts a workspace back where a probe found it. */
  const restoreWorkspace = async (previous) => {
    if (!previous) {
      return;
    }
    await window.__TAURI_INTERNALS__.invoke('set_config', {
      cfg: {
        ...previous,
        config_version: await window.__TAURI_INTERNALS__.invoke('get_current_config_version')
      }
    });
    const { configManager } = await app('/src/services/config_manager.ts');
    await configManager.load();
    await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', {
      event: 'workspace_changed',
      payload: previous.workspace ?? ''
    });
    await sleep(400);
  };

  const caretRect = () => {
    const rect = document.querySelector('.markdown-caret')?.getBoundingClientRect();
    return rect ? { x: Math.round(rect.left), y: Math.round(rect.top) } : null;
  };

  /**
   * Clicks a point inside an element, which is how the editor places carets.
   *
   * A click is the *end* of a gesture — the browser sends `pointerdown` where the pointer
   * went down, then `pointerup`, then the click — and the editor reads that press to tell a
   * click from the drag its click may be ending (`editing/pointer.ts: endedADrag` refuses a
   * caret to a gesture that travelled a few pixels and left a selection). So the gesture is
   * sent whole, from the point the click lands on.
   *
   * A bare `click` is judged against whatever press the page last saw, and that press can be
   * a markdown node's: a node answers the click that lands on it and stops it, so the press
   * it came from is never consumed — measured, one coordinate-less `pointerdown` (what
   * `input-method-click.js` dispatches to stand the keyboard hand-over back) left a press at
   * the window's origin, and the next probe's click, hundreds of pixels away and with the
   * document selected from `t.raw()`, was refused as the end of a drag.
   */
  const click = async (element, ratio = 0.99, dy = 0.5) => {
    const rect = element.getBoundingClientRect();
    const at = {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + rect.width * ratio,
      clientY: rect.top + rect.height * dy
    };
    element.dispatchEvent(new PointerEvent('pointerdown', at));
    element.dispatchEvent(new PointerEvent('pointerup', at));
    element.dispatchEvent(new MouseEvent('click', at));
    await sleep(120);
  };

  const rectOf = (element) => {
    const rect = element.getBoundingClientRect();
    return {
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      height: Math.round(rect.height)
    };
  };

  const styles = (selector) => {
    const element = prose().querySelector(selector);
    if (!element) return null;
    const style = getComputedStyle(element);
    return {
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      marginTop: style.marginTop,
      marginBottom: style.marginBottom,
      ...rectOf(element)
    };
  };

  /** Distances between the mounted blocks, in document order. */
  const gaps = () => {
    const rects = blocks().map((block) => block.getBoundingClientRect());
    return rects.slice(1).map((rect, index) => Math.round(rect.top - rects[index].bottom));
  };

  /** The empty-paragraph lines currently mounted. */
  const emptyLines = () =>
    blocks()
      .filter((block) => block.querySelector('.markdown-empty-line-placeholder'))
      .map((block) => ({ lineStart: Number(block.dataset.lineStart), ...rectOf(block) }));

  /**
   * Publishes a probe's partial results, so a probe that outlives the bridge's
   * budget still reports everything it managed to measure.
   */
  const report = (value) => {
    window.__probeSteps = value;
    return value;
  };

  /**
   * The running app's own instance of one of its modules, by source path.
   *
   * A probe drives the app the way a reader does, but one command has no
   * scriptable trigger: the table context menu is a native menu, and nothing
   * can select an item of it but a person. So those probes ask the registry
   * for the command the menu item names and run it, which is what the menu
   * does.
   *
   * Vite serves a module it has rebuilt under a `?t=` URL, and the app runs
   * *that* instance — importing the bare path would get a second, empty copy
   * of the registry — so the newest URL this page fetched for the path wins,
   * and the bare path is the fallback for a freshly started dev server.
   */
  const app = async (path) => {
    const fetched = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => {
        try {
          return new URL(name).pathname === path;
        } catch {
          return false;
        }
      });
    return await import(fetched.length > 0 ? fetched[fetched.length - 1] : path);
  };

  /** The layout the editor is drawn in: `page` or `auto` (see `styles.css`). */
  const layout = () => document.querySelector('.markdown-scroller')?.dataset.layout ?? null;

  /**
   * Presses the titlebar's layout button until the editor is in `layout`, and reports what
   * it is then. The layout is remembered in the app config, so a probe that measures one of
   * them asks for it instead of inheriting whichever the reader left behind.
   */
  const useLayout = async (wanted) => {
    const button = () =>
      [...document.querySelectorAll('button')].find((element) =>
        ['A4 page', 'Full width'].includes(element.getAttribute('aria-label') ?? '')
      );
    for (let attempt = 0; attempt < 4 && layout() !== wanted; attempt += 1) {
      button()?.click();
      await sleep(250);
    }
    return layout();
  };


  /**
   * Every stream in a PDF, by the byte offset it starts at — what `pdfText` and `pdfFonts` both read a
   * file through. The bytes are found by the `stream` keyword rather than through the file's own
   * cross-reference table: what a probe wants is the text inside them, and the table's own offsets are
   * not needed to find that.
   */
  const pdfStreams = (bytes) => {
    const latin = new TextDecoder('latin1').decode(bytes);
    const out = [];
    for (const match of latin.matchAll(/stream\r?\n/g)) {
      if (latin.slice(Math.max(0, match.index - 3), match.index) === 'end') {
        continue;
      }
      const from = match.index + match[0].length;
      const end = latin.indexOf('endstream', from);
      if (end < 0) {
        break;
      }
      let stop = end;
      while (stop > from && (latin[stop - 1] === '\n' || latin[stop - 1] === '\r')) stop -= 1;
      out.push({ at: match.index, range: [from, stop] });
    }
    return out;
  };

  /** One stream's bytes, inflated — or null when they are not deflate (a font's own tables are not). */
  const inflateText = async (bytes, [from, stop]) => {
    try {
      const stream = new Blob([bytes.slice(from, stop)])
        .stream()
        .pipeThrough(new DecompressionStream('deflate'));
      return new TextDecoder('latin1').decode(await new Response(stream).arrayBuffer());
    } catch {
      return null;
    }
  };

  /**
   * A page's own drawing commands, inflated: what a probe needs when the *text* is not the question.
   * Fake bold is one — a face with a single weight is emboldened by being stroked as well as filled
   * (`2 Tr` and a line width), so neither the text nor the font names say anything about it and these
   * operators say all of it.
   */
  const pdfContent = async (bytes) => {
    const commands = [];
    for (const stream of pdfStreams(bytes)) {
      const text = await inflateText(bytes, stream.range);
      if (text !== null && (text.includes('Tj') || text.includes('TJ'))) {
        commands.push(text);
      }
    }
    return commands.join('\n');
  };

  /**
   * The fonts a PDF draws with, as the names in its own `/BaseFont` entries: which face set a page is
   * *evidence about*. A page is read back as text by `pdfText`, and text alone cannot say whether the
   * characters came from the faces a build ships or from whichever font the machine happened to have —
   * measured, the names are inside a compressed object stream, so the file's raw bytes do not hold them
   * and the streams have to be inflated first.
   */
  const pdfFonts = async (bytes) => {
    const names = new Set();
    for (const stream of pdfStreams(bytes)) {
      const text = await inflateText(bytes, stream.range);
      for (const [, name] of (text ?? '').matchAll(/\/BaseFont\s*\/([A-Za-z0-9+\-]+)/g)) {
        names.add(name);
      }
    }
    return [...names];
  };

  /**
   * What a PDF's page says, rebuilt from the file: a font's `ToUnicode` map names the character a
   * drawn code stands for, and the page's own text operators say which codes it draws — `<hex> Tj`,
   * `[<hex>] TJ` and, for characters the font holds directly, `(plain) Tj`. A code the font in force
   * has no map for stands for no character — a ligature, the word space of another face — and is left
   * out rather than guessed at, so what comes back is what is *on* the page.
   *
   * **One map per font, chosen by the `/Fn Tf` in force**, and not one map merged out of all of them:
   * a page carrying several subset fonts has several code spaces, and the same code means different
   * characters in each — merging them is what turned Cyrillic `и` into Greek `ν` on a page that had
   * Greek too. The page's objects are read out of the file, its compressed ones included, because the
   * only place the mapping from `/F5` to a font's map is written down is that page dictionary.
   *
   * The streams are read one byte to one character (`latin1`), and one that is not deflate — a font's
   * own tables are not — is skipped. This is what `export-pdf-font.js` and `export-pdf-scripts.js`
   * read a page with, and it is here because two probes need the same instrument, not because every
   * probe does.
   */
  const pdfText = async (bytes) => {
    const latin = new TextDecoder('latin1').decode(bytes);

    const streams = pdfStreams(bytes);
    const inflate = (range) => inflateText(bytes, range);

    /** The objects of the file, and where each one's own bytes are — a stream is inside them. */
    const objects = new Map();
    const parts = [...latin.matchAll(/(\d+)\s+0\s+obj([\s\S]*?)endobj/g)].map((match) => ({
      number: Number(match[1]),
      start: match.index,
      end: match.index + match[0].length,
      body: match[2]
    }));
    for (const part of parts) {
      objects.set(part.number, part);
    }
    /** What the stream inside an object says, inflated, or null when it has none. */
    const streamOf = async (part) => {
      const stream = streams.find(({ at }) => at > part.start && at < part.end);
      return stream === undefined ? null : inflate(stream.range);
    };
    // XeTeX packs most objects into object streams, page dictionaries among them: unpack those too.
    for (const part of parts) {
      const count = /\/N\s+(\d+)/.exec(part.body);
      const first = /\/First\s+(\d+)/.exec(part.body);
      if (!part.body.includes('/ObjStm') || count === null || first === null) {
        continue;
      }
      const packed = await streamOf(part);
      if (packed === null) {
        continue;
      }
      const head = packed.slice(0, Number(first[1])).trim().split(/\s+/).map(Number);
      for (let pair = 0; pair + 1 < head.length; pair += 2) {
        const from = Number(first[1]) + head[pair + 1];
        const to = pair + 3 < head.length ? Number(first[1]) + head[pair + 3] : packed.length;
        objects.set(head[pair], { number: head[pair], start: -1, end: -1, body: packed.slice(from, to) });
      }
    }

    /** The object a `/5 0 R` names, or the token itself when it names none. */
    const resolve = (token) => {
      const reference = /^\s*(\d+)\s+0\s+R\s*$/.exec(token ?? '');
      return reference === null ? (token ?? '') : (objects.get(Number(reference[1]))?.body ?? '');
    };

    /** A font's code → character table, out of its own `ToUnicode` map. */
    const mapOf = async (font) => {
      const table = new Map();
      const at = /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(font);
      const part = at === null ? undefined : objects.get(Number(at[1]));
      const map = part === undefined ? null : await streamOf(part);
      if (map === null) {
        return table;
      }
      for (const block of map.match(/beginbfchar[\s\S]*?endbfchar/g) ?? []) {
        for (const [, code, to] of block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
          table.set(parseInt(code, 16), fromHex(to));
        }
      }
      for (const block of map.match(/beginbfrange[\s\S]*?endbfrange/g) ?? []) {
        for (const [, lo, hi, to] of block.matchAll(
          /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g
        )) {
          const first = parseInt(lo, 16);
          const base = parseInt(to, 16);
          for (let code = first; code <= parseInt(hi, 16); code += 1) {
            table.set(code, fromHex((base + code - first).toString(16).padStart(4, '0')));
          }
        }
      }
      return table;
    };

    let out = '';
    // The pages come out of `objects`, not out of `parts`: a page dictionary is usually *inside* an
    // object stream, which is why unpacking comes first here as well as there.
    for (const page of [...objects.values()].filter((part) => /\/Type\s*\/Page[^s]/.test(part.body))) {
      const fonts = new Map();
      const resources = resolve(/\/Resources\s*(<<[\s\S]*?>>|\d+\s+0\s+R)/.exec(page.body)?.[1]);
      const dictionary = resolve(/\/Font\s*(<<[\s\S]*?>>|\d+\s+0\s+R)/.exec(resources)?.[1]);
      for (const [, name, reference] of dictionary.matchAll(/(\/F\d+)\s+(\d+\s+0\s+R)/g)) {
        fonts.set(name, await mapOf(resolve(reference)));
      }
      const contents = /\/Contents\s*(\d+\s+0\s+R|\[[\s\S]*?\])/.exec(page.body)?.[1] ?? '';
      for (const reference of contents.match(/\d+\s+0\s+R/g) ?? []) {
        const part = objects.get(Number(reference.split(/\s/)[0]));
        const text = part === undefined ? null : await streamOf(part);
        if (text === null) {
          continue;
        }
        // The font a run is set in, and the runs themselves, in the order the page writes them.
        let chars = new Map();
        for (const match of text.matchAll(
          /(\/F\d+)\s+[\d.]+\s+Tf|(\[[^\]]*\]|\([^)]*\)|<[0-9A-Fa-f\s]*>)\s*(?:TJ|Tj)/g
        )) {
          if (match[1] !== undefined) {
            chars = fonts.get(match[1]) ?? chars;
            continue;
          }
          const argument = match[2] ?? '';
          for (const [, hex] of argument.matchAll(/<([0-9A-Fa-f\s]+)>/g)) {
            for (const code of hex.replace(/\s+/g, '').match(/..../g) ?? []) {
              out += chars.get(parseInt(code, 16)) ?? '';
            }
          }
          for (const [, plain] of argument.matchAll(/\(((?:\\.|[^()\\])*)\)/g)) {
            for (const byte of new TextEncoder().encode(plain.replace(/\\(.)/g, '$1'))) {
              out += chars.get(byte) ?? '';
            }
          }
        }
      }
    }
    return out;
  };

  /** A `ToUnicode` map's target, which is written as hex of UTF-16 code units (`utf-16be`). */
  const fromHex = (hex) =>
    new TextDecoder('utf-16be').decode(
      Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16))
    );

  return {
    prose,
    scroller,
    blocks,
    textNodesIn,
    raw,
    load,
    openWorkspace,
    restoreWorkspace,
    key,
    click,
    caretRect,
    rectOf,
    styles,
    gaps,
    emptyLines,
    report,
    app,
    sleep,
    layout,
    useLayout,
    pdfText,
    pdfFonts,
    pdfContent
  };
})();
'helpers installed';
