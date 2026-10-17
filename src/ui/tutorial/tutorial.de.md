---
title: Willkommen bei Yi
id: yi-tutorial
lang: de
---

Yi ist eine lokal arbeitende Notizen-App. Deine Notizen sind gewöhnliche Markdown-Dateien in einem
Ordner, den du selbst wählst. Es gibt kein Konto und keinen Server: Was du siehst, bleibt als Text
auf deiner Festplatte.

## Mit einem Arbeitsbereich beginnen

Ein **Arbeitsbereich** ist der Ordner, den Yi liest und beschreibt. Der Baum links ist dieser
Ordner:

- klicke eine Notiz an, um sie zu öffnen;
- mit **Datei → Neue Notiz** legst du eine an;
- ein Rechtsklick auf einen Ordner oder eine Notiz zeigt die passenden Aktionen.

Wenn du noch keinen Arbeitsbereich gewählt hast, bietet Yi einen unter deinem Dokumente-Ordner an.
Zum Wechseln in einen anderen Ordner benutze später **Datei → Ordner öffnen…**.

## Eine Notiz anlegen

**Datei → Neue Notiz** fragt nach einem Namen und legt eine Markdown-Datei im Arbeitsbereich an.
Der Name wird zum Dateinamen; die Notiz kann in ihrem Frontmatter einen eigenen `title` haben.

Jede Notiz wird beim Schreiben gespeichert. **Datei → Speichern** schreibt den aktuellen Text
erneut, und **Speichern unter** legt eine Kopie an einem anderen Ort ab.

## Auf der Seite schreiben

Yi bearbeitet Markdown so, wie es dargestellt wird. Überschriften, Listen, Tabellen und Code sehen
aus wie sie selbst. Steht der Cursor in einem formatierten Wort, zeigt Yi die Markierungen darum,
etwa `**fett**` oder `*kursiv*`; verlässt der Cursor das Wort, wird die Seite wieder schlicht
gezeichnet.

Die Werkzeugleiste bietet dieselben Befehle wie das Menü. Markiere ein Wort und drücke **Fett**,
oder benutze die Tastatur:

| Aktion | Tastenkürzel |
| --- | --- |
| Rückgängig | ⌘Z |
| Suchen | ⌘F |
| Speichern | ⌘S |
| Neue Notiz | ⌘N |

Unter Windows und Linux nimmst du Ctrl statt ⌘.

## Frontmatter gibt der Notiz ihren Namen

Der Block zwischen den beiden `---`-Zeilen oben ist das **Frontmatter**. Sein `title` ist der Name
der Notiz; er dient als oberste Überschrift, auch wenn der Text keine `# Überschrift` hat.

```yaml
---
title: Eine Notiz mit Namen
id: 20261017120000
keywords: notizen, beispiel
---
```

Die `id` ist die feste Identität der Notiz, die Wikilinks verwenden können. Unter
**Einstellungen → Neue Notiz** wählst du das Frontmatter, mit dem jede neue Notiz beginnt.

## Der Seite Struktur geben

Um eine Überschrift zu machen, schreibe zuerst ihren Text. Klicke dann ganz an den Anfang der
Zeile und setze die Markierung davor: `# ` für eine Überschrift erster Ebene, `## ` für die zweite
und so weiter. Das Leerzeichen nach den Rauten ist nötig. Schreibe zum Beispiel `Ein Abschnitt`,
klicke vor `Ein` und tippe `## `.

### Überschrift zwei

#### Überschrift drei

Absätze werden durch eine Leerzeile getrennt. Benutze **Fett**, *kursiv*, ~~durchgestrichen~~ und
`Inline-Code`, wo sie dem Lesen helfen. Eine Trennlinie setzt Gedanken auseinander:

---

Aufzählungen, nummerierte Listen und Aufgabenlisten sind gewöhnliches Markdown:

- ein Punkt
- ein weiterer Punkt
  - ein eingerückter Punkt

1. erstens
2. zweitens

- [ ] eine offene Aufgabe
- [x] eine erledigte Aufgabe

Um ein Zitat zu machen, beginne eine neue Zeile mit `> ` und schreibe dann den Text. Jeder zitierte
Absatz beginnt mit `> `; eine Zeile ohne ist außerhalb des Zitats.

> Ein Zitat hält eine Passage auf Abstand.

Tabellen schreibst du mit senkrechten Strichen:

| Funktion | Verwendung |
| --- | --- |
| Fett | Text markieren und **Fett** drücken |
| Tabelle | **Einfügen → Tabelle** |
| Code | einen eingezäunten Block tippen |

## Code, Formeln und Fußnoten

Ein eingezäunter Block bewahrt Code genau so, wie er geschrieben ist:

```js
const answer = 42;
console.log(answer);
```

Inline-Formeln stehen in `$E = mc^2$`. Eine abgesetzte Formel bekommt einen eigenen Block:

$$
\frac{a}{b} + \frac{c}{d} = \frac{ad + bc}{bd}
$$

Eine Fußnote ist ein Verweis im Satz und eine Erklärung unter dem Text.[^erste]

[^erste]: Das ist der Text der Fußnote. Yi nummeriert Fußnoten für dich.

## Notizen und Bilder verknüpfen

Ein Wikilink verbindet Notizen über Titel, Dateiname oder id: `[[Eine andere Notiz]]`. Tippe `[[`,
und Yi bietet die Notizen an, die es findet. Ein normaler Weblink sieht so aus:
`[die Worte](https://example.com)`.

Ein Bild ist ein gewöhnliches Markdown-Bild: `![Beschreibung](bild.png)`. Ein relativer Pfad wird
zuerst neben der Notiz gesucht, dann im Bilderordner aus **Einstellungen → Allgemein**. Die
Bild-Schaltfläche fügt ein Bild aus einer Datei oder der Zwischenablage ein.

## Belege zitieren

Zitate verwenden die Pandoc-Syntax: `[@smith2020]`. Wähle unter **Einstellungen → Zitate** eine
Bibliografiedatei und einen Zitierstil; Yi zeigt dann das formatierte Zitat auf der Seite und die
zitierten Werke beim Export unter den Literaturangaben.

## Suchen und ersetzen

**Bearbeiten → Suchen** durchsucht die Notiz; **Bearbeiten → Ersetzen** ändert einen Treffer oder
alle. Die Suche arbeitet auf der dargestellten Seite und im Quelltext eines Codeblocks.

## Die Notiz exportieren

**Datei → Exportieren** bietet ein Word-Dokument, eine OpenDocument-Datei, LaTeX, HTML, ein
EPUB-Buch, ein PDF und das verarbeitete Markdown der App. Die Karte nennt die Datei und die
Konvertierungseinstellungen. Bilder werden in die Ausgabe übernommen; ein SVG oder WebP wird als
PNG gezeichnet, wo das gewählte Format es nicht aufnehmen kann.

## Eine Version behalten

**Datei → Version speichern** legt einen Stand der Notiz in einem Git-Repository ab. Versionen
entstehen nur, wenn du eine anforderst; im Versionsfenster kannst du eine ältere Kopie lesen und
mit dem aktuellen Text vergleichen.

## Die App anpassen

**Einstellungen** ändert die Sprache, den Bilderordner, die Zitate, die Vorlage für neue Notizen
und ob ein ungespeichertes Dokument im Stapel geöffnet wird. Eine Einstellung wird gespeichert,
sobald du sie änderst. Der Arbeitsbereich wird mit **Datei → Ordner öffnen…** gewechselt, nicht in
den Einstellungen.

Die App merkt sich die geöffneten Dokumente und deine Position darin. Schließe das Fenster und
öffne es wieder; dieselbe Seite kommt zurück.

## Eine Notiz zum Ausprobieren

Kopiere dies in eine neue Notiz und ändere es:

```markdown
---
title: Meine erste Notiz
---

## Worüber ich schreibe

Ein Gedanke mit **Gewicht**, ein [Link](https://example.com) und eine Fußnote.[^1]

Eine Formel: $a^2 + b^2 = c^2$.

[^1]: Die Notiz unter der Linie.
```

Das ist die ganze Form einer Yi-Notiz: reiner Text, ein wenig Markdown und eine Seite, die sich
beim Schreiben gut lesen lässt.
