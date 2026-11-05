# 資格ドリル

工業系の国家資格を勉強する人のための、**無料・非公式**の4択問題集PWAです。HTML/CSS/JavaScriptだけで動き、ビルドやサーバーは不要です。

- 公開URL（予定）: https://volcanotkahasi.github.io/shikaku/
- 対象資格と収録問題数（すべてオリジナル問題・合計230問）

| 資格 | 問題数 | 分野 |
| --- | --- | --- |
| 第二種電気工事士 学科 | 80問 | 基礎理論11・配電理論/配線設計13・機器/材料/工具14・施工方法15・検査方法9・配線図/図記号8・法令10 |
| 危険物取扱者 乙種第4類 | 72問 | 法令31・基礎的な物理学/化学19・性質/火災予防/消火22 |
| 2級電気通信工事施工管理技術検定 第一次 | 78問 | 電気通信工学17・電気通信設備18・関連分野8・施工管理法18・法規17 |

> **免責事項**: 本アプリは各試験の実施団体・官公庁とは一切関係ありません。内容の正確性は保証しません。法令・試験制度は改正されることがあるため、受験の際は必ず最新の公式情報（受験案内・法令原文）を確認してください。

## 機能

- **分野別** … 分野ごとに全問（未学習→間違えた問題→その他の順）
- **ランダム** … 10問／20問（20問は未学習優先）
- **模擬試験** … 本番と同じ問題数・制限時間。合格基準で判定し、分野別得点・解答解説を表示。途中で閉じても時間内なら再開可
  - 電工二種: 50問・120分・合格基準点60点（1問2点換算で30問）
  - 乙4: 35問（法令15・物化10・性消10）・120分・各科目60%以上
  - 2級電気通信 第一次: 40問・130分・40問中24問以上（本番の選択解答制を目安配分で再現）
- **復習（間隔反復）** … 間違えた問題はすぐ復習へ。正解ごとに 1→3→7→14→30→60日 と間隔が延び、最後まで正解で「習得済み」。間違えると最初から
- **苦手**・**ブックマーク**（一覧表示・まとめて解く）
- **進捗グラフ**（インラインSVG）… 直近14日の解答数と正答率、分野別正答率、模試の得点推移
- **ダークモード**（端末設定に追従／手動切替）
- **オフライン対応**（Service Worker）・**ホーム画面に追加**（Web App Manifest）
- 学習データの書き出し／読み込み（JSON）。データは端末の localStorage のみに保存し、外部送信なし
- キーボード操作（1〜4で解答、Enterで次へ、模試は←→で移動）

## フォルダ構成

```
index.html              画面の土台（OGP・インラインSVGファビコン・AdSenseプレースホルダ）
css/style.css           スタイル（モバイルファースト、ライト/ダーク）
js/app.js               アプリ本体（ルーティング・出題・模試・間隔反復・グラフ）
data/bundle.js          全問題（window.SHIKAKU_DATA）※自動生成
data/*.json             資格ごとの問題データ ※自動生成
sw.js                   Service Worker（オフラインキャッシュ）
manifest.webmanifest    PWAマニフェスト
icons/                  アプリアイコン（PNG/SVG）・OGP画像
tools/src_*.py          問題の原稿（分野, 問題文, 正解, [誤答×3], 解説）
tools/build_data.py     原稿 → data/ を生成・検証
tools/validate.js       問題データの検証
tools/e2e-test.js       ヘッドレスブラウザでの動作テスト
```

## 問題の追加・修正

1. `tools/src_*.py` を編集（正解は必ず先頭。選択肢の並びはビルド時に決定的にシャッフル）
2. `python3 tools/build_data.py` で `data/` を再生成
3. `node tools/validate.js` で検証（4択・正解1つ・解説あり・重複なし・模試に必要な問題数）
4. `sw.js` の `CACHE` の版を上げる（利用者の端末で新しいデータに入れ替わる）

## テスト

```bash
node --check js/app.js && node --check sw.js      # 構文チェック
node tools/validate.js                            # 問題データの検証
# 動作テスト（playwright-core と Chromium が必要）
PW=/path/to/node_modules/playwright-core CHROME=/usr/bin/chromium node tools/e2e-test.js
```

## 広告枠について

`index.html` に `<!-- AdSense -->` のコメントだけを置いた広告枠（`.ad-area`）があります。現在は空で非表示です。広告コードは入っていません。出題中・模試中は CSS で非表示になります。

## 問題作成の方針

- 法令（e-Gov法令検索）、試験実施団体の公表資料、官公庁の解説資料などで事実を確認してから書き起こしたオリジナル問題です。過去問の文章は使っていません
- 確認できなかった内容は収録していません。数値に幅がある物性値（引火点・発火点など）は代表値で出題し、解説で幅があることに触れています
- 本番との違い: 乙4の本番は五肢択一、2級電気通信の能力問題は五肢択一、電工二種の配線図問題は図の代わりに文章で出題しています

## 出典・確認先（2026年11月確認）

### 試験形式・合格基準
- 電気技術者試験センター「第二種電気工事士 学科試験のポイント」 https://www.shiken.or.jp/construction/second/department/
- 同「令和8年度 第二種電気工事士 下期試験 受験案内」（学科の合格基準点60点） https://www.shiken.or.jp/construction/upload/r8kmousikomiannai1.pdf
- 同「令和8年度第二種電気工事士上期学科試験の結果について」 https://www.shiken.or.jp/ecee-overview/press/upload/2026_K_kamikigakka_735683.pdf
- 消防試験研究センター「試験の方法」「試験科目」 https://www.shoubo-shiken.or.jp/kikenbutsu/annai/way.html ／ https://www.shoubo-shiken.or.jp/kikenbutsu/annai/subject.html
- 消防試験研究センター「写真の書換え」 https://www.shoubo-shiken.or.jp/license/photo.html
- 全国建設研修センター「令和8年度 2級電気通信工事施工管理技術検定 第一次検定（前期）合格発表」（合格基準 40問中24問以上） https://www.jctc.jp/kentei/260707e_uwe09r/index.html
- 同 プレスリリース（令和8年7月7日） https://www.jctc.jp/kentei/info/datasheets20260707.pdf
- 同「受検の手引」 https://www.jctc.jp/kentei/themes/tebiki_2e03_08.pdf

### 法令（e-Gov法令検索 https://laws.e-gov.go.jp/ ）
- 電気工事士法・電気工事士法施行令（第1条 軽微な工事）
- 電気設備に関する技術基準を定める省令（第58条 絶縁抵抗）／電気設備の技術基準の解釈（第14・17・29・148・149・158・159・164条）
- 消防法・危険物の規制に関する政令（別表第三 指定数量）・危険物の規制に関する規則（第58条の14 保安講習）
- 建設業法・建設業法施行令（第1条の2 軽微な建設工事、第2条 特定建設業の下請代金）
- 労働安全衛生規則（第518〜528条）・酸素欠乏症等防止規則（第2条）
- 有線電気通信法（第3条）
- 建設工事に係る資材の再資源化等に関する法律施行令（第1条 特定建設資材）
- 廃棄物の処理及び清掃に関する法律（第12条の3 マニフェスト、第21条の3 元請業者）

### 官公庁・公的機関の解説資料
- 経済産業省「電気工事士等資格が不要な『軽微な工事』とは」 https://www.meti.go.jp/policy/safety_security/industrial_safety/sangyo/electric/files/1-3keibi.pdf
- 経済産業省「太陽電池発電設備を設置する場合の手引き」（小規模事業用電気工作物） https://www.meti.go.jp/policy/safety_security/industrial_safety/sangyo/electric/detail/taiyoudenchi.html
- 厚生労働省「はしごや脚立からの墜落・転落災害をなくしましょう」 https://www.mhlw.go.jp/new-info/kobetu/roudou/gyousei/anzen/dl/170322-1.pdf
- 厚生労働省「足場からの墜落防止措置（より安全な措置）」 https://www.mhlw.go.jp/new-info/kobetu/roudou/gyousei/anzen/dl/120308-1-3.pdf
- 酸素欠乏症等防止規則（厚生労働省 法令等データベース） https://www.mhlw.go.jp/web/t_doc?dataId=74105000&dataType=0&pageNo=1
- 全国危険物安全協会「保安講習の受講期限について」 https://www.zenkikyo.or.jp/znk-w/wp-content/uploads/2023/10/faq_kousyuukigen.pdf
- 国土交通省「建設リサイクル法」 https://www.mlit.go.jp/sogoseisaku/region/recycle/d03project/d0301/page_030110recyclelaw.htm
- 宮城県「産業廃棄物の適正処理のために」（マニフェスト5年保存） https://www.pref.miyagi.jp/documents/7611/r7tebiki.pdf

### 技術資料・参考
- 内線規程に基づくIV電線の許容電流表（昭和電線） https://www.swcc.co.jp/jpn/products/tec_information/pdf/kyoyou.pdf
- リングスリーブの適用表（パナソニック TERASU辞書・ホーザン取扱説明書）
- 同軸ケーブルの記号（JIS C 3502 適合品の仕様書：冨士電線・矢崎）
- 電気設備学会誌「雷保護に関する規程・規格類の整備」（建築基準法第33条 高さ20m超の避雷設備）
- 乙4の物性代表値: 一般的な試験対策資料（製品・資料により数値に幅があります）

## ライセンス・連絡

問題文・解説の著作権は作者に帰属します。誤りを見つけたら作者のページからお知らせください。

made by atalabo
