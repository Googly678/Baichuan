import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { writeIcdDb, type Icd10Record } from '../icdStorage';

const targetFile = process.argv[2] || path.resolve(__dirname, '../../data/ICD-10医保2.0版.xlsx');

function normalizeHeader(header: string) {
  return String(header || '').replace(/\s+/g, '').replace(/[()（）:：_\-]/g, '').toLowerCase();
}

function pickValue(row: Record<string, any>, aliases: string[]) {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const normalizedAlias = normalizeHeader(alias);
    const found = entries.find(([key]) => normalizeHeader(key) === normalizedAlias);
    if (found && String(found[1] || '').trim()) {
      return String(found[1]).trim();
    }
  }
  return '';
}

function fallbackFromRow(row: Record<string, any>) {
  return Object.values(row).map((value) => String(value || '').trim()).filter(Boolean);
}

async function main() {
  if (!fs.existsSync(targetFile)) {
    throw new Error(`未找到 ICD-10 文件：${targetFile}`);
  }

  const workbook = XLSX.readFile(targetFile);
  const firstSheetName = workbook.SheetNames[0];
  const firstSheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(firstSheet, { defval: '' });

  const items: Icd10Record[] = rows.map((row, index) => {
    const fallback = fallbackFromRow(row);
    const code = pickValue(row, ['诊断代码', '诊断编码', 'ICD编码', 'ICD-10编码', '疾病编码', '编码'])
      || pickValue(row, ['亚目代码', '类目代码'])
      || fallback[0]
      || '';
    const name = pickValue(row, ['诊断名称', '疾病名称', 'ICD名称', '名称'])
      || pickValue(row, ['亚目名称', '类目名称'])
      || fallback[1]
      || '';
    const level1 = pickValue(row, ['章的名称', '章代码范围', '一级', '一级目录', '大类', '一级分类']) || '';
    const level2 = pickValue(row, ['节名称', '节代码范围', '二级', '二级目录', '中类', '二级分类']) || '';
    const level3 = pickValue(row, ['类目名称', '类目代码', '三级', '三级目录', '类目', '小类', '三级分类']) || '';
    const injuryPart = pickValue(row, ['损伤部位', '部位']) || '';
    const severity = pickValue(row, ['损伤程度', '严重程度']) || '';
    const treatment = pickValue(row, ['治疗方式', '处置方式', '建议治疗']) || '';

    return {
      id: `${code || 'ICD'}-${index + 1}`,
      code,
      name,
      level1,
      level2,
      level3,
      injury_part: injuryPart,
      severity,
      treatment,
    };
  }).filter((item) => item.code || item.name);

  await writeIcdDb(items);
  console.log(`已导入 ICD-10 ${items.length} 条，来源工作表：${firstSheetName}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});