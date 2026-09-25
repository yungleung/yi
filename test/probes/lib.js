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
   * repository's own fixtures: it makes one with the app's own commands (under
   * `/private/tmp`, on the platform these probes run on), points the app at it with this,
   * and removes it when it is done.
   */
  const openWorkspace = async (path) => {
    const previous = await window.__TAURI_INTERNALS__.invoke('get_config');
    const cfg = {
      ...previous,
      workspace: path,
      config_version: await window.__TAURI_INTERNALS__.invoke('get_current_config_version')
    };
    await window.__TAURI_INTERNALS__.invoke('set_config', { cfg });
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

  /** Clicks a point inside an element, which is how the editor places carets. */
  const click = async (element, ratio = 0.99, dy = 0.5) => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: rect.left + rect.width * ratio,
        clientY: rect.top + rect.height * dy
      })
    );
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
    sleep
  };
})();
'helpers installed';
