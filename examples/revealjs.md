---
title: From Notes to a Presentation
subtitle: A Reveal.js example for Yi
author: Yi Documentation
date: 2026-10-30
lang: en
theme: black
transition: slide
background-transition: fade
slide-level: 2
incremental: false
controls: true
progress: true
history: true
center: true
---

# Why presentations?

## Markdown all the way down

Yi keeps the source as ordinary Markdown. Frontmatter controls the deck, while level-one
headings become sections and level-two headings become slides.

- One source for the note and the talk
- Normal Markdown tables, lists, code and mathematics
- Speaker notes that stay in the same document

::: notes
Explain that the presentation is not a separate export project: it is the same Markdown with
presentation metadata.
:::

## Pictures can be local or remote

![A web picture](https://placehold.co/600x240/png)

By default, Yi downloads pictures into `images/` and Reveal.js into `js/dist/`. The export card
can keep either family remote for a particular export.

## Markdown features still work

Inline math $e^{i\pi}+1=0$ and a citation [@example2024] survive the export.

| Feature | In this deck |
| --- | --- |
| Sections | level-one headings |
| Slides | level-two headings |
| Speaker notes | `::: notes` |

::: {.callout .callout-note}
The same callouts work in notes, articles and presentations.
:::

## Code belongs on slides

```python
def calibrated_mean(samples, calibration):
    corrected = [value - calibration for value in samples]
    return sum(corrected) / len(corrected)
```

Use fragments and other Reveal.js attributes through Pandoc metadata and document attributes.

# Working with the export

## Local bundle by default

The exported folder contains:

```text
presentation/
  presentation.html
  images/
  js/dist/
```

The local bundle works without a remote Reveal.js or picture server.

::: notes
The two export-card switches are independent. Turning on one does not turn on the other.
:::

## Choose intentionally

- Keep everything local for an offline handout.
- Allow remote Reveal.js files when the deck will always have network access.
- Allow remote pictures when their URLs are stable and you do not need a portable folder.
