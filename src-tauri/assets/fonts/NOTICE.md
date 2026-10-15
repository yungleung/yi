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
| `Amiri-Regular.ttf` | Arabic | 1.003 | `aliftype/amiri`, release `Amiri-1.003` |
| `NotoSerifDevanagari-Regular.ttf` | Devanagari | 2.006 | `notofonts/devanagari`, release `NotoSerifDevanagari-v2.006` |
| `NotoSerifThai-Regular.ttf` | Thai | 2.002 | `notofonts/thai`, release `NotoSerifThai-v2.002` |
| `NotoSerifArmenian-Regular.ttf` | Armenian | 2.008 | `notofonts/armenian`, release `NotoSerifArmenian-v2.008` |
| `NotoSerifGeorgian-Regular.ttf` | Georgian | 2.003 | `notofonts/georgian`, release `NotoSerifGeorgian-v2.003` |
| `NotoSerifCJKsc-Regular.otf` | Han, kana, Hangul | 2.003 | `notofonts/noto-cjk`, `Serif/OTF/SimplifiedChinese` |

And the **styles** a note may ask of those faces — 1.75 MB in all, from the same releases and archives:

| file | what it is for |
| --- | --- |
| `NotoSerif-Bold.ttf`, `NotoSerif-Italic.ttf` | Greek and Cyrillic, which have both |
| `NotoSerifHebrew-Bold.ttf` · `Amiri-Bold.ttf` · `NotoSerifDevanagari-Bold.ttf` | Hebrew, Arabic, Devanagari |
| `NotoSerifThai-Bold.ttf` · `NotoSerifArmenian-Bold.ttf` · `NotoSerifGeorgian-Bold.ttf` | Thai, Armenian, Georgian |

**No bold is shipped for the Han and Hangul face, and that is a size decision with a number**: its bold
is 25.5 MB (measured by asking the upstream URL for its length), as much again as every script's face
put together, for one heading's worth of weight. Those two are emboldened by XeTeX instead
(`AutoFakeBold`, in `export_fonts.rs`), and a reader who wants a real bold there names a face of their
own for CJK — their font's own bold is then the one used, since a face the reader names is never
emboldened by this build. The scripts with no italic face in them (everything but Greek and Cyrillic)
have none shipped: an italic Hebrew or Arabic is not a thing those scripts have, and a slanted one
would be an invention.

Each was checked against its own `cmap` before being trusted: every *assigned* code point of the script
is in it, with one measured exception — the Coptic letters that sit inside the Greek block
(`U+03E2`–`U+03EF`) are in no face here, since the core Noto Serif has no Coptic. `Noto Serif CJK SC`
holds the unified ideographs and extension A in full and only a few code points of extensions B to H
(2057 of extension B's 42,720, measured), which the settings file's header says and the card's hint
reports.

**Arabic is the one face that is not Noto, and it is a measured choice.** `Noto Naskh Arabic` (the
obvious candidate, and what shipped first) is built with the dotless letters as its shaping targets —
its glyph names run `uni066E.fina`, `uni066E.medi`, and the dots are separate marks — so a page set in
it carries a `ToUnicode` map that names beh's final form as *dotless beh*: measured, one page, text
copied out of it came back `ٮ` where the note said `ب`, `ى` for `ي` and `ه` for `ة`, and six of the
glyphs had no mapping at all. `Amiri` is the same genre (a Naskh), reads back letter for letter
(`بكرم` and `العربية` both come out of a page exactly), and covers **more** of the Arabic ranges than
the Noto face did: 1233 of their 1282 assigned code points against 1139, presentation forms included.
`AmiriQuran` and the bold are not shipped — one regular weight is what a note needs.

The faces are **not renamed or modified** (the OFL forbids changing a Reserved Font Name, and none of
these have one); the file names are the app's own choice, and every script that uses them does so by
file name with the folder given as `Path=`.
