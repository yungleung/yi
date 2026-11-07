---
title: Bienvenue dans Yi
id: yi-tutorial
lang: fr
---

Yi est une application de notes qui travaille en local. Vos notes sont de simples fichiers markdown
dans un dossier que vous choisissez. Il n'y a ni compte ni serveur : ce que vous voyez est le texte
qui reste sur votre disque.

## Commencer avec un espace de travail

Un **espace de travail** est le dossier que Yi lit et écrit. L'arbre à gauche est ce dossier :

- cliquez sur une note pour l'ouvrir ;
- utilisez **Fichier → Nouvelle note** pour en créer une ;
- faites un clic droit sur un dossier ou une note pour les actions qui le concernent.

Si vous n'avez pas encore choisi d'espace de travail, Yi vous propose d'en créer un dans votre
dossier Documents. Pour passer à un autre dossier plus tard, utilisez **Fichier → Ouvrir un
dossier…**.

## Créer une note

**Fichier → Nouvelle note** demande un nom et crée un fichier markdown dans l'espace de travail. Le
nom devient celui du fichier ; la note peut avoir son propre `title` dans son frontmatter.

Chaque note est enregistrée pendant que vous écrivez. **Fichier → Enregistrer** écrit de nouveau le
texte courant, et **Enregistrer sous** place une copie ailleurs.

## Écrire dans la page

Yi modifie le markdown tel qu'il s'affiche. Les titres, les listes, les tableaux et le code se
montrent comme eux-mêmes. Quand le curseur entre dans un mot mis en forme, Yi montre ses marques
autour, par exemple `**gras**` ou `*italique*` ; quand il en sort, la page est dessinée simplement.

La barre d'outils a les mêmes commandes que le menu. Sélectionnez un mot et appuyez sur **Gras**, ou
utilisez le clavier :

| Action | Raccourci |
| --- | --- |
| Annuler | ⌘Z |
| Rechercher | ⌘F |
| Enregistrer | ⌘S |
| Nouvelle note | ⌘N |

Sous Windows et Linux, utilisez Ctrl à la place de ⌘.

## Le frontmatter nomme la note

Le bloc entre les deux lignes `---` en haut est le **frontmatter**. Son `title` est le nom de la
note ; il sert de titre principal même si le corps n'a pas de `# titre`.

```yaml
---
title: Une note avec un nom
id: 20261017120000
keywords: notes, exemple
---
```

L'`id` est l'identité stable de la note, que les wikiliens peuvent utiliser. Dans
**Réglages → Nouvelle note**, vous modifiez dans un éditeur YAML le frontmatter du début de chaque
nouvelle note ; les changements sont enregistrés automatiquement.

## Donner une structure à la page

Pour faire un titre, écrivez d'abord ses mots. Cliquez ensuite au tout début de la ligne et placez
la marque devant : `# ` pour un titre de premier niveau, `## ` pour un titre de deuxième niveau,
et ainsi de suite. L'espace après les dièses est nécessaire. Par exemple, écrivez `Une section`,
cliquez devant `Une` et tapez `## `.

### Titre de niveau deux

#### Titre de niveau trois

Les paragraphes sont séparés par une ligne vide. Utilisez **Gras**, *italique*, ~~barré~~ et `code
en ligne` là où ils aident à lire. Une ligne horizontale sépare les idées :

---

Les listes à puces, numérotées et de tâches sont du markdown ordinaire :

- une puce
- une autre puce
  - une puce imbriquée

1. premier
2. deuxième

- [ ] une tâche à faire
- [x] une tâche faite

Pour faire une citation, commencez une nouvelle ligne par `> ` puis écrivez le texte. Chaque
paragraphe cité commence par `> ` ; une ligne sans cette marque est hors de la citation.

> Une citation tient un passage à distance.

Les tableaux s'écrivent avec des barres verticales :

| Fonction | Comment l'utiliser |
| --- | --- |
| Gras | sélectionnez du texte et appuyez sur **Gras** |
| Tableau | **Insérer → Tableau** |
| Code | tapez un bloc délimité |

## Code, formules et notes

Un bloc délimité garde le code exactement tel qu'il est écrit :

```js
const answer = 42;
console.log(answer);
```

Une formule en ligne s'écrit `$E = mc^2$`. Une formule affichée prend son propre bloc :

$$
\frac{a}{b} + \frac{c}{d} = \frac{ad + bc}{bd}
$$

Une note de bas de page est une référence dans la phrase et une explication sous le texte.[^premiere]

[^premiere]: Voici le texte de la note. Yi numérote les notes pour vous.

## Lier les notes et les images

Un wikilien relie des notes par titre, nom de fichier ou id : `[[Une autre note]]`. Tapez `[[` et Yi
propose les notes qu'il trouve. Un lien web ordinaire s'écrit
`[les mots](https://example.com)`.

Une image est une image markdown ordinaire : `![description](image.png)`. Un chemin relatif est
cherché d'abord à côté de la note, puis dans le dossier d'images de **Réglages → Général**. Le
bouton d'image insère une image depuis un fichier ou le presse-papiers.

## Citer ce que vous lisez

Les citations utilisent la syntaxe de pandoc : `[@smith2020]`. Choisissez un fichier de
bibliographie et un style de citation dans **Réglages → Citations** ; Yi affiche alors la citation
formatée dans la page et les œuvres citées sous Références à l'export.

## Chercher et remplacer

**Édition → Rechercher** parcourt la note ; **Édition → Remplacer** change une occurrence ou
toutes. La recherche fonctionne dans la page affichée et dans le code source d'un bloc.

## Exporter la note

**Fichier → Exporter** propose un document Word, un fichier OpenDocument, LaTeX, HTML, un livre
EPUB, un PDF et le markdown traité par l'application. La carte nomme le fichier et les réglages de
conversion. Les images sont reprises dans la sortie ; un SVG ou un WebP est dessiné en PNG là où le
format choisi ne peut pas le contenir.

## Garder une version

**Fichier → Enregistrer une version** garde un instantané de la note dans un dépôt git. Les
versions ne sont créées que lorsque vous le demandez, et le panneau des versions vous laisse lire
une copie ancienne et la comparer au texte actuel.

## Adapter l'application

**Réglages** change la langue, l'apparence, le dossier d'images, les citations, le frontmatter des
nouvelles notes et si un document non enregistré s'ouvre dans la pile. Il n'y a pas de bouton
Enregistrer : les champs de texte sont enregistrés après une courte pause ou quand vous les quittez,
et les choix et interrupteurs immédiatement. **Apparence** propose Automatique, Clair et Sombre ;
Automatique suit le système. **Nouvelle note** utilise un éditeur YAML, et Réinitialiser restaure le
modèle de l'application. L'espace de travail se change avec **Fichier → Ouvrir un dossier…**, pas
dans les Réglages.

L'application se souvient des documents ouverts et de l'endroit où vous étiez. Fermez la fenêtre et
rouvrez-la ; la même page revient.

## Une note à essayer

Copiez ceci dans une nouvelle note et modifiez-le :

```markdown
---
title: Ma première note
---

## Ce dont j'écris

Une idée avec du **poids**, un [lien](https://example.com) et une note de bas de page.[^1]

Une formule : $a^2 + b^2 = c^2$.

[^1]: La note sous la ligne.
```

C'est toute la forme d'une note Yi : du texte simple, un peu de markdown, et une page facile à lire
pendant que vous écrivez.
