# Yi GitHub Pages site

## Purpose

Create a public project site at `https://yungleung.github.io/yi/` that explains Yi to
writers, note-takers and researchers. The site introduces what Yi is, shows the
desktop application, presents the features used for daily notes, personal knowledge
bases and long-form writing, and provides direct entry points to the shipped template
examples and the full documentation.

The site is English by default and supports English and Simplified Chinese.

## Success criteria

- A public repository can deploy the site through GitHub Actions to the project Pages
  URL without changing the Tauri or Vite application entrypoints.
- The landing page identifies Yi and explains its purpose without requiring prior
  knowledge of Markdown editors or Pandoc.
- Visitors can distinguish the three use cases: daily notes, personal knowledge base
  and writing.
- At least one real screenshot of the running desktop application appears in the hero
  and additional real screenshots support the feature story.
- A Templates tab lists every shipped example package and links to its GitHub folder.
- A Documentation tab displays the current bundled Documentation as HTML.
- The Documentation tab has a sidebar table of contents generated from its headings.
- English and Simplified Chinese switch together across navigation, landing content,
  template descriptions, documentation and TOC.
- The site is responsive, keyboard-accessible and free of runtime CDN or tracker
  dependencies.

## Non-goals

- Hosting the Tauri application in the browser.
- Shipping downloadable installers that do not exist.
- Adding a blog, newsletter, comments, analytics or account system.
- Maintaining a second copy of the documentation prose.
- Translating the public site into every language supported by the application.

## Repository layout

The site stays independent of the application entrypoint:

```text
site/
  index.html             page shell and bilingual landing content
  styles.css             public-site design and responsive layouts
  app.js                 language, tabs, documentation loading and TOC behaviour
  assets/
    icon.png             application icon
    screenshots/         real screenshots captured from Yi
scripts/build-site.mjs   copies the site and generates documentation fragments
.github/workflows/pages.yml
                         builds and deploys the Pages artifact
_site/                    generated Pages artifact, ignored by Git
```

The existing root `index.html`, `settings.html`, Vite configuration and Tauri
configuration remain unchanged.

## Architecture

The public site is a static-site capability with two boundaries:

1. `site/` owns presentation, browser behaviour and public-site content.
2. `scripts/build-site.mjs` owns the transformation from authoritative Markdown
   documentation to browser-ready HTML.

The source of truth for documentation remains `src/ui/documentation/en.md` and
`src/ui/documentation/zh-Hans.md`. The build does not edit or duplicate those files.

The page shell uses relative URLs (`./assets/...`, `./documentation/...`) so the same
artifact works at `/yi/` and from a local static preview.

`package.json` gains `site:build` and `site:preview` scripts. These are public-site
commands and do not replace the application's existing `dev`, `build`, `tauri` or test
scripts.

## Build flow

`npm run site:build` performs these steps:

1. Remove and recreate `_site/`, the generated Pages artifact.
2. Copy the contents of `site/` into `_site/`.
3. Parse the English and Simplified Chinese Documentation Markdown.
4. Convert frontmatter, headings, tables, lists, block quotes, code blocks, links and
   inline formatting to HTML.
5. Give every heading a stable ID and generate a nested TOC data structure from the
   heading levels.
6. Write `_site/documentation/en.html` and
   `_site/documentation/zh-Hans.html`.
7. Fail with a non-zero exit status if a required source file is missing or a document
   produces no headings.

The build uses the repository's existing unified/remark parser stack plus the minimum
additional render plugins needed by Documentation. It does not require Pandoc.

## Page structure

### Header

The header contains:

- Yi's application icon and wordmark;
- links to the feature story, Templates and Documentation;
- an English / 简体中文 switch;
- a GitHub repository link.

Language is stored in `localStorage` when available. Without stored preference, the
site opens in English. Switching language updates visible copy, document title,
metadata description, tab labels, template descriptions and the loaded documentation.

### Hero

The hero uses a warm editorial canvas, large serif display type and a real application
screenshot. It states that Yi is a local-first Markdown writing environment and that
notes remain ordinary files. Primary actions open the templates section and the GitHub
repository.

### Feature story

Three sections organize shipped features by the reader's purpose:

- **Daily notes:** quick note creation, workspace tree, autosave, session stack,
  search, light/dark/automatic themes and long-document performance.
- **Personal knowledge base:** wikilinks, cross-references, frontmatter, metadata,
  citations, bibliography files and navigable targets.
- **Writing and publishing:** inline Markdown editing, KaTeX mathematics, callouts,
  theorem blocks, footnotes and export to Word, ODT, LaTeX, HTML, EPUB, PDF, Reveal.js
  and Beamer with template packages.

Each section combines concise copy with a real screenshot or an honest illustrative
UI detail derived from the application. It must not imply a feature the current build
does not ship.

### Templates tab

The Templates tab contains one card for every shipped example:

- HTML
- LaTeX
- PDF
- Rho Class
- Legrand Orange Book
- EPUB
- Word
- OpenDocument

Each card describes what the package demonstrates and links to its folder under
`https://github.com/yungleung/yi/tree/main/examples/templates/`. A final link points
to the template examples index.

### Documentation tab

The Documentation tab loads the generated HTML fragment for the active language.

Desktop layout:

- a sticky sidebar labeled **On this page** / **本页目录**;
- an article column with readable line length;
- active TOC link updates as headings enter the viewport;
- selecting a TOC link scrolls to the heading within the tab.

Mobile layout:

- the TOC becomes a compact expandable block above the article;
- opening the tab preserves the selected language;
- the article remains horizontally contained, with code blocks scrolling internally.

Documentation links keep their destinations. External links open normally; in-document
links resolve inside the generated fragment. The landing page remains readable when
JavaScript fails. A `<noscript>` notice links directly to the generated English and
Simplified Chinese documentation pages because tab switching itself needs JavaScript.

## Interaction and accessibility

- Tabs follow the WAI-ARIA tabs pattern with `tablist`, `tab`, `tabpanel`,
  `aria-selected`, roving `tabindex`, ArrowLeft/ArrowRight and Home/End support.
- The language switch has an explicit accessible label and pressed state.
- Keyboard focus is visible on all links, buttons and TOC entries.
- Screenshots have descriptive alternative text in both languages.
- Motion respects `prefers-reduced-motion`.
- Colour contrast meets WCAG AA for body text and controls.
- The page has a skip link, semantic landmarks, one `h1`, and ordered heading levels.

## Visual direction

The visual language combines Typora's editorial minimalism with Zettlr's explicit
knowledge-work story. It uses:

- warm paper and near-black ink as the base palette;
- one restrained accent colour for actions and active states;
- interchangeable serif display typography and highly legible sans-serif UI text;
- generous margins, fine rules and restrained shadows;
- large application screenshots rather than generic stock imagery;
- subtle transitions only where they clarify tab or menu state.

No Typora or Zettlr logos, illustrations, layouts or copy are reused.

## Error handling

- If a documentation fragment fails to load, the tab shows a concise bilingual error
  with a direct GitHub documentation link.
- Unknown or missing stored language falls back to English.
- Missing screenshots fail the site build rather than publishing a broken image.
- Invalid tabs or missing target panels leave the page on the current valid tab.
- TOC generation ignores headings below level three to keep the sidebar usable.

## Deployment

`.github/workflows/pages.yml` runs on pushes to `main` and manual dispatch.

The workflow:

1. checks out the repository;
2. installs the locked Node dependencies;
3. runs `npm run site:build`;
4. uploads `_site/` with `actions/upload-pages-artifact`;
5. deploys with `actions/deploy-pages`.

The workflow has `contents: read`, `pages: write` and `id-token: write` permissions and
uses the `github-pages` environment.

Repository settings must select **GitHub Actions** as the Pages source after the first
workflow is pushed.

## Testing

### Node checks

Add `test/checks/check-site.mjs`, which verifies:

- the expected site files exist;
- both languages provide every required public-site string;
- all tabs, panels and ARIA wiring are present;
- all eight template cards link to the correct GitHub folders;
- the required hero and feature screenshots exist;
- Pages URLs are relative and do not assume a custom domain;
- the workflow deploys the generated artifact from `main`.

Add `test/checks/check-site-docs.mjs`, which builds the documentation and verifies:

- both generated fragments exist;
- they contain the expected top-level chapters;
- every heading has a unique ID;
- the generated TOC includes the expected top-level entries;
- documentation prose comes from the current bundled Markdown.

### Build verification

- Run `npm run site:build` and ensure `_site/` contains the shell, assets, screenshots
  and both documentation fragments.
- Start a local static server and inspect the page at desktop and mobile widths.
- Verify English and Simplified Chinese switching.
- Verify keyboard tab navigation and both tab panels.
- Verify TOC navigation and active-heading updates.
- Inspect missing-fragment behaviour by temporarily requesting an invalid document in
  the browser console, without committing a broken state.

### Existing project verification

Because the site adds a build script and workflow but does not alter application
behaviour, run:

- `npx tsc --noEmit`;
- `cargo test --manifest-path src-tauri/Cargo.toml`;
- `npm run check`;
- the Documentation probe, because it proves the source guide remains valid.

## Media plan

Capture two screenshots from the running application through the Tauri development
bridge:

1. the default demo document in the page layout, showing rendered Markdown, the
   workspace tree and status/toolbar chrome;
2. a feature-focused view showing cross-references, callouts, theorem blocks, or the
   template manager.

Crop browser or desktop chrome only when it is irrelevant. Preserve enough application
chrome to make the product recognizably native. Save optimized PNG or WebP files under
`site/assets/screenshots/` and record their intended alternative text in the page.
