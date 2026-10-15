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
   * What a PDF's page says, rebuilt from the file: a font's `ToUnicode` map names the character a
   * drawn code stands for, and the page's own text operators say which codes it draws — `<hex> Tj`,
   * `[<hex>] TJ` and, for characters the font holds directly, `(plain) Tj`. A code no map names is a
   * character the page cannot draw and is left out rather than guessed at, so what comes back is what
   * is *on* the page.
   *
   * The streams are read one byte to one character (`latin1`), and one that is not deflate — a font's
   * own tables are not — is skipped. This is what `export-pdf-font.js` and `export-pdf-scripts.js`
   * read a page with, and it is here because two probes need the same instrument, not because every
   * probe does.
   */
  const pdfText = async (bytes) => {
    const latin = new TextDecoder('latin1').decode(bytes);
    const streams = [];
    let index = 0;
    for (;;) {
      const at = latin.indexOf('stream', index);
      if (at < 0) {
        break;
      }
      let from = at + 'stream'.length;
      if (latin[from] === '\r') from += 1;
      if (latin[from] === '\n') from += 1;
      const end = latin.indexOf('endstream', from);
      if (end < 0) {
        break;
      }
      let stop = end;
      while (stop > from && (latin[stop - 1] === '\n' || latin[stop - 1] === '\r')) stop -= 1;
      index = end + 'endstream'.length;
      try {
        const stream = new Blob([bytes.slice(from, stop)])
          .stream()
          .pipeThrough(new DecompressionStream('deflate'));
        streams.push(new TextDecoder('latin1').decode(await new Response(stream).arrayBuffer()));
      } catch {
        // Not deflate, so nothing here reads it.
      }
    }
    const chars = new Map();
    for (const text of streams) {
      for (const block of text.match(/beginbfchar[\s\S]*?endbfchar/g) ?? []) {
        for (const [, code, to] of block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
          chars.set(parseInt(code, 16), fromHex(to));
        }
      }
      for (const block of text.match(/beginbfrange[\s\S]*?endbfrange/g) ?? []) {
        for (const [, lo, hi, to] of block.matchAll(
          /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g
        )) {
          const first = parseInt(lo, 16);
          const base = parseInt(to, 16);
          for (let code = first; code <= parseInt(hi, 16); code += 1) {
            chars.set(code, String.fromCharCode(base + code - first));
          }
        }
      }
    }
    const decode = (hex) =>
      (hex.replace(/\s+/g, '').match(/..../g) ?? [])
        .map((code) => chars.get(parseInt(code, 16)) ?? '')
        .join('');
    const drawn = (streams.find((text) => text.includes('BT')) ?? '').matchAll(
      /<([0-9A-Fa-f\s]+)>\s*Tj|\(((?:\\.|[^()\\])*)\)\s*Tj|\[([^\]]*)\]\s*TJ/g
    );
    return [...drawn]
      .map(([, hex, plain, array]) => {
        if (hex !== undefined) {
          return decode(hex);
        }
        if (plain !== undefined) {
          return plain.replace(/\\(.)/g, '$1');
        }
        return [...array.matchAll(/<([0-9A-Fa-f\s]+)>/g)].map((run) => decode(run[1])).join('');
      })
      .join('');
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
    pdfText
  };
})();
'helpers installed';
