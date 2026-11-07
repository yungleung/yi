/**
 * Latest-request-wins lifecycle for the public Documentation tab.
 *
 * The page can request several language fragments in quick succession. Only the response whose
 * token still matches the newest request may render, and only that request owns the busy state.
 */

/**
 * Creates a reusable asynchronous loader with injected fetch/render boundaries.
 *
 * Example: an English request that resolves after a newer Simplified Chinese request is ignored,
 * so the Chinese article remains on screen.
 */
export function createDocumentationLoader({
  fetchHtml,
  renderHtml,
  renderError,
  begin = () => {},
  finish = () => {}
}) {
  let newestRequest = 0;
  let currentLanguage = null;

  async function load(language) {
    if (language === currentLanguage) return true;

    const request = ++newestRequest;
    begin();
    try {
      const html = await fetchHtml(language);
      if (request !== newestRequest) return false;
      await renderHtml(html, language);
      if (request !== newestRequest) return false;
      currentLanguage = language;
      return true;
    } catch {
      if (request !== newestRequest) return false;
      await renderError(language);
      currentLanguage = null;
      return false;
    } finally {
      if (request === newestRequest) finish();
    }
  }

  return {
    load,
    current: () => currentLanguage
  };
}
