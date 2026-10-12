/**
 * A picture a note names by a path with spaces in it: the file beside the note, and the file in
 * the folder the settings name for images.
 *
 * A markdown destination may not hold a space unless it is wrapped in `<…>`, so a line written
 * the way a reader writes a path — `![shot](my shot.png)` — used to be no image at all: the note
 * showed the markdown, and the file it names was never asked for. The parser repairs that line
 * (`syntax/image_paths.ts`); this probe holds the whole way from there — the repaired line, the
 * two folders a relative path is resolved against (the note's own first, the settings' next, and
 * a first candidate that is not there falls through to the second), the asset protocol and the
 * pixels on screen. The same path *copied* out of something else may spell the space the way a
 * browser spells it, `%20`, and that is still the file it names (`services/workspace_folders.ts`),
 * which is the last case here.
 *
 * The probe makes its own folder under the home directory — what the file plugin and the asset
 * protocol are scoped to — removes it again, and puts the image-folder setting back. It points the
 * app at no workspace and drives no tree: a note's own folder comes from the session showing the
 * note, so the probe is safe to run in a sweep.
 *
 * @covers src/ui/markdown/syntax/image_paths.ts, src/ui/image/image_urls.ts,
 *   src/services/workspace_folders.ts, src/ui/markdown/nodes/image.ts
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session.ts');
  const { configManager } = await t.app('/src/services/config_manager.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const home = await window.__TAURI_INTERNALS__.invoke('plugin:path|resolve_directory', {
    directory: 21
  });
  const workspace = `${home}/yi-probe-image-path`;
  const beside = `${workspace}/beside`;
  const notes = `${workspace}/notes`;
  const images = `${workspace}/images`;
  const png = Uint8Array.from(
    atob(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP4z8AARAwQCgAf7gP9i18U1AAAAABJRU5ErkJggg=='
    ),
    (character) => character.charCodeAt(0)
  );
  const writeImage = (path) =>
    window.__TAURI_INTERNALS__.invoke('plugin:fs|write_file', png, {
      headers: { path: encodeURIComponent(path) }
    });
  /** What the note draws for one image: the picture's own size, and where it was read from. */
  const painted = (alt) => {
    const image = t.prose().querySelector(`img[alt="${alt}"]`);
    const source = decodeURIComponent(image?.getAttribute('src') ?? '');
    return {
      width: image?.naturalWidth ?? 0,
      // The probe folder's own name is dropped, so the check reads the folder the file came from
      // rather than the whole URL the page asked for.
      from: image ? source.split(`${workspace}/`).pop() : null
    };
  };
  /** Whether the note is showing the markdown it was written as instead of a picture. */
  const showsTheMarkdown = () => (t.prose().textContent ?? '').includes('![');
  /**
   * The picture once the page has it. The candidates are tried one at a time, each by the error of
   * the one before it, so a picture from the *second* (or a later) candidate arrives some frames
   * after the note does: waiting for the pixels beats waiting a fixed time and hoping.
   */
  const paintedEventually = async (alt) => {
    for (let attempt = 0; attempt < 25 && painted(alt).width === 0; attempt += 1) {
      await t.sleep(100);
    }
    return painted(alt);
  };

  let previousConfig = null;
  try {
    try {
      await files.deleteEntry(workspace);
    } catch {
      // A leftover from a probe that was cut off; it is about to be replaced.
    }
    await files.createEntry(home, 'yi-probe-image-path', false);
    await files.createEntry(workspace, 'beside', false);
    await files.createEntry(workspace, 'notes', false);
    await files.createEntry(workspace, 'images', false);
    await writeImage(`${beside}/my shot.png`);
    await writeImage(`${beside}/plain.png`);
    await writeImage(`${images}/my shot.png`);
    await files.writeTextAtomically(
      `${beside}/note.md`,
      'A picture beside the note.\n\n![shot](my shot.png)\n\n![plain](plain.png)\n'
    );
    await files.writeTextAtomically(
      `${notes}/other.md`,
      'A picture in the folder the settings name.\n\n![shot](my shot.png)\n'
    );
    await files.writeTextAtomically(
      `${beside}/continued.md`,
      '![shot](my shot.png)\nThe paragraph carries on here.\n'
    );
    await files.writeTextAtomically(
      `${beside}/encoded.md`,
      'A path written the way a browser spells it.\n\n![shot](my%20shot.png)\n'
    );
    previousConfig = await configManager.update({ image_folder: images });
    // The setting reaches the page through the app's own announcement (`config_changed` →
    // `main.ts`), so wait for the folder the images are read with to *be* the one named here: a
    // run that is cut off leaves its own announcement in flight, and a probe that measured
    // through that would be reading a folder this run has already removed.
    const urls = await t.app('/src/ui/image/image_urls.ts');
    for (let attempt = 0; attempt < 25 && urls.imageBases().images !== images; attempt += 1) {
      await t.sleep(100);
    }
    check('the app reads images from the folder the probe named', urls.imageBases().images === images, urls.imageBases());

    // 1. Beside the note: the file's own name, spaces and all.
    await session.documentSession.openPath(`${beside}/note.md`);
    await t.sleep(400);
    const besideTheNote = await paintedEventually('shot');
    check('a path with spaces beside the note shows the picture', besideTheNote.width === 2, besideTheNote);
    check('and it was read from the note’s own folder', besideTheNote.from === 'beside/my shot.png', besideTheNote);
    check('and the note is not showing that line as markdown', !showsTheMarkdown(), t.prose().textContent?.slice(0, 60));
    const withoutSpaces = await paintedEventually('plain');
    check('a path without spaces beside it still shows its picture', withoutSpaces.width === 2, withoutSpaces);

    // 2. The shape most of a reading library has: the image is the paragraph's first line and the
    //    prose carries on under it, so the picture and the words are in one paragraph. The click
    //    past the words is what shows the picture: a note opens with the caret at its start, and a
    //    node the caret is in shows its own markdown (`nodes/revealable_node.ts`).
    await session.documentSession.openPath(`${beside}/continued.md`);
    await t.sleep(400);
    await t.click(t.prose().querySelector('.markdown-block'), 0.99, 0.99);
    const withProse = await paintedEventually('shot');
    check('a picture with prose under it still shows', withProse.width === 2, withProse);
    check(
      'and the words under it are still the words',
      (t.prose().textContent ?? '').includes('The paragraph carries on here.'),
      t.prose().textContent?.slice(0, 60)
    );

    // 3. The same path copied out of something else, spelling the space the way a browser does.
    await session.documentSession.openPath(`${beside}/encoded.md`);
    await t.sleep(400);
    const encoded = await paintedEventually('shot');
    check('a path written with %20 shows the picture', encoded.width === 2, encoded);
    check(
      'and it was read from the file that path resolves to',
      encoded.from === 'beside/my shot.png',
      encoded
    );

    // 4. In the folder the settings name: the note's own folder has no such file, so the second
    //    candidate is the one that answers.
    await session.documentSession.openPath(`${notes}/other.md`);
    await t.sleep(400);
    const fromTheImageFolder = await paintedEventually('shot');
    check(
      'a path with spaces in the settings’ image folder shows the picture',
      fromTheImageFolder.width === 2,
      fromTheImageFolder
    );
    check(
      'and it was read from the folder the settings name',
      fromTheImageFolder.from === 'images/my shot.png',
      fromTheImageFolder
    );
  } finally {
    if (previousConfig !== null) {
      await configManager.save(previousConfig);
    }
    try {
      await files.deleteEntry(workspace);
    } catch {
      // Nothing to clean up if the folder was never made.
    }
  }
  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
