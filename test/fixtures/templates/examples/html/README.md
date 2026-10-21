# HTML example

`template.html` is a complete Pandoc HTML template. `$body$` is where the converted note goes;
`$pagetitle$`, `$title$` and `$lang$` fill the page metadata.

The links to `assets/site.css` and `assets/site.js` stay relative. Yi copies those files into the
HTML export folder. With self-contained output enabled, Pandoc embeds them instead.

`metadata.yaml` demonstrates starting frontmatter. `defaults.yaml` demonstrates package-local Pandoc
settings without overriding the template chosen in the export card.
