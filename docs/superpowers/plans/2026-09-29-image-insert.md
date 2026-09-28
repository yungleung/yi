# Image insert

**Goal:** the user's ask — a toolbar button at the titlebar's centre that inserts an image at the
caret; the clipboard decides what that means (a URL or a disk path is written straight in, an
image on the clipboard opens a dialog with a preview and a name, and the image is saved into the
configured image folder or beside the note); and a rendered image is centred with a small round
corner. The branch is `codex/image-insert`; the user reviews the plan before it is merged.

## What is already there

| Piece | Where it is | What it gives us |
| --- | --- | --- |
| A link insert from the clipboard | `editing/links.ts`, `syntax/link_edits.ts`, `api/clipboard.ts` | the shape this feature copies: read the app's own clipboard (`tauri-plugin-clipboard-manager`, never `navigator.clipboard`), write one markdown insertion at the caret through `applyEdit`, and leave the caret in the *title* part |
| A toolbar button | `ui/toolbar/*`, one class per group, registered in `main.ts` into the titlebar's centre | the image button is one more of these, running `edit:insertImage` |
| A card the app asks on | `ui/new_document/*` (a card, native twin only where a system surface can mean the same thing), `ui/table/table_picker.ts` | the image dialog is a card: a *native* surface cannot show a preview, so there is no native twin to write |
| A settings window with tabs | `ui/settings/settings_window.ts` + one module per tab, config in `settings.rs` / `config_manager.ts` | the image folder is a field on a new **General** tab |
| Images rendered as `<img src={node.url}>` | `nodes/image.ts` | today only a remote URL works — a saved *file* needs resolution and a URL the webview may load |

## The design

### 1. The rule, in one home (`src/ui/markdown/syntax/image_edits.ts`, pure)

| Rule | What it says |
| --- | --- |
| `imageInsertion(title, destination)` | the markdown an image is written as — `![title](destination)`, the title escaped the way a link's is, the destination wrapped in `<…>` when markdown cannot read it plainly — and where inside it the caret sits (the end of the title, as a link's does) |
| `clipboardImageDestination(text)` | the destination a clipboard *offers*: exactly one token that is an `http(s):` URL, a `file://` URL, an absolute path, or a `~/…` path **whose extension is one of the image kinds**. Anything else — several words, a bare word, a path to something that is not an image — is `null`: the image is still written, with an empty destination to type into |
| `imageTitleFromUrl(url)` | the alt text a destination suggests: its last path piece without the extension |
| `destinationForImage(filePath, documentFolder)` | what the markdown says about a file the app just wrote: the path **relative to the document's folder** when the file is inside it, the absolute path otherwise |
| `imageFileName(stamp, extension)` | the default name: the app's own `YYYYMMDDHHMMSS` stamp (the same one a new note gets, from `services/new_document.ts`) with the reader's extension, `.png` unless they typed another |
| `imageKindFor(name)` | the mime a name's extension asks for (`png`, `jpg`/`jpeg`, `webp`, `gif`), `.png` when there is none or it is unknown |

### 2. The clipboard (`src/api/clipboard.ts`)

`readClipboardText()` stays as it is; the module gains `readClipboardImage()`, which answers the
clipboard's image as `{ width, height, rgba }` or `null` — the plugin's `Image` resource, read
once and closed, and any refusal (no image, no permission) answered the same way the text read
answers one: *nothing to offer*. The capability gains
`clipboard-manager:allow-read-image` — **measured**: with a PNG on the clipboard the text read
answers `null` and the image read answers *"clipboard-manager.read_image not allowed"*, so the
grant is what the feature needs and the text read is not enough.

The precedence is the ask's own order — **a destination in the text wins, an image otherwise** —
and it is also what the platform does: on macOS nothing in a copied image is plain text.

### 3. What the button does (`ui/image/image_flow.ts`, one command `edit:insertImage`)

1. read the clipboard's **text**; if it offers a destination, write `![title](destination)` at the
   caret and stop (the caret in the title, exactly as `edit:insertLink` leaves it);
2. otherwise read the clipboard's **image**; if there is none, write `![]()` with the caret in the
   title, so the reader can type or paste one — the same courtesy the link button pays a
   clipboard it cannot use;
3. otherwise **ask** on the card (`ui/image/image_dialog.ts`): the preview drawn from the
   clipboard's pixels, a name field (default the stamp + `.png`, the stem selected), a line saying
   where the file will go, and Save/Cancel;
4. **encode** the pixels as what the name asks for (`canvas.toBlob`), **write** them to
   `image_folder` (or the document's own folder when the setting is empty), and
5. write `![title](destination)` at the caret, `destinationForImage` deciding what it says.

The file is written through `plugin:fs`, so it lands wherever the reader's own *Save* can write —
which is `$HOME` and nowhere else today (`docs/roadmap.md`, *Open*).

### 4. A local image renders (`nodes/image.ts`, `styles.css`, `tauri.conf.json`)

An `<img src="pic.png">` is a request to the *page's* own origin, and `asset://` is the protocol
that serves a file. So: the app config enables the asset protocol with the `$HOME/**` scope the
file plugin already has (`csp` stays `null`), a node whose destination is not `http(s):`/`data:`
is resolved against the **document's folder** and handed to `img.src` through `convertFileSrc`,
and the folder reaches the render layer as one module (`ui/markdown/document_folder.ts`, set by
the session when it shows a document) — one fact, one home, and every element is rebuilt when a
document opens, so a relative path cannot render against the note before it.

The page styles it: centred, and a small round corner, in the prose's own scale (`styles.css`).

### 5. The image folder (`settings.rs`, `api/settings.ts`, a **General** tab)

`image_folder: String` in the app config, empty meaning *beside the note* — empty rather than a
built-in path, so a reader who never chose one follows the app (the lesson `new_file_frontmatter`
already paid for). The settings window gains a **General** tab holding it with Browse…/Clear,
written the way the bibliography field is.

## Tasks

- [ ] Task 1: the rule and its check — `ui/markdown/syntax/image_edits.ts` and
      `test/checks/check-image-edits.mjs`.
- [ ] Task 2: the clipboard's image — `api/clipboard.ts`, the capability, and a probe that puts a
      real image on the clipboard and reads it back.
- [ ] Task 3: a local image renders — the asset protocol, `document_folder.ts`, `nodes/image.ts`,
      `styles.css`, and a probe that inserts a file and sees it painted.
- [ ] Task 4: the setting — the config field and the General tab.
- [ ] Task 5: the button, the command and the dialog — `ui/toolbar/image_toolbar.ts`,
      `ui/image/*`, the registry, `main.ts`.
- [ ] Task 6: the probes — the URL case (a path and a URL), the no-clipboard case, and the image
      case (the dialog, the name, the file written where it says, the markdown inserted).
- [ ] Task 7: acceptance and docs — `npx tsc --noEmit`, `npm run check`, `cargo test`, a fresh
      reload, `npm run probe:all`, and `docs/architecture.md`, `docs/ai-context.md`,
      `docs/roadmap.md`, `test/README.md`.

## Decisions I have made, and what I would change

1. **The dialog has no native twin.** A system surface cannot draw a preview, so this card is the
   reader's own interface — not a test-only stand-in for a native one, as the other two cards are.
2. **A destination in the clipboard's text wins over an image beside it**, which is the ask's own
   order and what macOS does anyway (measured: a copied PNG carries no plain text).
3. **The image is saved where the reader said, and the markdown says the truth about it**: a
   relative path when the file is inside the document's folder, absolute otherwise. (Zettlr, whose
   notes the fixtures come from, writes relative paths for a workspace folder.)
4. **The image folder is empty by default** — beside the note — so an untouched setting follows
   the app rather than freezing today's answer into the config.
5. **The asset protocol's scope is `$HOME/**`**, the same as the file plugin's. A workspace outside
   the home directory can be browsed but its images will not paint — one more line for the
   roadmap's *Open* item, not a new rule.

## Handoff

*(written when the work lands)*
