# 年末調整サイト v0.2.0 変更ファイル

v0.1.2 からの変更ファイルのみを収録しています。

## 追加・変更
- 管理者から設定済みスタッフPWを再発行可能に変更
  - 英大文字・英小文字・数字からランダム8文字を生成
  - Supabase AuthのPWを直接更新し、平文PWはDBに保存しない
  - 再発行PWは管理画面に1回だけ表示
- 2026年の全員共通編集期限を管理画面から設定可能に変更
- CSV登録から `editable_until` 列を削除
  - `staff_id,display_name,birth_date` の3列
  - 新規登録時は共通編集期限を自動適用
- スタッフごとの個別編集期限を管理画面から設定／解除可能
- スタッフ「基本情報」入力画面を追加
  - 氏名・生年月日は登録情報を表示
  - フリガナ、郵便番号、住所、世帯主氏名、続柄を保存
  - 編集期限後は閲覧のみ

## 反映手順
1. Supabase SQL Editorで `supabase/migrations/002_admin_deadline_basic_info.sql` を実行。
2. `supabase/functions/staff-auth/index.ts` を `staff-auth` Edge Functionへ上書きして再デプロイ。
3. それ以外の変更ファイルをGitHubの同じ階層へ上書き／追加。
4. GitHub Pagesの反映後、管理画面で共通編集期限を確認して保存。

## CSV形式
```csv
staff_id,display_name,birth_date
"0001","山田 太郎","1990-01-01"
```

## 注意
- 再発行したPWはDBに平文保存しません。管理画面に表示された時点で必要に応じて安全な方法で本人へ伝えてください。
- `sb_secret_...` / `service_role` はブラウザやGitHubへ置かないでください。
