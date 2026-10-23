document.documentElement.dataset.yiTemplate = 'technical-blog';

const toc = document.querySelector('#TOC');

if (toc) {
  const links = [...toc.querySelectorAll('a[href^="#"]')];
  const headings = links
    .map((link) => document.getElementById(decodeURIComponent(link.hash.slice(1))))
    .filter((heading) => heading !== null);

  const markCurrent = (id) => {
    for (const link of links) {
      const current = link.hash === `#${encodeURIComponent(id)}` || link.hash === `#${id}`;
      link.classList.toggle('is-active', current);
      if (current) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  };

  for (const link of links) {
    link.addEventListener('click', () => markCurrent(decodeURIComponent(link.hash.slice(1))));
  }

  if ('IntersectionObserver' in window && headings.length > 0) {
    const visible = new Set();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }

        const firstVisible = headings.find((heading) => visible.has(heading.id));
        if (firstVisible) markCurrent(firstVisible.id);
      },
      { rootMargin: '-12% 0px -68% 0px', threshold: 0 }
    );

    for (const heading of headings) observer.observe(heading);
  }

  if (location.hash) markCurrent(decodeURIComponent(location.hash.slice(1)));
}
