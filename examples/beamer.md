---
title: From Notes to a Presentation
subtitle: A Beamer example for Yi
author: Yi Documentation
date: 2026-10-30
lang: en
institute: Yi
theme: Madrid
colortheme: seahorse
fonttheme: default
aspectratio: 169
navigation: horizontal
section-titles: true
slide-level: 2
---

# Why presentations?

## Markdown all the way down

Beamer uses the same Markdown structure as every other export:

- level-one headings are sections;
- level-two headings are frames;
- ordinary Markdown remains ordinary Markdown.

## Mathematics

Inline mathematics $e^{i\pi}+1=0$ and display mathematics share the note's TeX:

$$
\hat{y} = \beta_0 + \beta_1 x + \epsilon
$$

## Blocks and callouts

::: {.callout .callout-note title="Note"}
Yi callouts remain semantic Markdown and can be styled or filtered by a presentation workflow.
:::

## Tables

| Feature | Beamer result |
| --- | --- |
| Level-one heading | section |
| Level-two heading | frame |
| `theme` metadata | Beamer theme |
| `aspectratio` metadata | slide geometry |

## Code

```python
def calibrated_mean(samples, calibration):
    corrected = [value - calibration for value in samples]
    return sum(corrected) / len(corrected)
```

# Frontmatter controls the design

## Presentation metadata

The design comes from the note:

```yaml
theme: Madrid
colortheme: seahorse
fonttheme: default
aspectratio: 169
navigation: horizontal
section-titles: true
```

Beamer exports one PDF and does not use an export template package.

## Citations

Cite works with the bibliography selected in Yi:

> Citations use Pandoc and the bibliography selected in Settings → Citation [@example2024].
