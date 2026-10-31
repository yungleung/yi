---
title: Yi-Dokumentation
id: yi-documentation
lang: de
---

Yi ist ein lokal arbeitender Markdown-Editor. Ein Arbeitsbereich ist ein gewöhnlicher Ordner, jede
Notiz eine gewöhnliche Markdown-Datei und der Export wird an Pandoc übergeben. Diese Anleitung
erklärt die tägliche Arbeit und besonders sorgfältig zu behandelnde Exportvorlagen.

Dieses Dokument ist schreibgeschützt. **F1** öffnet es erneut; eine andere Notiz ersetzt es ohne
Speicherabfrage.

## Arbeitsbereich und Notizen

Der Ordner links im Baum ist der Arbeitsbereich. Es gibt kein Konto und keine entfernte Kopie.

- **File → New Markdown** erzeugt eine Notiz mit einer vierzehnstelligen ID als Dateinamen und
  markiert den `title` zur Eingabe.
- **New file** im Baum erstellt dieselbe Art Notiz im gewählten Ordner.
- **File → Open Folder…** wechselt den Arbeitsbereich, **File → Save** speichert.
- Nur ausdrücklich hinzugefügte Dokumente liegen im Sitzungsstapel. Tutorial und Anleitung sind
  Referenzdokumente und gelangen nicht hinein.

### Sitzungsstapel

**⌘P** bzw. **Ctrl+P** legt das aktuelle Dokument in den Sitzungsstapel oder nimmt es wieder heraus.
**⌘T** bzw. **Ctrl+T** öffnet das nächste Dokument im Stapel, **⇧⌘T** bzw. **Ctrl+Shift+T** das
vorherige. Die Reihenfolge entspricht dem Stapelbereich; nach dem letzten Dokument geht es wieder am
Anfang weiter.

Ist das aktuelle Dokument noch nicht im Stapel, legt Yi es vor dem Wechsel zuerst hinein. So bleibt
das Dokument, das Sie verlassen, erhalten. Schreibgeschützte Referenzen wie diese Anleitung bleiben
außerhalb des Stapels. In der Statusleiste ist der Stapelstatus grün, wenn das Dokument im Stapel
liegt, und gedämpft, wenn nicht; **Saved** ist grün, **Editing** bernsteinfarben und **Read-only**
gedämpft.

### Frontmatter

```yaml
---
title: Eine Notiz
date: 2026-10-21
id: 20261021153000
keywords:
  - notes
  - export
---
```

`title` benennt das Dokument, `id` ist die unveränderliche Kennung und `lang` die Sprache für EPUB
und andere Exporte. Weitere Schlüssel stehen Pandoc und Vorlagenpaketen zur Verfügung.

**Settings → New note** legt das anfängliche Frontmatter fest. `metadata.yaml` eines Pakets gilt nur
für die aktuell erzeugte Notiz und ändert nicht die Exportvorlage späterer Exporte. Für neue Notizen
gibt es außerdem die eingebauten Präsentationsstarter **Reveal.js presentation** und
**Beamer presentation**; sie liefern Metadaten, keine Vorlagenpakete.

### Bearbeiten

Yi zeigt Markdown gerendert an und behandelt den Quelltext als maßgeblich. Beim Bearbeiten eines
Links, einer Formel oder eines eingezäunten Blocks erscheint dessen Markdown an Ort und Stelle.
Wichtige Tastenkürzel: ⌘S / Ctrl+S speichern, ⌘N / Ctrl+N neu, ⌘F / Ctrl+F suchen,
⇧⌘F / Ctrl+Shift+F ersetzen und F1 für diese Anleitung.

### Listen

Eine vollständige Aufzählungs-, nummerierte oder Aufgabenliste wird zu einem nummerierten
Listenobjekt, wenn danach eine Beschriftungszeile steht:

```markdown
1. Probe vorbereiten
2. Messung ausführen

: Schritte {#list:steps .wide data-owner=demo}
```

Die Doppelpunktzeile kann direkt nach der Liste oder nach genau einer Leerzeile stehen. Sie verwendet
dieselbe Beschriftungsgrammatik wie eine Tabelle. Eine Liste nur mit Beschriftung wird nummeriert,
ist ohne ID aber kein Referenzziel:

```markdown
: Vorbereitende Prüfungen
```

Eine Liste nur mit ID hat ein Ziel und eine sichtbare Nummer, aber keinen Beschriftungstext:

```markdown
: {#list:steps}
```

Eine gewöhnliche Liste ohne Beschriftungszeile erhält weder eine Listenobjektnummer noch ein Ziel.
Die Objektnummer ist unabhängig von den Markern `1.`, `2.` innerhalb einer nummerierten Liste.

`[#list:steps]` erzeugt einen automatischen Querverweis; ein normaler Link behält den selbst
geschriebenen Text:

```markdown
Siehe [#list:steps].
Siehe [die Messschritte](#list:steps).
```

Der voreingestellte automatische Text ist `List 1`, unabhängig von der Sprache dieser Anleitung.
Wort und literales Zahlenpräfix lassen sich im Frontmatter ändern:

```yaml
reference-labels:
  list: Prozedur
reference-number-prefixes:
  list: "3-"
```

Querverweis und sichtbare Beschriftung verwenden dann `Prozedur 3-1`.

HTML, EPUB, Word und ODT erhalten dieselbe Listenstruktur mit Ziel, Beschriftungsposition, Wort,
Präfix und Nummerierung. Die Writer erzeugen unterschiedliche native Container, das sichtbare
Verhalten bleibt jedoch gemeinsam. Listenmarker, Aufgabenfelder und verschachtelte Listen bleiben
unverändert. Vorverarbeitetes Markdown verwendet dieselbe Struktur wie HTML.

⌘-Klick oder Ctrl-Klick auf einen Querverweis zeigt die Liste an und setzt den Cursor in den ersten
bearbeitbaren Eintrag. Ein Klick auf die gerenderte Beschriftung zeigt die vollständige Quelle
`: Beschriftung {…}`, in der Text, ID, Klassen und Attribute bearbeitet werden können.

Listen benötigen keinen `:::`-Block im Quelltext. Die Doppelpunktbeschriftung lässt eingezäunte
DIV-Blöcke für Callouts frei. Ein eingerückter Doppelpunkt innerhalb eines Listeneintrags bleibt
Inhalt dieses Eintrags; nach einem normalen Absatz behält der Doppelpunkt seine
Pandoc-Definitionslisten-Bedeutung.

#### Listennummerierung in LaTeX und PDF

LaTeX besitzt keinen nativen Zähler für ein vollständiges Listenobjekt: `enumi`, `enumii` und
ähnliche Zähler nummerieren Einträge und gelten nur innerhalb einer `enumerate`-Umgebung. Yi gibt
dem Listenobjekt deshalb den eigenen Namensraum `yilist`; `\label`, `\ref` und `hyperref` bleiben
die nativen LaTeX-Referenzmechanismen.

Standardmäßig gibt es eine globale Reihenfolge pro Dokument. Eine LaTeX/PDF-Vorlage kann
Rücksetzebene und Zahlenformat über `\yiListCounterSetup` einstellen. Für Nummerierung pro Kapitel:

```tex
\makeatletter
\providecommand{\yiListCounterSetup}{}
\renewcommand{\yiListCounterSetup}{%
  \@addtoreset{yilist}{chapter}%
  \renewcommand{\yiListNumber}{\thechapter.\arabic{yilist}}%
}
\makeatother
```

Yi ruft den Hook bei `\begin{document}` auf und wendet danach Wort und literales Präfix aus der
Notiz an. `\yiListNumber` steuert die zugrunde liegende Zahl, ohne das Präfix zu entfernen. Soll die
Listennummerierung genau dem Tabellenzähler der Vorlage folgen, müssen beide Zähler an derselben
Stelle und mit derselben Rücksetzebene eingerichtet werden; Yi kann die Regeln einer beliebigen
Klasse nicht automatisch ableiten.

Wenn du in einer leeren Zeile drei Backticks eingibst, entsteht ein paariger Code-Fence, dessen
Cursor direkt nach den öffnenden Backticks bleibt. Eingegebene Zeichen filtern die Sprachliste.
Enter wählt die markierte Sprache, Escape schließt die Liste ohne Änderung, und Leertaste schließt
sie, schreibt das Leerzeichen und lässt den Cursor auf der öffnenden Zeile, damit Attribute wie
`{#lst:sample}` folgen können. Bewege den Cursor nach unten, wenn du den Inhalt schreiben willst.

## Callouts

Ein GitHub-Alert erzeugt einen Callout:

```markdown
> [!NOTE]
> Etwas, das Beachtung verdient.
```

Die fünf eingebauten Arten sind `NOTE`, `TIP`, `IMPORTANT`, `WARNING` und `CAUTION`. Ihre sichtbaren
Titel heißen immer `Note`, `Tip`, `Important`, `Warning` und `Caution`, unabhängig von der
Oberflächensprache. Die Kennungen unterscheiden nicht zwischen Groß- und Kleinschreibung. Die
Zitatleerzeile nach der Kennung ist optional. Unbekannte Kennungen, zusätzlicher Text nach der
Kennung und maskierte Marker wie `> \[!NOTE]` bleiben gewöhnliche Zitate.

Auch Pandocs eingezäunte Div-Syntax wird akzeptiert:

```markdown
::: {.callout .callout-note}
Ein eingebauter Callout.
:::

::: {.callout .callout-definition title="Definition"}
Eine eigene Callout-Art.
:::
```

Die Kurzform `.callout-note` funktioniert ebenfalls. Ohne `title=` wird der Titel einer eigenen Art
unabhängig von der Oberflächensprache aus dem Klassennamen gebildet. IDs, Klassen und andere
Attribute bleiben für den Export erhalten; eine Div-ID ist Pandoc-Metadatum und kein
Querverweisziel von Yi.

Wer drei oder mehr Doppelpunkte und danach ein Leerzeichen in eine eigene Zeile schreibt, erhält ein
geschlossenes Default-Div mit derselben Doppelpunktzahl in beiden Zäunen und eine Auswahl mit
Default, Note, Tip, Important, Warning, Caution und Definition. Bis zu diesem Leerzeichen bleiben
die Doppelpunkte literal. Default lässt den öffnenden Zaun ohne Zusatz; eine Callout-Auswahl ergänzt
oder ändert nur die Callout-Metadaten. Inhalt, ID, weitere Klassen und Attribute bleiben unverändert.
Ein verschachteltes Div verwendet mehr Doppelpunkte als sein äußerer Zaun; eine Typauswahl ändert
nur dessen innerste öffnende Zeile. Der Cursor bleibt direkt hinter dem öffnenden
Doppelpunktzaun; mit ↓ gelangst du in den Inhalt.

Andere Pandoc-Divs wie `.columns`, Sprechernotizen, Wrapper sowie inkrementelle und nicht
inkrementelle Listen werden nicht geraten. Ein vollständiges unbekanntes Div wird immer als exakter
Quelltext gezeigt. Verschachtelte Divs verwenden wie bei Pandoc einen längeren äußeren
Doppelpunkt-Zaun. Liegt ein unbekanntes Div in einem Zitat oder Callout, zeigt auch dieser Container
seinen vollständigen Quelltext.

Callouts können in Zitaten oder anderen Callouts verschachtelt werden. Ihr Inhalt kann Absätze,
Listen, Tabellen, Codeblöcke, Formeln, Beschriftungen, Zitate und normale Markdown-Zitate enthalten.

Öffnende Markierungen bleiben beim Bearbeiten containerbewusst. Die Eingabe von `$$`, `[$$`, einem
Code-Fence aus drei Backticks oder drei oder mehr Doppelpunkten mit folgendem Leerzeichen erzeugt
die passende paarige Struktur und versieht jede erzeugte Quellzeile mit dem aktuellen
`>`-Präfix. Sprach- und Div-Auswahl funktionieren auf dieser öffnenden Zeile wie außerhalb eines
Containers. Im Quelltext eines Pandoc-Divs bleibt ein einzelner Backtick literal; drei Backticks
öffnen den verschachtelten Code-Fence.
In Code und Anzeigeformeln innerhalb eines Zitats oder Callouts folgt Enter der Zeilenregel des
Kindblocks und kann beliebig viele aufeinanderfolgende Leerzeilen erzeugen. Ein Callout in einem
eingezäunten Div fügt pro Enter genau einen präfixierten Zeilenumbruch ein, auch wenn es in einem
anderen Zitat oder Callout verschachtelt ist.

Die Vervollständigung von Zitaten nach `@`, Wikilinks nach `[[` und automatischen Referenzen nach
`[#` bleibt in beiden Quellformen verfügbar. Die Auswahl schreibt nur den Schlüssel oder die
Ziel-ID; das umgebende Zitatpräfix und die Klammern bleiben unverändert. Die Liste öffnet sich,
sobald die Markierung eingegeben oder von einer Eingabemethode übergeben wird; Tab ist nicht nötig.

Die öffnenden Zeichen `[`, `(` und `{` werden in normalem Text, Zitaten, GitHub-Callouts und
Callouts in eingezäunten Divs automatisch gepaart, auch wenn das Zeichen von einer Eingabemethode
kommt. Im Ziel eines normalen Links auf dasselbe Dokument listet `#` nach `](` außerdem die
Referenzziele des Dokuments auf; die Auswahl schreibt nur die Fragment-ID.
Nach Annahme einer dieser Vervollständigungen bleibt der Cursor an der schließenden Kante des
fertigen Knotens und dessen Markdown-Quelltext zum Bearbeiten sichtbar. Das nächste Zeichen wird
dahinter geschrieben und rendert den fertigen Link, Verweis, Zitat oder Wikilink. Gehört das
Zeichen noch zum selben Konstrukt, etwa ein weiteres Schlüsselzeichen in einem narrativen Zitat,
bleibt der Quelltext offen.

Außerhalb des Callouts zeigt Yi die gerenderte Karte; ein Klick auf Titel oder Inhalt zeigt den
vollständigen Quelltext, und beim Verlassen erscheint wieder die Darstellung.
Ein gewöhnliches Zitat zeigt unter derselben Cursor-Regel seinen vollständigen Quelltext, sodass
Escape-Marker, `>`-Präfixe und Trennzeichen der Kindblöcke exakt bearbeitet werden.
Außerhalb des Quellmodus hat ein gewöhnliches Zitat beidseitigen Abstand und ein großes öffnendes
Anführungszeichen. Die dicke Seitenlinie und das schließende Anführungszeichen entfallen.

In einem normalen Zitatabsatz erzeugt Enter zwei leere Zeilen mit dem vollständigen `>`-Präfix. Der
nächste Text beginnt einen neuen Absatz. Ein zweites Enter auf dem leeren Zitatabsatz entfernt genau
eine Zitatebene; bei verschachtelten Zitaten wiederholt man dies pro Ebene. Listen, Tabellen,
Codeblöcke und Formeln behalten ihr normales Enter-Verhalten, und jede eingefügte Quellzeile erhält
das vollständige Präfix. Nach einem abgeschlossenen Kindblock fügt Enter denselben Absatz aus zwei
leeren Zeilen mit Präfix ein.

Die Eingabe auf einer leeren `>`-Zeile erzeugt genau `>B` und fügt keinen unsichtbaren Abstand ein.
Ein bereits sichtbares `> ` bleibt erhalten. Backspace oder Delete auf einer leeren Zitatzeile
entfernt die ganze physische Zeile statt nur des `>`.
Enter auf einem leeren Listeneintrag entfernt dessen Listenzeichen und hinterlässt eine normale
Zitat- oder Callout-Zeile.
Beim Einfügen einer Tabelle in einem Zitat oder GitHub-Callout erhalten jede Tabellenzeile und jeder
Trenner dieselbe `>`-Kette; die Tabelle bleibt dadurch im Container.

Innerhalb eines Callouts in einem eingezäunten Div fügt Enter genau einen Zeilenumbruch ein. Jedes
weitere Enter erzeugt eine weitere Leerzeile, und der Cursor bleibt auf der neuesten Zeile. Ein
eingezäuntes Div in einem Zitat behält auf jeder neuen Zeile sein sichtbares Präfix.

Ein leerer Callout behält einen unsichtbaren Cursoranker im Inhalt. Left vom folgenden Block und
Right vom vorherigen Block führen hinein; reine Navigation verändert den Quelltext nicht. Das erste
eingegebene Zeichen erzeugt die fehlende Inhaltszeile.
Enter auf der Markierungszeile eines leeren GitHub-Callouts erzeugt die zwei leeren Zitatzeilen
eines Absatzes und setzt den Cursor auf die zweite; ein weiteres Enter entfernt die Markierungen und
verlässt den Callout. Enter auf der leeren öffnenden Zeile eines Div-Callouts erzeugt eine
bearbeitbare Inhaltszeile vor der schließenden Zeile.

Jeder Pandoc-Export wandelt beide Schreibweisen in dasselbe semantische Div um:

```markdown
:::: {.callout .callout-note}
::: {.callout-title}
Note
:::

Etwas, das Beachtung verdient.
::::
```

HTML-, EPUB-, DOCX-, ODT- und LaTeX/PDF-Vorlagen können das Aussehen per CSS,
Referenzdokument-Stilen oder Lua-Filter festlegen. Der Filter erhält `.callout`,
`.callout-<Art>`, `.callout-title` und die Inhaltsblöcke in Dokumentreihenfolge. Die Umwandlung
erfolgt vor den Vorlagenfiltern; diese arbeiten daher mit dieser stabilen Struktur statt mit der
GitHub- oder Div-Quelle.

## Eine Notiz exportieren

| Art | Ausgabe |
| --- | --- |
| HTML | Bundled-Ordner mit Seite und lokalen Ressourcen |
| Reveal.js | Präsentationsordner mit `images/` und standardmäßig lokalem `js/dist/` |
| LaTeX | `.tex` und Vorlagenressourcen |
| Beamer | Präsentations-PDF von XeLaTeX |
| PDF | PDF aus einer TeX-Engine |
| EPUB | EPUB-Buch |
| Word | `.docx` |
| LibreOffice | `.odt` |
| Markdown | Von Yi vorverarbeitetes Markdown |

Außer Markdown benötigen alle Formate Pandoc; PDF benötigt zusätzlich XeLaTeX oder eine andere
TeX-Engine. Yi sucht Pandoc an üblichen Orten und in `PATH`, installiert aber keine Software und
startet nicht TeX Live Manager.

Die Exportkarte wählt das Ziel und, bei Arten, die dies unterstützen, ein Vorlagenpaket oder
Ressourcen. Reveal.js und Beamer nehmen keine Vorlagenpakete an. Die gemerkte Vorlagenwahl gilt je
Exportart, nicht je Notiz.

### Präsentationen

Reveal.js liest `title`, `subtitle`, `author`, `theme`, `transition`, `slide-level` und weitere
Pandoc-Steuerungen aus dem Frontmatter. Es schreibt immer einen nicht eigenständigen Ordner:

```text
praesentation/
  praesentation.html
  images/
  js/dist/
```

`examples/revealjs.md` verwendet ein mitgeliefertes Bild; der standardmäßig lokale Export
funktioniert daher auch offline.

Die Karte bietet zwei unabhängige Optionen, standardmäßig beide aus:

- **Use remote Reveal.js resources** behält die von Pandoc festgelegten CDN-URLs. Sonst lädt Yi
  JavaScript, Stylesheets, Theme und Plugins von Reveal.js nach `js/dist/`.
- **Use remote pictures** behält URL von Web-Bildern. Sonst wird jedes entfernte Bild nach
  `images/` geladen; lokale Bilder werden immer dorthin kopiert.

Beamer verwendet `title`, `subtitle`, `author`, `institute`, `theme`, `colortheme`, `fonttheme`,
`aspectratio`, `navigation` und `section-titles`. Es schreibt eine PDF und bietet weder Vorlage noch
Seitengröße an. Überschriften der ersten Ebene sind Abschnitte, der zweiten Ebene Folien.

### Pandoc und TeX installieren

```sh
# macOS
brew install pandoc
brew install --cask mactex-no-gui

# Debian / Ubuntu
sudo apt install pandoc texlive-xetex texlive-fonts-recommended
```

```powershell
# Windows
winget install JohnMacFarlane.Pandoc
winget install MiKTeX.MiKTeX
```

Prüfen:

```sh
pandoc --version
xelatex --version
```

Schlägt `pandoc --version` fehl, sind alle Pandoc-Exporte nicht verfügbar. Schlägt nur
`xelatex --version` fehl, funktionieren alle Formate außer PDF. Fehlende TeX-Pakete werden mit dem
Paketmanager der TeX-Installation ergänzt; Yi führt kein `tlmgr` aus.

Jede Art besitzt eine bearbeitbare Datei `export.<kind>.yaml`, etwa `export.pdf.yaml`. Es sind
normale Pandoc-Defaults für Writer, PDF-Engine, Hervorhebung, Seitenvariablen, Filter und
Ressourcenpfade.

## Vorlagenpakete

Vorlagenpakete liegen im Exportdatenordner von Yi, nicht im Arbeitsbereich und nicht in der Sitzung.
Die Paketauswahl zeigt nur Pakete für die gewählte Exportart. Ein Paket mit unlesbarem Manifest
bleibt auswählbar, damit es entfernt werden kann; verwenden oder bearbeiten lässt es sich nicht.

```text
example-latex/
  template.json
  template.tex
  journal.cls
  journal.bst
  metadata.yaml
  defaults.yaml
```

`template.json` wird von Yi gepflegt. `kind` ist `html`, `latex`, `pdf`, `epub`, `docx` oder `odt`;
`mode` ist `template`, `wrapper` oder `reference-doc`. Textvorlagen verwenden `template`, Word und
ODT verwenden `reference_doc`; nur eines davon darf gesetzt sein. `assets` enthält
`/`-getrennte relative Pfade. `deliver` nennt Klassen und BibTeX-Stile für LaTeX-Ausgaben. `csl`
kann einen paketeigenen Zitierstil erzwingen.

### Wrapper-Modus

Eine vollständige LaTeX-Datei mit `\begin{document}` und `\end{document}`, aber ohne `$body$`, wird
beim Import als Wrapper angeboten. Yi behält das Original als `source.tex` und erzeugt
`template.tex` mit `$body$` vor `\end{document}`. Optional werden `\title{}` und `\author{}` durch
`$title$` und `$author$` ersetzt.

### Aus Pandocs Standard erzeugen

**Create…** fragt Name, Quelle und Lizenz ab und erzeugt anschließend mit Pandoc die Standardvorlage
oder das Referenzdokument. Textformate erhalten `template.html`, `template.tex` usw.; Word und ODT
erhalten `reference.docx` und `reference.odt`.

### Vorlagenkit importieren

Yi importiert eine Datei, einen Ordner oder ein ZIP. Zuerst wird geprüft, erst nach Bestätigung
kopiert. ZIPs mit absoluten Pfaden, `..`, symbolischen Links, zu vielen Dateien oder zu großer
Größe werden abgewiesen und in einem temporären Ordner verarbeitet.

### Bearbeiten und prüfen

Der Codepanel zeigt editierbare Textdateien und schreibgeschützte Binärdateien mit Zeilennummern,
Suche, Undo, YAML-/LaTeX-Hervorhebung und atomarem Speichern. **Validate** führt eine echte kurze
Konvertierung aus; **Test PDF** startet zusätzlich die PDF-Engine.

## HTML-Vorlagen

```html
<!doctype html>
<html lang="$lang$">
  <head><meta charset="utf-8"><title>$title$</title></head>
  <body><main>$body$</main></body>
</html>
```

`$body$` steht einmal an der Inhaltsstelle. Yi legt immer einen Bundled-Ordner an. Ist
**Self-contained HTML** aus, werden Vorlagenressourcen und lokale Bilder relativ kopiert; ist es an,
werden lokale Dateien eingebettet und die vollständigen Paketressourcen trotzdem mitgeliefert.
HTTP- und HTTPS-Bilder bleiben URLs.

## LaTeX- und PDF-Vorlagen

```tex
\documentclass{article}
\begin{document}
$if(title)$\title{$title$}\maketitle$endif$
$body$
\end{document}
```

`$body$` darf nur einmal vorkommen. Titel, Autoren, Institute und E-Mails gehören in die
Notizmetadaten. LaTeX-Exporte kopieren den gesamten Ressourcenbaum neben die `.tex`-Datei; vorhandene
abweichende Dateien werden nicht überschrieben. Lokale Notizbilder ersetzen gleiche relative
Paketpfade; andere werden unter `<ausgabe>.assets/` abgelegt.

Native-BibTeX-Pakete setzen:

```yaml
filters: []
cite-method: natbib
bibliography: references.bib
```

**Settings → Citation** bleibt maßgeblich. Yi schreibt nur tatsächlich zitierte Werke nach
`references.bib`; CSL-JSON wird mit `citation-key` oder ersatzweise `id` nach BibTeX konvertiert.
PDF läuft mit Pandoc und `pdf-engine`; Paket- und Einstiegspfade werden über `TEXINPUTS`,
`BIBINPUTS` und `BSTINPUTS` gefunden. Uneingeschränkte Shell-Erweiterung wird in PDF-Defaults
abgewiesen.

## EPUB-Vorlagen

EPUB verwendet `template.xhtml` mit einmaligem `$body$`. CSS, Bilder, Schriften und Skripte liegen
im Paket. Pandoc erzeugt das Buch, Yi legt Ressourcen unter `EPUB/assets/` ab und trägt sie in
`content.opf` ein. EPUB benötigt `title` und `lang`; für die Veröffentlichung sollte zusätzlich
epubcheck verwendet werden.

## Word- und OpenDocument-Vorlagen

Word und OpenDocument verwenden gestaltete **Referenzdokumente**, keine Textvorlagen.

```text
example-docx/
  template.json
  reference.docx
  defaults.yaml
  metadata.yaml
```

Pandoc übernimmt Absatz-, Zeichen-, Tabellen- und Seitenstile. Bewahren Sie die erwarteten Namen für
Titel, Untertitel, Autor, Datum, Abstract, Überschriften, Text, Zitate, Code, Beschriftungen,
Listen, Fußnoten, Tabellen, Abbildungen und Literatur. Yi bearbeitet Binärdateien nicht;
**Open in system** öffnet sie in Word oder LibreOffice.

### Mit Pandocs Referenzdokument beginnen

Der Abschnitt
[`--reference-doc`](https://pandoc.org/MANUAL.html#option--reference-doc)
der offiziellen Pandoc-Anleitung beschreibt DOCX- und ODT-Unterschiede, Stilnamen und den empfohlenen
Arbeitsablauf. Das vollständige
[Pandoc-Handbuch](https://pandoc.org/MANUAL.html) erklärt alle weiteren von Yi durchgereichten
Einstellungen.

**Create…** erzeugt in Yi ein Standard-Referenzdokument. Im Terminal lauten die Befehle:

```sh
pandoc -o custom-reference.docx --print-default-data-file reference.docx
pandoc -o custom-reference.odt --print-default-data-file reference.odt
```

Öffnen Sie die Datei in Word oder LibreOffice, ändern Sie die Stile und speichern Sie sie. Ändern Sie
die von Pandoc erwarteten Stilnamen nicht; Schrift, Abstände, Farben und Rahmen dürfen angepasst
werden.

- Ein DOCX-Referenzdokument liefert Stile und Dokumenteigenschaften einschließlich Seitengröße,
  Rändern, Kopf- und Fußzeilen. Der sichtbare Inhalt wird ignoriert.
- Ein ODT-Referenzdokument liefert seine Stylesheets. Der sichtbare Inhalt wird ignoriert.

Speichern Sie es als `reference.docx` oder `reference.odt` und wählen Sie es als Eintrag des
passenden Pakets.

## Paket-YAML

`metadata.yaml` kann das Frontmatter einer neuen Notiz liefern. Seine Schlüssel gewinnen außer `date`
und `id`, die Yi immer setzt. `export.yaml` folgt auf `export.<kind>.yaml`; ohne diese Datei gilt
`defaults.yaml`. Paketwerte gewinnen über App-Standards, aber explizite Ausgabe-, Vorlagen-, CSL- und
Ressourcenargumente gewinnen zuletzt.

Ein `csl` in Paket-YAML ist nur ein Fallback. **Settings → Citation** wird später übergeben und
gewinnt. Für einen erzwungenen Stil gehört die Datei in `csl` von `template.json`. Kein zusätzliches
citeproc hinzufügen; Yi liefert es bereits und doppelte Filter erzeugen doppelte Literatur.

## Vollständige Beispiele und KI-Prompts

Unter `examples/templates/` liegen vollständige benutzerseitige Pakete für HTML, LaTeX, PDF,
Rho Class, EPUB, Word und ODT. Eine Ebene darüber liegen die vollständigen Referenzpräsentationen
`examples/revealjs.md` und `examples/beamer.md`. `examples/` dient Lesern;
`test/fixtures/` enthält getrennte, kontrollierte Testdaten.

KI-Aufträge sollen einen importierbaren Quellordner erzeugen, aber kein `template.json`:

- **HTML:** `$body$`, Seitenleisten-Inhalt, `toc-depth: 2`, paketlokales CSS und JavaScript.
- **LaTeX:** drei Autoren und Institute, Abstract, Abbildungen, Tabellen, Fußnoten und native Zitate.
- **PDF:** XeLaTeX, Titelseite, Abstract, Code, Abbildungen, Tabellen und Literatur.
- **Rho Class PDF:** CC-BY-4.0-Design, Klassenname, Quell-URL und Attribution bewahren.
- **EPUB:** Cover, Verlag, ISBN, Rechte, Widmung, Inhaltsverzeichnis und drei Kapitel.
- **Word:** vollständige `reference.docx`-Stile, `toc: true`, `toc-depth: 2`.
- **OpenDocument:** A4-Dissertation mit Cover, Abstract, zweistufigem Inhalt und Seitennummern ab 1.

## Vor Verwendung prüfen

1. Paket im Vorlageneditor öffnen.
2. **Validate** ausführen und die vollständige Meldung lesen.
3. Bei PDF anschließend **Test PDF** ausführen.
4. Eine kurze Notiz mit Überschriften, Listen, Tabelle, Code, Mathematik und Bild exportieren.
5. Relative Ressourcen und Literaturdateien prüfen.

| Meldung | Prüfen |
| --- | --- |
| Pandoc not found | Pandoc installieren und Yi mit aktuellem `PATH` neu starten |
| PDF engine not found | TeX installieren und `xelatex --version` prüfen |
| `journal.cls` not found | Klasse ins Paket legen und das Paket in den TeX-Suchpfad aufnehmen |
| Template variable missing | Vorlage mit den Variablen des Pandoc-Writers vergleichen |
| Filter could not start | Laufzeit des Filters installieren oder Filter entfernen |
| Local picture missing | Paketrelativen Pfad und Bild in `assets` prüfen |

## Sicherheit und Vertrauen

Vorlagen sind ausführbare Konvertierungskonfiguration und können Pandoc-Filter, Lua, LaTeX-Klassen,
Pakete und Schriften enthalten. Verwenden Sie nur vertrauenswürdige Vorlagen. Yi zeichnet Quelle und
Lizenz auf, entscheidet aber nicht über Nutzungsrechte. Es lädt keine Journaldateien herunter,
installiert keine TeX-Pakete, führt kein `tlmgr` aus, erlaubt in PDF-Standards keine
uneingeschränkte Shell-Erweiterung und schreibt beliebige Beispiele nicht automatisch in perfekte
Pandoc-Vorlagen um.

## Paket-Checkliste

- [ ] `template.json` existiert und verwendet Schema 1.
- [ ] `kind`, Eintrag und `mode` stimmen überein.
- [ ] Eine Textvorlage enthält genau ein `$body$` an der Inhaltsstelle.
- [ ] Das Referenzdokument öffnet in Word oder LibreOffice.
- [ ] Alle Pfade in `assets`, `deliver` und `csl` existieren.
- [ ] Relative Links verwenden `/` und bleiben im Paket.
- [ ] `metadata.yaml` ist eine YAML-Zuordnung auf oberster Ebene.
- [ ] `defaults.yaml` / `export.yaml` enthalten nur notwendige Einstellungen.
- [ ] PDF-Standards aktivieren keine Shell-Erweiterung.
- [ ] Eine kurze repräsentative Notiz wird erfolgreich validiert.
- [ ] Ein echter Export enthält Klassen, Stile, Bilder und Literatur.
