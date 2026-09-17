/** The delimiter row's alignment reaches the rendered cells. */
(async () => {
  const t = window.__t;
  await t.load('| A | B |\n| :--- | ---: |\n| 1 | 2 |\n');
  const align = (selector) => {
    const element = t.prose().querySelector(selector);
    return element ? getComputedStyle(element).textAlign : null;
  };
  return {
    headerLeft: align('[data-table-cell="0:0"]'),
    headerRight: align('[data-table-cell="0:1"]'),
    bodyLeft: align('[data-table-cell="1:0"]'),
    bodyRight: align('[data-table-cell="1:1"]')
  };
})()
