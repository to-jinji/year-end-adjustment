# v0.8.5 変更内容

- 保険料控除で「いいえ（対象外）」を選択した際に表示していた「この項目は対象外です」の重複案内を削除。
- 「いいえ」の場合は追加入力欄を表示せず、「この内容で入力完了」へそのまま進めるUIに整理。

## 変更ファイル
- `staff/insurance.html`
- `assets/js/staff-insurance.js`

SQL migration / Edge Function 再デプロイは不要です。
