---
title: Documentación de Yi
id: yi-documentation
lang: es
---

Yi es un editor Markdown que trabaja localmente. Un espacio de trabajo es una carpeta normal, cada
nota es un archivo Markdown normal y la exportación se entrega a Pandoc. Esta guía explica el trabajo
diario y la creación de paquetes de plantillas de exportación.

El documento es de solo lectura. **F1** lo vuelve a abrir; otra nota lo sustituye sin preguntar si
se debe guardar.

## Espacio de trabajo y notas

La carpeta del árbol izquierdo es el espacio de trabajo. No hay cuenta ni copia remota.

- **File → New Markdown** crea una nota con un identificador de catorce cifras y selecciona `title`.
- **New file** crea otra nota en la carpeta elegida.
- **File → Open Folder…** cambia el espacio de trabajo y **File → Save** guarda.
- Solo los documentos añadidos explícitamente entran en la pila de sesión. El tutorial y esta guía
  son referencias y nunca entran.

### Frontmatter

```yaml
---
title: Una nota
date: 2026-10-21
id: 20261021153000
keywords:
  - notes
  - export
---
```

`title` nombra el documento, `id` es su identidad fija y `lang` declara el idioma de EPUB y otros
formatos. Las demás claves están disponibles para Pandoc y los paquetes. **Settings → New note**
define el frontmatter inicial; el `metadata.yaml` de un paquete solo afecta a esa nota nueva.

Yi conserva Markdown como fuente de verdad mientras muestra el resultado. Al entrar en un enlace,
fórmula o bloque delimitado se muestra su Markdown para editarlo. Atajos: ⌘S / Ctrl+S guardar,
⌘N / Ctrl+N nueva, ⌘F / Ctrl+F buscar, ⇧⌘F / Ctrl+Shift+F reemplazar y F1 documentación.

### Listas

Una lista completa de viñetas, ordenada o de tareas se convierte en un objeto de lista numerado
cuando la sigue una línea de leyenda:

```markdown
1. Preparar la muestra
2. Ejecutar la medición

: Pasos {#list:steps .wide data-owner=demo}
```

La línea con dos puntos puede seguir directamente a la lista o después de exactamente una línea en
blanco. Usa la misma gramática de leyenda que una tabla. Una lista que solo tiene leyenda se numera,
pero sin ID no puede ser destino de una referencia:

```markdown
: Comprobaciones preliminares
```

Una lista que solo tiene ID posee destino y número visible, pero no texto de leyenda:

```markdown
: {#list:steps}
```

Una lista normal sin línea de leyenda no recibe número de objeto ni destino. El número del objeto es
independiente de los marcadores `1.`, `2.` dentro de una lista ordenada.

`[#list:steps]` crea una referencia automática; un enlace normal conserva el texto escrito por el
autor:

```markdown
Consulta [#list:steps].
Consulta [los pasos de medición](#list:steps).
```

El texto automático predeterminado es `List 1`, independientemente del idioma de esta guía. La
palabra y el prefijo numérico literal se configuran en el frontmatter:

```yaml
reference-labels:
  list: Procedimiento
reference-number-prefixes:
  list: "3-"
```

La referencia y la leyenda visible usarán entonces `Procedimiento 3-1`.

HTML, EPUB, Word y ODT reciben la misma estructura de destino, posición de leyenda, palabra,
prefijo y numeración. Cada writer produce un contenedor nativo distinto, pero el comportamiento
visible es común. Los marcadores de lista, las casillas de tareas y las listas anidadas no cambian.
Markdown preprocesado usa la misma estructura que HTML.

⌘-clic o Ctrl-clic en una referencia revela la lista y coloca el cursor en el primer elemento
editable. Al hacer clic en la leyenda renderizada se muestra su fuente completa
`: Leyenda {…}`, donde pueden editarse texto, ID, clases y atributos.

Las listas no necesitan un bloque `:::` en el código fuente. La leyenda con dos puntos deja los
bloques fenced div disponibles para callouts. Unos dos puntos indentados dentro de un elemento
siguen siendo contenido de ese elemento; después de un párrafo normal, Pandoc conserva su
significado de lista de definiciones.

#### Numeración de listas en LaTeX y PDF

LaTeX no tiene un contador nativo para un objeto de lista completo: `enumi`, `enumii` y contadores
similares numeran elementos y se limitan a un entorno `enumerate`. Por eso Yi da al objeto de lista
el contador propio `yilist`, mientras `\label`, `\ref` y `hyperref` siguen siendo los mecanismos
nativos de referencia de LaTeX.

De forma predeterminada hay una secuencia global por documento. Una plantilla LaTeX/PDF puede
configurar el nivel de reinicio y el formato mediante `\yiListCounterSetup`. Para numerar por
capítulo:

```tex
\makeatletter
\providecommand{\yiListCounterSetup}{}
\renewcommand{\yiListCounterSetup}{%
  \@addtoreset{yilist}{chapter}%
  \renewcommand{\yiListNumber}{\thechapter.\arabic{yilist}}%
}
\makeatother
```

Yi llama al hook en `\begin{document}` y después aplica la palabra y el prefijo literal de la nota.
`\yiListNumber` controla el número subyacente sin quitar el prefijo. Si la numeración debe coincidir
exactamente con el contador de tablas de una plantilla, ambos contadores deben configurarse en el
mismo lugar y con el mismo nivel de reinicio; Yi no puede inferir automáticamente las reglas de una
clase arbitraria.

## Callouts

Una alerta de estilo GitHub crea un callout:

```markdown
> [!NOTE]
> Algo que conviene advertir.
```

Los cinco tipos integrados son `NOTE`, `TIP`, `IMPORTANT`, `WARNING` y `CAUTION`. Sus títulos
visibles siempre son `Note`, `Tip`, `Important`, `Warning` y `Caution`, independientemente del idioma
de la interfaz. Las etiquetas no distinguen mayúsculas de minúsculas. La línea de cita vacía después
del marcador es opcional. Una etiqueta desconocida, una etiqueta seguida de texto o un marcador
escapado como `> \[!NOTE]` siguen siendo una cita normal.

También se acepta la sintaxis de Div cercado de Pandoc:

```markdown
::: {.callout .callout-note}
Un callout integrado.
:::

::: {.callout .callout-definition title="Definición"}
Un tipo personalizado.
:::
```

También vale la forma corta `.callout-note`. Para un tipo personalizado sin `title=`, el título se
deriva del nombre de clase sin depender del idioma de la interfaz. Los ID, clases y demás atributos
se conservan para la exportación; un ID de Div es metadatos de Pandoc y no una referencia de Yi.

Escribir `:::` en una línea propia crea un Div Note cerrado y abre seis opciones: Note, Tip,
Important, Warning, Caution y Definition. La elección cambia solo la clase `.callout-<tipo>`; el
cuerpo, el ID, las demás clases y los atributos permanecen intactos.

Los callouts pueden anidarse dentro de citas u otros callouts. Su cuerpo admite párrafos, listas,
tablas, bloques de código, ecuaciones, leyendas, citas y citas Markdown normales. Yi muestra el panel
cuando el cursor está fuera; al hacer clic en el título o el cuerpo aparece la fuente completa y al
salir del bloque vuelve la vista renderizada.

Los marcadores de apertura conservan el contexto del contenedor durante la edición. Escribir `$$`,
`[$$`, un bloque de código delimitado por tres acentos graves o `:::` crea la construcción
emparejada correspondiente, añade el prefijo `>` activo a cada línea fuente generada y conserva el
selector de tipo de callout para `:::`. Dentro de código o fórmulas en bloque de una cita o callout,
Enter sigue la regla del bloque hijo y puede crear cualquier número de líneas vacías consecutivas.
Un callout Div crea exactamente una línea nueva con prefijo por cada Enter, también cuando está
anidado en otra cita o callout.

La finalización de citas después de `@`, de wikilinks después de `[[` y de referencias automáticas
después de `[#` sigue disponible en ambas formas de origen. Al elegir una fila solo se escribe la
clave o el ID de destino; el prefijo de cita y los corchetes que lo rodean quedan intactos. La lista
aparece en cuanto se escribe el marcador o lo confirma un método de entrada; no hace falta pulsar Tab.

Los signos de apertura `[`, `(` y `{` se emparejan automáticamente en texto normal, citas, callouts
de GitHub y callouts Div, también cuando el carácter llega desde un método de entrada. En el destino
de un enlace normal al mismo documento, escribir `#` después de `](` también muestra los destinos de
referencia; al aceptar una fila solo se escribe el ID del fragmento.
Al aceptar cualquiera de estas sugerencias, el enlace, la referencia, la cita o el wikilink se
renderizan de inmediato y el cursor queda justo después de su delimitador de cierre.

Una cita normal muestra su fuente completa con la misma regla, de modo que los marcadores escapados,
los prefijos `>` y los delimitadores internos sean exactamente los caracteres que se editan.
Fuera del modo fuente, una cita normal tiene margen a ambos lados y una gran comilla inicial. No
muestra la línea lateral gruesa ni la comilla final.

En un párrafo de cita normal, Enter crea dos líneas vacías con el prefijo `>` completo. El texto
siguiente forma otro párrafo. Un segundo Enter en el párrafo vacío quita solo un nivel de cita; en
citas anidadas se repite una vez por nivel. Las listas, tablas, bloques de código y ecuaciones
mantienen su comportamiento normal, y cada línea nueva recibe el prefijo completo. Cuando termina un
bloque hijo, Enter añade el mismo párrafo de dos líneas vacías con prefijo.

Escribir en una línea `>` vacía produce exactamente `>B`, sin añadir un espacio invisible. Si la
fuente ya contiene el espacio visible `> `, se conserva. Backspace o Delete en una línea de cita
vacía elimina la línea física completa, no solo el carácter `>`.
Enter sobre un elemento de lista vacío elimina su marcador y deja una línea normal del cuerpo de la
cita o del callout.
Al insertar una tabla dentro de una cita o callout de GitHub, cada fila y separador recibe la misma
cadena de `>`, por lo que la tabla permanece dentro del contenedor.

Dentro de un callout con Div cercado, Enter inserta exactamente un salto de línea. Cada Enter
adicional crea otra línea vacía y el cursor se queda en la más reciente. Un Div dentro de una cita
conserva su prefijo visible en cada línea insertada.

Un callout vacío conserva un ancla invisible para el cursor del cuerpo. Left desde el bloque
posterior y Right desde el anterior entran en ella; navegar no modifica la fuente. El primer
carácter escrito crea la línea de cuerpo que falta.
Enter en la línea del marcador de un callout GitHub vacío crea las dos líneas vacías con prefijo de
un párrafo de cita y coloca el cursor en la segunda; otro Enter elimina esas marcas y abandona el
callout. Enter en la apertura vacía de un callout Div crea una línea de cuerpo editable antes de su
cierre.

Todas las exportaciones con Pandoc convierten ambas formas en el mismo Div semántico:

```markdown
:::: {.callout .callout-note}
::: {.callout-title}
Note
:::

Algo que conviene advertir.
::::
```

Las plantillas HTML, EPUB, DOCX, ODT y LaTeX/PDF pueden aplicar estilos mediante CSS, documentos de
referencia o un filtro Lua. El filtro recibe `.callout`, `.callout-<tipo>`, `.callout-title` y el
cuerpo en orden. La conversión ocurre antes de los filtros de plantilla, que así trabajan con esta
estructura estable y no con el código GitHub o el Div original.

## Exportar una nota

| Tipo | Salida |
| --- | --- |
| HTML | Carpeta con la página y recursos locales |
| LaTeX | `.tex` y recursos del paquete |
| PDF | PDF generado por TeX |
| EPUB | Libro EPUB |
| Word | `.docx` |
| LibreOffice | `.odt` |
| Markdown | Markdown preprocesado por Yi |

Todo excepto Markdown necesita Pandoc; PDF también necesita XeLaTeX u otro motor TeX. Yi busca Pandoc
en ubicaciones habituales y en `PATH`, pero no instala software ni ejecuta TeX Live Manager.

### Instalar Pandoc y TeX

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

Si falla `pandoc --version`, no funciona ninguna exportación con Pandoc. Si solo falla
`xelatex --version`, todo excepto PDF sigue disponible. Yi nunca ejecuta `tlmgr`.

Cada formato tiene un archivo editable `export.<kind>.yaml`, por ejemplo `export.pdf.yaml`. Son
Pandoc defaults normales para writer, motor PDF, resaltado, variables de página, filtros y rutas.

## Paquetes de plantillas

Un paquete vive en los datos de exportación de Yi, fuera del espacio de trabajo y de la sesión.

```text
example-latex/
  template.json
  template.tex
  journal.cls
  journal.bst
  metadata.yaml
  defaults.yaml
```

Yi mantiene `template.json`. `kind` es `html`, `latex`, `pdf`, `epub`, `docx` u `odt`; `mode` es
`template`, `wrapper` o `reference-doc`. Las plantillas de texto usan `template`; Word y ODT usan
`reference_doc`. `assets` contiene rutas relativas separadas por `/`, `deliver` enumera clases y
estilos BibTeX para LaTeX y `csl` puede imponer el estilo de citas del paquete.

### Modo wrapper

Un documento LaTeX completo con `\begin{document}` y `\end{document}`, pero sin `$body$`, se propone
como wrapper. Yi conserva el original como `source.tex` y crea `template.tex` con `$body$` antes de
`\end{document}`. Opcionalmente sustituye `\title{}` y `\author{}` por `$title$` y `$author$`.

### Crear desde el valor predeterminado de Pandoc

**Create…** pide nombre, origen y licencia, y ejecuta Pandoc para crear la plantilla o el documento
de referencia. Word y ODT reciben `reference.docx` y `reference.odt`. El origen se registra como
`pandoc-default`.

### Importar un kit

Se puede importar un archivo, carpeta o ZIP. Yi inspecciona antes de copiar y rechaza rutas absolutas,
`..`, enlaces simbólicos, demasiados archivos o tamaño excesivo. Clases, estilos, bibliografías,
imágenes, fuentes, CSS y JavaScript se conservan como recursos.

### Editar y validar

El panel de código muestra archivos de texto editables y binarios de solo lectura, con números de
línea, búsqueda, deshacer, resaltado YAML/LaTeX y guardado atómico. **Validate** hace una conversión
real corta; **Test PDF** también ejecuta el motor PDF.

## Plantillas HTML

```html
<!doctype html>
<html lang="$lang$">
  <head><meta charset="utf-8"><title>$title$</title></head>
  <body><main>$body$</main></body>
</html>
```

`$body$` aparece una vez. Yi siempre crea una carpeta de salida. Sin **Self-contained HTML**, los
recursos y las imágenes locales se copian con URL relativas; con la opción activa se incrustan, pero
el paquete completo igualmente se copia. Las URL HTTP(S) permanecen intactas.

## Plantillas LaTeX y PDF

```tex
\documentclass{article}
\begin{document}
$if(title)$\title{$title$}\maketitle$endif$
$body$
\end{document}
```

El título, autores, instituciones y correos deben venir de los metadatos de la nota. La exportación
LaTeX copia todo el árbol de recursos junto al `.tex`; nunca sobrescribe un archivo distinto ya
presente. Las imágenes locales sustituyen el mismo camino relativo del paquete y las demás van a
`<salida>.assets/`.

```yaml
filters: []
cite-method: natbib
bibliography: references.bib
```

**Settings → Citation** es la fuente de verdad. Yi escribe en `references.bib` solo las obras
citadas; CSL-JSON usa `citation-key` o, si falta, `id`. El paquete y la carpeta de entrada se añaden
a las rutas TeX/BibTeX. Yi rechaza la extensión de shell sin restricciones en defaults PDF.

## Plantillas EPUB

EPUB usa `template.xhtml` con un único `$body$`. CSS, imágenes, fuentes y scripts deben estar dentro
del paquete con URL relativas. Pandoc crea el libro; Yi añade recursos en `EPUB/assets/` y los declara
en `content.opf`. Se necesitan `title` y `lang`; para publicar conviene validar también con epubcheck.

## Plantillas Word y OpenDocument

Word y OpenDocument usan **documentos de referencia** con estilos, no plantillas de texto.

```text
example-docx/
  template.json
  reference.docx
  defaults.yaml
  metadata.yaml
```

Pandoc toma estilos de párrafo, carácter, tabla y página. Mantén los nombres esperados para título,
subtítulo, autor, fecha, resumen, encabezados, cuerpo, citas, código, leyendas, listas, notas, tablas,
figuras y bibliografía. Yi no edita binarios; **Open in system** los abre en Word o LibreOffice.

### Partir del documento de referencia de Pandoc

La sección
[`--reference-doc`](https://pandoc.org/MANUAL.html#option--reference-doc)
del manual oficial describe los estilos DOCX/ODT y el flujo recomendado. El
[manual completo de Pandoc](https://pandoc.org/MANUAL.html) documenta los demás ajustes que Yi pasa.

**Create…** genera el documento predeterminado dentro de Yi. En una terminal:

```sh
pandoc -o custom-reference.docx --print-default-data-file reference.docx
pandoc -o custom-reference.odt --print-default-data-file reference.odt
```

Abre el archivo en Word o LibreOffice, modifica los estilos y guárdalo sin cambiar los nombres que
Pandoc espera.

- DOCX aporta estilos y propiedades del documento, como tamaño, márgenes, encabezados y pies; el
  contenido visible se ignora.
- ODT aporta sus hojas de estilo; el contenido visible se ignora.

Guarda `reference.docx` o `reference.odt` y selecciónalo como entrada del paquete correspondiente.

## YAML del paquete

`metadata.yaml` puede iniciar el frontmatter de una nota nueva; sus claves ganan salvo `date` e `id`.
`export.yaml` se pasa después de `export.<kind>.yaml`; si falta, se usa `defaults.yaml`. La
configuración del paquete gana a los valores de la aplicación, pero los argumentos explícitos de
salida, plantilla, CSL y recursos se aplican al final.

El `csl` del YAML del paquete solo es un fallback: **Settings → Citation** se pasa después y gana.
Para imponer un estilo, usa `csl` en `template.json`. No añadas otro citeproc: Yi ya lo proporciona y
dos filtros duplican las referencias.

## Ejemplos completos y prompts de IA

`test/fixtures/templates/examples/` contiene paquetes completos HTML, LaTeX, PDF, Rho Class, EPUB,
Word y ODT.

Pide a un agente de IA una carpeta fuente importable, sin `template.json`:

- **HTML:** `$body$`, índice lateral, `toc-depth: 2`, CSS y JavaScript locales.
- **LaTeX:** tres autores e instituciones, resumen, figuras, tablas, notas y citas nativas.
- **PDF:** XeLaTeX, portada, resumen, código, figuras, tablas y bibliografía.
- **Rho Class PDF:** conservar el diseño CC BY 4.0, clase, URL de origen y atribución.
- **EPUB:** portada, editorial, ISBN, derechos, dedicatoria, índice y tres capítulos.
- **Word:** todos los estilos en `reference.docx`, `toc: true`, `toc-depth: 2`.
- **OpenDocument:** tesis A4 con portada, resumen, índice de dos niveles y páginas desde 1.

## Validar antes de usar

1. Abrir el paquete en el editor.
2. Ejecutar **Validate** y leer el mensaje completo.
3. Para PDF, ejecutar después **Test PDF**.
4. Exportar una nota breve con títulos, listas, tabla, código, matemáticas e imagen.
5. Revisar recursos relativos y bibliografía.

| Mensaje | Comprobación |
| --- | --- |
| Pandoc not found | Instalar Pandoc y reiniciar Yi con el `PATH` actualizado |
| PDF engine not found | Instalar TeX y comprobar `xelatex --version` |
| `journal.cls` not found | Incluir la clase y añadir el paquete al camino TeX |
| Template variable missing | Comparar con las variables del writer de Pandoc |
| Filter could not start | Instalar el runtime o quitar el filtro |
| Local picture missing | Usar una ruta relativa y una imagen en `assets` |

## Seguridad y confianza

Una plantilla es configuración ejecutable: filtros Pandoc, Lua, clases LaTeX, paquetes y fuentes. Usa
solo plantillas fiables. Yi registra origen y licencia sin decidir los derechos. No descarga recursos
de revistas, no instala paquetes TeX, no ejecuta `tlmgr`, no permite shell escape sin restricciones
en defaults PDF y no convierte automáticamente ejemplos arbitrarios en plantillas Pandoc perfectas.

## Lista de comprobación

- [ ] Existe `template.json` con esquema 1.
- [ ] `kind`, entrada y `mode` coinciden.
- [ ] La plantilla de texto contiene un solo `$body$` en el lugar correcto.
- [ ] El documento de referencia abre en Word o LibreOffice.
- [ ] Existen todas las rutas de `assets`, `deliver` y `csl`.
- [ ] Los enlaces relativos usan `/` y apuntan dentro del paquete.
- [ ] `metadata.yaml` es una tabla YAML de primer nivel.
- [ ] `defaults.yaml` / `export.yaml` solo contienen lo necesario.
- [ ] Los defaults PDF no activan shell escape.
- [ ] Una nota breve representativa valida correctamente.
- [ ] La exportación real incluye clases, estilos, imágenes y referencias.
