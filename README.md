# 年末調整サイト v0.9.17

## 修正内容
- TOPの各入力画面リンクに最新版のバージョン番号を付与し、古いHTMLキャッシュが再利用される問題を修正。
- 特に「本人・所得情報」が古い `income.html` / `staff-income.js` と混在する問題を解消。
- `TO株式会社以外から受け取る給与の見込額` が保存済みで1円以上の場合は、画面初期表示時から「他勤務先の源泉徴収票」欄を表示。
- 金額入力時だけでなく change / blur 時にも表示判定を再実行。
- バージョン表示を v0.9.17 に更新。

## 反映
GitHubへ以下を同じ階層で上書きしてください。
- `staff/index.html`
- `staff/income.html`
- `assets/js/staff-income.js`
- `assets/js/version.js`

SQL実行・Edge Function再デプロイは不要です。
