# 年末調整サイト v0.8.1 変更ファイル

## 変更内容
- スタッフID＋生年月日の本人確認で5回失敗した場合のロック時間を30分から24時間へ変更。
- ロック中の案内に、急ぎの場合または登録生年月日の確認が必要な場合は `jinji@to-job.com` へメールする旨を追加。
- ログイン画面の事前案内も「5回失敗で24時間ロック」に変更。
- IP単位の不正アクセス防止ロック（20回失敗で30分）は変更なし。
- 管理者画面の「本人確認ロック解除」は従来どおり利用可能。

## 反映方法
1. `staff/login.html` をGitHubへ上書き。
2. `supabase/functions/staff-auth/index.ts` をSupabase Edge Function `staff-auth` へ上書きして再デプロイ。
3. SQL migrationは不要。
