# 年末調整サイト v0.12.0

## 新しいスタッフ導線
同意画面 → ログイン → 扶養控除等申告書 → 年末調整TOP

- 通常ログイン成功後は必ず扶養控除等申告書を表示します。
- 管理者再発行の仮PWを変更した場合も、PW変更後に扶養控除等申告書へ進みます。
- 扶養控除等申告書から「保存して年末調整へ」で現在のTOPへ進みます。

## データ連動
扶養控除等申告書用に回答内容を複製保存しません。
以下の既存データを直接読み書きします。
- `staff_basic_info`
- `staff_income_info`
- `staff_spouse_info`
- `staff_dependents`

そのため、
- 申告書で入力した内容 → 基本情報 / 本人・所得 / 配偶者・扶養へ自動反映
- 既存入力画面で回答済みの内容 → 次回ログイン時の申告書へ自動表示
となります。

申告書から基本情報・配偶者扶養を保存した場合は、それぞれの入力済み状態も更新します。
本人・所得情報については、他社給与・給与以外所得など申告書にない項目があるため、申告書だけでは「入力済み」にしません。

## 提出済みスタッフ
- ログイン時に申告書を表示
- 既存回答を自動表示
- 通常の提出済み状態では読み取り専用
- 内容確認後に年末調整TOPへ進めます
- 提出状態を未提出へ戻しません

## 管理者
スタッフ一覧 → 操作 → 「扶養控除等申告書」で随時確認できます。
最終確認日時も表示します。

## 反映手順
1. Supabase SQL Editorで `supabase/migrations/013_fuyou_declaration_flow.sql` を実行
2. GitHubへZIP内の残りのファイルを同じ階層で上書き・追加

Edge Functionの再デプロイは不要です。

## 変更ファイル
- `supabase/migrations/013_fuyou_declaration_flow.sql`
- `staff/login.html`
- `staff/password.html`
- `staff/index.html`
- `staff/fuyou-declaration.html`
- `admin/index.html`
- `admin/fuyou-declaration.html`
- `assets/js/staff-login.js`
- `assets/js/staff-password.js`
- `assets/js/staff-fuyou-declaration.js`
- `assets/js/admin.js`
- `assets/js/admin-fuyou-declaration.js`
- `assets/js/version.js`
