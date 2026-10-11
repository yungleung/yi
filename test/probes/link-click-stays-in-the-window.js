/**
 * A ⌘-click on a link asks the app to open it, and does not take the window away.
 *
 * A plain click on a link is not this: it places the caret, which is the editor's own reading
 * (`click_routing.ts: routeLinkClick` asks for ⌘ or Ctrl). A ⌘-click asks the system to open the
 * URL, and then the system's browser comes to the front — which costs every probe after it the
 * front a page needs for its frames (`test/README.md`, "the app's window has to be in front";
 * measured there: four frame-dependent probes failing at the five-second line behind a browser,
 * and passing again once the app was in front). The harness takes the opener's system hand away
 * before every probe and keeps what the app asked for in `window.__probeOpenedUrls`.
 *
 * This holds that seam, because it is the difference between a sweep that measures the app and one
 * that measures an occluded page: the gesture still has to reach the app's own routing, the app still
 * has to ask for the URL, and the page has to still be the one in front.
 *
 * @covers src/ui/markdown/click_routing.ts, src/ui/markdown/markdown_editor.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });

  await t.load('See [a link](https://example.com/probe) here.\n');
  await t.sleep(300);
  check(
    'the page is the one in front when the probe starts',
    document.visibilityState === 'visible',
    document.visibilityState
  );
  const link = t.prose().querySelector('a[href="https://example.com/probe"]');
  check('the link is rendered', link !== null, Boolean(link));
  if (link) {
    link.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true })
    );
    await t.sleep(400);
  }
  const asked = (window.__probeOpenedUrls ?? []).map((entry) => entry.body);
  check(
    'the ⌘-click asks the app to open the link',
    asked.some((body) => String(body).includes('example.com/probe')),
    asked
  );
  check(
    'and the page is still the one in front',
    document.visibilityState === 'visible',
    document.visibilityState
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
