---
reference-labels:
  table: Data table
  equation: Formula
reference-number-prefixes:
  table: "2-"
  equation: "2-"
---

# GitHub-flavored markdown demo

This paragraph has *italic*, **bold**, ***both*** text, plus `inline code` and ~~strikethrough~~.

## Task lists

- [x] Completed task
- [ ] Pending task
- [ ] Another pending task with a [link](https://example.com)
- [ ] 

## Lists and links

- Unordered list item
- Another item with an autolink: https://example.com
  - Nested item
  - 

1. Ordered list item
2. Another ordered item

## Blockquotes and code

> A blockquote with a [link](https://example.com)

```ts
function greet(name: string) {
  console.log(`Hello, ${name}`);
}
```

## Tables

| Column 1 | Column 2 | Column 3 |
| --- | --- | --- |
| Alpha | Beta | Gamma |
| Delta | Epsilon | Zeta |

See [#tbl:results] or [the results table](#tbl:results).

An ordinary table has no caption and consumes no table number. A caption-only table is numbered:

| Step | Result |
| --- | --- |
| Build | Clean |

: A caption-only table

An ID-only caption is a reference target:

| A | B |
| --- | --- |
| one | two |

: {#tbl:target}

Attributes and margin placement remain source for Pandoc and template packages:

| Name | Value |
| --- | --- |
| alpha | one |

: Results {#tbl:results .margin data-owner=demo}

## Math expressions

Inline math: $E = mc^2$ and $\int_a^b x^2 \, dx$.

Display math:

$$
\frac{d}{dx}(\sin x) = \cos x \\ \frac{d}{dx}(\cos x) = -\sin x \\
e^{i 2\pi} = 1
$$

## Equation cross-references

The display formula above is the “no environment, no ID” case: standard display math with no
equation target. See [#eq:plain] or [the first labeled formula](#eq:plain).

No environment, with an ID:

[$$
e_0 = 1
$$]{#eq:plain}

`equation` without an ID:

$$
\begin{equation}
e_1 = 1
\end{equation}
$$

`equation` with an ID:

[$$
\begin{equation}
e_2 = 1
\end{equation}
$$]{#eq:equation}

`equation*` without an ID:

$$
\begin{equation*}
e_3 = 1
\end{equation*}
$$

`equation*` with an ID:

[$$
\begin{equation*}
e_4 = 1
\end{equation*}
$$]{#eq:equation-star}

`align` without an ID:

$$
\begin{align}
a_1 &= 1\\
a_2 &= 2
\end{align}
$$

`align` with an ID:

[$$
\begin{align}
a_3 &= 1\\
a_4 &= 2
\end{align}
$$]{#eq:align}

`align*` without an ID:

$$
\begin{align*}
a_5 &= 1\\
a_6 &= 2
\end{align*}
$$

`align*` with an ID:

[$$
\begin{align*}
a_7 &= 1\\
a_8 &= 2
\end{align*}
$$]{#eq:align-star}

`aligned` without an ID:

$$
\begin{aligned}
a_9 &= 1\\
a_{10} &= 2
\end{aligned}
$$

`aligned` with an ID:

[$$
\begin{aligned}
a_{11} &= 1\\
a_{12} &= 2
\end{aligned}
$$]{#eq:aligned}

`gather` without an ID:

$$
\begin{gather}
g_1 = 1\\
g_2 = 2
\end{gather}
$$

`gather` with an ID:

[$$
\begin{gather}
g_3 = 1\\
g_4 = 2
\end{gather}
$$]{#eq:gather}

`gather*` without an ID:

$$
\begin{gather*}
g_5 = 1\\
g_6 = 2
\end{gather*}
$$

`gather*` with an ID:

[$$
\begin{gather*}
g_7 = 1\\
g_8 = 2
\end{gather*}
$$]{#eq:gather-star}

`gathered` without an ID:

$$
\begin{gathered}
g_9 = 1\\
g_{10} = 2
\end{gathered}
$$

`gathered` with an ID:

[$$
\begin{gathered}
g_{11} = 1\\
g_{12} = 2
\end{gathered}
$$]{#eq:gathered}

`alignat` without an ID:

$$
\begin{alignat}{2}
b_1 &= 1 &\quad c_1 &= 2\\
b_2 &= 3 &\quad c_2 &= 4
\end{alignat}
$$

`alignat` with an ID:

[$$
\begin{alignat}{2}
b_3 &= 1 &\quad c_3 &= 2\\
b_4 &= 3 &\quad c_4 &= 4
\end{alignat}
$$]{#eq:alignat}

`alignat*` without an ID:

$$
\begin{alignat*}{2}
b_5 &= 1 &\quad c_5 &= 2\\
b_6 &= 3 &\quad c_6 &= 4
\end{alignat*}
$$

`alignat*` with an ID:

[$$
\begin{alignat*}{2}
b_7 &= 1 &\quad c_7 &= 2\\
b_8 &= 3 &\quad c_8 &= 4
\end{alignat*}
$$]{#eq:alignat-star}

`alignedat` without an ID:

$$
\begin{alignedat}{2}
b_9 &= 1 &\quad c_9 &= 2\\
b_{10} &= 3 &\quad c_{10} &= 4
\end{alignedat}
$$

`alignedat` with an ID:

[$$
\begin{alignedat}{2}
b_{11} &= 1 &\quad c_{11} &= 2\\
b_{12} &= 3 &\quad c_{12} &= 4
\end{alignedat}
$$]{#eq:alignedat}

`split` without an ID:

$$
\begin{split}
s_1 &= 1\\
s_2 &= 2
\end{split}
$$

`split` with an ID:

[$$
\begin{split}
s_3 &= 1\\
s_4 &= 2
\end{split}
$$]{#eq:split}

## Footnotes and definition lists

Here is a sentence with a footnote.[^1]

[^1]: This is the footnote content rendered as a definition-style note.

Term one

: Definition for the first term.

Term two

: Definition for the second term that can include a [link](https://example.com).

## Images and separators

See [#fig:sample] or the [sample figure](#fig:sample).

![An unlabeled figure](https://placehold.co/200x80/png)

![A sample image](https://placehold.co/200x80/png){#fig:sample .wide}

An inline image ![a tiny inline image](https://placehold.co/40x20/png) does not advance the figure sequence.

## Citations

Pandoc-style citations: [@Abel2024], with locator [@Abel2024, p. 45],
suppressed author [-@Abel2024], and multiple [see @Abel2024; also @2014, ch. 3].
Narrative citations: according to @Abel2024, code reviews matter;
with a locator @Abel2024 [p. 33], suppressed -@Abel2024.
Keys missing from the bibliography stay raw: [@smith2020] and @jones2019.
emails like contact@example.com are not citations.
An escaped one \@literal stays literal, while [a link](https://example.com) is not a citation.

## Wikilinks

Wikilinks resolve inside the workspace: [[虚无与生发]] renders the target’s heading 1,
[[6 Bayesian Game]] resolves by name, [[20221031105857]] resolves by frontmatter id,
[[Language and Thought]] falls back to the frontmatter title,
[[虚无与生发|My Custom Title]] uses the explicit title, and [[nonexistent-note]] stays as typed.

## Heading cross-references

Jump to [automatic heading IDs](#automatic-heading-ids),
[the repeated heading](#automatic-heading-ids-1),
[custom heading attributes](#reading-methods), or
[a setext heading](#setext-heading).

### Automatic heading IDs

Pandoc derives this section’s ID from its text.

### Automatic heading IDs

This repeated title receives the suffix `-1`.

### Reading methods {#reading-methods .unnumbered data-owner=demo}

Move the caret into this heading to edit its ID, class, and key/value attribute.

Setext heading with attributes {#setext-heading .unnumbered}
===========================================================

ATX and setext headings preserve trailing Pandoc attributes.

---

This demo shows GitHub-flavored markdown features such as task lists, autolinks, tables, and fenced code blocks.
