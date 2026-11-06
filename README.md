# 年末調整サイト v0.12.1

## 変更した画面遷移

### 初回
同意画面 → ログイン → 扶養控除等申告書 → 年末調整TOP

### 2回目以降
ログイン → 年末調整TOP

扶養控除等申告書の初回確認済みかどうかは
`staff_fuyou_declaration_confirmations` で判定します。

すでに年末調整を回答済みのスタッフでも、v0.12.0導入後にまだ扶養控除等申告書を
確認していない場合は、次回ログイン時に1回だけ申告書を表示します。
確認・保存後は以後TOPへ直接進みます。

## 扶養控除等申告書

- 自動入力された既存回答も編集可能。
- 申告書から修正すると以下の既存データへ直接反映。
  - 基本情報
  - 本人・所得情報
  - 配偶者・扶養
- 提出済みスタッフでも、扶養控除等申告書からは修正可能。
- 通常の入力画面側の「提出済み」「編集期限」制御は変更しません。
- 氏名・生年月日は本人確認に使用する社員登録情報のため、申告書上では読み取り専用。
- TOPの「扶養控除等申告書を確認する」リンクは継続。
- 下部の重複した「年末調整TOPへ」ボタンを削除し、
  `保存して年末調整TOPへ` の1ボタンに整理。

## セキュリティ

通常テーブルのRLSを緩和せず、
本人の2026年assignmentだけを更新できる専用RPC
`save_staff_fuyou_declaration` を追加しています。

## 管理者

v0.12.0で追加した
`操作 → 扶養控除等申告書`
からの随時確認はそのまま利用できます。

## 反映手順

1. Supabase SQL Editorで
   `supabase/migrations/014_fuyou_declaration_edit_flow.sql`
   を実行
2. GitHubへZIP内の残りのファイルを同じ階層で上書き・追加

Edge Functionの再デプロイは不要です。

## 変更ファイル

- `supabase/migrations/014_fuyou_declaration_edit_flow.sql`
- `staff/login.html`
- `staff/password.html`
- `staff/index.html`
- `staff/fuyou-declaration.html`
- `assets/js/staff-login.js`
- `assets/js/staff-password.js`
- `assets/js/staff-fuyou-declaration.js`
- `assets/js/version.js`
