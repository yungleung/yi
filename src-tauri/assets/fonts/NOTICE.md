# The faces this build ships

Eight Noto faces, one per script, unmodified, under the **SIL Open Font License 1.1** (`OFL.txt` in
this folder, which travels with them — the licence requires it, and it is why this file names each
one's version and where it came from).

They are shipped because a PDF page has no font fallback: without them a note in any of these scripts
exported with the space its words took and none of the words, unless the reader named a font of their
own. `src-tauri/src/export_fonts.rs` is what wires them in, and the header it writes names the files
below by path.

| file | script | version | from |
| --- | --- | --- | --- |
| `NotoSerif-Regular.ttf` | Greek, Cyrillic, Coptic, Glagolitic | 2.015 | `notofonts/latin-greek-cyrillic`, release `NotoSerif-v2.015` |
| `NotoSerifHebrew-Regular.ttf` | Hebrew | 2.004 | `notofonts/hebrew`, release `NotoSerifHebrew-v2.004` |
| `NotoNaskhArabic-Regular.ttf` | Arabic | 2.021 | `notofonts/arabic`, release `NotoNaskhArabic-v2.021` |
| `NotoSerifDevanagari-Regular.ttf` | Devanagari | 2.006 | `notofonts/devanagari`, release `NotoSerifDevanagari-v2.006` |
| `NotoSerifThai-Regular.ttf` | Thai | 2.002 | `notofonts/thai`, release `NotoSerifThai-v2.002` |
| `NotoSerifArmenian-Regular.ttf` | Armenian | 2.008 | `notofonts/armenian`, release `NotoSerifArmenian-v2.008` |
| `NotoSerifGeorgian-Regular.ttf` | Georgian | 2.003 | `notofonts/georgian`, release `NotoSerifGeorgian-v2.003` |
| `NotoSerifCJKsc-Regular.otf` | Han, kana, Hangul | 2.003 | `notofonts/noto-cjk`, `Serif/OTF/SimplifiedChinese` |

Each was checked against its own `cmap` before being trusted: every *assigned* code point of the script
is in it, with one measured exception — the Coptic letters that sit inside the Greek block
(`U+03E2`–`U+03EF`) are in no face here, since the core Noto Serif has no Coptic. `Noto Serif CJK SC`
holds the unified ideographs and extension A in full and only a few code points of extensions B to H
(2057 of extension B's 42,720, measured), which the settings file's header says and the card's hint
reports.

The faces are **not renamed or modified** (the OFL forbids changing a Reserved Font Name, and none of
these have one); the file names are the app's own choice, and every script that uses them does so by
file name with the folder given as `Path=`.
