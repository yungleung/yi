(async () => {
  const t = window.__t;
  await t.load('# Title\n\nfirst paragraph\n\nsecond paragraph\n\n## Section\n\nafter the heading\n');
  // Blocks include their children's margins, so the paragraph-to-paragraph
  // distance has to be measured between the inner paragraphs, not the blocks.
  const paragraphs = [...t.prose().querySelectorAll('p')].map((p) => p.getBoundingClientRect());
  const heading = t.prose().querySelector('h2').getBoundingClientRect();
  return {
    paragraphGap: Math.round(paragraphs[1].top - paragraphs[0].bottom),
    blockGaps: t.gaps(),
    paragraph: t.styles('p'),
    h2: t.styles('h2'),
    headingGap: Math.round(heading.top - paragraphs[1].bottom)
  };
})()
