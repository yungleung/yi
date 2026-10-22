---
title: Complete Word template example
subtitle: Every supported document element in one file
author:
  - Example Author
  - Second Author
date: 2026-10-21
abstract: |
  This example exercises the document title block and the paragraph and
  character styles Pandoc takes from reference.docx.
lang: en
keywords:
  - Word
  - DOCX
  - reference document
bibliography: references.bib
reference-section-title: References
toc: true
number-sections: true
---

# Heading level 1

This is the first paragraph after a heading, so Pandoc applies **First Paragraph**.

This is the second paragraph, so it uses **Body Text**. Inline elements include **bold**,
*italic*, ~~strikethrough~~, `inline code`, [a hyperlink](https://pandoc.org/), H₂O,
E = mc², and a footnote.[^complete]

> A block quote uses **Block Text**.
>
> Its second paragraph is part of the same quotation.

## Heading level 2

Paragraph text under heading level two.

### Heading level 3

Paragraph text under heading level three.

#### Heading level 4

Paragraph text under heading level four.

##### Heading level 5

Paragraph text under heading level five.

###### Heading level 6

Paragraph text under heading level six.

## Lists and code

A tight bullet list uses **Compact** paragraph styles:

- first bullet
- second bullet
  - nested bullet

An ordered list:

1. first item
2. second item

A task list:

- [ ] unfinished task
- [x] completed task

A fenced code block:

```python
def greet(name):
    return f"Hello, {name}!"
```

## Mathematics

Inline mathematics such as $E = mc^2$ is carried as an equation.

$$
\int_0^1 x^2\,dx = \frac{1}{3}
$$

A citation such as [@example2026] produces the bibliography entries below.

## Table with caption

| Element | Purpose |
| --- | --- |
| Table Caption | Styles the caption above the table |
| Table | Styles the table itself |
| Compact | Styles tight table-cell paragraphs |

## Figure with caption

![Caption for the example figure](example.svg)

The image and its caption exercise the figure and image-caption styles.

## Definition list

Term one

: Definition text for the first term.

Term two

: Definition text for the second term.

## Inline and block boundaries

---

This paragraph follows a thematic break and closes the example.

[^complete]: A footnote uses the **Footnote Text** style.

    A second paragraph demonstrates **Footnote Block Text** inside the same footnote.

    > A quotation inside a footnote is part of the note.
