# 年末調整サイト v0.5.2 変更ファイル

## 追加
- 管理画面から2026年の給与情報をCSVで一括登録できるようにしました。
- スタッフID（4桁）で既存スタッフに紐づけます。
- CSVひな形を管理画面からダウンロードできます。
- 既に給与情報があるスタッフはCSVの値で上書きします。
- CSVで給与情報を更新した場合、以前の年末調整計算結果はクリアされるため、必要に応じて再計算してください。

## CSV列
`staff_id,taxable_salary_total,social_insurance_total,withheld_income_tax_total`

例:
```csv
staff_id,taxable_salary_total,social_insurance_total,withheld_income_tax_total
"0001","3500000","520000","85000"
```

- `staff_id`: 4桁
- `taxable_salary_total`: 2026年のTO株式会社における課税支給額合計（円）
- `social_insurance_total`: 2026年のTO株式会社における社会保険料合計（円）
- `withheld_income_tax_total`: 2026年のTO株式会社における所得税合計（円）
- 金額は0以上の整数。CSV内で `"3,500,000"` のようにカンマ付きで記載しても読み取れます。
- 1回500件まで登録できます。

## 反映手順
1. `assets/js/admin.js` と `admin/index.html` をGitHubへ上書き。
2. `supabase/functions/staff-auth/index.ts` をEdge Function `staff-auth` に上書きして再デプロイ。
3. SQL migrationは不要です。
