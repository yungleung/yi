---
title: Bem-vindo ao Yi
id: yi-tutorial
lang: pt
---

O Yi é um aplicativo de notas que trabalha localmente. Suas notas são arquivos markdown comuns em
uma pasta que você escolhe. Não há conta nem servidor: o que você vê é o texto que fica no seu disco.

## Comece com um espaço de trabalho

Um **espaço de trabalho** é a pasta que o Yi lê e grava. A árvore à esquerda é essa pasta:

- clique em uma nota para abri-la;
- use **Arquivo → Nova nota** para criar uma;
- clique com o botão direito em uma pasta ou nota para ver as ações dela.

Se você ainda não escolheu um espaço de trabalho, o Yi oferece criar um dentro da sua pasta de
Documentos. Para mudar para outra pasta depois, use **Arquivo → Abrir pasta…**.

## Crie uma nota

**Arquivo → Nova nota** pede um nome e cria um arquivo markdown no espaço de trabalho. O nome vira o
nome do arquivo; a nota pode ter seu próprio `title` no frontmatter.

Cada nota é salva enquanto você escreve. **Arquivo → Salvar** grava o texto atual de novo, e
**Salvar como** coloca uma cópia em outro lugar.

## Escreva na página

O Yi edita markdown como ele aparece. Títulos, listas, tabelas e código parecem eles mesmos. Quando
o cursor entra em uma palavra formatada, o Yi mostra as marcas ao redor, como `**negrito**` ou
`*itálico*`; quando sai, a página é desenhada normalmente outra vez.

A barra de ferramentas tem os mesmos comandos do menu. Selecione uma palavra e pressione
**Negrito**, ou use o teclado:

| Ação | Atalho |
| --- | --- |
| Desfazer | ⌘Z |
| Localizar | ⌘F |
| Salvar | ⌘S |
| Nova nota | ⌘N |

No Windows e no Linux, use Ctrl no lugar de ⌘.

## O frontmatter dá nome à nota

O bloco entre as duas linhas `---` no topo é o **frontmatter**. Seu `title` é o nome da nota; ele
serve como título principal mesmo quando o corpo não tem um `# título`.

```yaml
---
title: Uma nota com nome
id: 20261017120000
keywords: notas, exemplo
---
```

O `id` é a identidade estável da nota, que os wikilinks podem usar. Em
**Configurações → Nova nota** você edita num editor YAML o frontmatter com que toda nota nova começa;
as alterações são salvas automaticamente.

## Dê estrutura à página

Para fazer um título, escreva primeiro as palavras. Depois clique no início da linha e coloque a
marca antes delas: `# ` para um título de primeiro nível, `## ` para um de segundo nível, e assim
por diante. O espaço depois das cerquilhas é necessário. Por exemplo, escreva `Uma seção`, clique
antes de `Uma` e digite `## `.

### Título de nível dois

#### Título de nível três

Parágrafos são separados por uma linha em branco. Use **Negrito**, *itálico*, ~~riscado~~ e `código
em linha` onde ajudarem a ler. Uma linha horizontal separa ideias:

---

Listas com marcadores, numeradas e de tarefas são markdown comum:

- um marcador
- outro marcador
  - um marcador aninhado

1. primeiro
2. segundo

- [ ] uma tarefa pendente
- [x] uma tarefa feita

Para fazer uma citação, comece uma linha nova com `> ` e escreva o texto. Cada parágrafo citado
começa com `> `; uma linha sem essa marca fica fora da citação.

> Uma citação mantém uma passagem à distância.

Tabelas são escritas com barras verticais:

| Recurso | Como usar |
| --- | --- |
| Negrito | selecione o texto e pressione **Negrito** |
| Tabela | **Inserir → Tabela** |
| Código | digite um bloco delimitado |

## Código, fórmulas e notas

Um bloco delimitado preserva o código exatamente como foi escrito:

```js
const answer = 42;
console.log(answer);
```

Fórmulas em linha usam `$E = mc^2$`. Uma fórmula destacada ganha seu próprio bloco:

$$
\frac{a}{b} + \frac{c}{d} = \frac{ad + bc}{bd}
$$

Uma nota de rodapé é uma referência na frase e uma explicação abaixo do texto.[^primeira]

[^primeira]: Este é o texto da nota. O Yi numera as notas para você.

## Ligue notas e imagens

Um wikilink liga notas por título, nome de arquivo ou id: `[[Outra nota]]`. Digite `[[` e o Yi
oferece as notas que encontra. Um link da web comum é escrito como
`[as palavras](https://example.com)`.

Uma imagem é uma imagem markdown comum: `![descrição](imagem.png)`. Um caminho relativo é
procurado primeiro ao lado da nota, depois na pasta de imagens de **Configurações → Geral**. O botão
de imagem insere uma imagem de um arquivo ou da área de transferência.

## Cite o que você lê

Citações usam a sintaxe do pandoc: `[@smith2020]`. Escolha um arquivo de bibliografia e um estilo
de citação em **Configurações → Citações**; o Yi então mostra a citação formatada na página e as
obras citadas em Referências ao exportar.

## Localize e substitua

**Editar → Localizar** percorre a nota; **Editar → Substituir** troca uma ocorrência ou todas. A
busca funciona na página exibida e no próprio código de um bloco.

## Exporte a nota

**Arquivo → Exportar** oferece um documento do Word, um arquivo OpenDocument, LaTeX, HTML, um livro
EPUB, um PDF e o markdown processado pelo aplicativo. O cartão nomeia o arquivo e as configurações
de conversão. Imagens são levadas para a saída; um SVG ou WebP é desenhado como PNG onde o formato
escolhido não consegue contê-lo.

## Guarde uma versão

**Arquivo → Salvar uma versão** guarda um estado da nota em um repositório git. Versões são criadas
só quando você pede, e o painel de versões deixa você ler uma cópia antiga e compará-la com o texto
atual.

## Deixe o aplicativo do seu jeito

**Configurações** muda o idioma, a aparência, a pasta de imagens, as citações, o frontmatter de notas
novas e se um documento não salvo abre na pilha. Não há botão Salvar: campos de texto salvam após
uma pequena pausa ou ao sair, enquanto opções e interruptores salvam imediatamente. **Aparência**
oferece Automático, Claro e Escuro; Automático segue o sistema. **Nova nota** usa um editor YAML, e
Redefinir restaura o modelo do aplicativo. O espaço de trabalho muda com **Arquivo → Abrir pasta…**,
não nas Configurações.

O aplicativo lembra os documentos abertos e onde você estava neles. Feche a janela e abra de novo; a
mesma página volta.

## Uma nota para experimentar

Copie isto em uma nota nova e mude:

```markdown
---
title: Minha primeira nota
---

## Sobre o que escrevo

Uma ideia com **peso**, um [link](https://example.com) e uma nota de rodapé.[^1]

Uma fórmula: $a^2 + b^2 = c^2$.

[^1]: A nota sob a linha.
```

Essa é toda a forma de uma nota do Yi: texto simples, um pouco de markdown e uma página fácil de ler
enquanto você escreve.
