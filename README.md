# 年末調整サイト v0.6.0 変更内容

本番運用前のセキュリティ強化版です。

## 変更内容
- 管理者ログインにTOTP方式のMFA（認証アプリ）を必須化。初回管理者ログイン時にQRコードを表示し、以降は毎回パスワード＋認証コードでログイン。
- DB側の管理者判定もAAL2（MFA完了済みJWT）を必須化。画面だけを迂回してもAAL1では管理者データを取得できないよう変更。
- Edge Functionの管理者APIもAAL2を必須化。
- スタッフ本人確認APIにIP単位のレート制限を追加。IPは平文保存せずハッシュ化。20回失敗で30分ロック。
- スタッフID単位の本人確認失敗も30分ウィンドウ化し、5回失敗で30分ロック。
- Edge FunctionのCORSを `https://to-jinji.github.io` に限定。
- 初回設定パスワードを「8文字以上＋英字と数字を各1文字以上」に強化。
- 管理者によるPW再発行は、英大文字・英小文字・数字を必ず含むランダム8文字を生成。

## 反映手順
1. Supabase SQL Editorで `supabase/migrations/006_security_hardening.sql` を実行。
2. `supabase/functions/staff-auth/index.ts` をEdge Function `staff-auth` に上書きして再デプロイ。
3. GitHubへ `admin/login.html`、`assets/js/admin-login.js`、`assets/js/admin.js`、`staff/login.html`、`assets/js/staff-login.js` を同じ階層で上書き。
4. 管理者ログインを開き、初回だけ認証アプリでQRコードを登録して6桁コードを入力。

## 注意
- MFAを紛失すると管理者ログインできなくなるため、管理者アカウントを複数用意するか、認証アプリのバックアップ機能を利用してください。
- CORSは本番GitHub PagesのOriginに固定しています。別ドメインへ移行する場合はEdge Function内の `ALLOWED_ORIGIN` を変更してください。
