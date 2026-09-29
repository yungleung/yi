# Localization

**Goal:** the user's ask — English, Japanese, Simplified and Traditional Chinese, German, French,
Spanish and Portuguese — and the design question that came with it: the app's menu is built in
Rust and its windows are HTML, so where do the words live?

**The answer taken** (the opinion the user asked for, and accepted with *"you can go"*): keep the
menu in Rust, and make the **catalogues files in the repository that both sides read**. The branch
is `codex/localization`.

## Why not the other two

| Option | Why not |
| --- | --- |
| Build the menu in TypeScript (`@tauri-apps/api/menu`) | the menu must exist before a page does, and has to survive a page that never loads — otherwise ⌘Q and ⌘W go with it. On macOS the app menu is *app-wide* while pages are per-window, so every window would have to build the same menu and the last to load would win |
| A Rust i18n crate (or a Tauri i18n plugin) as the shared API | a crate gives *Rust* a `t!`; the webview still needs its own reader, and the plugin variants ship the catalogue over IPC — a startup round trip and a frame of untranslated chrome — for a lookup that is twenty lines. What a crate buys (plurals, date and number formatting) can be adopted later *behind* the reader; the seam is the valuable part |

## The design

### 1. The catalogues

`locales/<language>.json`, flat dotted keys (`menu.file.save`, `status.words`), `{name}` for a
parameter, one file each for `en`, `ja`, `zh-Hans`, `zh-Hant`, `de`, `fr`, `es`, `pt`. English is
the language every key is written in and every fallback lands on.

### 2. Two readers, one set of facts

- `src-tauri/src/i18n.rs` brings the same files into the binary with `include_str!`, parses them
  once, and serves the **menu** — which is built before any window exists. It also reads the
  system locale (`tauri_plugin_os::locale`) when the config names no language.
- `src/services/i18n.ts` imports them into the bundle (no IPC, no flash of English chrome) and
  serves every window. Same lookup rule, same fallback, same reading of a locale.

Neither side needs the other to be running, and a key one side knows and the other does not is a
bug `test/checks/check-locales.mjs` fails on.

### 3. Which language the app speaks

`language` in the app config, with the empty default meaning *the reader's own system locale*, so a
first launch is in the language the rest of the machine is in. The **General** tab offers the eight
by their own names (a language's name is not translated). Changing it saves the setting, Rust
rebuilds the menu (`menu.rs: set_menu_for_language`, called from `set_config` when the language
moved), and the windows **reload** — a label is read where it is drawn, and the session brings the
document, the caret and the view back.

### 4. What the menu owes

Tauri's predefined items are titled by `muda`'s English table when no text is given ("Quit Yi",
"Copy"): every label is passed from the catalogue instead, through the `*_with_text` forms. Ids and
accelerators are *not* translated — an id is what `commands/menu.ts` maps to a command.

## Tasks

- [ ] Task 1: the catalogues, the two readers and the rule for a system locale.
- [ ] Task 2: the menu reads the catalogue (every label, predefined items included).
- [ ] Task 3: the webview's chrome reads the catalogue (toolbars, status bar, tree, dialogs, the
      two questions the session asks, the find bar, the settings window).
- [ ] Task 4: the setting and the reload.
- [ ] Task 5: the check, the probe, and the harness's guarantee that a probe runs in English.
- [ ] Task 6: acceptance and docs.

## Decisions I have made, and what I would change

1. **The seven other catalogues are translated here**, by the agent that wrote the English keys —
   which is a starting point a native speaker should review, not a finished translation. The
   *structure* is what this work is really for: adding a ninth language is one file and one line.
2. **A language change reloads the window** rather than re-rendering every component: components
   read their strings in their constructors, and the session restores the document's place.
3. **The backend's error sentences stay English for now** (`files.rs`'s *"A name cannot be empty."*,
   the fs plugin's own messages). They reach the reader in a toast; translating them means a
   second catalogue reader in Rust and is a follow-up, written into the roadmap.
4. **A probe runs in English** — the harness sets it and puts the reader's choice back — because a
   probe asserts behaviour, and its expectations are English (`test/tauri-probe.mjs`).

## Handoff

Landed on `codex/localization`. Every task in the plan is done.

**What is where.** The catalogues are `locales/<language>.json` — 129 keys each, one file per
language, the eight the user named. The menu's reader is `src-tauri/src/i18n.rs` (the files brought
in with `include_str!`, parsed once, plus the system-locale rule and the fallback to English) and
the webview's is `src/services/i18n.ts` (the same files imported into the bundle, the same rule
expressed once more). `src-tauri/src/menu.rs` builds the whole menu from the catalogue — the
predefined items as well, since Tauri titles them in English otherwise — and
`settings.rs` rebuilds it when the language changes. `src/services/language.ts` is where a window
learns which language it is in, `src/ui/settings/general_settings.ts` offers the eight by their own
names, and `src/main.ts`/`src/settings.ts` reload a window whose language moved.

**What proves it.** `test/checks/check-locales.mjs` (8 languages, 129 keys each, nothing blank,
nothing unused, one reading of a system locale, and both readers still able to read it) and
`cargo test`'s six i18n tests over the same ground from Rust. `test/probes/localization.js` builds
the app's own components under other languages and reads what they say. And the acceptance run:
with the setting moved to Japanese the window came back in Japanese by itself, and the native menu
— read through System Events, since no page can see it — was `ファイル, 編集, 表示, ウインドウ,
ヘルプ` with `新規 Markdown`, `開く…`, `保存`, `別名で保存…`, `書き出す`, `ウインドウを閉じる` under
File.

**What it cost elsewhere.** The probe harness now puts the app in English for the length of a probe
and puts the reader's choice back afterwards (`test/tauri-probe.mjs`), because a probe asserts
behaviour and its expectations are English: without it, a machine whose locale is Chinese or
Japanese would fail the whole suite for a reason that has nothing to do with the code. The
backend's own error sentences are still English — recorded in the roadmap as the next thing this
feature owes.
