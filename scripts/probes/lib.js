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
    await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', {
      event: 'document_opened',
      payload: markdown
    });
    await sleep(400);
  };

  const key = (name) =>
    scroller().dispatchEvent(
      new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true })
    );

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

  return {
    prose,
    scroller,
    blocks,
    textNodesIn,
    raw,
    load,
    key,
    click,
    caretRect,
    rectOf,
    styles,
    gaps,
    emptyLines,
    sleep
  };
})();
'helpers installed';
