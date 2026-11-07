---
title: Bienvenido a Yi
id: yi-tutorial
lang: es
---

Yi es una aplicación de notas que trabaja en local. Tus notas son archivos markdown normales en
una carpeta que tú eliges. No hay cuenta ni servidor: lo que ves es el texto que permanece en tu
disco.

## Empieza con un espacio de trabajo

Un **espacio de trabajo** es la carpeta que Yi lee y escribe. El árbol de la izquierda es esa
carpeta:

- haz clic en una nota para abrirla;
- usa **Archivo → Nota nueva** para crear una;
- haz clic derecho en una carpeta o una nota para ver sus acciones.

Si todavía no has elegido un espacio de trabajo, Yi te ofrece crear uno dentro de tu carpeta de
Documentos. Para cambiar a otra carpeta más tarde, usa **Archivo → Abrir carpeta…**.

## Crea una nota

**Archivo → Nota nueva** pide un nombre y crea un archivo markdown en el espacio de trabajo. El
nombre pasa a ser el del archivo; la nota puede tener su propio `title` en el frontmatter.

Cada nota se guarda mientras escribes. **Archivo → Guardar** vuelve a escribir el texto actual, y
**Guardar como** pone una copia en otro lugar.

## Escribe en la página

Yi edita markdown tal como se muestra. Los títulos, las listas, las tablas y el código se ven como
tales. Cuando el cursor entra en una palabra con formato, Yi muestra sus marcas alrededor, como
`**negrita**` o `*cursiva*`; cuando sale, la página vuelve a dibujarse con claridad.

La barra de herramientas tiene los mismos comandos que el menú. Selecciona una palabra y pulsa
**Negrita**, o usa el teclado:

| Acción | Atajo |
| --- | --- |
| Deshacer | ⌘Z |
| Buscar | ⌘F |
| Guardar | ⌘S |
| Nota nueva | ⌘N |

En Windows y Linux, usa Ctrl en lugar de ⌘.

## El frontmatter da nombre a la nota

El bloque entre las dos líneas `---` de arriba es el **frontmatter**. Su `title` es el nombre de la
nota; hace de título principal aunque el cuerpo no tenga un `# título`.

```yaml
---
title: Una nota con nombre
id: 20261017120000
keywords: notas, ejemplo
---
```

El `id` es la identidad estable de la nota, que los wikienlaces pueden usar. En
**Ajustes → Nota nueva** editas en un editor YAML el frontmatter con el que empieza cada nota; los
cambios se guardan automáticamente.

## Da estructura a la página

Para hacer un título, escribe primero sus palabras. Después haz clic al principio de la línea y
pon la marca delante: `# ` para un título de primer nivel, `## ` para uno de segundo nivel, y así
sucesivamente. El espacio después de las almohadillas es necesario. Por ejemplo, escribe
`Una sección`, haz clic antes de `Una` y teclea `## `.

### Título de segundo nivel

#### Título de tercer nivel

Los párrafos se separan con una línea en blanco. Usa **Negrita**, *cursiva*, ~~tachado~~ y `código
en línea` donde ayuden a leer. Una línea horizontal separa ideas:

---

Las listas con viñetas, numeradas y de tareas son markdown normal:

- un punto
- otro punto
  - un punto anidado

1. primero
2. segundo

- [ ] una tarea pendiente
- [x] una tarea hecha

Para hacer una cita, empieza una línea nueva con `> ` y escribe después el texto. Cada párrafo
citado empieza con `> `; una línea sin esa marca queda fuera de la cita.

> Una cita mantiene un pasaje a distancia.

Las tablas se escriben con barras verticales:

| Función | Cómo usarla |
| --- | --- |
| Negrita | selecciona texto y pulsa **Negrita** |
| Tabla | **Insertar → Tabla** |
| Código | escribe un bloque delimitado |

## Código, fórmulas y notas

Un bloque delimitado conserva el código exactamente como está escrito:

```js
const answer = 42;
console.log(answer);
```

Las fórmulas en línea van entre `$E = mc^2$`. Una fórmula destacada ocupa su propio bloque:

$$
\frac{a}{b} + \frac{c}{d} = \frac{ad + bc}{bd}
$$

Una nota al pie es una referencia en la frase y una explicación bajo el texto.[^primera]

[^primera]: Este es el texto de la nota al pie. Yi numera las notas por ti.

## Enlaza notas e imágenes

Un wikienlace conecta notas por título, nombre de archivo o id: `[[Otra nota]]`. Escribe `[[` y Yi
te ofrece las notas que encuentra. Un enlace web normal se escribe así:
`[las palabras](https://example.com)`.

Una imagen es una imagen markdown normal: `![descripción](imagen.png)`. Una ruta relativa se busca
primero junto a la nota y después en la carpeta de imágenes de **Ajustes → General**. El botón de
imagen inserta una desde un archivo o el portapapeles.

## Cita lo que lees

Las citas usan la sintaxis de pandoc: `[@smith2020]`. Elige un archivo de bibliografía y un estilo
de cita en **Ajustes → Citas**; Yi muestra entonces la cita formateada en la página y las obras
citadas bajo Referencias al exportar.

## Busca y cambia

**Editar → Buscar** recorre la nota; **Editar → Reemplazar** cambia una coincidencia o todas.
La búsqueda funciona en la página mostrada y en el propio código de un bloque.

## Exporta la nota

**Archivo → Exportar** ofrece un documento de Word, un archivo OpenDocument, LaTeX, HTML, un libro
EPUB, un PDF y el markdown procesado de la app. La tarjeta nombra el archivo y la configuración de
conversión. Las imágenes se llevan a la salida; un SVG o un WebP se dibuja como PNG donde el
formato elegido no puede contenerlo.

## Guarda una versión

**Archivo → Guardar una versión** conserva un estado de la nota en un repositorio git. Las
versiones se crean solo cuando las pides, y el panel de versiones te deja leer una copia anterior
y compararla con el texto actual.

## Haz tuya la aplicación

**Ajustes** cambia el idioma, la apariencia, la carpeta de imágenes, las citas, el frontmatter de
notas nuevas y si un documento sin guardar se abre en la pila. No hay botón Guardar: los campos de
texto se guardan tras una pausa breve o al salir, y las opciones e interruptores al cambiar.
**Apariencia** ofrece Automático, Claro y Oscuro; Automático sigue al sistema. **Nota nueva** usa un
editor YAML y Restablecer recupera la plantilla de la aplicación. El espacio de trabajo se cambia con
**Archivo → Abrir carpeta…**, no en Ajustes.

La app recuerda los documentos que tenías abiertos y dónde estabas en ellos. Cierra la ventana y
vuelve a abrirla; la misma página regresa.

## Una nota para probar

Copia esto en una nota nueva y cámbialo:

```markdown
---
title: Mi primera nota
---

## De qué escribo

Una idea con **peso**, un [enlace](https://example.com) y una nota al pie.[^1]

Una fórmula: $a^2 + b^2 = c^2$.

[^1]: La nota bajo la línea.
```

Esa es toda la forma de una nota de Yi: texto plano, un poco de markdown y una página fácil de leer
mientras escribes.
