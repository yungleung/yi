/**
 * Proves the public Documentation loader only renders the latest language request.
 *
 * Example: a slow English fetch that resolves after a newer Simplified Chinese fetch must
 * not replace the Chinese article.
 */
import { createDocumentationLoader } from '../../site/docs_loader.js';

const failures = [];
const check = (name, pass) => {
  if (!pass) failures.push(name);
};

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function harness() {
  const renders = [];
  const errors = [];
  const busy = [];
  const fetches = [];
  const loader = createDocumentationLoader({
    fetchHtml(language) {
      const request = deferred();
      fetches.push({ language, request });
      return request.promise;
    },
    renderHtml(html, language) {
      renders.push({ html, language });
    },
    renderError(language) {
      errors.push(language);
    },
    begin() {
      busy.push('start');
    },
    finish() {
      busy.push('end');
    }
  });
  return { loader, renders, errors, busy, fetches };
}

{
  const { loader, renders, errors, busy, fetches } = harness();
  const loading = loader.load('en');
  fetches[0].request.resolve('<article>English</article>');
  check('a successful load resolves', (await loading) === true);
  check('the successful fragment is rendered', renders[0]?.language === 'en');
  check('the successful fragment is the latest requested content', renders[0]?.html.includes('English'));
  check('the current language is recorded', loader.current() === 'en');
  check('the failure renderer is not called', errors.length === 0);
  check('busy state starts and finishes once', busy.join(',') === 'start,end');
  await loader.load('en');
  check('the current language is not fetched twice', fetches.length === 1);
}

{
  const { loader, renders, errors, busy, fetches } = harness();
  const loading = loader.load('zh-Hans');
  fetches[0].request.reject(new Error('offline'));
  check('a failed load resolves false', (await loading) === false);
  check('the localized error renderer receives the language', errors[0] === 'zh-Hans');
  check('a failed load renders no article', renders.length === 0);
  check('the current language clears after failure', loader.current() === null);
  check('busy state clears after failure', busy.join(',') === 'start,end');
}

{
  const { loader, renders, errors, fetches } = harness();
  const english = loader.load('en');
  const chinese = loader.load('zh-Hans');
  fetches[1].request.resolve('<article>Chinese</article>');
  check('the newer request resolves', (await chinese) === true);
  fetches[0].request.resolve('<article>English</article>');
  check('the stale request resolves false', (await english) === false);
  check('only the latest language is rendered', renders.length === 1 && renders[0].language === 'zh-Hans');
  check('the current language follows the latest request', loader.current() === 'zh-Hans');
  check('a stale success does not render an error', errors.length === 0);
}

{
  const { loader, renders, errors, fetches } = harness();
  const english = loader.load('en');
  const chinese = loader.load('zh-Hans');
  fetches[1].request.resolve('<article>Chinese</article>');
  await chinese;
  fetches[0].request.reject(new Error('stale failure'));
  check('a stale failure resolves false', (await english) === false);
  check('a stale failure does not replace the article', renders.length === 1 && renders[0].language === 'zh-Hans');
  check('a stale failure does not render an error', errors.length === 0);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('site documentation loader: latest language wins');
