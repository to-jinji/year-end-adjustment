# v0.6.3

## 修正内容
- MFA認証後にSupabaseセッションを明示的にrefreshし、AAL2 JWTをRLS/PostgRESTへ確実に反映。
- 管理画面初期化時にもセッションをrefreshしてから管理者判定・スタッフ一覧取得を実行。
- AAL2なのにスタッフ一覧が0件の場合、一度だけセッションをrefreshして再取得。

## 反映
GitHubへ以下2ファイルを上書きしてください。
- assets/js/admin-login.js
- assets/js/admin.js

SQL migration、Edge Function再デプロイは不要です。
