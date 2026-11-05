# atalabo ツールズ

ブラウザだけで動く無料の日本語Webツール集です（HTML / CSS / JavaScript のみ、サーバー処理なし）。
公開予定URL：https://volcanotkahasi.github.io/tools/

- 全20ツール、各ツールが専用ページ（`<slug>/index.html`）を持ち、固有の `<title>`・meta description・h1・使い方・よくある質問（FAQ）・構造化データ（JSON-LD: WebApplication / FAQPage / BreadcrumbList）を設定済み
- トップページ（`index.html`）にカテゴリ別一覧とキーワード検索
- 入力内容はすべてブラウザ内で処理（外部送信なし）。QRコード生成ライブラリ（qrcode-generator, MIT）も `assets/vendor/` に同梱しているため、外部CDNへの通信もありません
- すべて相対パスなので、`tools/` フォルダごと置けばそのまま動きます

## ツール一覧

| ツール | カテゴリ | フォルダ | URL |
|---|---|---|---|
| 文字数カウント | 文字・テキスト | `moji-count/` | https://volcanotkahasi.github.io/tools/moji-count/ |
| 全角半角変換 | 文字・テキスト | `zenkaku-hankaku/` | https://volcanotkahasi.github.io/tools/zenkaku-hankaku/ |
| 文字列置換 | 文字・テキスト | `text-replace/` | https://volcanotkahasi.github.io/tools/text-replace/ |
| 重複行削除 | 文字・テキスト | `duplicate-lines/` | https://volcanotkahasi.github.io/tools/duplicate-lines/ |
| JSON整形 | 文字・テキスト | `json-format/` | https://volcanotkahasi.github.io/tools/json-format/ |
| 和暦西暦変換 | 日付・時間 | `wareki/` | https://volcanotkahasi.github.io/tools/wareki/ |
| 年齢計算 | 日付・時間 | `age/` | https://volcanotkahasi.github.io/tools/age/ |
| 日数計算 | 日付・時間 | `nissu/` | https://volcanotkahasi.github.io/tools/nissu/ |
| タイマー・ストップウォッチ | 日付・時間 | `timer/` | https://volcanotkahasi.github.io/tools/timer/ |
| QRコード作成 | 生成・画像・デザイン | `qrcode/` | https://volcanotkahasi.github.io/tools/qrcode/ |
| 画像圧縮・リサイズ | 生成・画像・デザイン | `image-resize/` | https://volcanotkahasi.github.io/tools/image-resize/ |
| パスワード生成 | 生成・画像・デザイン | `password/` | https://volcanotkahasi.github.io/tools/password/ |
| カラーコード変換 | 生成・画像・デザイン | `color-code/` | https://volcanotkahasi.github.io/tools/color-code/ |
| くじ引き・チーム分け | 生成・画像・デザイン | `kuji/` | https://volcanotkahasi.github.io/tools/kuji/ |
| 消費税計算 | 計算・お金 | `shohizei/` | https://volcanotkahasi.github.io/tools/shohizei/ |
| 割り勘計算 | 計算・お金 | `warikan/` | https://volcanotkahasi.github.io/tools/warikan/ |
| パーセント計算 | 計算・お金 | `percent/` | https://volcanotkahasi.github.io/tools/percent/ |
| 電気代計算 | 計算・お金 | `denki/` | https://volcanotkahasi.github.io/tools/denki/ |
| 単位変換 | 計算・お金 | `unit/` | https://volcanotkahasi.github.io/tools/unit/ |
| BMI計算 | 計算・お金 | `bmi/` | https://volcanotkahasi.github.io/tools/bmi/ |

その他のページ：`privacy/`（プライバシーポリシー）、`contact/`（お問い合わせ → atalabo の制作ページ `../work/` へのリンク）

## フォルダ構成

```
tools/
├─ index.html            トップ（一覧・検索）
├─ <slug>/index.html     各ツールページ
├─ privacy/  contact/
├─ assets/
│   ├─ style.css         共通CSS
│   ├─ app.js            共通UI（コピー、タブ、検索）
│   ├─ lib.js            計算ロジック（ブラウザ / Node 共通。テスト対象）
│   └─ vendor/qrcode-generator.min.js
├─ sitemap.xml
└─ README.md
```

## 公開手順（GitHub Pages）

1. `volcanotkahasi.github.io` リポジトリの直下に `tools/` フォルダごと配置して push します。
2. `https://volcanotkahasi.github.io/tools/` が表示されることを確認します。

### robots.txt と sitemap について

`robots.txt` はドメイン直下（`https://volcanotkahasi.github.io/robots.txt`）にしか置けないため、このフォルダには含めていません。
リポジトリ直下に robots.txt を作る場合は、次の内容がおすすめです。

```
User-agent: *
Allow: /
Sitemap: https://volcanotkahasi.github.io/tools/sitemap.xml
```

robots.txt を置かない場合でも、Google Search Console に `https://volcanotkahasi.github.io/tools/sitemap.xml` を送信すればインデックスされます。

## 検索エンジンへの登録（公開後すぐ）

1. [Google Search Console](https://search.google.com/search-console) で「URLプレフィックス」に `https://volcanotkahasi.github.io/tools/` を登録
   - 所有権の確認は「HTMLタグ」方式が簡単です。表示された `<meta name="google-site-verification" ...>` を `index.html` の `<head>` に追加します
2. 「サイトマップ」から `sitemap.xml` を送信
3. ツールを追加・更新したら `sitemap.xml` の `<lastmod>` を更新

## Google AdSense の申請方法（あとで）

### 申請前の準備
- **年齢**：AdSense のアカウントは 18 歳以上が必要です。18 歳未満の場合は、保護者のアカウントで申請する必要があります。
- **ドメイン**：AdSense は `github.io` のサブディレクトリ（`/tools/`）のままだと審査を通りにくく、サイト追加時にサブディレクトリを指定できません。**独自ドメイン（例：`atalabo.jp` など、年1,000〜2,000円程度）を取得し、GitHub Pages に設定する**のがおすすめです。ドメインを変えたら `build.py` の `BASE` を変更して再生成（canonical・og:url・sitemap が更新されます）。
- **コンテンツ量**：ツールだけでなく、使い方・FAQ を充実させた状態で申請します（このサイトは各ページに説明文あり）。可能なら解説記事（例：「和暦の早見表と覚え方」）を数本追加すると通りやすくなります。
- **必須ページ**：プライバシーポリシー（`privacy/`、広告Cookieの記載済み）とお問い合わせ（`contact/`）は用意済みです。
- 公開後、少なくとも数週間〜1か月ほど運営し、Search Console でインデックスされていることを確認してから申請すると安心です。

### 申請の流れ
1. https://adsense.google.com/ に Google アカウントでログインし、サイトURLと支払い先情報（住所・氏名）を登録
2. 表示された「AdSense コード」（`<script async src="https://pagead2.googlesyndication.com/...client=ca-pub-..."></script>`）を全ページの `<head>` に貼る
   - 各ページの `</head>` 直前に `<!-- AdSense: 審査申請時に... -->` というコメントがあるので、そのコメントを外して `ca-pub-XXXXXXXXXXXXXXXX` を自分のIDに置き換えます（`build.py` の `ADS_HEAD` を書き換えて再生成すると全ページ一括で反映）
3. ドメイン直下に `ads.txt` を置く：`google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0`
4. AdSense 管理画面で「審査をリクエスト」→ 通常数日〜2週間ほどで結果が届きます
5. 合格したら、広告ユニットを作成し、各ページの `<div class="ad-slot">` 内のコメント（`<ins class="adsbygoogle" ...>`）を外して `data-ad-slot` を設定します
   - 広告枠は各ツールページで「ツール本体の直下（tool-below）」と「ページ下部（page-bottom）」、トップページ下部（index-bottom）の統一位置にあります
   - ツールのボタンと広告が近すぎると誤クリック扱いになることがあるため、位置は変えずに使うのがおすすめです
6. 2024年以降、EEA/英国向けには同意管理（CMP）が必要です。AdSense の「プライバシーとメッセージ」で Google 認定の CMP を有効にしておくと安心です

### やってはいけないこと
- 自分で広告をクリックする、クリックをお願いする（アカウント停止の原因になります）
- 広告をボタンやダウンロードリンクに見せかける配置

## 開発メモ

- ページは生成スクリプトで作っています（ワークスペース：`/workspace/work/atalabo-tools-gen/`）。`tools_a.py` / `tools_b.py` にツール定義、`build.py` で全ページ・sitemap を生成
- 計算ロジックは `assets/lib.js` に集約。`node test_lib.js` で単体テスト、`python3 test_e2e.py 0 30` で Chromium による画面テストを実行
- 電気代の初期単価 31円/kWh は全国家庭電気製品公正取引協議会の新電力料金目安単価（2022年7月22日改定、出典 https://www.eftc.or.jp/qa ）。改定されたら `tools_b.py` の初期値と説明文を更新してください

made by atalabo
