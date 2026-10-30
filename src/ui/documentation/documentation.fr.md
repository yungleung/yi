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
New note propose aussi les modèles intégrés **Reveal.js presentation** et
**Beamer presentation** : ce sont des métadonnées de présentation, pas des paquets de modèles.

Yi conserve le Markdown comme source de vérité tout en l’affichant mis en forme. Un lien, une formule
ou un bloc délimité révèle son Markdown quand le curseur y entre. Raccourcis : ⌘S / Ctrl+S,
⌘N / Ctrl+N, ⌘F / Ctrl+F, ⇧⌘F / Ctrl+Shift+F et F1.

### Listes

Une liste à puces, ordonnée ou de tâches complète devient un objet de liste numéroté lorsqu’elle est
suivie d’une ligne de légende :

```markdown
1. Préparer l’échantillon
2. Effectuer la mesure

: Étapes {#list:steps .wide data-owner=demo}
```

La ligne commençant par deux-points peut suivre directement la liste ou venir après exactement une
ligne vide. Elle utilise la même grammaire de légende qu’un tableau. Une liste avec seulement une
légende est numérotée, mais reste sans cible sans ID :

```markdown
: Vérifications préliminaires
```

Une liste avec seulement un ID possède une cible et un numéro visible, mais aucun texte de légende :

```markdown
: {#list:steps}
```

Une liste ordinaire sans ligne de légende ne reçoit ni numéro d’objet ni cible. Le numéro de l’objet
est indépendant des marqueurs `1.`, `2.` à l’intérieur d’une liste ordonnée.

`[#list:steps]` crée une référence automatique ; un lien ordinaire conserve le texte écrit par
l’auteur :

```markdown
Voir [#list:steps].
Voir [les étapes de mesure](#list:steps).
```

Le texte automatique par défaut est `List 1`, quelle que soit la langue de ce guide. Le mot et le
préfixe numérique littéral se configurent dans l’en-tête YAML :

```yaml
reference-labels:
  list: Procédure
reference-number-prefixes:
  list: "3-"
```

La référence et la légende visible utilisent alors `Procédure 3-1`.

HTML, EPUB, Word et ODT reçoivent la même structure de cible, de position de légende, de mot, de
préfixe et de numérotation. Les writers produisent des conteneurs natifs différents, mais le
comportement visible est commun. Les marqueurs de liste, cases de tâches et listes imbriquées ne
changent pas. Le Markdown prétraité reprend la structure du HTML.

⌘-clic ou Ctrl-clic sur une référence révèle la liste et place le curseur dans le premier élément
modifiable. Un clic sur la légende rendue révèle sa source complète `: Légende {…}`, où le texte,
l’ID, les classes et les attributs peuvent être modifiés.

Les listes n’exigent aucun bloc `:::` dans la source. La légende avec deux-points laisse les blocs
fenced div disponibles pour les callouts. Deux-points indentés dans un élément de liste restent le
contenu de cet élément ; après un paragraphe ordinaire, Pandoc conserve leur sens de liste de
définitions.

#### Numérotation des listes en LaTeX et PDF

LaTeX n’a pas de compteur natif pour un objet de liste complet : `enumi`, `enumii` et les compteurs
similaires numérotent les éléments et sont limités à un environnement `enumerate`. Yi donne donc à
l’objet de liste le compteur propre `yilist`, tandis que `\label`, `\ref` et `hyperref` restent les
mécanismes natifs de référence de LaTeX.

La valeur par défaut est une séquence globale par document. Un modèle LaTeX/PDF peut configurer le
niveau de remise à zéro et le format par `\yiListCounterSetup`. Pour une numérotation par chapitre :

```tex
\makeatletter
\providecommand{\yiListCounterSetup}{}
\renewcommand{\yiListCounterSetup}{%
  \@addtoreset{yilist}{chapter}%
  \renewcommand{\yiListNumber}{\thechapter.\arabic{yilist}}%
}
\makeatother
```

Yi appelle ce hook à `\begin{document}`, puis applique le mot et le préfixe littéral de la note.
`\yiListNumber` contrôle le numéro sous-jacent sans supprimer le préfixe. Si la numérotation doit
correspondre exactement au compteur de tableaux d’un modèle, les deux compteurs doivent être
configurés au même endroit avec le même niveau de remise à zéro ; Yi ne peut pas déduire
automatiquement les règles d’une classe arbitraire.

## Callouts

Une alerte de style GitHub crée un callout :

```markdown
> [!NOTE]
> Un point à remarquer.
```

Les cinq types intégrés sont `NOTE`, `TIP`, `IMPORTANT`, `WARNING` et `CAUTION`. Leurs titres restent
`Note`, `Tip`, `Important`, `Warning` et `Caution`, indépendamment de la langue de l’interface. Les
libellés ne distinguent pas majuscules et minuscules. La ligne de citation vide après le marqueur est
facultative. Un libellé inconnu, un libellé suivi de texte ou un marqueur échappé comme
`> \[!NOTE]` reste une citation ordinaire.

Yi accepte aussi la syntaxe Pandoc des Div clôturés :

```markdown
::: {.callout .callout-note}
Un callout intégré.
:::

::: {.callout .callout-definition title="Définition"}
Un type personnalisé.
:::
```

La forme courte `.callout-note` est également reconnue. Pour un type personnalisé sans `title=`, le
titre vient du nom de classe sans passer par la langue de l’interface. Les ID, classes et autres
attributs sont conservés pour l’export. Un ID de Div reste une métadonnée Pandoc et ne devient pas une
cible de référence Yi.

Taper `:::` seul sur une ligne crée un Div Note fermé et ouvre six choix : Note, Tip, Important,
Warning, Caution et Definition. Le choix ne change que la classe `.callout-<type>` ; le corps, l’ID,
les autres classes et les attributs restent intacts.

Les callouts peuvent être imbriqués dans des citations ou d’autres callouts. Leur corps accepte les
paragraphes, listes, tableaux, blocs de code, équations, légendes, citations et citations Markdown
ordinaires.

Les marqueurs d’ouverture restent conscients de leur conteneur pendant l’édition. Saisir `$$`,
`[$$`, un bloc de code délimité par trois accents graves ou `:::` crée la construction appariée
correspondante, préfixe chaque ligne source générée par la chaîne `>` active et conserve le sélecteur
de type de callout pour `:::`. Dans un bloc de code ou une formule d’affichage placé dans une
citation ou un callout, Entrée suit la règle du bloc enfant et peut créer autant de lignes vides
consécutives que nécessaire. Un callout Div ajoute exactement un saut de ligne préfixé par Entrée,
même lorsqu’il est imbriqué dans une autre citation ou un autre callout.

La complétion des citations après `@`, des wikilinks après `[[` et des références automatiques après
`[#` reste disponible dans les deux formes source. Choisir une ligne n’écrit que la clé ou l’ID de
destination ; le préfixe de citation et les crochets autour restent intacts. La liste s’ouvre dès
que le marqueur est saisi ou validé par une méthode de saisie ; Tab n’est pas nécessaire.

Les ouvrants `[`, `(` et `{` sont appariés automatiquement dans le texte ordinaire, les citations,
les callouts GitHub et les callouts Div, y compris lorsqu’un caractère arrive par une méthode de
saisie. Dans la destination d’un lien vers le même document, saisir `#` après `](` propose aussi les
cibles de référence du document ; accepter une ligne n’écrit que l’ID du fragment.
Après avoir accepté l’une de ces suggestions, le curseur reste au bord fermant du nœud et son
Markdown demeure visible pour la modification. Le caractère suivant est écrit après le nœud et
rend le lien, la référence, la citation ou le wikilien terminé. Si le caractère prolonge encore
la même construction, par exemple une clé de citation narrative, sa source reste visible.

Yi affiche le panneau quand le curseur est à l’extérieur ; cliquer sur le titre ou le
corps révèle la source complète, et quitter le bloc restaure le rendu.
Une citation ordinaire révèle sa source complète selon la même règle : les marqueurs échappés, les
préfixes `>` et les délimiteurs internes sont exactement les caractères modifiés.
Hors du mode source, une citation ordinaire est décalée des deux côtés et porte un grand guillemet
ouvrant. Elle n’a ni trait latéral épais ni guillemet fermant.

Dans un paragraphe de citation ordinaire, Entrée crée deux lignes vides portant le préfixe `>`
complet. Le texte suivant forme un nouveau paragraphe. Une seconde pression sur Entrée dans le
paragraphe vide retire une seule profondeur de citation ; dans une citation imbriquée, répétez une
fois par niveau. Les listes, tableaux, blocs de code et équations gardent leur comportement habituel,
et chaque ligne source insérée reçoit le préfixe complet. Après la fermeture d’un bloc enfant, Entrée
ajoute le même paragraphe de deux lignes vides préfixées.

La saisie sur une ligne `>` vide produit exactement `>B`, sans espace invisible ajouté. Si la source
contient déjà l’espace visible `> `, il est conservé. Backspace ou Delete sur une ligne de citation
vide retire toute la ligne physique, pas seulement le `>`.
Entrée sur un élément de liste vide retire son marqueur et laisse une ligne normale du corps de la
citation ou du callout.
Lors de l’insertion d’un tableau dans une citation ou un callout GitHub, chaque ligne et séparateur
reçoit la même chaîne de `>` ; le tableau reste donc dans le conteneur.

Dans un callout délimité par un Div, Entrée insère exactement un saut de ligne. Chaque Entrée
supplémentaire ajoute une autre ligne vide et le curseur reste sur la plus récente. Un Div dans une
citation conserve son préfixe visible sur chaque ligne insérée.

Un callout vide garde une ancre de curseur invisible dans son corps. Left depuis le bloc suivant et
Right depuis le bloc précédent y entrent ; la navigation seule ne modifie pas la source. Le premier
caractère saisi matérialise la ligne de corps manquante.
Entrée sur le marqueur d’un callout GitHub vide crée les deux lignes vides préfixées d’un paragraphe
de citation et place le curseur sur la seconde ; une nouvelle Entrée retire ces marqueurs et quitte
le callout. Entrée sur l’ouverture vide d’un callout Div crée une ligne de corps modifiable avant sa
fermeture.

Tous les exports Pandoc transforment les deux écritures en un même Div sémantique :

```markdown
:::: {.callout .callout-note}
::: {.callout-title}
Note
:::

Un point à remarquer.
::::
```

Les modèles HTML, EPUB, DOCX, ODT et LaTeX/PDF peuvent régler l’apparence par CSS, styles de
référence ou filtre Lua. Le filtre reçoit `.callout`, `.callout-<type>`, `.callout-title` et le corps
dans l’ordre du document. La conversion précède les filtres du modèle : ceux-ci voient donc cette
structure stable plutôt que la syntaxe GitHub ou le Div source.

## Exporter une note

| Type | Sortie |
| --- | --- |
| HTML | Dossier groupé avec page et ressources locales |
| Reveal.js | Paquet de présentation avec `images/` et `js/dist/` local par défaut |
| LaTeX | Fichier `.tex` et ressources du modèle |
| Beamer | PDF de présentation produit par XeLaTeX |
| PDF | PDF produit par une moteur TeX |
| EPUB | Livre EPUB |
| Word | `.docx` |
| LibreOffice | `.odt` |
| Markdown | Markdown prétraité par Yi |

Sauf Markdown, l’export exige Pandoc ; le PDF exige aussi XeLaTeX ou un autre moteur TeX. Yi cherche
Pandoc aux emplacements habituels et dans `PATH`, mais n’installe rien et ne lance pas TeX Live
Manager.

La carte d’export choisit la destination et, pour les types qui les acceptent, un paquet de modèles
ou de ressources. Reveal.js et Beamer n’acceptent pas de paquet de modèles. Le choix mémorisé vaut par
type d’export, pas par note.

### Exports de présentation

Reveal.js lit dans l’en-tête `title`, `subtitle`, `author`, `theme`, `transition`,
`slide-level` et les autres contrôles Pandoc. Il écrit toujours un dossier non autonome :

```text
presentation/
  presentation.html
  images/
  js/dist/
```

`examples/revealjs.md` utilise une image fournie ; son export local par défaut fonctionne donc
aussi hors connexion.

La carte propose deux choix indépendants, désactivés par défaut :

- **Use remote Reveal.js resources** conserve les URL CDN fixées par Pandoc. Sinon, Yi télécharge
  le JavaScript, les feuilles de style, le thème et les extensions Reveal.js dans `js/dist/`.
- **Use remote pictures** conserve les URL des images web. Sinon, chaque image distante est
  téléchargée dans `images/` ; les images locales y sont toujours copiées.

Beamer utilise `title`, `subtitle`, `author`, `institute`, `theme`, `colortheme`, `fonttheme`,
`aspectratio`, `navigation` et `section-titles`. Il écrit un seul PDF et ne propose ni modèle ni
taille de page. Les titres de niveau un sont des sections et ceux de niveau deux des diapositives.

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
n’entre pas dans la pile de session. Le sélecteur ne montre que les paquets du type d’export choisi.
Un paquet dont le manifeste est illisible reste visible pour pouvoir être supprimé, mais ne peut être
ni utilisé ni modifié.

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

`examples/templates/` contient des paquets complets destinés aux lecteurs pour HTML, LaTeX, PDF,
Rho Class, EPUB, Word et ODT. Les présentations de référence complètes se trouvent un niveau
au-dessus, dans `examples/revealjs.md` et `examples/beamer.md`. `examples/` est destiné aux lecteurs ;
`test/fixtures/` contient des données de test contrôlées et remplit un autre rôle.

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
