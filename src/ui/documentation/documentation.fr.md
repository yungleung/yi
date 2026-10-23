---
title: Documentation de Yi
id: yi-documentation
lang: fr
---

Yi est un éditeur Markdown local-first. Un espace de travail est un dossier ordinaire, chaque note
un fichier Markdown ordinaire, et l’export est confié à Pandoc. Ce guide couvre le travail quotidien
et la création, plus délicate, des modèles d’export.

Ce document est en lecture seule. **F1** le rouvre ; ouvrir une autre note le remplace sans demander
de sauvegarde.

## Espace de travail et notes

Le dossier affiché à gauche est l’espace de travail. Il n’y a ni compte ni copie distante.

- **File → New Markdown** crée une note nommée par un identifiant à quatorze chiffres et sélectionne
  le `title`.
- **New file** crée la même note dans le dossier choisi.
- **File → Open Folder…** change d’espace de travail ; **File → Save** enregistre.
- Seuls les documents ajoutés explicitement entrent dans la pile de session. Le tutoriel et ce guide
  sont des références et n’y entrent pas.

### En-tête YAML

```yaml
---
title: Une note
date: 2026-10-21
id: 20261021153000
keywords:
  - notes
  - export
---
```

`title` nomme le document, `id` est son identité stable et `lang` sa langue pour EPUB et les autres
exports. Les autres clés sont transmises à Pandoc et aux paquets de modèles. **Settings → New note**
définit l’en-tête initial ; le choix d’un `metadata.yaml` de paquet ne vaut que pour cette note.

Yi conserve le Markdown comme source de vérité tout en l’affichant mis en forme. Un lien, une formule
ou un bloc délimité révèle son Markdown quand le curseur y entre. Raccourcis : ⌘S / Ctrl+S,
⌘N / Ctrl+N, ⌘F / Ctrl+F, ⇧⌘F / Ctrl+Shift+F et F1.

## Exporter une note

| Type | Sortie |
| --- | --- |
| HTML | Dossier groupé avec page et ressources locales |
| LaTeX | Fichier `.tex` et ressources du modèle |
| PDF | PDF produit par une moteur TeX |
| EPUB | Livre EPUB |
| Word | `.docx` |
| LibreOffice | `.odt` |
| Markdown | Markdown prétraité par Yi |

Sauf Markdown, l’export exige Pandoc ; le PDF exige aussi XeLaTeX ou un autre moteur TeX. Yi cherche
Pandoc aux emplacements habituels et dans `PATH`, mais n’installe rien et ne lance pas TeX Live
Manager.

### Installer Pandoc et TeX

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

```sh
pandoc --version
xelatex --version
```

Si `pandoc --version` échoue, aucun export Pandoc n’est disponible. Si seul `xelatex --version`
échoue, tous les formats sauf PDF restent utilisables. Yi ne lance jamais `tlmgr`.

Chaque format possède un fichier `export.<kind>.yaml`, par exemple `export.pdf.yaml`. Ce sont des
Pandoc defaults ordinaires : writer, moteur PDF, coloration, variables de page, filtres et chemins de
ressources.

## Paquets de modèles

Un paquet est un dossier dans les données d’export de Yi. Il n’appartient pas à l’espace de travail et
n’entre pas dans la pile de session.

```text
example-latex/
  template.json
  template.tex
  journal.cls
  journal.bst
  metadata.yaml
  defaults.yaml
```

`template.json` est écrit par Yi. `kind` vaut `html`, `latex`, `pdf`, `epub`, `docx` ou `odt` ;
`mode` vaut `template`, `wrapper` ou `reference-doc`. Une entrée texte utilise `template`, Word et
ODT utilisent `reference_doc`. `assets` contient des chemins relatifs séparés par `/`. `deliver`
liste les classes et styles BibTeX à copier près du fichier LaTeX. `csl` permet d’imposer le style
de citation du paquet.

### Mode wrapper

Un document LaTeX complet avec `\begin{document}` et `\end{document}`, mais sans `$body$`, devient
une proposition de wrapper. Yi garde l’original sous `source.tex` et crée `template.tex` avec
`$body$` avant `\end{document}`. Le remplacement optionnel de `\title{}` et `\author{}` par
`$title$` et `$author$` est proposé.

### Créer depuis le modèle Pandoc par défaut

**Create…** demande nom, source et licence, puis fait produire par Pandoc le modèle ou le document de
référence par défaut. Word et ODT reçoivent `reference.docx` et `reference.odt`. L’origine est
enregistrée comme `pandoc-default`.

### Importer un kit

Yi accepte un fichier, un dossier ou un ZIP, inspecte avant de copier et refuse les chemins absolus,
`..`, liens symboliques et archives excessives. Les fichiers texte, classes, styles, bibliographies,
images, polices, CSS et JavaScript restent dans le paquet.

### Modifier et valider

Le panneau de code affiche les fichiers texte modifiables et les binaires en lecture seule, avec
numéros de ligne, recherche, annulation, coloration YAML/LaTeX et sauvegarde atomique.
**Validate** effectue une vraie conversion courte ; **Test PDF** exécute aussi le moteur PDF.

## Modèles HTML

```html
<!doctype html>
<html lang="$lang$">
  <head><meta charset="utf-8"><title>$title$</title></head>
  <body><main>$body$</main></body>
</html>
```

`$body$` apparaît une seule fois. Yi crée toujours un dossier de sortie. Sans **Self-contained HTML**,
les ressources et images locales sont copiées avec des URL relatives ; avec l’option, elles sont
intégrées et l’arborescence complète du paquet reste néanmoins livrée. Les URL HTTP(S) restent des URL.

## Modèles LaTeX et PDF

```tex
\documentclass{article}
\begin{document}
$if(title)$\title{$title$}\maketitle$endif$
$body$
\end{document}
```

Le titre, les auteurs, affiliations et adresses doivent venir des métadonnées de la note. L’export
LaTeX copie tout l’arbre de ressources près du `.tex`. Un fichier différent déjà présent n’est jamais
écrasé. Les images de la note remplacent un chemin relatif identique ; les autres vont dans
`<sortie>.assets/`.

```yaml
filters: []
cite-method: natbib
bibliography: references.bib
```

**Settings → Citation** reste la source de vérité. Yi n’écrit dans `references.bib` que les œuvres
citées ; le CSL-JSON utilise `citation-key`, sinon `id`. Les chemins TeX/BibTeX incluent le paquet et
le dossier de l’entrée. Yi refuse une extension shell illimitée dans les defaults PDF.

## Modèles EPUB

EPUB utilise `template.xhtml` avec un seul `$body$`. CSS, images, polices et scripts restent dans le
paquet avec des URL relatives. Pandoc construit le livre ; Yi ajoute les ressources dans
`EPUB/assets/` et les déclare dans `content.opf`. `title` et `lang` sont requis ; utilisez aussi
epubcheck avant publication.

## Modèles Word et OpenDocument

Word et OpenDocument utilisent des **documents de référence** stylés, non des modèles texte.

```text
example-docx/
  template.json
  reference.docx
  defaults.yaml
  metadata.yaml
```

Pandoc reprend les styles de paragraphe, caractère, tableau et page. Conservez les noms attendus pour
titre, sous-titre, auteur, date, résumé, titres hiérarchiques, corps, citations, code, légendes,
listes, notes, tableaux et bibliographie. Yi ne modifie pas les binaires ; **Open in system** les
ouvre dans Word ou LibreOffice.

### Partir du document de référence Pandoc

La section
[`--reference-doc`](https://pandoc.org/MANUAL.html#option--reference-doc)
du manuel Pandoc décrit les styles DOCX/ODT et le flux officiel. Le
[manuel Pandoc complet](https://pandoc.org/MANUAL.html) couvre les autres réglages transmis par Yi.

**Create…** génère le document par défaut dans Yi. En terminal :

```sh
pandoc -o custom-reference.docx --print-default-data-file reference.docx
pandoc -o custom-reference.odt --print-default-data-file reference.odt
```

Ouvrez le fichier dans Word ou LibreOffice, modifiez les styles et enregistrez-le sans renommer les
styles attendus.

- Le DOCX fournit styles et propriétés du document, dont format, marges, en-têtes et pieds de page ;
  son contenu visible est ignoré.
- Le ODT fournit ses feuilles de styles ; son contenu visible est ignoré.

Enregistrez-le comme `reference.docx` ou `reference.odt`, puis choisissez-le comme entrée du paquet
Word ou LibreOffice.

## YAML du paquet

`metadata.yaml` peut fournir l’en-tête d’une nouvelle note ; ses clés gagnent sauf `date` et `id`,
toujours écrits par Yi. `export.yaml` suit `export.<kind>.yaml` ; à défaut, `defaults.yaml` joue ce
rôle. Les réglages du paquet priment sur les valeurs de l’application, mais les arguments explicites
de sortie, modèle, CSL et ressources passent en dernier.

Un `csl` dans le YAML du paquet n’est qu’un fallback. **Settings → Citation** passe après et gagne.
Pour imposer un style, placez-le dans le champ `csl` de `template.json`. N’ajoutez pas citeproc une
seconde fois : Yi le fournit déjà et deux filtres dupliquent les références.

## Exemples complets et prompts IA

`test/fixtures/templates/examples/` contient des paquets complets HTML, LaTeX, PDF, Rho Class,
EPUB, Word et ODT.

Demandez à un agent IA un dossier source importable, sans `template.json` :

- **HTML** : `$body$`, sommaire latéral, `toc-depth: 2`, CSS/JS locaux.
- **LaTeX** : trois auteurs, affiliations distinctes, résumé, figures, tableaux, notes et citations.
- **PDF** : XeLaTeX, page de titre, résumé, code, figures, tableaux et bibliographie.
- **Rho Class PDF** : conserver le design CC BY 4.0, la classe, l’URL source et l’attribution.
- **EPUB** : couverture, éditeur, ISBN, droits, dédicace, sommaire et trois chapitres.
- **Word** : tous les styles dans `reference.docx`, `toc: true`, `toc-depth: 2`.
- **OpenDocument** : dissertation A4 avec couverture, résumé, sommaire à deux niveaux et pages du
  corps numérotées à partir de 1.

## Vérifier avant utilisation

1. Ouvrir le paquet dans l’éditeur de modèles.
2. Exécuter **Validate** et lire le message entier.
3. Pour un PDF, exécuter ensuite **Test PDF**.
4. Exporter une courte note avec titres, listes, tableau, code, maths et image.
5. Inspecter les ressources relatives et les fichiers bibliographiques.

| Message | Vérification |
| --- | --- |
| Pandoc not found | Installer Pandoc et relancer Yi avec le `PATH` actualisé |
| PDF engine not found | Installer TeX et vérifier `xelatex --version` |
| `journal.cls` not found | Placer la classe dans le paquet et l’ajouter au chemin TeX |
| Template variable missing | Comparer le modèle aux variables du writer Pandoc |
| Filter could not start | Installer le runtime du filtre ou le retirer des defaults |
| Local picture missing | Utiliser un chemin relatif et une image dans `assets` |

## Sécurité et confiance

Un modèle est une configuration exécutable : filtres Pandoc, Lua, classes LaTeX, paquets et polices.
N’utilisez que des modèles de confiance. Yi enregistre source et licence sans juger les droits. Il ne
télécharge pas de ressources de revue, n’installe pas de paquets TeX, ne lance pas `tlmgr`, interdit
une extension shell illimitée dans les defaults PDF et ne transforme pas automatiquement un exemple
arbitraire en modèle Pandoc parfait.

## Liste de vérification

- [ ] `template.json` existe avec le schéma 1.
- [ ] `kind`, entrée et `mode` concordent.
- [ ] Le modèle texte contient un seul `$body$` au bon endroit.
- [ ] Le document de référence s’ouvre dans Word ou LibreOffice.
- [ ] Tous les chemins de `assets`, `deliver` et `csl` existent.
- [ ] Les liens relatifs utilisent `/` et restent dans le paquet.
- [ ] `metadata.yaml` est une table YAML de premier niveau.
- [ ] `defaults.yaml` / `export.yaml` ne contiennent que le nécessaire.
- [ ] Les defaults PDF n’activent pas l’extension shell.
- [ ] Une courte note représentative est validée.
- [ ] L’export réel contient classes, styles, images et références.
