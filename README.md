# 年末調整サイト v0.9.11

## 修正内容
- 管理者画面のPW再発行で Edge Function の非2xxエラーが共通メッセージしか表示されない問題を修正。
- PW再発行時にスタッフのSupabase Authユーザーが存在しない場合、8桁英数字の仮PWでAuthユーザーを再作成し、スタッフ情報へ再紐付けして復旧できるように変更。
- Auth更新・再作成・紐付けで失敗した場合は、管理画面に具体的なエラー内容を表示。
- 表示バージョンを v0.9.11 に更新。

## 反映手順
1. `supabase/functions/staff-auth/index.ts` をEdge Function `staff-auth` へ上書きして再デプロイ。
2. `assets/js/admin.js` と `assets/js/version.js` をGitHubへ上書き。
3. SQL migrationは不要。
