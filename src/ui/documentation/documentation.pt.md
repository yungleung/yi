---
title: Documentação do Yi
id: yi-documentation
lang: pt
---

O Yi é um editor Markdown local-first. Um espaço de trabalho é uma pasta comum, cada nota é um
arquivo Markdown comum e a exportação é entregue ao Pandoc. Este guia explica o uso diário e a
criação cuidadosa de pacotes de modelos de exportação.

Este documento é somente leitura. **F1** o abre novamente; outra nota o substitui sem perguntar se
deve salvar.

## Espaço de trabalho e notas

A pasta exibida à esquerda é o espaço de trabalho. Não há conta nem cópia remota.

- **File → New Markdown** cria uma nota com identificador de catorze dígitos e seleciona `title`.
- **New file** cria a mesma nota na pasta escolhida.
- **File → Open Folder…** troca o espaço de trabalho e **File → Save** salva.
- Só documentos adicionados explicitamente entram na pilha de sessão. O tutorial e este guia são
  referências e não entram nela.

### Frontmatter

```yaml
---
title: Uma nota
date: 2026-10-21
id: 20261021153000
keywords:
  - notes
  - export
---
```

`title` nomeia o documento, `id` é sua identidade fixa e `lang` declara o idioma para EPUB e outros
formatos. Outras chaves ficam disponíveis ao Pandoc e aos pacotes. **Settings → New note** define o
frontmatter inicial; o `metadata.yaml` de um pacote vale apenas para aquela nova nota. New note
também oferece os iniciadores integrados **Reveal.js presentation** e **Beamer presentation**:
são metadados de apresentação, não pacotes de modelos de exportação.

O Yi mantém Markdown como fonte da verdade enquanto exibe o resultado. Ao entrar em link, fórmula ou
bloco cercado, seu Markdown aparece para edição. Atalhos: ⌘S / Ctrl+S salvar, ⌘N / Ctrl+N nova,
⌘F / Ctrl+F buscar, ⇧⌘F / Ctrl+Shift+F substituir e F1 documentação.

### Listas

Uma lista completa com marcadores, ordenada ou de tarefas torna-se um objeto de lista numerado
quando é seguida por uma linha de legenda:

```markdown
1. Preparar a amostra
2. Executar a medição

: Etapas {#list:steps .wide data-owner=demo}
```

A linha iniciada por dois-pontos pode vir logo após a lista ou depois de exatamente uma linha em
branco. Ela usa a mesma gramática de legenda de uma tabela. Uma lista apenas com legenda recebe
número, mas sem ID não pode ser destino de referência:

```markdown
: Verificações preliminares
```

Uma lista apenas com ID possui destino e número visível, mas nenhum texto de legenda:

```markdown
: {#list:steps}
```

Uma lista comum sem linha de legenda não recebe número de objeto nem destino. O número do objeto é
independente dos marcadores `1.`, `2.` dentro de uma lista ordenada.

`[#list:steps]` cria uma referência automática; um link comum mantém o texto escrito pelo autor:

```markdown
Consulte [#list:steps].
Consulte [as etapas de medição](#list:steps).
```

O texto automático padrão é `List 1`, independentemente do idioma deste guia. A palavra e o prefixo
numérico literal são configurados no frontmatter:

```yaml
reference-labels:
  list: Procedimento
reference-number-prefixes:
  list: "3-"
```

A referência e a legenda visível passam a usar `Procedimento 3-1`.

HTML, EPUB, Word e ODT recebem a mesma estrutura de destino, posição da legenda, palavra, prefixo e
numeração. Cada writer produz um contêiner nativo diferente, mas o comportamento visível é comum.
Marcadores, caixas de tarefas e listas aninhadas não mudam. Markdown pré-processado usa a mesma
estrutura do HTML.

⌘-clique ou Ctrl-clique em uma referência revela a lista e coloca o cursor no primeiro item
editável. Um clique na legenda renderizada mostra sua origem completa `: Legenda {…}`, onde texto,
ID, classes e atributos podem ser editados.

Listas não exigem um bloco `:::` no texto de origem. A legenda com dois-pontos deixa os blocos
fenced div disponíveis para callouts. Dois-pontos indentados dentro de um item continuam sendo
conteúdo desse item; depois de um parágrafo comum, o Pandoc mantém seu significado de lista de
definições.

#### Numeração de listas em LaTeX e PDF

O LaTeX não tem um contador nativo para um objeto de lista completo: `enumi`, `enumii` e contadores
semelhantes numeram itens e valem apenas dentro de um ambiente `enumerate`. Por isso o Yi dá ao
objeto de lista o contador próprio `yilist`, enquanto `\label`, `\ref` e `hyperref` continuam sendo
os mecanismos nativos de referência do LaTeX.

O padrão é uma sequência global por documento. Um modelo LaTeX/PDF pode configurar o nível de
reinício e o formato por `\yiListCounterSetup`. Para numeração por capítulo:

```tex
\makeatletter
\providecommand{\yiListCounterSetup}{}
\renewcommand{\yiListCounterSetup}{%
  \@addtoreset{yilist}{chapter}%
  \renewcommand{\yiListNumber}{\thechapter.\arabic{yilist}}%
}
\makeatother
```

O Yi chama o hook em `\begin{document}` e depois aplica a palavra e o prefixo literal da nota.
`\yiListNumber` controla o número subjacente sem remover o prefixo. Se a numeração precisar
corresponder exatamente ao contador de tabelas de um modelo, os dois contadores devem ser
configurados no mesmo local e com o mesmo nível de reinício; o Yi não consegue inferir
automaticamente as regras de uma classe arbitrária.

## Callouts

Um alerta no estilo GitHub cria um callout:

```markdown
> [!NOTE]
> Algo que merece atenção.
```

Os cinco tipos internos são `NOTE`, `TIP`, `IMPORTANT`, `WARNING` e `CAUTION`. Os títulos visíveis
são sempre `Note`, `Tip`, `Important`, `Warning` e `Caution`, independentemente do idioma da
interface. Os rótulos não diferenciam maiúsculas de minúsculas. A linha de citação vazia após o
marcador é opcional. Um rótulo desconhecido, texto depois do rótulo ou um marcador escapado como
`> \[!NOTE]` continuam sendo uma citação comum.

A sintaxe de Div cercado do Pandoc também é aceita:

```markdown
::: {.callout .callout-note}
Um callout interno.
:::

::: {.callout .callout-definition title="Definição"}
Um tipo personalizado.
:::
```

A forma curta `.callout-note` também funciona. Um tipo personalizado sem `title=` deriva o título do
nome da classe sem depender do idioma da interface. ID, classes e outros atributos são preservados
para exportação; um ID de Div é metadado do Pandoc e não um destino de referência do Yi.

Digitar `:::` sozinho numa linha cria um Div Note fechado e abre seis opções: Note, Tip, Important,
Warning, Caution e Definition. A escolha altera apenas a classe `.callout-<tipo>`; o corpo, o ID,
as outras classes e os atributos permanecem intactos.

Callouts podem ser aninhados em citações ou em outros callouts. O corpo aceita parágrafos, listas,
tabelas, blocos de código, equações, legendas, citações e citações Markdown comuns. O Yi mostra o
painel quando o cursor está fora; clicar no título ou no corpo revela a origem completa, e sair do
bloco restaura a renderização.

Os marcadores de abertura continuam cientes do contêiner durante a edição. Digitar `$$`, `[$$`, um
bloco de código delimitado por três acentos graves ou `:::` cria a construção emparelhada
correspondente, aplica o prefixo `>` atual a cada linha física gerada e mantém o seletor de tipo de
callout para `:::`. Dentro de código ou fórmulas em bloco numa citação ou callout, Enter segue a
regra do bloco filho e pode criar qualquer número de linhas vazias consecutivas. Um callout com Div
cercado cria exatamente uma nova linha prefixada por Enter, mesmo quando está aninhado noutra citação
ou callout.

A conclusão de citações depois de `@`, de wikilinks depois de `[[` e de referências automáticas
depois de `[#` continua disponível nas duas formas de origem. Escolher uma linha grava apenas a chave
ou o ID de destino; o prefixo de citação e os parênteses retos em volta permanecem intactos. A lista
abre assim que o marcador é digitado ou confirmado por um método de entrada; Tab não é necessário.

Os sinais de abertura `[`, `(` e `{` são emparelhados automaticamente em texto comum, citações,
callouts do GitHub e callouts Div, inclusive quando o caractere chega por um método de entrada. No
destino de um link comum para o mesmo documento, digitar `#` depois de `](` também lista os destinos
de referência; aceitar uma linha grava apenas o ID do fragmento.
Ao aceitar qualquer uma dessas sugestões, o cursor fica na borda de fechamento do nó e o
Markdown continua visível para edição. O próximo caractere é escrito depois do nó e renderiza o
link, a referência, a citação ou o wikilink concluídos. Se o caractere ainda fizer parte da mesma
construção, como outra tecla de uma citação narrativa, a fonte continua visível.

Uma citação comum revela a origem completa pela mesma regra, de modo que marcadores escapados,
prefixos `>` e delimitadores internos sejam exatamente os caracteres editados.
Fora do modo de origem, uma citação comum tem margem dos dois lados e uma grande aspa inicial. Ela
não mostra a linha lateral grossa nem a aspa final.

Em um parágrafo de citação comum, Enter cria duas linhas vazias com o prefixo `>` completo. O texto
seguinte forma outro parágrafo. Um segundo Enter no parágrafo vazio remove apenas um nível de
citação; em citações aninhadas, repita uma vez por nível. Listas, tabelas, blocos de código e
equações mantêm o comportamento normal, e cada nova linha recebe o prefixo completo. Depois que um
bloco filho termina, Enter acrescenta o mesmo parágrafo de duas linhas vazias com prefixo.

Digitar numa linha `>` vazia produz exatamente `>B`, sem acrescentar um espaço invisível. Se a origem
já tiver o espaço visível `> `, ele é preservado. Backspace ou Delete numa linha de citação vazia
remove toda a linha física, não apenas o `>`.
Enter num item de lista vazio remove o marcador e deixa uma linha normal do corpo da citação ou do
callout.
Ao inserir uma tabela numa citação ou callout do GitHub, cada linha e separador recebe a mesma
cadeia de `>`, mantendo a tabela dentro do contêiner.

Dentro de um callout com Div cercado, Enter insere exatamente uma quebra de linha. Cada Enter
adicional cria outra linha vazia, e o cursor permanece na linha mais recente. Um Div dentro de uma
citação conserva o prefixo visível em cada linha inserida.

Um callout vazio mantém uma âncora invisível para o cursor do corpo. Left a partir do bloco seguinte
e Right a partir do anterior entram nela; a navegação sozinha não altera a origem. O primeiro
caractere digitado cria a linha de corpo ausente.
Enter na linha do marcador de um callout GitHub vazio cria as duas linhas vazias com prefixo de um
parágrafo de citação e coloca o cursor na segunda; outro Enter remove essas marcas e deixa o callout.
Enter na abertura vazia de um callout Div cria uma linha de corpo editável antes do fecho.

Toda exportação com Pandoc transforma as duas formas no mesmo Div semântico:

```markdown
:::: {.callout .callout-note}
::: {.callout-title}
Note
:::

Algo que merece atenção.
::::
```

Modelos HTML, EPUB, DOCX, ODT e LaTeX/PDF podem estilizar por CSS, documentos de referência ou filtro
Lua. O filtro recebe `.callout`, `.callout-<tipo>`, `.callout-title` e o corpo na ordem do documento.
A conversão acontece antes dos filtros do modelo, que trabalham com essa estrutura estável em vez da
sintaxe GitHub ou do Div original.

## Exportar uma nota

| Tipo | Saída |
| --- | --- |
| HTML | Pasta com página e recursos locais |
| Reveal.js | Pacote de apresentação com `images/` e `js/dist/` local por padrão |
| LaTeX | `.tex` e recursos do pacote |
| Beamer | PDF de apresentação gerado pelo XeLaTeX |
| PDF | PDF gerado por TeX |
| EPUB | Livro EPUB |
| Word | `.docx` |
| LibreOffice | `.odt` |
| Markdown | Markdown pré-processado pelo Yi |

Tudo exceto Markdown exige Pandoc; PDF também exige XeLaTeX ou outro motor TeX. O Yi procura Pandoc
em locais comuns e no `PATH`, mas não instala software nem executa TeX Live Manager.

O cartão de exportação escolhe o destino e, nos tipos que os aceitam, um pacote de modelos ou de
recursos. Reveal.js e Beamer não aceitam pacotes de modelos. A escolha lembrada é por tipo de
exportação, não por nota.

### Apresentações

Reveal.js lê do frontmatter `title`, `subtitle`, `author`, `theme`, `transition`,
`slide-level` e outros controles do Pandoc. Sempre grava uma pasta não autocontida:

```text
apresentacao/
  apresentacao.html
  images/
  js/dist/
```

O cartão oferece duas opções independentes, ambas desativadas por padrão:

- **Use remote Reveal.js resources** mantém as URLs CDN fixadas pelo Pandoc. Caso contrário, o Yi
  baixa JavaScript, folhas de estilo, tema e plugins do Reveal.js para `js/dist/`.
- **Use remote pictures** mantém as URLs de imagens da web. Caso contrário, cada imagem remota é
  baixada para `images/`; imagens locais sempre são copiadas para lá.

Beamer usa `title`, `subtitle`, `author`, `institute`, `theme`, `colortheme`, `fonttheme`,
`aspectratio`, `navigation` e `section-titles`. Grava um único PDF e não oferece modelo nem tamanho
de página. Títulos de nível um são seções e os de nível dois são slides.

### Instalar Pandoc e TeX

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

Se `pandoc --version` falhar, nenhuma exportação Pandoc funciona. Se apenas `xelatex --version`
falhar, todos os formatos menos PDF continuam disponíveis. O Yi nunca executa `tlmgr`.

Cada tipo tem um arquivo editável `export.<kind>.yaml`, como `export.pdf.yaml`. São Pandoc defaults
comuns para writer, motor PDF, realce, variáveis de página, filtros e caminhos de recursos.

## Pacotes de modelos

O pacote fica nos dados de exportação do Yi, fora do espaço de trabalho e da sessão.

```text
example-latex/
  template.json
  template.tex
  journal.cls
  journal.bst
  metadata.yaml
  defaults.yaml
```

O Yi mantém `template.json`. `kind` é `html`, `latex`, `pdf`, `epub`, `docx` ou `odt`; `mode` é
`template`, `wrapper` ou `reference-doc`. Modelos textuais usam `template`; Word e ODT usam
`reference_doc`. `assets` usa caminhos relativos com `/`; `deliver` lista classes e estilos BibTeX
para LaTeX; `csl` pode impor o estilo de citação do pacote.

### Modo wrapper

Um documento LaTeX completo com `\begin{document}` e `\end{document}`, mas sem `$body$`, vira uma
proposta de wrapper. O Yi mantém o original como `source.tex` e cria `template.tex` com `$body$`
antes de `\end{document}`. Opcionalmente troca `\title{}` e `\author{}` por `$title$` e `$author$`.

### Criar a partir do padrão do Pandoc

**Create…** pede nome, origem e licença, então executa Pandoc para criar o modelo ou documento de
referência. Word e ODT recebem `reference.docx` e `reference.odt`. A origem é gravada como
`pandoc-default`.

### Importar um kit

O Yi aceita arquivo, pasta ou ZIP, inspeciona antes de copiar e recusa caminhos absolutos, `..`, links
simbólicos, excesso de arquivos ou tamanho. Classes, estilos, bibliografias, imagens, fontes, CSS e
JavaScript permanecem no pacote.

### Editar e validar

O painel de código lista textos editáveis e binários somente leitura, com números de linha, busca,
desfazer, realce YAML/LaTeX e gravação atômica. **Validate** faz uma conversão curta real; **Test PDF**
também executa o motor PDF.

## Modelos HTML

```html
<!doctype html>
<html lang="$lang$">
  <head><meta charset="utf-8"><title>$title$</title></head>
  <body><main>$body$</main></body>
</html>
```

`$body$` aparece uma vez. O Yi sempre cria uma pasta de saída. Sem **Self-contained HTML**, modelos e
imagens locais são copiados com URL relativa; com a opção, são incorporados, mas o pacote completo
continua no diretório. URLs HTTP(S) permanecem inalteradas.

## Modelos LaTeX e PDF

```tex
\documentclass{article}
\begin{document}
$if(title)$\title{$title$}\maketitle$endif$
$body$
\end{document}
```

Título, autores, instituições e e-mails devem vir dos metadados da nota. A exportação LaTeX copia
toda a árvore de recursos junto ao `.tex` e nunca sobrescreve um arquivo diferente existente. Imagens
da nota substituem o mesmo caminho relativo do pacote; as demais vão para `<saída>.assets/`.

```yaml
filters: []
cite-method: natbib
bibliography: references.bib
```

**Settings → Citation** é a fonte de verdade. O Yi grava em `references.bib` somente obras citadas;
CSL-JSON usa `citation-key` ou, se faltar, `id`. O pacote e a pasta da entrada entram nos caminhos
TeX/BibTeX. O Yi recusa shell escape irrestrito em defaults PDF.

## Modelos EPUB

EPUB usa `template.xhtml` com um único `$body$`. CSS, imagens, fontes e scripts ficam no pacote com
URLs relativas. O Pandoc cria o livro; o Yi adiciona recursos em `EPUB/assets/` e os declara em
`content.opf`. `title` e `lang` são necessários; antes de publicar, valide também com epubcheck.

## Modelos Word e OpenDocument

Word e OpenDocument usam **documentos de referência** com estilos, não modelos textuais.

```text
example-docx/
  template.json
  reference.docx
  defaults.yaml
  metadata.yaml
```

O Pandoc importa estilos de parágrafo, caractere, tabela e página. Mantenha os nomes esperados para
título, subtítulo, autor, data, resumo, títulos, corpo, citações, código, legendas, listas, notas,
tabelas, figuras e bibliografia. O Yi não edita binários; **Open in system** abre no Word ou
LibreOffice.

### Começar pelo documento de referência do Pandoc

A seção
[`--reference-doc`](https://pandoc.org/MANUAL.html#option--reference-doc)
do manual oficial descreve diferenças DOCX/ODT, estilos e o fluxo recomendado. O
[manual completo do Pandoc](https://pandoc.org/MANUAL.html) cobre as demais opções repassadas pelo Yi.

**Create…** gera o documento padrão dentro do Yi. No terminal:

```sh
pandoc -o custom-reference.docx --print-default-data-file reference.docx
pandoc -o custom-reference.odt --print-default-data-file reference.odt
```

Abra no Word ou LibreOffice, altere os estilos e salve sem renomear os nomes esperados.

- DOCX fornece estilos e propriedades, incluindo tamanho, margens, cabeçalhos e rodapés; o conteúdo
  visível é ignorado.
- ODT fornece suas folhas de estilo; o conteúdo visível é ignorado.

Salve como `reference.docx` ou `reference.odt` e escolha-o como entrada do pacote correspondente.

## YAML do pacote

`metadata.yaml` pode iniciar o frontmatter de uma nova nota; suas chaves vencem exceto `date` e `id`.
`export.yaml` é passado depois de `export.<kind>.yaml`; sem ele, usa-se `defaults.yaml`. O pacote vence
os padrões do aplicativo, mas argumentos explícitos de saída, modelo, CSL e recursos vêm depois.

Um `csl` no YAML do pacote é apenas fallback; **Settings → Citation** é passado depois e vence. Para
impor um estilo, use `csl` em `template.json`. Não adicione outro citeproc: o Yi já fornece um e dois
filtros duplicam referências.

## Exemplos completos e prompts de IA

`examples/templates/` contém pacotes completos para leitores em HTML, LaTeX, PDF, Rho Class, EPUB,
Word e ODT. Um nível acima ficam as apresentações de referência completas
`examples/revealjs.md` e `examples/beamer.md`. `examples/` é material para leitores;
`test/fixtures/` contém dados de teste controlados e tem outro propósito.

Peça a um agente de IA uma pasta importável, sem `template.json`:

- **HTML:** `$body$`, sumário lateral, `toc-depth: 2`, CSS e JavaScript locais.
- **LaTeX:** três autores e instituições, resumo, figuras, tabelas, notas e citações nativas.
- **PDF:** XeLaTeX, capa, resumo, código, figuras, tabelas e bibliografia.
- **Rho Class PDF:** preservar o design CC BY 4.0, a classe, URL de origem e atribuição.
- **EPUB:** capa, editora, ISBN, direitos, dedicatória, sumário e três capítulos.
- **Word:** todos os estilos em `reference.docx`, `toc: true`, `toc-depth: 2`.
- **OpenDocument:** dissertação A4 com capa, resumo, sumário de dois níveis e páginas desde 1.

## Validar antes de usar

1. Abra o pacote no editor de modelos.
2. Execute **Validate** e leia a mensagem completa.
3. Para PDF, execute depois **Test PDF**.
4. Exporte uma nota curta com títulos, listas, tabela, código, matemática e imagem.
5. Confira recursos relativos e arquivos bibliográficos.

| Mensagem | Verificação |
| --- | --- |
| Pandoc not found | Instalar Pandoc e reiniciar o Yi com o `PATH` atualizado |
| PDF engine not found | Instalar TeX e verificar `xelatex --version` |
| `journal.cls` not found | Colocar a classe no pacote e incluí-lo no caminho TeX |
| Template variable missing | Comparar com as variáveis do writer do Pandoc |
| Filter could not start | Instalar o runtime ou remover o filtro |
| Local picture missing | Usar caminho relativo e imagem em `assets` |

## Segurança e confiança

Um modelo é configuração executável: filtros Pandoc, Lua, classes LaTeX, pacotes e fontes. Use apenas
modelos confiáveis. O Yi registra origem e licença sem decidir direitos. Não baixa recursos de
periódicos, não instala pacotes TeX, não executa `tlmgr`, não permite shell escape irrestrito em
defaults PDF e não converte automaticamente exemplos arbitrários em modelos Pandoc perfeitos.

## Lista de verificação

- [ ] `template.json` existe com schema 1.
- [ ] `kind`, entrada e `mode` coincidem.
- [ ] O modelo textual contém um único `$body$` no local correto.
- [ ] O documento de referência abre no Word ou LibreOffice.
- [ ] Todos os caminhos em `assets`, `deliver` e `csl` existem.
- [ ] Links relativos usam `/` e permanecem no pacote.
- [ ] `metadata.yaml` é um mapeamento YAML de primeiro nível.
- [ ] `defaults.yaml` / `export.yaml` contêm apenas o necessário.
- [ ] Defaults PDF não ativam shell escape.
- [ ] Uma nota curta representativa é validada.
- [ ] A exportação real contém classes, estilos, imagens e referências.
