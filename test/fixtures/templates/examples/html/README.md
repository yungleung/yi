# Technical blog example

This package is a complete Bootstrap-based blog page. `template.html` places Pandoc's
`$table-of-contents$` list in a sticky sidebar and the converted note in `$body$`.

`defaults.yaml` enables a two-level contents with `toc: true` and `toc-depth: 2`. Pandoc gives every
heading a stable id and writes matching `href="#…"` links into the contents, so clicking a sidebar
entry jumps to the section without extra anchor code.

`example.md` is a short article on LLMs, AI agents and harnesses. It demonstrates the page with
ordinary headings, paragraphs, lists and a quotation.

The Bootstrap stylesheet comes from a CDN. The links to `assets/site.css` and `assets/site.js` remain
relative, so Yi copies the blog's local styling and active-section highlighting into the export
folder. With self-contained output enabled, Pandoc embeds those local assets.

`metadata.yaml` demonstrates starting frontmatter for a new post. `defaults.yaml` demonstrates
package-local Pandoc settings without overriding the template chosen in the export card.
