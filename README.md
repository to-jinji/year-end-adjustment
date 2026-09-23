# 年末調整サイト v0.1.2 変更ファイル

## 修正内容
- CSV一括登録で `admin only` になる不具合を修正。
- CSV一括登録をブラウザからDB RPCへ1行ずつ送る方式から、管理者JWTを確認するEdge Functionで一括処理する方式へ変更。
- CSV一括登録は1回500件まで。

## 反映方法
1. GitHubの `assets/js/admin.js` をこのZIP内の同ファイルで上書き。
2. Supabase Edge Functions の `staff-auth` の `index.ts` をこのZIP内の `supabase/functions/staff-auth/index.ts` で上書きして再デプロイ。
3. GitHub Pagesの反映後、管理者画面を再読み込みしてCSV登録を再テスト。

追加のSQL migrationはありません。
