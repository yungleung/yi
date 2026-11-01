/**
 * The image button when the clipboard is holding a *picture*: the card, the file it writes, the
 * text that points at it, and the painted result.
 *
 * This is the half of the feature that is not the link button's twin. The pixels come off the
 * clipboard as RGBA, are drawn on a canvas, and are saved as the file the reader names — into the
 * folder the settings name for images, which this probe sets to a folder of its own. The text the
 * note gets is a *relative* path, and the last check is the one that matters most: the image the
 * note now names is actually *painted*, which is the asset protocol, the folder resolution and the
 * style all working together.
 *
 * The clipboard is stubbed where the app reads it (the plugin's `read_text` and its image trio,
 * over the webview's `fetch`), so the probe needs no real clipboard. Its own folder lives under
 * the home directory, because that is what the file plugin and the asset protocol are scoped to.
 *
 * @covers src/ui/image/index.ts, src/ui/image/index.ts, src/ui/image/index.ts
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const { configManager } = await t.app('/src/services/config_manager.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const same = (name, actual, expected) =>
    check(name, JSON.stringify(actual) === JSON.stringify(expected), { actual, expected });
  const home = await window.__TAURI_INTERNALS__.invoke('plugin:path|resolve_directory', {
    directory: 21
  });
  const workspace = `${home}/yi-probe-images`;

  const images = `${workspace}/images`;
  const savedPath = `${images}/a picture.png`;
  /** Two by two pixels, which is as much of a picture as a stub needs. */
  const rgba = new Uint8Array([
    255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255
  ]);
  /** Answers the app's clipboard reads: no text, and a two-by-two image. */
  const stubClipboard = () => {
    const real = window.fetch;
    window.fetch = async (input, init) => {
      const url = decodeURIComponent(
        typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
      );
      const body = (value) =>
        new Response(JSON.stringify(value), {
          status: 200,
          headers: { 'content-type': 'application/json', 'Tauri-Response': 'ok' }
        });
      if (url.includes('plugin:clipboard-manager|read_text')) {
        return new Response(JSON.stringify('no text'), {
          status: 200,
          headers: { 'content-type': 'application/json', 'Tauri-Response': 'error' }
        });
      }
      if (url.includes('plugin:clipboard-manager|read_image')) {
        return body(1);
      }
      if (url.includes('plugin:image|size')) {
        return body({ width: 2, height: 2 });
      }
      if (url.includes('plugin:image|rgba')) {
        return new Response(rgba, {
          status: 200,
          headers: { 'content-type': 'application/octet-stream', 'Tauri-Response': 'ok' }
        });
      }
      return await real.call(window, input, init);
    };
    return () => {
      window.fetch = real;
    };
  };
  /** Puts the caret at an offset in a text node, the way a click does. */
  const place = async (text, offset) => {
    const range = document.createRange();
    range.setStart(text, offset);
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    text.parentElement.dispatchEvent(
      new MouseEvent('click', { bubbles: true, clientX: rect.left + 1, clientY: rect.top + 2 })
    );
    await t.sleep(150);
  };
  /** Clicks past the end of the note's own line, which takes the caret out of the image. */
  const scrollerClickPastTheLine = () => {
    const node = t.textNodesIn(t.blocks()[0]).find((leaf) => leaf.data.includes('Note body.'));
    if (!node) {
      return;
    }
    const range = document.createRange();
    range.setStart(node, node.data.length);
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    node.parentElement.dispatchEvent(
      new MouseEvent('click', { bubbles: true, clientX: rect.left + 1, clientY: rect.top + 2 })
    );
  };
  let previous = null;
  try {
    try {
      await files.deleteEntry(workspace);
    } catch {
      // A leftover from a probe that was cut off.
    }
    await files.createEntry(home, 'yi-probe-images', false);
    previous = await configManager.update({ image_folder: images });

    const restored = stubClipboard();
    await t.load('Note body.\n');
    await place(t.textNodesIn(t.blocks()[0])[0], 10);

    const button = [...document.querySelectorAll('button')].find(
      (element) => element.getAttribute('aria-label') === 'Image'
    );
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    button.click();
    await t.sleep(400);

    const card = document.querySelector('[data-image-dialog]');
    const preview = card?.querySelector('[data-image-preview]');
    const field = card?.querySelector('[data-image-name]');
    check(
      'a picture on the clipboard opens the card, with the picture drawn in it',
      card !== null &&
        !card.classList.contains('hidden') &&
        preview?.src.startsWith('blob:') === true &&
        preview.naturalWidth === 2,
      { open: card ? !card.classList.contains('hidden') : null, preview: preview?.src?.slice(0, 12) ?? null, width: preview?.naturalWidth ?? null }
    );
    check(
      'and the name it starts from is the app stamp, as a PNG, with its stem ready to type over',
      /^\d{14}\.png$/.test(field?.value ?? '') &&
        field.selectionStart === 0 &&
        field.selectionEnd === (field.value ?? '').length - 4,
      { value: field?.value ?? null, start: field?.selectionStart, end: field?.selectionEnd }
    );
    same(
      'the card says where the file will go',
      card.querySelector('[data-image-where]')?.textContent ?? null,
      `Saved in ${images}`
    );

    field.value = 'a picture';
    card.querySelector('[data-image-save]').click();
    await t.sleep(700);
    restored();

    const raw = await window.__TAURI_INTERNALS__.invoke('plugin:fs|read_file', { path: savedPath });
    const bytes = raw instanceof ArrayBuffer ? new Uint8Array(raw) : Uint8Array.from(raw);
    check(
      'the picture is saved where the settings said, under the name given, as a PNG',
      bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47,
      { length: bytes.length, magic: [...bytes.slice(0, 4)] }
    );
    same(
      'and the note names it, relative to the folder it is read from, at the caret',
      await t.raw(),
      'Note body.![](<a picture.png>)\n'
    );
    // The caret sits inside the image's alt, so the node shows its own source: the reader leaves
    // it (a click past the end of the line) and the image is rendered again.
    scrollerClickPastTheLine();
    await t.sleep(500);
    const painted = t.prose().querySelector('img');
    check(
      'and the note paints it: the path resolves and the file is served to the page',
      painted !== null && painted.naturalWidth === 2 && painted.naturalHeight === 2,
      {
        src: painted?.getAttribute('src')?.slice(0, 60) ?? null,
        width: painted?.naturalWidth ?? null,
        height: painted?.naturalHeight ?? null
      }
    );
  } finally {
    if (previous !== null) {
      await configManager.save(previous);
    }
    try {
      await files.deleteEntry(workspace);
    } catch {
      // Already gone.
    }
  }
  return { checks, failed: checks.filter((item) => !item.pass).map((item) => item.name) };
})()
