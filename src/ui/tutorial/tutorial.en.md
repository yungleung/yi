---
title: Welcome to Yi
id: yi-tutorial
lang: en
---

Yi is a local-first notes app. Your notes are ordinary markdown files in a folder you choose.
There is no account and no server: what you see is the text that stays on your disk.

## Start with a workspace

A **workspace** is the folder Yi reads and writes. The tree on the left is that folder:

- click a note to open it;
- use **File → New Note** to make one;
- right-click a folder or a note for the actions that belong to it.

If you have not chosen a workspace yet, Yi offers to make one under your Documents folder. You can
switch to another folder later with **File → Open Folder…**.

## Make a note

**File → New Note** asks for a name and creates a markdown file in the workspace. The name becomes
the file name; the note can have its own `title` in frontmatter.

Every note is saved as you write. **File → Save** writes the current text again, and **Save As**
puts a copy somewhere else.

## Write in the page

Yi edits markdown as it renders. Headings, lists, tables and code look like themselves. When the
caret enters a formatted word, Yi shows the markers around it, such as `**bold**` or `*italic*`;
when the caret leaves, the page is drawn plainly again.

The toolbar has the same commands as the menu. Try selecting a word and pressing **Bold**, or use
the keyboard:

| Action | Shortcut |
| --- | --- |
| Undo | ⌘Z |
| Find | ⌘F |
| Save | ⌘S |
| New note | ⌘N |

On Windows and Linux, use Ctrl in place of ⌘.

## Frontmatter names the note

The block between the two `---` lines at the top is **frontmatter**. Its `title` is the note's
name; it serves as the note's top-level heading even when the body has no `# heading`.

```yaml
---
title: A note with a name
id: 20261017120000
keywords: notes, example
---
```

The `id` is the note's stable identity, which wikilinks can use. **Settings → New Note** chooses
the frontmatter every new note starts from.

## Put structure on the page

To make a heading, type its words first. Then click at the very start of the line and put the
marker before them: `# ` for a first-level heading, `## ` for a second-level heading, and so on.
The space after the hashes is required. For example, type `A section`, click before `A`, and type
`## `.

### Heading two

#### Heading three

Paragraphs are separated by a blank line. Use **Bold**, *italic*, ~~strikethrough~~ and `inline
code` where they help the reader. A horizontal rule separates ideas:

---

Bullet lists, numbered lists and task lists are all plain markdown:

- a bullet
- another bullet
  - a nested bullet

1. first
2. second

- [ ] a task still to do
- [x] a task already done

To make a quote, start a new line with `> ` and then type the quotation. Every quoted paragraph
starts with `> `; a line without it is outside the quote.

> A quote keeps a passage at arm's length.

Tables are written with pipes:

| Feature | How to use it |
| --- | --- |
| Bold | select text and press **Bold** |
| Table | **Insert → Table** |
| Code | type a fenced block |

## Code, math and notes

A fenced block keeps code exactly as written:

```js
const answer = 42;
console.log(answer);
```

Inline math uses `$E = mc^2$`. A display formula gets its own block:

$$
\frac{a}{b} + \frac{c}{d} = \frac{ad + bc}{bd}
$$

A footnote is a reference in the sentence and a definition under the body.[^first]

[^first]: This is the footnote's text. Yi numbers footnotes for you.

## Link notes and pictures

A wikilink connects notes by title, file name or id: `[[Another note]]`. Type `[[` and Yi offers
the notes it can find. A normal web link is written as `[the words](https://example.com)`.

An image is a normal markdown image: `![description](picture.png)`. A relative path is read beside
the note first, then in the pictures folder chosen in **Settings → General**. The image button can
insert a picture from a file or the clipboard.

## Cite what you read

Citations use pandoc's syntax: `[@smith2020]`. Choose a bibliography file and a citation style in
**Settings → Citations**; Yi then shows the formatted citation in the page and the works you cite
under References when the note is exported.

## Find and change

**Edit → Find** searches the note; **Edit → Replace** changes one match or every match. Search
works in the rendered page and in a code block's own source.

## Export the note

**File → Export** offers a Word document, an OpenDocument file, LaTeX, HTML, an EPUB book, a PDF and
the app's own processed markdown. The card names the file it will write and the conversion settings
it will use. Pictures are carried in the output; an SVG or webp is drawn as a PNG where the chosen
format cannot hold it.

## Keep a version

**File → Save a Version** keeps a snapshot of the note in a git repository. Versions are created
only when you ask for one, and the version panel lets you read an older copy and compare it with
the current text.

## Make the app yours

**Settings** changes the language, the pictures folder, the citations, the new-note template and
whether an unsaved document opens in the stack. A setting is saved when you change it. The workspace
is changed with **File → Open Folder…**, not in Settings.

The app remembers the documents you had open and where you were in them. Close the window and open
it again; the same page comes back.

## A note to try

Copy this into a new note and change it:

```markdown
---
title: My first note
---

## What I am writing about

An idea with **weight**, a [link](https://example.com), and a footnote.[^1]

A formula: $a^2 + b^2 = c^2$.

[^1]: The note under the line.
```

That is the whole shape of a Yi note: plain text, a little markdown, and a page that is easy to
read while you write it.
