/**
 * The webview reads the catalogues: the components the app builds draw their words in the language
 * the app is speaking, and the rule that picks a language out of a system locale is the one both
 * readers share.
 *
 * The *menu* cannot be read from here — it is a native tree built in Rust before this page exists
 * (`src-tauri/src/menu/build.rs`), and `src-tauri/src/i18n.rs` has its own tests for the strings it
 * reads. What this holds is the other half: that a component built under a language really shows
 * that language, so a translated catalogue is not a file nobody reads.
 *
 * @covers src/services/i18n.ts, src/ui/toolbar/index.ts, src/ui/document_status.ts
 */
(async () => {
  const t = window.__t;
  const i18n = await t.app('/src/services/i18n.ts');
  const { LinkToolbar } = await t.app('/src/ui/toolbar/index.ts');
  const { ImageToolbar } = await t.app('/src/ui/toolbar/index.ts');
  const { FormattingToolbar } = await t.app('/src/ui/toolbar/index.ts');
  const { ListToolbar } = await t.app('/src/ui/toolbar/index.ts');
  const { DocumentStatus } = await t.app('/src/ui/document_status.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const same = (name, actual, expected) =>
    check(name, JSON.stringify(actual) === JSON.stringify(expected), { actual, expected });
  const was = i18n.language();
  /** The label a freshly built component shows, under `code`. */
  const labelUnder = (code, build) => {
    i18n.setLanguage(code);
    const element = build().element.querySelector('button') ?? build().element;
    return element.getAttribute('aria-label') ?? element.textContent;
  };
  /** Every tool label a toolbar shows, under `code`. */
  const labelsUnder = (code, build) => {
    i18n.setLanguage(code);
    return [...build().element.querySelectorAll('button')].map(
      (button) => button.getAttribute('aria-label')
    );
  };

  try {
    check(
      'the window is in the language its own rule asks for',
      ['en', 'ja', 'zh-Hans', 'zh-Hant', 'de', 'fr', 'es', 'pt'].includes(document.documentElement.lang),
      { lang: document.documentElement.lang, catalogued: i18n.language() }
    );
    same(
      'a link button built under Japanese says so',
      labelUnder('ja', () => new LinkToolbar()),
      'リンク'
    );
    same(
      'an image button built under German says so',
      labelUnder('de', () => new ImageToolbar()),
      'Bild'
    );
    // Three toolbars whose specs are written as constants of their own module: a label read once,
    // when the module loads, is a label that never changes language.
    same(
      'the formatting tools are built under the language in hand',
      labelsUnder('ja', () => new FormattingToolbar()),
      ['太字', '斜体', '取り消し線', 'インラインコード']
    );
    same(
      'and so are the list tools',
      labelsUnder('zh-Hant', () => new ListToolbar()),
      ['有序清單', '項目符號清單', '待辦清單', '增加清單縮排']
    );
    same(
      'and a status label under Simplified Chinese says so',
      (() => {
        i18n.setLanguage('zh-Hans');
        return i18n.t('status.saved');
      })(),
      '已保存'
    );
    same(
      'a system locale picks the same language the menu side picks',
      ['de-DE', 'zh-TW', 'zh-CN', 'ko-KR'].map((locale) => i18n.matchLocale(locale)),
      ['de', 'zh-Hant', 'zh-Hans', 'en']
    );
    same(
      'a string with parameters puts them in',
      (() => {
        i18n.setLanguage('en');
        return i18n.t('toolbar.tableSize', { columns: 3, rows: 2 });
      })(),
      '3 columns by 2 rows'
    );
    same('and a key nothing wrote answers itself', i18n.t('no.such.key'), 'no.such.key');
  } finally {
    i18n.setLanguage(was);
  }
  return { checks, failed: checks.filter((item) => !item.pass).map((item) => item.name) };
})()
