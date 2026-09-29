# 年末調整サイト v0.8.4 変更ファイル

## 変更内容
- スタッフID＋生年月日の本人確認失敗時に `1/5` ～ `4/5` の失敗回数を表示。
- 5回目の失敗時は24時間ロックし、`ロックされています　残り時間 23:59` の形式で残り時間を表示。
- ロック残り時間は画面上で自動更新。
- スタッフID単位のロック時は `jinji@to-job.com` への問い合わせ案内を表示。
- 本人確認エラー表示と「次へ」ボタンの間に余白を追加。

## 反映方法
1. `assets/js/staff-login.js` をGitHubへ上書き。
2. `assets/css/style.css` をGitHubへ上書き。
3. `supabase/functions/staff-auth/index.ts` をSupabase Edge Function `staff-auth` へ上書きし、再デプロイ。

SQL migrationは不要です。
