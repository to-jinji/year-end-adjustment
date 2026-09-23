# 年末調整サイト v0.1.1

GitHub Pages + Supabase を前提にした初期版です。

## 実装済み
- 年末調整対象確認ページ
- スタッフID（4桁）＋生年月日（8桁）の本人確認
- 初回のみスタッフ自身で8文字以上のパスワード設定
- 2回目以降も「ID＋生年月日 → 設定済みPW」の2段階フロー
- 管理者専用ログインページ
- 管理者によるスタッフ登録（個別／CSV一括登録）
- 2026年の編集期限・状態管理の土台
- RLSによるスタッフ本人／管理者の分離

## セットアップ
1. Supabaseプロジェクトを作成。
2. `supabase/migrations/001_initial.sql` をSQL Editorで実行。
3. `supabase/functions/staff-auth` をEdge Functionとしてデプロイ。
4. `assets/js/config.example.js` を `assets/js/config.js` にコピーし、Project URL と anon key を設定。
5. Supabase Authで管理者ユーザーを作成。
6. SQL Editorで管理者を登録：
   `insert into public.admin_users(auth_user_id, display_name) values ('AUTH_USER_UUID','管理者');`
7. GitHubリポジトリへアップロードし、GitHub Pagesを有効化。

## セキュリティ
- `service_role` キーはEdge Function内だけで使用し、GitHubやブラウザJSへ置かないでください。
- 生年月日は公開APIから匿名ユーザーに取得させません。
- 本人確認トークンは10分で失効し、初回PW設定時に1回だけ使用します。
- 本番ではEdge FunctionにIP/スタッフID単位のレート制限、監査ログ、管理者MFAを追加してください。

## 次版予定
- 基本情報
- 配偶者・扶養
- 保険料控除
- 前職・源泉徴収票
- 書類アップロード
- 提出／差し戻し／再提出
- 管理者詳細確認・CSV出力

## v0.1.1 変更点
- スタッフパスワードの最低文字数を10文字から8文字へ変更。
- 管理者画面にCSV一括登録とCSVひな形ダウンロードを追加。
- 入口の年末調整対象確認文面を実運用に合わせて更新。
- 入社日条件を「2026年11月30日まで」に変更。
