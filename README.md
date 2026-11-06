# 年末調整サイト v0.12.2

## 変更内容
- 扶養控除等申告書画面から
  「従たる給与についての扶養控除等（異動）申告書を提出している」
  のチェック項目を削除。
- 内部値は `false` で保存。
- 「他の所得者の住所又は居所」を複数行textareaから1行inputへ変更し、
  先頭に不要な改行が見える問題を解消。
- キャッシュ参照とバージョン表示を v0.12.2 に更新。

## 反映
GitHubへ以下を上書きしてください。
- `staff/index.html`
- `staff/fuyou-declaration.html`
- `assets/js/staff-fuyou-declaration.js`
- `assets/js/version.js`

SQL実行・Edge Function再デプロイは不要です。
