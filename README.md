# 年末調整サイト v0.10.0

## 変更内容
- 「給与以外の所得」を1つの合計金額欄から、種類別の複数登録方式へ変更。
- 「給与以外の所得がありますか？」で「はい」を選んだ場合のみ登録欄を表示。
- 所得の種類：
  - 事業所得
  - 雑所得
  - 配当所得
  - 不動産所得
  - 一時所得
  - 譲渡所得
  - 退職所得
  - その他
- 各項目に「所得金額の見込額」と任意の備考を登録可能。
- 登録済み項目の合計を従来の `staff_income_info.other_income` に自動保存するため、
  既存の確認画面・年末調整計算との互換性を維持。
- 旧「給与以外の所得の見込額」に既存値がある場合は、migration実行時に「その他」として移行。
- 他勤務先の源泉徴収票は従来どおり任意・確認用。
- 前職の源泉徴収票は従来どおり必須。
- バージョン表示を v0.10.0 に更新。

## 反映手順
1. Supabase SQL Editorで `supabase/migrations/011_other_income_items.sql` を実行
2. GitHubへ以下を同じ階層で上書き・追加
   - `staff/index.html`
   - `staff/income.html`
   - `assets/js/staff-income.js`
   - `assets/js/version.js`

Edge Functionの再デプロイは不要です。
