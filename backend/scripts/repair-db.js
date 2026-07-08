const fs = require('fs');
const path = require('path');

const dbPath = path.resolve(__dirname, '../data/demo-db.json');
const raw = fs.readFileSync(dbPath, 'utf8');

let depth = 0;
let inString = false;
let escaped = false;
let endIndex = -1;

for (let i = 0; i < raw.length; i += 1) {
  const ch = raw[i];

  if (inString) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = false;
    }
    continue;
  }

  if (ch === '"') {
    inString = true;
    continue;
  }

  if (ch === '{') {
    depth += 1;
    continue;
  }

  if (ch === '}') {
    depth -= 1;
    if (depth === 0) {
      endIndex = i;
      break;
    }
  }
}

if (endIndex < 0) {
  throw new Error('Failed to locate end of top-level JSON object');
}

const fixed = raw.slice(0, endIndex + 1);
JSON.parse(fixed);
fs.writeFileSync(dbPath, fixed, 'utf8');

console.log(`Repaired demo-db.json at index ${endIndex}, length ${fixed.length}`);
