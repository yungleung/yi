---
title: Yi 文档
id: yi-documentation
lang: zh-Hans
---

Yi 是本地优先的 Markdown 编辑器。工作区是普通文件夹，每条笔记是普通 Markdown 文件，导出交给
Pandoc 完成。本指南介绍日常工作，以及最需要谨慎处理的导出模板包。

本文件为只读文档。按 **F1** 可再次打开；打开其他笔记时会直接替换它，不会询问是否保存。

## 工作区与笔记

左侧树中显示的文件夹就是工作区，没有账户或远程副本。

- **File → New Markdown** 创建以十四位 ID 为文件名的笔记，并选中 `title` 方便立即输入。
- 树中的 **New file** 在选中文件夹内创建同类笔记。
- **File → Open Folder…** 切换工作区，**File → Save** 保存。
- 会话栈只保留显式加入的文档。教程和本文档是参考文档，不会进入栈。

### 前置元数据

```yaml
---
title: 笔记标题
date: 2026-10-21
id: 20261021153000
keywords:
  - notes
  - export
---
```

`title` 是文档名，`id` 是编辑器中不可修改的稳定标识，`lang` 可供 EPUB 等导出使用。其他键会传给
Pandoc 和模板包。

**Settings → New note** 决定新笔记的初始元数据。使用模板包 `metadata.yaml` 的选择只属于当前新
笔记，不会改变后续导出的模板选择。

### 编辑

Yi 以 Markdown 原文为准，同时显示渲染结果。光标进入链接、公式或围栏代码块时，会显示并允许编辑其
Markdown。常用快捷键：⌘S / Ctrl+S 保存，⌘N / Ctrl+N 新建，⌘F / Ctrl+F 查找，
⇧⌘F / Ctrl+Shift+F 替换，F1 打开文档。

### 列表

完整的项目符号列表、有序列表或任务列表后紧跟一行题注时，会成为带编号的列表对象：

```markdown
1. 准备样本
2. 执行测量

: 步骤 {#list:steps .wide data-owner=demo}
```

以冒号开头的题注行可以直接跟在列表后，也可以隔一行空行。它使用与表格题注相同的语法。只有题注
而没有 ID 的列表会消耗编号，但不能作为引用目标：

```markdown
: 初步检查
```

只有 ID 的列表有引用目标和可见编号，但没有题注正文：

```markdown
: {#list:steps}
```

没有题注行的普通列表既不会有列表对象编号，也不会有引用目标。列表对象编号与有序列表内部的
`1.`、`2.` 项目编号相互独立。

`[#list:steps]` 会生成自动引用；普通链接保留作者写入的文本：

```markdown
参见 [#list:steps]。
参见[测量步骤](#list:steps)。
```

自动引用的默认文本是 `List 1`，不随本文档语言变化。可以在前置元数据中设置列表类型词和字面编号
前缀：

```yaml
reference-labels:
  list: 流程
reference-number-prefixes:
  list: "3-"
```

引用和可见题注会使用 `流程 3-1`。

HTML、EPUB、Word 和 ODT 获得相同的列表目标、题注位置、类型词、前缀和编号行为。不同 writer
生成的底层容器不同，但可见行为和结构一致。列表标记、任务复选框和嵌套列表保持不变。预处理
Markdown 使用与 HTML 相同的结构。

按住 ⌘ 或 Ctrl 点击引用会显示列表，并把光标放到第一个可编辑项目中。点击渲染后的题注会显示完整
来源 `: 题注 {…}`，可在此编辑正文、ID、类名和属性。

列表来源不需要 `:::` 块。冒号题注不会占用围栏 div，因此 callout 可以继续使用该语法。列表项目
内部缩进的冒号仍属于该项目内容；普通段落后的冒号继续保留 Pandoc 定义列表的含义。

#### LaTeX 与 PDF 中的列表编号

LaTeX 没有针对整个列表对象的原生计数器：`enumi`、`enumii` 等只计算项目，并且作用范围限于一个
`enumerate` 环境。因此 Yi 为列表对象使用专用计数器 `yilist`，但标签和引用仍使用 LaTeX 原生的
`\label`、`\ref` 和 `hyperref` 机制。

默认使用整个文档中的单一序列。LaTeX/PDF 模板可以通过 `\yiListCounterSetup` 设置重置层级和编号
格式。按章编号的示例：

```tex
\makeatletter
\providecommand{\yiListCounterSetup}{}
\renewcommand{\yiListCounterSetup}{%
  \@addtoreset{yilist}{chapter}%
  \renewcommand{\yiListNumber}{\thechapter.\arabic{yilist}}%
}
\makeatother
```

Yi 在 `\begin{document}` 时调用这个 hook，随后应用笔记配置的类型词和字面前缀。`\yiListNumber`
只控制基础编号，不会移除前缀。如果列表编号必须与模板的表格计数器完全一致，需要把两个计数器放在
同一位置并设置为相同的重置层级；Yi 无法自动推断任意文档类的表格计数器规则。

## Callout（提示框）

GitHub 风格提示框的写法：

```markdown
> [!NOTE]
> 值得注意的内容。
```

内置类型为 `NOTE`、`TIP`、`IMPORTANT`、`WARNING` 和 `CAUTION`。标题固定显示为 `Note`、`Tip`、
`Important`、`Warning` 和 `Caution`，不随 Yi 的界面语言改变；标记本身不区分大小写。标记后的空引用行
可有可无。未知类型、`[!NOTE]` 后还有文字，以及 `> \[!NOTE]` 这类转义写法都保持普通引用。

也支持 Pandoc 围栏 Div：

```markdown
::: {.callout .callout-note}
内置类型。
:::

::: {.callout .callout-definition title="定义"}
自定义类型。
:::
```

也可以只写 `.callout-note`。自定义类型未写 `title=` 时，标题由不依赖界面语言的类名生成。ID、类名和
其他属性会保留给导出；Div ID 只是 Pandoc 元数据，不会成为 Yi 的交叉引用目标。

在单独一行输入 `:::` 会创建已闭合的 Note Div，并在旁边显示 Note、Tip、Important、Warning、
Caution 和 Definition 六种选择。选择只改写 `.callout-<类型>` 类，正文、ID、其他类名和属性都保持不变。

提示框可以嵌套在引用或另一个提示框中，正文支持段落、列表、表格、代码围栏、公式、题注、引用和普通
嵌套引用。光标在提示框外时显示渲染面板；点击标题或正文会显示完整原文，离开后恢复渲染。
普通引用也遵循同一规则：光标位于其中时显示完整原文，因此转义标记、`>` 前缀和子块分隔符都能按所见字符
精确编辑。

普通引用段落中的 Enter 会创建两个带完整 `>` 前缀的空行。继续输入会成为下一段；在空的引用段上再按
一次 Enter 只会退出当前一层引用。嵌套引用需要逐层退出。列表、表格、代码和公式保持原有 Enter
行为，每个新增源码行都会带上完整引用前缀；这些子块结束后，只需添加一个带前缀的空行。

在空的 `>` 行输入时，源码准确变为 `>B`，不会自动添加不可见空格；如果源码本来就有可见的 `> `，
则保留这个空格。在空白引用行按 Backspace 或 Delete 会删除整条物理行，而不只是删除 `>`。

在围栏 Div 提示框内，Enter 只插入一个换行；再次按 Enter 会继续增加空行，光标始终落在最新一行。
引用中的 Div 会在每条新插入的物理行上保留可见引用前缀。

空提示框仍有不可见的正文光标锚点。从后一个块按 Left 或从前一个块按 Right 都能进入它；仅导航不会
修改源码，第一次输入时才创建正文行。

所有 Pandoc 导出都会把两种写法转换为相同的语义 Div：

```markdown
:::: {.callout .callout-note}
::: {.callout-title}
Note
:::

值得注意的内容。
::::
```

HTML、EPUB、DOCX、ODT 和 LaTeX/PDF 模板可分别通过 CSS、参考文档样式或 Lua filter 设置外观。filter
接收 `.callout`、`.callout-<类型>`、`.callout-title` 和按文档顺序排列的正文块。转换发生在模板 filter
之前，因此 filter 使用这个稳定结构，而不用处理 GitHub 或围栏 Div 原文。

## 导出笔记

| 类型 | 输出 |
| --- | --- |
| HTML | 包含页面和本地资源的捆绑文件夹 |
| LaTeX | `.tex` 文件及模板资源 |
| PDF | TeX 引擎生成的 PDF |
| EPUB | EPUB 电子书 |
| Word | `.docx` |
| LibreOffice | `.odt` |
| Markdown | Yi 预处理后的 Markdown |

除 Markdown 外都需要 Pandoc；PDF 还需要 XeLaTeX 等 TeX 环境。Yi 会从常见应用位置和 `PATH`
查找 Pandoc，但不会自动安装软件或运行 TeX Live Manager。

### 安装 Pandoc 与 TeX

macOS：

```sh
brew install pandoc
brew install --cask mactex-no-gui
```

Debian / Ubuntu：

```sh
sudo apt install pandoc texlive-xetex texlive-fonts-recommended
```

Windows：

```powershell
winget install JohnMacFarlane.Pandoc
winget install MiKTeX.MiKTeX
```

检查安装：

```sh
pandoc --version
xelatex --version
```

如果 `pandoc --version` 失败，所有依赖 Pandoc 的导出都不可用；如果只有 `xelatex --version`
失败，PDF 以外的格式仍可用。缺少的 TeX 包应通过安装 TeX 的包管理器补充，Yi 不运行 `tlmgr`。

### 默认导出设置

每种格式都有可编辑的 `export.<kind>.yaml`，例如 `export.html.yaml`、`export.pdf.yaml`。它们是
普通 Pandoc defaults 文件，可设置 writer、PDF 引擎、代码高亮、页面变量、过滤器和资源路径。

## 模板包

模板包位于 Yi 的导出数据目录，不属于工作区，也不会进入会话栈。

```text
example-latex/
  template.json
  template.tex
  journal.cls
  journal.bst
  metadata.yaml
  defaults.yaml
```

`template.json` 由 Yi 写入和维护，用户不应手工创建。`kind` 为 `html`、`latex`、`pdf`、`epub`、
`docx` 或 `odt`；`mode` 为 `template`、`wrapper` 或 `reference-doc`。文本模板使用
`template`，Word 和 ODT 使用 `reference_doc`，二者只能有一个。

`assets` 是从包根开始的 `/` 分隔相对路径。`deliver` 是复制到 LaTeX 输出旁的类文件和 BibTeX
样式子集。`csl` 可指定包自带引用样式，并会在用户选择的 CSL 之后应用。

### Wrapper 模式

如果起点是包含 `\begin{document}` 和 `\end{document}` 的完整 LaTeX 文档，而不是 Pandoc 模板，
应使用 `wrapper`。导入时 Yi 可保留原文件为 `source.tex`，生成在 `\end{document}` 前插入
`$body$` 的 `template.tex`，并可选地把 `\title{}` 和 `\author{}` 替换为 `$title$` 和
`$author$`。

### 从 Pandoc 默认模板创建

**Create…** 会询问名称、来源和许可证，再运行 Pandoc 生成默认模板或参考文档。文本格式得到
`template.html`、`template.tex` 等；Word 和 ODT 得到 `reference.docx`、`reference.odt`。
清单中的来源类型记为 `origin.type: "pandoc-default"`。

### 导入模板包

可以导入单个文件、文件夹或 ZIP。Yi 先检查，用户确认后才复制。文件夹和 ZIP 会递归扫描，并按
`$body$` 文本、完整 LaTeX 文档、`.docx` / `.odt` 的顺序选择入口。类、样式、参考文献、图片、字体、
CSS 和 JavaScript 都会作为资源保留。

ZIP 中的绝对路径、`..`、符号链接、过大的体积或过多文件会被拒绝。解压只在临时目录中进行，并在
成功或失败后清理。

### 编辑与验证

模板代码面板列出可编辑文本和只读二进制文件，支持行号、查找、撤销、YAML/LaTeX 高亮和原子保存。
**Validate** 会用短测试段落转换；**Test PDF** 还会运行 PDF 引擎。错误原样显示 Pandoc 或 TeX
的消息，而不是由 Yi 猜测。

## 编写 HTML 模板

HTML 模板是包含 `$body$` 的 Pandoc 模板。

```html
<!doctype html>
<html lang="$lang$">
  <head>
    <meta charset="utf-8">
    <title>$title$</title>
    <link rel="stylesheet" href="assets/site.css">
  </head>
  <body><main>$body$</main><script src="assets/site.js"></script></body>
</html>
```

将模板和 `assets/` 放在同一个包中。Yi 始终创建输出文件夹，并把页面放在其中。
**Self-contained HTML** 关闭时，模板资源和笔记本地图片按相对 URL 复制；开启时，本地资源会嵌入
页面，但完整模板资源树仍会复制到捆绑目录。`http://` 和 `https://` 图片保持原 URL。

## 编写 LaTeX 与 PDF 模板

LaTeX 和 PDF 模板必须只包含一次 `$body$`。

```tex
\documentclass{article}
\begin{document}
$if(title)$\title{$title$}\maketitle$endif$
$body$
\end{document}
```

标题、作者、单位和邮箱应来自笔记元数据，而不是固定在模板中。Pandoc 变量、循环、条件和代码高亮
请参考 Pandoc 手册。Yi 不会擅自给用户模板注入兼容性导言区。

### LaTeX 输出

LaTeX 导出会把整个模板资源树复制到 `.tex` 旁边，包括类、样式、文献、图片和数据。`deliver` 表示
投稿需要的类文件和文献样式子集。目标位置已有不同文件时 Yi 会报告冲突，不会覆盖。

笔记中的本地图片会复制到源码目录。若它与模板资源使用同一相对路径，笔记图片优先；其他图片放在
`<输出名>.assets/` 下。

### 原生 BibTeX

```yaml
filters: []
cite-method: natbib
bibliography: references.bib
```

模板通常使用 `\bibliographystyle{...}` 和 `\bibliography{references}`。导出时
**Settings → Citation** 是权威来源，Yi 只把笔记实际引用的条目写入 `references.bib`。BibTeX 和
CSL-JSON 都可作为输入；CSL-JSON 优先使用 `citation-key`，否则使用 `id`。

### PDF 输出

PDF 由 Pandoc 和 `pdf-engine` 处理 `.tex`。包根目录和入口所在目录会加入 `TEXINPUTS`、
`BIBINPUTS`、`BSTINPUTS`，工作目录为入口目录。若 PDF 默认文件启用无限制 shell escape，Yi
会拒绝。

## 编写 EPUB 模板

EPUB 使用包含 `$body$` 的 XHTML 文件 `template.xhtml`。CSS、图片、字体和脚本都应放在包内并使用
相对 URL。Pandoc 生成容器，Yi 再把资源加入 `EPUB/assets/` 并声明到 `content.opf`。

```xhtml
<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" lang="$lang$">
  <head><title>$pagetitle$</title></head>
  <body><section>$body$</section></body>
</html>
```

EPUB 需要 `title` 和 `lang`。正式发布时还应使用 epubcheck 等专用工具验证。

## 编写 Word 和 OpenDocument 模板

Word 和 OpenDocument 使用带样式的二进制**参考文档**，不是文本模板。

```text
example-docx/
  template.json
  reference.docx
  defaults.yaml
  metadata.yaml
```

Pandoc 会从参考文档读取样式。请保留标题、副标题、作者、日期、摘要、各级标题、正文、引用、代码、
图题、列表、脚注、表格、插图和参考文献对应的样式名。Yi 不编辑二进制文件，**Open in system**
会在 Word 或 LibreOffice 中打开它。

### 从 Pandoc 参考文档开始

Pandoc 的
[`--reference-doc` 章节](https://pandoc.org/MANUAL.html#option--reference-doc)
是权威说明，包含 DOCX 与 ODT 的差异、样式名和推荐流程。完整的
[Pandoc 用户指南](https://pandoc.org/MANUAL.html)说明 Yi 会传递的其他设置。

可以在 Yi 中使用 **Create…** 生成默认参考文档，也可在终端运行：

```sh
pandoc -o custom-reference.docx --print-default-data-file reference.docx
pandoc -o custom-reference.odt --print-default-data-file reference.odt
```

用 Word 或 LibreOffice 打开生成的文件，修改样式并保存。不要改变 Pandoc 需要的样式名。字体、间距、
颜色和边框可以修改，改名会让相应 Markdown 元素找不到样式。

- DOCX 参考文档提供样式和文档属性，包括页面尺寸、页边距、页眉和页脚；正文内容会被忽略。
- ODT 参考文档提供样式表；正文内容会被忽略。

保存为 `reference.docx` 或 `reference.odt`，再把它设为相应 Word 或 LibreOffice 模板包的入口。

## 包内 YAML

### metadata.yaml

包根目录中的 `metadata.yaml` 可作为新笔记的初始元数据。包中的键优先于已配置模板，但 `date` 和
`id` 始终由 Yi 覆盖。

```yaml
title: 模板标题
author: 示例作者
keywords:
  - journal
  - template
```

### export.yaml 与 defaults.yaml

`export.yaml` 会在应用 `export.<kind>.yaml` 之后传给 Pandoc；没有时使用 `defaults.yaml`。
包设置优先于应用默认值，但输出路径、模板或参考文档、CSL、资源路径等显式命令行参数最后生效。

包 YAML 中的 `csl` 只是后备。**Settings → Citation** 选择的样式稍后传入并优先。需要强制包自己的
引用样式时，应在 `template.json` 的 `csl` 中指定。不要再添加 citeproc，否则可能重复参考文献。

## 完整示例

`test/fixtures/templates/examples/` 包含 HTML、LaTeX、PDF、Rho Class、EPUB、Word 和 ODT
的完整可用示例。可直接打开学习，也可以把文件夹导入 Yi 的模板库。

### 给 AI 代理的提示词

下面各提示词要求创建可导入的源文件夹；不要让代理创建 `template.json`，由 Yi 在导入时写入。

#### Example prompt: HTML

创建 Yi HTML 模板包：`template.html` 只含一次 `$body$`，带侧边目录、`toc-depth: 2`、包内 CSS
和 JavaScript，以及 Yi 支持的 Markdown 示例；不要创建 `template.json`。

#### Example prompt: LaTeX

创建三作者、不同单位、摘要、图、表、脚注和引文齐全的学术 LaTeX 模板包；包含类文件、BibTeX 样式、
仅保留被引条目的示例 `references.bib`，且不要创建 `template.json`。

#### Example prompt: PDF

创建 XeLaTeX PDF 模板包，包含标题页、摘要、代码高亮、图、表和参考文献；使用
`pdf-engine: xelatex` 和 `$body$`，不要创建 `template.json`。

#### Example prompt: Rho Class PDF

按 Rho Class 的 CC BY 4.0 设计创建 PDF 模板包，保留上游类名、来源 URL、许可证和署名；标题、
作者和单位来自 metadata，不要创建 `template.json`。

#### Example prompt: EPUB

创建含封面、出版社、版次、ISBN、版权、献词、目录和三章的 EPUB 包；`template.xhtml` 只含一次
`$body$`，CSS 和封面放在包内，不要创建 `template.json`。

#### Example prompt: Word

创建包含标题至参考文献全部 Pandoc 样式的 `reference.docx`，设置 `toc: true` 和
`toc-depth: 2`，附 Yi 支持的 Markdown 示例，不要创建 `template.json`。

#### Example prompt: OpenDocument

创建含学院图片封面、四行署名、摘要和两级目录的 A4 学位论文 `reference.odt`；正文从第 1 页开始，
封面、摘要和目录不显示页码，不要创建 `template.json`。

## 使用模板前验证

1. 在模板编辑器中打开包。
2. 点击 **Validate** 并读取完整消息。
3. PDF 包通过后再点击 **Test PDF**。
4. 导出含标题、列表、表格、代码、公式和图片的短笔记。
5. 检查相对资源与参考文献文件。

验证会真实转换到临时目录。它不能保证任意笔记都不会触发缺失类或错误变量，但能在正式导出前发现包自身
的错误。

| 消息 | 检查 |
| --- | --- |
| Pandoc not found | 安装 Pandoc，并用更新后的 `PATH` 重启 Yi |
| PDF engine not found | 安装 TeX，确认 `xelatex --version` |
| `journal.cls` not found | 将类文件放入包内，并确保包根在 TeX 搜索路径 |
| Template variable missing | 对照 Pandoc 对应 writer 的变量 |
| Filter could not start | 安装过滤器运行环境，或从默认设置移除 |
| Local picture missing | 使用包内相对路径和 `assets` 图片 |

## 安全与信任

模板是可执行的转换配置，可能包含 Pandoc 过滤器、Lua、LaTeX 包、类和字体。只使用可信模板。
Yi 记录来源与许可证，但不判断使用权限；发布包时应保持字段准确。

Yi 不自动下载期刊资源，不安装 TeX 包，不运行 `tlmgr`，不允许 PDF 默认文件开启无限制 shell
escape，也不会把任意期刊样例自动改写成完美 Pandoc 模板。

## 模板包检查清单

- [ ] `template.json` 存在且 schema 为 1。
- [ ] `kind`、入口和 `mode` 一致。
- [ ] 文本模板在正确位置只含一次 `$body$`。
- [ ] 参考文档可在 Word 或 LibreOffice 中打开。
- [ ] `assets`、`deliver` 和 `csl` 中的路径都存在。
- [ ] 相对链接使用 `/` 并指向包内资源。
- [ ] `metadata.yaml` 是顶层 YAML 映射。
- [ ] `defaults.yaml` / `export.yaml` 只包含必要设置。
- [ ] PDF 默认设置未启用 shell escape。
- [ ] 短代表性笔记验证成功。
- [ ] 真实导出包含需要的类、样式、图片和参考文献。
