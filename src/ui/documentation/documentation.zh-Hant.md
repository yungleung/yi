---
title: Yi 文件說明
id: yi-documentation
lang: zh-Hant
---

Yi 是本地優先的 Markdown 編輯器。工作區是一般資料夾，每則筆記是一般 Markdown 檔案，匯出交給
Pandoc。本指南說明日常工作，以及最需要謹慎處理的匯出範本套件。

本文件為唯讀；按 **F1** 可再次開啟。開啟其他筆記時會直接取代，不會詢問是否儲存。

## 工作區與筆記

左側樹狀檢視顯示的資料夾就是工作區，沒有帳戶或遠端副本。**File → New Markdown** 建立以十四位
ID 為檔名的筆記，並選取 `title`；樹中的 **New file** 在指定資料夾內建立同類筆記。

```yaml
---
title: 筆記標題
date: 2026-10-21
id: 20261021153000
keywords:
  - notes
  - export
---
```

`title` 是文件標題，`id` 是不可編輯的穩定識別碼，`lang` 可供 EPUB 等匯出使用。其他欄位會傳給
Pandoc 和範本套件。**Settings → New note** 控制新筆記的初始內容；套件 `metadata.yaml` 的選擇
只用於那一則筆記，不會改變之後的匯出範本。New note 也提供內建的
**Reveal.js presentation** 和 **Beamer presentation**；它們是簡報中繼資料，不是匯出範本套件。

Yi 以 Markdown 原文為準，同時顯示呈現結果。游標進入連結、公式或圍欄程式碼時，可在原處編輯
Markdown。常用快捷鍵為 ⌘S / Ctrl+S 儲存、⌘N / Ctrl+N 新增、⌘F / Ctrl+F 尋找、
⇧⌘F / Ctrl+Shift+F 取代，以及 F1 文件。

### 清單

完整的項目符號清單、有序清單或任務清單後方緊接一行題註時，會成為帶編號的清單物件：

```markdown
1. 準備樣本
2. 執行量測

: 步驟 {#list:steps .wide data-owner=demo}
```

以冒號開頭的題註行可以直接接在清單後，也可以隔一行空白。它使用與表格題註相同的語法。只有題註
而沒有 ID 的清單會消耗編號，但不能作為參照目標：

```markdown
: 初步檢查
```

只有 ID 的清單有參照目標和可見編號，但沒有題註正文：

```markdown
: {#list:steps}
```

沒有題註行的普通清單既沒有清單物件編號，也沒有參照目標。物件編號與有序清單內部的 `1.`、`2.`
項目編號互相獨立。

`[#list:steps]` 會建立自動參照；普通連結則保留作者撰寫的文字：

```markdown
參閱 [#list:steps]。
參閱[量測步驟](#list:steps)。
```

自動參照的預設文字是 `List 1`，不隨本文件的語言改變。可以在前置資料中設定清單類型詞與字面編號
前綴：

```yaml
reference-labels:
  list: 流程
reference-number-prefixes:
  list: "3-"
```

參照與可見題註會使用 `流程 3-1`。

HTML、EPUB、Word 和 ODT 會取得相同的清單目標、題註位置、類型詞、前綴與編號行為。不同 writer
產生的底層容器不同，但可見行為與結構一致。清單標記、任務核取方塊與巢狀清單維持不變。預處理
Markdown 使用與 HTML 相同的結構。

按住 ⌘ 或 Ctrl 點擊參照會顯示清單，並把游標放到第一個可編輯項目。點擊呈現後的題註會顯示完整
來源 `: 題註 {…}`，可在此編輯正文、ID、類別與屬性。

清單來源不需要 `:::` 區塊。冒號題註不會佔用圍欄 div，因此 callout 可以繼續使用該語法。清單項目
內部縮排的冒號仍屬於該項目內容；普通段落後的冒號則保留 Pandoc 定義清單的意義。

#### LaTeX 與 PDF 中的清單編號

LaTeX 沒有針對整個清單物件的原生計數器：`enumi`、`enumii` 等只計算項目，而且作用範圍限於一個
`enumerate` 環境。因此 Yi 為清單物件使用專用計數器 `yilist`，但標籤與參照仍使用 LaTeX 原生的
`\label`、`\ref` 和 `hyperref` 機制。

預設使用整份文件中的單一序列。LaTeX/PDF 範本可以透過 `\yiListCounterSetup` 設定重設層級與編號
格式。依章編號的範例：

```tex
\makeatletter
\providecommand{\yiListCounterSetup}{}
\renewcommand{\yiListCounterSetup}{%
  \@addtoreset{yilist}{chapter}%
  \renewcommand{\yiListNumber}{\thechapter.\arabic{yilist}}%
}
\makeatother
```

Yi 會在 `\begin{document}` 時呼叫這個 hook，接著套用筆記設定的類型詞與字面前綴。`\yiListNumber`
只控制基礎編號，不會移除前綴。如果清單編號必須與範本的表格計數器完全一致，必須把兩個計數器放在
同一位置並設定相同的重設層級；Yi 無法自動推斷任意文件類別的表格計數器規則。

## Callout（提示框）

GitHub 風格提示框的寫法：

```markdown
> [!NOTE]
> 值得注意的內容。
```

內建類型為 `NOTE`、`TIP`、`IMPORTANT`、`WARNING` 和 `CAUTION`。標題固定顯示為 `Note`、`Tip`、
`Important`、`Warning` 和 `Caution`，不隨 Yi 的介面語言改變；標記本身不區分大小寫。標記後的空引用
行可有可無。未知類型、`[!NOTE]` 後還有文字，以及 `> \[!NOTE]` 這類轉義寫法都保持普通引用。

也支援 Pandoc 圍欄 Div：

```markdown
::: {.callout .callout-note}
內建類型。
:::

::: {.callout .callout-definition title="定義"}
自訂類型。
:::
```

也可以只寫 `.callout-note`。自訂類型未寫 `title=` 時，標題由不依賴介面語言的類別名稱產生。ID、類別
與其他屬性會保留給匯出；Div ID 只是 Pandoc 中繼資料，不會成為 Yi 的交互參照目標。

在獨立一行輸入 `:::` 會建立已閉合的 Note Div，並在旁邊顯示 Note、Tip、Important、Warning、
Caution 和 Definition 六種選擇。選擇只會改寫 `.callout-<類型>` 類別，正文、ID、其他類別與屬性都保持
不變。

提示框可以巢狀於引用或另一個提示框，正文支援段落、清單、表格、程式碼圍欄、公式、題註、引用與普通
巢狀引用。游標在提示框外時顯示呈現面板；點擊標題或正文會顯示完整原文，離開後恢復呈現。

編輯時，開標記仍依容器上下文運作。在引用或提示框中輸入 `$$`、`[$$`、三個反引號的程式碼圍欄或
`:::` 會建立對應的成對結構；每條產生的實際行都會帶上目前 `>` 前綴，`:::` 仍會開啟提示框類型選擇器。
引用或提示框內的程式碼與顯示公式遵循子區塊自己的換行規則，可連續建立任意多個空行。圍欄 Div 提示框每按
一次 Enter 只增加一條帶前綴的新行，即使巢狀於引用或另一個提示框中也是如此。

輸入 `@` 後的引用補全、`[[` 後的 wikilink 補全與 `[#` 後的自動引用補全在兩種原始碼形式中都可用。
選擇項目時只寫入文獻鍵或目標 ID，周圍的引用前綴與括號保持不變。標記輸入或由輸入法提交後，列表會
立即出現，不需要再按 Tab 才能顯示。

開括號 `[`、`(` 和 `{` 會在普通文字、引用、GitHub 提示框與圍欄 Div 提示框中自動配對，由輸入法提交
單一字元時也一樣。在普通同文件連結的目的地中，於 `](` 後輸入 `#` 也會列出本文件的參照目標；
選擇項目時只寫入片段 ID。
接受這些補全後，游標停在完成節點的閉合邊緣，Markdown 原始碼仍可編輯；輸入下一個字元時，
如果它屬於外圍文字，會寫在節點之後，並呈現完成的連結、參照、文獻引用或 wikilink。
如果它仍屬於同一結構，例如敘述式文獻引用中的下一個鍵字元，則原始碼保持顯示。

普通引用也遵循相同規則：游標位於其中時顯示完整原文，因此轉義標記、`>` 前綴與子區塊分隔符都能按所見
字元精確編輯。
離開原始碼模式後，普通引用會在左右兩側留出邊距，只顯示一個醒目的左引號；不再顯示粗直線，也不顯示右引號。

普通引用段落中的 Enter 會建立兩個帶完整 `>` 前綴的空行。繼續輸入會成為下一段；在空的引用段上再按
一次 Enter 只會退出目前一層引用。巢狀引用需要逐層退出。清單、表格、程式碼與公式保持原有 Enter
行為，每個新增原始碼行都會帶上完整引用前綴；這些子區塊結束後，按 Enter 會像普通段落一樣加入兩個帶前綴的空行。

在空的 `>` 行輸入時，原始碼會準確變成 `>B`，不會自動加入不可見空格；如果原始碼原本已有可見的
`> `，則保留該空格。在空白引用行按 Backspace 或 Delete 會刪除整條實際行，而不只是刪除 `>`。
在空清單項目按 Enter 會移除清單標記，將其變成普通的引用行或提示框正文行。
在引用或 GitHub 提示框中插入表格時，每一行與分隔行都會帶上相同的 `>` 前綴，因此表格仍位於容器內。

在圍欄 Div 提示框內，Enter 只插入一個換行；再次按 Enter 會繼續增加空行，游標始終停在最新一行。
引用中的 Div 會在每條新插入的實際行保留可見引用前綴。

空提示框仍有不可見的正文游標錨點。從後一個區塊按 Left 或從前一個區塊按 Right 都能進入它；僅導覽
不會修改原始碼，第一次輸入時才建立正文行。
在空 GitHub 提示框的標記行按 Enter，會像普通引用段落一樣建立兩個帶 `>` 的空行，並把游標放在第二個；
再次按 Enter 會移除這些標記並離開提示框。在空圍欄 Div 的開標記行按 Enter，會在結束圍欄前建立一條
可編輯正文行。

所有 Pandoc 匯出都會把兩種寫法轉換成相同的語意 Div：

```markdown
:::: {.callout .callout-note}
::: {.callout-title}
Note
:::

值得注意的內容。
::::
```

HTML、EPUB、DOCX、ODT 與 LaTeX/PDF 範本可分別透過 CSS、參照文件樣式或 Lua filter 設定外觀。filter
接收 `.callout`、`.callout-<類型>`、`.callout-title` 與依文件順序排列的正文區塊。轉換發生在範本
filter 之前，因此 filter 使用這個穩定結構，而不用處理 GitHub 或圍欄 Div 原文。

## 匯出筆記

| 類型 | 輸出 |
| --- | --- |
| HTML | 含頁面與本地資源的組合資料夾 |
| Reveal.js | 預設含本地 `images/` 和 `js/dist/` 的簡報組合包 |
| LaTeX | `.tex` 與範本資源 |
| Beamer | XeLaTeX 產生的簡報 PDF |
| PDF | TeX 引擎產生的 PDF |
| EPUB | EPUB 電子書 |
| Word | `.docx` |
| LibreOffice | `.odt` |
| Markdown | Yi 預處理的 Markdown |

除 Markdown 外都需要 Pandoc；PDF 另需 XeLaTeX 等 TeX 環境。Yi 會從常見位置及 `PATH` 尋找
Pandoc，但不會自動安裝軟體，也不會執行 TeX Live Manager。

匯出卡片會選擇目標，並在支援的類型中選擇範本包或資源。Reveal.js 與 Beamer 不接受範本包。
記住的範本選擇依匯出類型保存，不依筆記保存。

### 簡報匯出

Reveal.js 從前置中繼資料讀取 `title`、`subtitle`、`author`、`theme`、`transition`、
`slide-level` 等設定，而且一律輸出非自包含資料夾：

```text
presentation/
  presentation.html
  images/
  js/dist/
```

卡片有兩個彼此獨立的選項，預設都關閉：

- **Use remote Reveal.js resources** 保留 Pandoc 固定的 CDN URL；關閉時，Yi 將 Reveal.js 的
  JavaScript、樣式表、主題和外掛下載到 `js/dist/`。
- **Use remote pictures** 保留網頁圖片 URL；關閉時，每張遠端圖片會下載到 `images/`。本地圖片
  一律複製到該資料夾。

Beamer 從中繼資料讀取 `title`、`subtitle`、`author`、`institute`、`theme`、`colortheme`、
`fonttheme`、`aspectratio`、`navigation` 和 `section-titles`。它輸出一個 PDF，不提供範本或頁面
尺寸控制。一級標題是章節，二級標題是投影片。

### 安裝 Pandoc 與 TeX

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

檢查：

```sh
pandoc --version
xelatex --version
```

`pandoc --version` 失敗時，所有依賴 Pandoc 的匯出都不可用；只有 `xelatex --version` 失敗時，
PDF 以外的格式仍可使用。缺少的 TeX 套件由安裝 TeX 的套件管理器補充，Yi 不執行 `tlmgr`。

每個格式都有可編輯的 `export.<kind>.yaml`，例如 `export.pdf.yaml`。它們是 Pandoc defaults
檔案，可設定 writer、PDF 引擎、高亮、頁面變數、濾鏡和資源路徑。

## 範本套件

範本套件位於 Yi 匯出資料目錄，不屬於工作區，也不會進入工作階段堆疊。

```text
example-latex/
  template.json
  template.tex
  journal.cls
  journal.bst
  metadata.yaml
  defaults.yaml
```

`template.json` 由 Yi 維護。`kind` 為 `html`、`latex`、`pdf`、`epub`、`docx` 或 `odt`；
`mode` 為 `template`、`wrapper` 或 `reference-doc`。文字範本使用 `template`，Word 與 ODT
使用 `reference_doc`，兩者只能有一個。`assets` 是從套件根開始的 `/` 分隔相對路徑；
`deliver` 是 LaTeX 輸出旁需要的類別與 BibTeX 樣式子集；`csl` 可指定套件自身的引用樣式。

### 包裝模式

若起點是包含 `\begin{document}` 與 `\end{document}` 的完整 LaTeX 文件，而不是 Pandoc 範本，
應使用 `wrapper`。Yi 可保留原文為 `source.tex`，建立一個在 `\end{document}` 前插入 `$body$`
的 `template.tex`，並可選擇把 `\title{}` 和 `\author{}` 改成 `$title$`、`$author$`。

### 從 Pandoc 預設建立

**Create…** 詢問名稱、來源與授權後，用 Pandoc 產生預設範本或參照文件。文字格式得到
`template.html`、`template.tex` 等；Word 與 ODT 得到 `reference.docx`、`reference.odt`。

### 匯入範本組合

可匯入單一檔案、資料夾或 ZIP。Yi 先檢查，確認後才複製。ZIP 的絕對路徑、`..`、符號連結、過大
容量或過多檔案會被拒絕；解壓只在暫存資料夾進行並於結束後清除。類別、樣式、文獻、圖片、字型、
CSS 和 JavaScript 都會保留為資產。

### 編輯與驗證

程式碼面板列出可編輯文字與唯讀二進位檔，支援行號、搜尋、復原、YAML/LaTeX 高亮和原子儲存。
**Validate** 以短段落執行實際轉換；**Test PDF** 另執行 PDF 引擎。錯誤會顯示 Pandoc 或 TeX
原本的訊息。

## HTML 範本

```html
<!doctype html>
<html lang="$lang$">
  <head><meta charset="utf-8"><title>$title$</title></head>
  <body><main>$body$</main></body>
</html>
```

將 `$body$` 放在內容位置。Yi 一定建立輸出資料夾；**Self-contained HTML** 關閉時，範本資源與
筆記本地圖片以相對 URL 複製，開啟時則嵌入頁面，但完整套件資產仍會保留在組合資料夾。
`http://`、`https://` 圖片保持原本 URL。

## LaTeX 與 PDF 範本

```tex
\documentclass{article}
\begin{document}
$if(title)$\title{$title$}\maketitle$endif$
$body$
\end{document}
```

`$body$` 只能出現一次，標題、作者、單位與電子郵件應來自筆記中繼資料。LaTeX 匯出會把完整套件資產
複製到 `.tex` 旁；若目標已有不同檔案，Yi 會回報衝突而不覆寫。筆記本地圖片優先於相同相對路徑的
範本圖片，其餘放在 `<輸出名>.assets/`。

原生 BibTeX 套件在 `defaults.yaml` 使用：

```yaml
filters: []
cite-method: natbib
bibliography: references.bib
```

匯出時 **Settings → Citation** 是依據，Yi 只將筆記實際引用的項目寫入 `references.bib`。
BibTeX 與 CSL-JSON 都可使用；CSL-JSON 優先採用 `citation-key`，否則使用 `id`。
PDF 由 Pandoc 和 `pdf-engine` 執行，套件根與入口資料夾會加入 TeX/BibTeX 搜尋路徑。Yi 拒絕在
PDF defaults 啟用無限制 shell escape。

## EPUB 範本

EPUB 使用包含 `$body$` 的 XHTML `template.xhtml`。CSS、圖片、字型和指令碼放在套件內並使用相對
URL。Pandoc 建立書籍，Yi 將資源放入 `EPUB/assets/` 並登錄到 `content.opf`。EPUB 需要 `title`
與 `lang`，正式發布前也應使用 epubcheck 等專用工具。

## Word 與 OpenDocument 範本

Word 和 OpenDocument 使用帶樣式的**參照文件**，不是文字範本。

```text
example-docx/
  template.json
  reference.docx
  defaults.yaml
  metadata.yaml
```

Pandoc 會採用參照文件中的段落、字元、表格和頁面樣式。標題、副標題、作者、日期、摘要、各級標題、
正文、引用、程式碼、圖表標題、清單、腳註和參考文獻的樣式名稱應保持不變。Yi 不編輯二進位檔，
**Open in system** 會在 Word 或 LibreOffice 中開啟。

### 從 Pandoc 參照文件開始

Pandoc 的
[`--reference-doc` 章節](https://pandoc.org/MANUAL.html#option--reference-doc)
是正式說明，包含 DOCX 與 ODT 差異、樣式名稱和建議流程。完整的
[Pandoc 使用者指南](https://pandoc.org/MANUAL.html)說明 Yi 傳遞的其他設定。

可在 Yi 使用 **Create…** 產生預設參照文件，或在終端執行：

```sh
pandoc -o custom-reference.docx --print-default-data-file reference.docx
pandoc -o custom-reference.odt --print-default-data-file reference.odt
```

以 Word 或 LibreOffice 開啟並修改樣式後儲存。不要更改 Pandoc 需要的樣式名稱；字型、間距、顏色和
框線可以調整。DOCX 參照文件提供樣式與文件屬性，包括頁面尺寸、邊界、頁首和頁尾，正文內容會被忽略；
ODT 參照文件提供樣式表，正文內容同樣會被忽略。最後存成 `reference.docx` 或 `reference.odt`，
並設為對應套件的入口。

## 套件 YAML

`metadata.yaml` 可作為新筆記的初始中繼資料；內容優先於設定的新筆記範本，但 `date`、`id` 永遠由
Yi 覆寫。`export.yaml` 會接在 App 的 `export.<kind>.yaml` 之後，沒有時使用 `defaults.yaml`。
套件設定優先於 App 預設，但明確的命令列輸出路徑、範本、CSL 和資源路徑最後生效。

套件 YAML 的 `csl` 只是後備；**Settings → Citation** 的樣式會稍後傳入並優先。要強制套件樣式，
應在 `template.json` 的 `csl` 指定。不要再加入 citeproc，否則可能產生重複文獻。

## 完整範例與 AI 提示

`examples/templates/` 有供讀者使用的 HTML、LaTeX、PDF、Rho Class、EPUB、Word 和 ODT
完整套件。上一層還有完整參考簡報 `examples/revealjs.md` 和 `examples/beamer.md`。
`examples/` 是讀者資料；`test/fixtures/` 是用途不同、受控的測試資料。

給 AI 代理的提示應要求建立可匯入的來源資料夾，但不要建立 `template.json`：

- **HTML**：`$body$`、側邊目錄、`toc-depth: 2`、套件內 CSS/JavaScript。
- **LaTeX**：三位作者、不同單位、摘要、圖表、腳註、原生引用、類別和 BibTeX 樣式。
- **PDF**：XeLaTeX、標題頁、摘要、程式碼、圖表與文獻。
- **Rho Class PDF**：保留 CC BY 4.0 設計、類別名稱、來源 URL 與署名。
- **EPUB**：封面、出版社、ISBN、版權、獻詞、目錄與三章。
- **Word**：完整 `reference.docx` 樣式、`toc: true`、`toc-depth: 2`。
- **OpenDocument**：A4 學位論文、封面、摘要、兩層目錄、正文從第 1 頁編號。

## 使用前驗證

1. 在範本編輯器開啟套件。
2. 執行 **Validate** 並讀完整訊息。
3. PDF 再執行 **Test PDF**。
4. 匯出含標題、清單、表格、程式碼、數學與圖片的短筆記。
5. 檢查相對資產與參考文獻。

| 訊息 | 檢查 |
| --- | --- |
| Pandoc not found | 安裝 Pandoc，並用更新後的 `PATH` 重啟 Yi |
| PDF engine not found | 安裝 TeX，確認 `xelatex --version` |
| `journal.cls` not found | 將類別檔放入套件並加入 TeX 搜尋路徑 |
| Template variable missing | 對照 Pandoc 對應 writer 的變數 |
| Filter could not start | 安裝濾鏡環境或從 defaults 移除 |
| Local picture missing | 使用套件相對路徑與 `assets` 圖片 |

## 安全性與信任

範本是可執行的轉換設定，可能含 Pandoc 濾鏡、Lua、LaTeX 類別、套件與字型。只使用可信範本。
Yi 記錄來源與授權，但不判斷使用權；不自動下載期刊資產、不安裝 TeX、不執行 `tlmgr`、不允許
PDF defaults 啟用無限制 shell escape，也不會自動改寫任意期刊範例。

## 套件檢查清單

- [ ] `template.json` 存在且 schema 為 1。
- [ ] `kind`、入口與 `mode` 一致。
- [ ] 文字範本在正確位置只有一個 `$body$`。
- [ ] 參照文件可在 Word 或 LibreOffice 開啟。
- [ ] `assets`、`deliver`、`csl` 路徑都存在。
- [ ] 相對連結使用 `/` 並指向套件內資源。
- [ ] `metadata.yaml` 是頂層 YAML 映射。
- [ ] `defaults.yaml` / `export.yaml` 只含必要設定。
- [ ] PDF 未啟用 shell escape。
- [ ] 短代表性筆記驗證成功，實際輸出含所需資產。
