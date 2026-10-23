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
frontmatter inicial; o `metadata.yaml` de um pacote vale apenas para aquela nova nota.

O Yi mantém Markdown como fonte da verdade enquanto exibe o resultado. Ao entrar em link, fórmula ou
bloco cercado, seu Markdown aparece para edição. Atalhos: ⌘S / Ctrl+S salvar, ⌘N / Ctrl+N nova,
⌘F / Ctrl+F buscar, ⇧⌘F / Ctrl+Shift+F substituir e F1 documentação.

## Exportar uma nota

| Tipo | Saída |
| --- | --- |
| HTML | Pasta com página e recursos locais |
| LaTeX | `.tex` e recursos do pacote |
| PDF | PDF gerado por TeX |
| EPUB | Livro EPUB |
| Word | `.docx` |
| LibreOffice | `.odt` |
| Markdown | Markdown pré-processado pelo Yi |

Tudo exceto Markdown exige Pandoc; PDF também exige XeLaTeX ou outro motor TeX. O Yi procura Pandoc
em locais comuns e no `PATH`, mas não instala software nem executa TeX Live Manager.

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

`test/fixtures/templates/examples/` contém pacotes completos HTML, LaTeX, PDF, Rho Class, EPUB, Word
e ODT.

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
