---
title: Yi ドキュメント
id: yi-documentation
lang: ja
---

Yi はローカル優先の Markdown エディターです。ワークスペースは通常のフォルダー、ノートは通常の
Markdown ファイルで、書き出しは Pandoc に任せます。このガイドは日常的な使い方と、もっとも慎重な
扱いが必要なテンプレートパッケージの作成方法を説明します。

この文書は読み取り専用です。**F1** でいつでも開き直せます。別のノートを開くと保存確認なしで
置き換わります。

## ワークスペースとノート

左側のツリーに表示されるフォルダーがワークスペースです。アカウントやリモートコピーはありません。

- **File → New Markdown** は 14 桁の ID をファイル名にしてノートを作ります。`title` はすぐ
  入力できるよう選択されます。
- ツリーの **New file** は選択したフォルダー内に同じ種類のノートを作ります。
- **File → Open Folder…** でワークスペースを変更し、**File → Save** で保存します。
- セッションスタックには明示的に追加した文書だけが残ります。チュートリアルとこのガイドは参照
  文書であり、スタックには入りません。

### フロントマター

```yaml
---
title: ノートの名前
date: 2026-10-21
id: 20261021153000
keywords:
  - notes
  - export
---
```

`title` は文書名、`id` は編集できない安定した識別子です。`lang` は EPUB などの書き出しで使う
言語を宣言できます。その他のキーは Pandoc とテンプレートパッケージから利用できます。

**Settings → New note** では新しいノートの初期フロントマターを設定できます。テンプレート
パッケージの `metadata.yaml` を使う選択はそのノートだけに適用され、書き出しテンプレートの選択は
変更しません。

### 編集

Yi は Markdown を正本として保持しながら描画します。リンク、数式、フェンス付きブロックなどの
ソースを編集すると、その Markdown がその場に表示されます。主なショートカットは ⌘S / Ctrl+S
（保存）、⌘N / Ctrl+N（新規）、⌘F / Ctrl+F（検索）、⇧⌘F / Ctrl+Shift+F（置換）、F1
（ドキュメント）です。

## ノートを書き出す

| 種類 | 出力 |
| --- | --- |
| HTML | ページとローカル資産を含むバンドルフォルダー |
| LaTeX | パッケージ資産を伴う `.tex` ファイル |
| PDF | TeX エンジンが生成する PDF |
| EPUB | EPUB ブック |
| Word | `.docx` |
| LibreOffice | `.odt` |
| Markdown | Yi が前処理した Markdown |

Markdown 以外の書き出しには Pandoc が必要です。PDF には XeLaTeX などの TeX 環境も必要です。
Yi は Pandoc を一般的なアプリケーションの場所と `PATH` から探し、ソフトウェアを自動導入したり
TeX Live Manager を実行したりしません。

### Pandoc と TeX のインストール

macOS:

```sh
brew install pandoc
brew install --cask mactex-no-gui
```

Debian / Ubuntu:

```sh
sudo apt install pandoc texlive-xetex texlive-fonts-recommended
```

Windows:

```powershell
winget install JohnMacFarlane.Pandoc
winget install MiKTeX.MiKTeX
```

次のコマンドで確認してください。

```sh
pandoc --version
xelatex --version
```

`pandoc --version` が失敗すると Pandoc を使うすべての書き出しが使えません。`xelatex --version`
だけが失敗する場合は、PDF 以外は使えます。TeX パッケージは TeX を導入したパッケージマネージャーで
追加してください。Yi は `tlmgr` を実行しません。

### 書き出し既定設定

各形式には `export.html.yaml`、`export.pdf.yaml` などの編集可能な既定ファイルがあります。これらは
通常の Pandoc defaults ファイルで、writer、PDF エンジン、ハイライト、ページ変数、フィルター、
リソースパスを同じ Pandoc の語彙で指定できます。

## テンプレートパッケージ

テンプレートパッケージは Yi の書き出しデータ内にあるフォルダーです。ワークスペースやセッション
には入りません。

```text
example-latex/
  template.json
  template.tex
  journal.cls
  journal.bst
  metadata.yaml
  defaults.yaml
```

`template.json` は Yi が管理し、利用者が手で用意するものではありません。`kind` は `html`、
`latex`、`pdf`、`epub`、`docx`、`odt` のいずれかです。`mode` は `template`、`wrapper`、
`reference-doc` のいずれかです。テキストテンプレートは `template`、Word と ODT は
`reference_doc` を使用し、両方が同時に入ることはありません。

`assets` はパッケージルートからの `/` 区切り相対パスです。`deliver` は LaTeX 出力の隣へコピーする
クラスや BibTeX スタイルの部分集合です。`csl` は任意のパッケージ CSL で、利用者の選択より後に適用
されるため、パッケージ独自の引用形式を強制できます。

### ラッパーモード

出発点が Pandoc テンプレートではなく、`\begin{document}` と `\end{document}` を持つ完全な LaTeX
文書の場合は `wrapper` を使います。読み込み時に Yi は元の文書を `source.tex` として残し、
`\end{document}` の直前に `$body$` を入れた `template.tex` を作れます。`\title{}` と
`\author{}` を `$title$` と `$author$` に置換するかも選択できます。

### Pandoc 既定から作成

**Create…** は名前、出典、ライセンスを尋ね、選択した形式の Pandoc 既定テンプレートまたは参照文書を
生成します。テキスト形式は `template.html`、`template.tex` など、Word と ODT は
`reference.docx`、`reference.odt` を受け取ります。出典種別は
`origin.type: "pandoc-default"` と記録されます。

### テンプレートキットを読み込む

単一ファイル、フォルダー、ZIP を読み込めます。Yi はまず検査し、確認後にコピーします。フォルダーと
ZIP は再帰的に調べ、`$body$` を持つテキスト、完全な LaTeX 文書、`.docx` / `.odt` の順に入口を
判定します。クラス、スタイル、参考文献、画像、フォント、CSS、JavaScript は資産として残します。

ZIP の絶対パス、`..`、シンボリックリンク、過大なサイズ、多すぎるファイルは拒否されます。
展開は一時領域で行われ、成功しても失敗しても後始末されます。

### 編集と検証

パッケージを開くと、編集可能なテキストファイルと読み取り専用のバイナリが一覧表示されます。コード
パネルには行番号、検索、Undo、YAML / LaTeX ハイライト、原子的保存があります。**Validate** は短い
テスト段落を変換し、**Test PDF** は PDF エンジンも実行します。エラーは Pandoc または TeX の実際の
メッセージとして表示されます。

## HTML テンプレートを作る

HTML テンプレートは `$body$` を含む Pandoc テンプレートです。

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

テンプレートと `assets/` を同じパッケージに置きます。Yi は常に出力フォルダーを作り、ページを
その中へ書きます。**Self-contained HTML** が無効ならテンプレート資産とノート画像を相対 URL の
ままコピーします。有効ならローカル資産をページへ埋め込みますが、パッケージ資産の完全なコピーも
バンドルに残します。`http://` と `https://` の画像 URL はそのまま残ります。

## LaTeX と PDF テンプレートを作る

LaTeX と PDF は `$body$` を一度だけ含むテキストテンプレートを使います。

```tex
\documentclass{article}
\begin{document}
$if(title)$\title{$title$}\maketitle$endif$
$body$
\end{document}
```

タイトル、著者、所属、メールなどをテンプレートへ固定せず、ノートのフロントマターから受け取ります。
Pandoc の変数、ループ、条件、ハイライトについては Pandoc マニュアルを参照してください。Yi は
利用者のテンプレートへ互換プリアンブルを勝手に追加しません。

### LaTeX 出力

LaTeX 出力ではパッケージの全資産を `.tex` の隣へコピーします。クラス、スタイル、参考文献、画像、
データ、補助ソースが含まれます。`deliver` は提出に必要なクラスと文献スタイルの部分集合を示します。
既存の異なるファイルは上書きせず、競合を報告します。

ノート内のローカル画像はソースフォルダーへコピーされます。パッケージ資産と同じ相対パスのノート
画像はその資産を置き換え、それ以外は `<出力名>.assets/` に置かれます。

### ネイティブ BibTeX

```yaml
filters: []
cite-method: natbib
bibliography: references.bib
```

テンプレートでは通常 `\bibliographystyle{...}` と `\bibliography{references}` を使います。
書き出し時には **Settings → Citation** の選択が正本となり、Yi はノートで引用したキーだけを
`references.bib` へ書きます。未引用項目は含みません。BibTeX と CSL-JSON の両方を入力にでき、
CSL-JSON は `citation-key`、なければ `id` を使って BibTeX に変換されます。

### PDF 出力

PDF は Pandoc と `pdf-engine` で `.tex` を処理します。パッケージルートと入口のフォルダーが
`TEXINPUTS`、`BIBINPUTS`、`BSTINPUTS` に入り、作業ディレクトリは入口のフォルダーになります。
無制限の shell escape を有効にする既定ファイルは Yi が拒否します。

## EPUB テンプレートを作る

EPUB は `$body$` を含む XHTML の `template.xhtml` を使います。CSS、画像、フォント、スクリプトは
パッケージ内に置き、パッケージ相対 URL を使ってください。Pandoc がコンテナを作り、Yi が資産を
`EPUB/assets/` へ追加して `content.opf` に宣言します。

```xhtml
<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" lang="$lang$">
  <head><title>$pagetitle$</title></head>
  <body><section>$body$</section></body>
</html>
```

EPUB には `title` と `lang` が必要です。検証には epubcheck など専用ツールも併用してください。

## Word と OpenDocument テンプレートを作る

Word と OpenDocument はテキストテンプレートではなく、スタイルを持つ**参照文書**です。

```text
example-docx/
  template.json
  reference.docx
  defaults.yaml
  metadata.yaml
```

Pandoc は参照文書からスタイルを取り込みます。タイトル、サブタイトル、著者、日付、概要、
見出し、本文、引用、コード、キャプション、一覧、脚注、表、図、参考文献のスタイル名を維持して
ください。Yi はバイナリ参照文書を編集しません。**Open in system** で Word または LibreOffice に
渡します。

### Pandoc の参照文書から始める

Pandoc の
[`--reference-doc` の節](https://pandoc.org/MANUAL.html#option--reference-doc)
が正式な説明です。DOCX と ODT の違い、対応するスタイル名、推奨手順が記載されています。完全な
[Pandoc User’s Guide](https://pandoc.org/MANUAL.html) には、Yi が引き渡すその他の設定も
説明されています。

Yi の **Create…** で既定の参照文書を生成できます。ターミナルでは次のコマンドが同等です。

```sh
pandoc -o custom-reference.docx --print-default-data-file reference.docx
pandoc -o custom-reference.odt --print-default-data-file reference.odt
```

生成したファイルを Word または LibreOffice で開き、スタイルを変更して保存します。Pandoc が期待する
スタイル名は変更しないでください。フォント、余白、色、罫線の変更は安全ですが、名前の変更は対応する
Markdown 要素を見失わせます。

- DOCX の参照文書はスタイルと文書プロパティを使います。ページサイズ、余白、ヘッダー、フッターも
  対象です。本文の内容は無視されます。
- ODT の参照文書はスタイルシートを使います。本文の内容は無視されます。

編集後は `reference.docx` または `reference.odt` として保存し、対応する Word / LibreOffice
パッケージの入口に指定します。

## パッケージ YAML

### metadata.yaml

パッケージルートの `metadata.yaml` は新しいノートの初期フロントマターとして提示されます。パッケージ
のキーが設定済みテンプレートより優先されますが、`date` と `id` は Yi が常に上書きします。

```yaml
title: テンプレートの題名
author: 例 著者
keywords:
  - journal
  - template
```

### export.yaml と defaults.yaml

`export.yaml` はアプリの `export.<kind>.yaml` の後に Pandoc へ渡されます。なければ
`defaults.yaml` が同じ役割を果たします。パッケージ設定はアプリ既定より優先されますが、出力先、
テンプレートまたは参照文書、CSL、リソースパスなどの明示的なコマンドライン引数が最後に優先されます。

引用形式では、パッケージ YAML の `csl` はフォールバックです。**Settings → Citation** の選択は
より後に渡されて優先されます。パッケージ自身の形式を強制するには `template.json` の `csl` を
使います。citeproc を再度追加すると参考文献が重複するため、Yi が既に提供する citeproc と重ねないで
ください。

## 完全な例

`test/fixtures/templates/examples/` には HTML、LaTeX、PDF、Rho Class、EPUB、Word、ODT の
実用的なパッケージがあります。各フォルダーを読み、そのまま Yi へ読み込んでテンプレート
ライブラリーで確認してください。

### AI エージェント向けプロンプト

次の形式で AI エージェントへ依頼できます。`template.json` は作らせず、Yi に読み込み時に書かせます。

#### Example prompt: HTML

Yi 用の HTML パッケージを作り、`$body$` を一度だけ含む `template.html`、目次サイドバー、
`toc-depth: 2`、パッケージ内 CSS / JavaScript、Yi 対応 Markdown の例を入れてください。
`template.json` は作らないでください。

#### Example prompt: LaTeX

三著者、異なる所属、要旨、図、表、脚注、引用を含む学術論文用 LaTeX パッケージを作ってください。
`$body$`、クラス、BibTeX スタイル、引用済み文献だけを使う `references.bib` を含め、
`template.json` は作らないでください。

#### Example prompt: PDF

XeLaTeX 用 PDF パッケージを作り、タイトルページ、要旨、コード、図、表、脚注、参考文献を含めて
ください。`pdf-engine: xelatex` と `$body$` を設定し、`template.json` は作らないでください。

#### Example prompt: Rho Class PDF

Rho Class の CC BY 4.0 デザインと帰属表示を保持した PDF パッケージを作ってください。上流クラス名、
出典 URL、ライセンスを残し、metadata から題名・著者・所属を受け取り、`template.json` は作らないで
ください。

#### Example prompt: EPUB

表紙、出版社、版、ISBN、著作権、献辞、目次、3 章を持つ EPUB パッケージを作ってください。
`template.xhtml` に `$body$` を一度だけ入れ、CSS と表紙をパッケージ内に置き、`template.json` は
作らないでください。

#### Example prompt: Word

題名から参考文献までのすべての Pandoc スタイルを持つ `reference.docx` を作ってください。
`toc: true`、`toc-depth: 2`、Yi 対応 Markdown の例を付け、`template.json` は作らないでください。

#### Example prompt: OpenDocument

大学写真の表紙、四つの記入欄、要旨、二段目次のある A4 学位論文用 `reference.odt` を作ってください。
本文のページ番号を 1 から始め、表紙・要旨・目次には表示せず、`template.json` は作らないでください。

## テンプレートを使う前の検証

1. テンプレートエディターでパッケージを開きます。
2. **Validate** を実行し、メッセージ全体を確認します。
3. PDF では成功後に **Test PDF** を実行します。
4. 見出し、一覧、表、コード、数式、画像を含む短いノートを書き出します。
5. 相対資産と参考文献を含む出力を確認します。

検証は一時フォルダーへの実際の変換です。任意のノートで不足クラスや不正な変数が起きないことを保証
するものではありませんが、パッケージ自体の誤りを書き出し前に見つけられます。

| メッセージ | 確認すること |
| --- | --- |
| Pandoc not found | Pandoc を入れ、更新した `PATH` で Yi を起動する |
| PDF engine not found | TeX を入れ、`xelatex --version` を確認する |
| `journal.cls` not found | クラスをパッケージ内に置き、ルートを検索パスへ追加する |
| Template variable missing | テンプレートと Pandoc の変数を比較する |
| Filter could not start | フィルターの実行環境を入れるか、既定から外す |
| Local picture missing | パッケージ相対パスと `assets` 内の画像を確認する |

## セキュリティと信頼

テンプレートは実行可能な変換設定です。Pandoc フィルター、Lua、LaTeX パッケージ、クラス、フォント、
metadata を含められます。信頼できるテンプレートだけを使ってください。

Yi は出典とライセンスを記録しますが、利用許諾を判断しません。公開時には正確な値を残してください。
Yi はジャーナル資産を自動取得せず、TeX パッケージを導入せず、`tlmgr` を実行せず、PDF 既定で
無制限 shell escape を許可せず、任意のサンプルを完全な Pandoc テンプレートへ自動変換しません。

## パッケージチェックリスト

- [ ] `template.json` があり、schema 1 である。
- [ ] `kind` と入口、`mode` が一致している。
- [ ] テキストテンプレートには適切な位置に `$body$` が一度だけある。
- [ ] 参照文書は Word または LibreOffice で開ける。
- [ ] `assets`、`deliver`、`csl` のパスがすべて存在する。
- [ ] 相対リンクは `/` 区切りでパッケージ内を指す。
- [ ] `metadata.yaml` は必要ならトップレベルの YAML マッピングである。
- [ ] `defaults.yaml` と `export.yaml` は必要な設定だけを含む。
- [ ] PDF 既定で shell escape を有効にしていない。
- [ ] 短い代表ノートで検証に成功する。
- [ ] 実際の書き出しに必要なクラス、スタイル、画像、参考文献が含まれる。
