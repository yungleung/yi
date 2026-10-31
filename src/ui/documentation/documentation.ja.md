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
変更しません。New note には組み込みの **Reveal.js presentation** と
**Beamer presentation** もあり、これらは書き出しテンプレートではなくプレゼンテーション用の
メタデータです。

### 編集

Yi は Markdown を正本として保持しながら描画します。リンク、数式、フェンス付きブロックなどの
ソースを編集すると、その Markdown がその場に表示されます。主なショートカットは ⌘S / Ctrl+S
（保存）、⌘N / Ctrl+N（新規）、⌘F / Ctrl+F（検索）、⇧⌘F / Ctrl+Shift+F（置換）、F1
（ドキュメント）です。

### リスト

完了した箇条書き、番号付きリスト、タスクリストの直後にキャプション行を置くと、そのリストは
番号付きのリストオブジェクトになります。

```markdown
1. 試料を準備する
2. 測定を実行する

: 手順 {#list:steps .wide data-owner=demo}
```

コロンで始まる行は、リストの直後、または空行をちょうど 1 行置いた後に書けます。表のキャプション
と同じ文法です。キャプションだけがあるリストは番号を持ちますが、ID がないため参照先にはなりません。

```markdown
: 事前確認
```

ID だけがあるリストは参照先と表示番号を持ちますが、キャプション本文はありません。

```markdown
: {#list:steps}
```

キャプション行のない通常のリストには、リストオブジェクトの番号も参照先も付きません。オブジェクト
番号は、番号付きリスト内部の `1.`、`2.` という項目番号とは別のものです。

`[#list:steps]` は自動参照になり、通常のリンクでは作者が書いたテキストをそのまま使います。

```markdown
[#list:steps] を参照してください。
[測定手順](#list:steps) を参照してください。
```

自動参照の既定テキストは、このガイドの言語にかかわらず `List 1` です。単語とリテラルの番号接頭辞は
フロントマターで設定できます。

```yaml
reference-labels:
  list: 手順
reference-number-prefixes:
  list: "3-"
```

参照と表示キャプションは `手順 3-1` になります。

HTML、EPUB、Word、ODT は、参照先、キャプション位置、単語、接頭辞、番号付けについて同じ構造を
受け取ります。writer が生成するネイティブなコンテナーは異なりますが、表示される参照動作は共通
です。リストマーカー、タスクのチェックボックス、入れ子のリストは変わりません。前処理済み
Markdown も HTML と同じ構造を使います。

参照を ⌘ クリックまたは Ctrl クリックするとリストが表示され、カーソルは最初の編集可能な項目に
入ります。描画されたキャプションをクリックすると、完全なソース `: キャプション {…}` が表示され、
テキスト、ID、クラス、属性を編集できます。

リストのソースに `:::` ブロックは不要です。コロンによるキャプションを使うため、フェンス付き
div は callout 用に残せます。リスト項目内でインデントされたコロンはその項目の内容のままで、
通常の段落の後にあるコロンは Pandoc の定義リストとしての意味を保ちます。

#### LaTeX と PDF のリスト番号

LaTeX にはリストオブジェクト全体に対応するネイティブカウンターがありません。`enumi`、
`enumii` などは項目を数え、`enumerate` 環境内だけで有効です。そのため Yi はリストオブジェクト用に
`yilist` という専用カウンターを与えますが、`\label`、`\ref`、`hyperref` という LaTeX 本来の
参照機構を使用します。

既定では文書全体で 1 つの連番になります。LaTeX/PDF テンプレートは
`\yiListCounterSetup` でリセット階層と番号形式を設定できます。章ごとに番号を付ける場合:

```tex
\makeatletter
\providecommand{\yiListCounterSetup}{}
\renewcommand{\yiListCounterSetup}{%
  \@addtoreset{yilist}{chapter}%
  \renewcommand{\yiListNumber}{\thechapter.\arabic{yilist}}%
}
\makeatother
```

Yi は `\begin{document}` でこのフックを呼び、その後でノートの単語とリテラル接頭辞を適用します。
`\yiListNumber` は接頭辞を外さずに基底番号を制御します。テンプレートの表カウンターと完全に同じ
番号付けにするには、両方のカウンターを同じ場所で同じリセット階層に設定する必要があります。
Yi は任意のクラスの表カウンター規則を自動的に推測できません。

空行でバッククォートを 3 つ入力すると、対になったコードフェンスを作り、カーソルを開き側の
バッククォート直後に残します。入力した文字は言語一覧を絞り込みます。Enter で選択中の言語を
確定し、Escape はフェンスを変えずに一覧を閉じ、Space は一覧を閉じて空白をソースに書き込み、
`{#lst:sample}` などの属性を続けられるようカーソルを開き行に残します。本文を書くときは下へ
移動してください。

## Callout

GitHub 形式のアラートで callout を作成できます。

```markdown
> [!NOTE]
> 注意したい内容。
```

組み込み種別は `NOTE`、`TIP`、`IMPORTANT`、`WARNING`、`CAUTION` です。表示タイトルは常に
`Note`、`Tip`、`Important`、`Warning`、`Caution` で、Yi の UI 言語に依存しません。ラベルは大文字と
小文字を区別しません。マーカー直後の引用空行は省略できます。未知のラベル、後ろに文字が続くラベル、
`> \[!NOTE]` のようなエスケープは通常の引用のままです。

Pandoc のフェンス付き Div も使用できます。

```markdown
::: {.callout .callout-note}
組み込み callout。
:::

::: {.callout .callout-definition title="Definition"}
カスタム callout。
:::
```

`.callout-note` だけの短縮形も使えます。カスタム種別で `title=` を省略した場合、UI 言語に依存しない
クラス名からタイトルを作ります。ID、クラス、その他の属性はエクスポート用に保持されますが、Div の
ID は Yi の相互参照対象にはなりません。

1 行に 3 個以上のコロンとその後に空白を入力すると、両方のフェンスに同じ個数のコロンを持つ
閉じた Default Div と、Default、Note、Tip、Important、Warning、Caution、Definition の 7 択が
表示されます。その空白が届くまでコロンはリテラルのままです。Default は開きフェンスに属性を
加えません。callout を選ぶとそのメタデータだけが追加または変更され、本文、ID、その他のクラス
と属性はそのまま残ります。入れ子の Div は外側より多いコロンを使い、種類を選ぶと最も内側の
開き行だけが変更されます。

`.columns`、スピーカーノート、wrapper、増分・非増分リストなど、他の Pandoc Div の見た目は推測
しません。完全な未知の Div は、カーソルが内外どちらにあっても常に正確なソースとして表示されます。
入れ子の Div は Pandoc の規則どおり、外側をより長いコロンのフェンスにします。未知の Div が引用や
callout の中にある場合、そのコンテナも完全なソース表示に切り替わります。

callout は引用や別の callout の中に入れ子にでき、本文には段落、リスト、表、コードフェンス、数式、
キャプション、引用、通常の入れ子引用を書けます。カーソルが外にあるときは描画パネルを表示し、タイトル
または本文をクリックすると完全なソースを表示します。ブロックから離れると描画へ戻ります。

編集中も開始マーカーはコンテナの文脈を保ちます。`$$`、`[$$`、3 つのバッククォートによるコード
フェンス、または 3 個以上のコロンとそれに続く空白を入力すると対応する対の構造を作り、生成される
すべての物理行に現在の `>` 接頭辞を付けます。言語と Div 種別の選択画面は、コンテナの外と同じ
ようにその開き行で動作します。Pandoc Div のソース内では 1 つのバッククォートはそのまま入力され、
3 つ入力すると入れ子のコードフェンスが開きます。引用または callout 内のコードと表示数式
では、Enter は子ブロックの改行規則に従い、連続する空行をいくつでも作れます。フェンス付き Div の
callout では、別の引用や callout に入れ子になっていても、Enter ごとに接頭辞付きの改行を正確に 1 つ
挿入します。

`@` 後の引用文献、`[[` 後の wikilink、`[#` 後の自動参照の補完は、どちらのソース形式でも利用できます。
候補を選ぶと文献キーまたは対象 ID だけが書き込まれ、周囲の引用接頭辞と括弧はそのまま残ります。
マーカーを入力したとき、または入力メソッドが確定したときに一覧が開き、Tab は不要です。

開き記号 `[`、`(`、`{` は通常のテキスト、引用、GitHub callout、フェンス付き Div callout で自動的に
対になります。入力メソッドから 1 文字が届いた場合も同様です。同じ文書への通常リンクのリンク先で、
`](` の後に `#` を入力すると参照先の一覧も表示され、候補を選ぶとフラグメント ID だけが書き込まれます。
候補を選ぶと、カーソルは完成したノードの閉じ側の端に残り、Markdown のソースは編集できる
状態で表示されます。次の文字を入力するとノードの後ろに書き込まれ、リンク、参照、引用、
または wikilink が描画されます。ナラティブ引用のキー文字のように、その文字が同じ構文の
一部であり続ける場合はソース表示のままです。

通常の引用も同じ規則で完全なソースを表示するため、エスケープしたマーカー、`>` 接頭辞、子ブロックの
区切りをそのまま編集できます。
ソースモードの外では、通常の引用は左右に余白を取り、大きな開き引用符を 1 つ表示します。太い縦線と
閉じ引用符は表示しません。

通常の引用段落で Enter を押すと、完全な `>` 接頭辞を持つ空行が 2 行できます。入力を続けると次の
段落になり、空の引用段落でもう一度 Enter を押すと 1 階層だけ外へ出ます。入れ子引用では階層ごとに
繰り返します。リスト、表、コード、数式は本来の Enter 動作を保ち、挿入されるすべての物理行に現在の
引用接頭辞を付けます。子ブロックが閉じた後の Enter も、通常の段落と同じ接頭辞付きの空行を 2 行追加します。

空の `>` 行に入力すると、見えない空白を補わず、正確に `>B` になります。ソースに表示される
`> ` が既にあれば、その空白は保持されます。空の引用行で Backspace または Delete を押すと、
`>` だけではなく物理行全体を削除します。
空のリスト項目で Enter を押すと、そのリスト記号が削除され、通常の引用または callout 本文行になります。
引用または GitHub callout の編集中に表を挿入すると、各行と区切り行に同じ `>` の連鎖が付き、表が
コンテナ内に残ります。

フェンス付き Div の callout 内では、Enter は改行を正確に 1 つ挿入します。追加で Enter を押すたびに
空行が 1 行増え、カーソルは最新の行に残ります。引用内の Div は、挿入する各行に表示中の引用接頭辞を
付けます。

空の callout にも見えない本文キャレットアンカーがあります。後ろのブロックから Left、前のブロックから
Right で入り、移動だけではソースを変更しません。最初の文字を入力したとき本文行を作ります。
空の GitHub callout のマーカー行で Enter を押すと、引用段落と同じ接頭辞付きの空行を 2 行作り、2 行目へ
キャレットを置きます。もう一度 Enter を押すとマーカーが外れて callout を離れます。空のフェンス付き Div
の開始行では、終了行の前に編集可能な本文行を 1 行作ります。

すべての Pandoc エクスポートは両方の記法を同じ意味の Div に変換します。

```markdown
:::: {.callout .callout-note}
::: {.callout-title}
Note
:::

注意したい内容。
::::
```

HTML、EPUB、DOCX、ODT、LaTeX/PDF のテンプレートは CSS、参照文書スタイル、Lua filter で外観を
設定できます。filter は `.callout`、`.callout-<種別>`、`.callout-title` と文書順の本文ブロックを
受け取ります。変換はテンプレート filter より前に完了するため、filter は GitHub 記法やフェンス付き
Div ではなく、この安定した構造を扱えます。

## ノートを書き出す

| 種類 | 出力 |
| --- | --- |
| HTML | ページとローカル資産を含むバンドルフォルダー |
| Reveal.js | 既定でローカルの `images/` と `js/dist/` を含むプレゼンテーションバンドル |
| LaTeX | パッケージ資産を伴う `.tex` ファイル |
| Beamer | XeLaTeX が生成するプレゼンテーション PDF |
| PDF | TeX エンジンが生成する PDF |
| EPUB | EPUB ブック |
| Word | `.docx` |
| LibreOffice | `.odt` |
| Markdown | Yi が前処理した Markdown |

Markdown 以外の書き出しには Pandoc が必要です。PDF には XeLaTeX などの TeX 環境も必要です。
Yi は Pandoc を一般的なアプリケーションの場所と `PATH` から探し、ソフトウェアを自動導入したり
TeX Live Manager を実行したりしません。

書き出しカードでは保存先と、対応する種類ではテンプレートパッケージまたはリソースを選びます。
Reveal.js と Beamer はテンプレートパッケージを受け付けません。選択はノートごとではなく、
書き出しの種類ごとに記憶されます。

### プレゼンテーションの書き出し

Reveal.js は `title`、`subtitle`、`author`、`theme`、`transition`、`slide-level` などの
設定をフロントマターから読みます。常に自己完結しないフォルダーを書き出します。

```text
presentation/
  presentation.html
  images/
  js/dist/
```

`examples/revealjs.md` は同梱画像を使うため、既定のローカル書き出しはオフラインでも動作します。

カードには独立した二つの選択肢があり、どちらも既定ではオフです。

- **Use remote Reveal.js resources** は Pandoc が固定した CDN URL を残します。オフの場合、Yi は
  Reveal.js の JavaScript、スタイルシート、テーマ、プラグインを `js/dist/` にダウンロードします。
- **Use remote pictures** はウェブ画像の URL を残します。オフの場合、各リモート画像を `images/`
  にダウンロードします。ローカル画像は常にそこへコピーされます。

Beamer は `title`、`subtitle`、`author`、`institute`、`theme`、`colortheme`、`fonttheme`、
`aspectratio`、`navigation`、`section-titles` をフロントマターから使います。PDF を一つ書き出し、
テンプレートやページサイズの設定は表示しません。レベル 1 の見出しがセクション、レベル 2 が
スライドになります。

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
には入りません。選択画面には、選んだ書き出し形式に対応するパッケージだけが表示されます。
マニフェストを読めないパッケージは削除できるよう表示されますが、使用も編集もできません。

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

`examples/templates/` には読者向けの HTML、LaTeX、PDF、Rho Class、EPUB、Word、ODT の
実用的なパッケージがあります。一つ上の階層には完全な参照用プレゼンテーション
`examples/revealjs.md` と `examples/beamer.md` があります。`examples/` は読者向け資料で、
`test/fixtures/` は目的の異なる管理されたテストデータです。

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
