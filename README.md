# 年末調整サイト v0.9.12

## 変更内容
- 管理者によるPW再発行を「仮パスワード発行」として扱うよう変更。
- PW再発行後は `password_change_required = true` となり、スタッフは次回ログイン時に任意のPWへ変更必須。
- 通常ログイン後もスタッフTOPの「パスワード変更」からいつでも任意のPWへ変更可能。
- 新しいPWは8文字以上、英字1文字以上＋数字1文字以上。
- PW変更完了後は `password_change_required = false` に戻り、通常の年末調整TOPへ進む。

## 反映手順
1. Supabase SQL Editorで `supabase/migrations/010_password_change_required.sql` を実行。
2. `supabase/functions/staff-auth/index.ts` をEdge Function `staff-auth` へ上書きして再デプロイ。
3. その他の変更ファイルをGitHubへ同じ階層で上書き・追加。
