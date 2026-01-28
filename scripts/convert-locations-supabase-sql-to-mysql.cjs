#!/usr/bin/env node
/*
Converts a Supabase/Postgres-style export like:
  INSERT INTO "public"."locations" ("id", ...) VALUES (...), (...);
into MySQL-compatible SQL targeting Prisma's `Location` table.

Usage:
  node scripts/convert-locations-supabase-sql-to-mysql.cjs \
    "locations_rows (2).sql" \
    "scripts/locations_rows.mysql.sql"
*/

const fs = require('node:fs');
const path = require('node:path');

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function extractColumns(sql) {
  const insertIdx = sql.indexOf('INSERT INTO');
  if (insertIdx < 0) die('Input SQL does not contain INSERT INTO');

  const firstParenIdx = sql.indexOf('(', insertIdx);
  if (firstParenIdx < 0) die('Could not find column list start');

  // Find the matching ") VALUES" boundary by searching for ') VALUES' after columns.
  const valuesMarkerIdx = sql.indexOf(') VALUES', firstParenIdx);
  if (valuesMarkerIdx < 0) die('Could not find ") VALUES" after column list');

  const colsRaw = sql.slice(firstParenIdx + 1, valuesMarkerIdx);
  const cols = colsRaw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s.replace(/^"|"$/g, ''));

  if (!cols.length) die('No columns found');
  return { cols, valuesStartIdx: valuesMarkerIdx + ') VALUES'.length };
}

function splitTuples(valuesPart) {
  // valuesPart begins right after ") VALUES". It should start with whitespace then '('.
  const tuples = [];

  let i = 0;
  let inString = false;
  let depth = 0;
  let start = -1;

  while (i < valuesPart.length) {
    const ch = valuesPart[i];

    if (inString) {
      if (ch === "'") {
        // Postgres escapes single quote as doubled ''
        if (valuesPart[i + 1] === "'") {
          i += 2;
          continue;
        }
        inString = false;
        i += 1;
        continue;
      }
      i += 1;
      continue;
    }

    if (ch === "'") {
      inString = true;
      i += 1;
      continue;
    }

    if (ch === '(') {
      if (depth === 0) start = i;
      depth += 1;
      i += 1;
      continue;
    }

    if (ch === ')') {
      depth -= 1;
      i += 1;
      if (depth === 0 && start >= 0) {
        tuples.push(valuesPart.slice(start, i));
        start = -1;
      }
      continue;
    }

    i += 1;
  }

  if (!tuples.length) die('No tuples parsed from VALUES');
  return tuples;
}

function normalizeTupleForMySql(tupleSql) {
  // Convert Postgres boolean string literals into MySQL numeric booleans.
  // We only touch exact quoted literals to avoid changing substrings.
  return tupleSql
    // Match the whole quoted literal and ensure it's followed by a separator.
    .replace(/'true'(?=\s*,|\s*\)|\s*$)/g, '1')
    .replace(/'false'(?=\s*,|\s*\)|\s*$)/g, '0');
}

function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];

  if (!inputPath || !outputPath) {
    die('Usage: node scripts/convert-locations-supabase-sql-to-mysql.cjs <input.sql> <output.sql>');
  }

  const absIn = path.isAbsolute(inputPath) ? inputPath : path.join(process.cwd(), inputPath);
  const absOut = path.isAbsolute(outputPath) ? outputPath : path.join(process.cwd(), outputPath);

  const sql = fs.readFileSync(absIn, 'utf8');

  const { cols, valuesStartIdx } = extractColumns(sql);

  // Remaining part contains VALUES tuples and trailing ';'
  const valuesPart = sql.slice(valuesStartIdx);
  const tuples = splitTuples(valuesPart);
  const mysqlTuples = tuples.map(normalizeTupleForMySql);

  const colList = cols.map(c => `\`${c}\``).join(', ');

  // Write as multiple INSERTs to avoid max_allowed_packet issues.
  const BATCH_SIZE = 250;

  let out = '';
  out += '-- Auto-generated for MySQL import (Prisma Location table)\n';
  out += 'SET FOREIGN_KEY_CHECKS=0;\n';
  out += 'START TRANSACTION;\n';
  out += 'TRUNCATE TABLE `Location`;\n\n';

  for (let idx = 0; idx < mysqlTuples.length; idx += BATCH_SIZE) {
    const batch = mysqlTuples.slice(idx, idx + BATCH_SIZE);
    out += `INSERT INTO \`Location\` (${colList}) VALUES\n`;
    out += batch.map(t => `  ${t}`).join(',\n');
    out += ';\n\n';
  }

  out += 'COMMIT;\n';
  out += 'SET FOREIGN_KEY_CHECKS=1;\n';

  // Make sure we are not using Postgres schema/table quoting.
  // (Tuples are kept as-is; columns are already transformed.)
  ensureDirForFile(absOut);
  fs.writeFileSync(absOut, out, 'utf8');

  console.log(`Wrote ${absOut} with ${mysqlTuples.length} rows in batches of ${BATCH_SIZE}.`);
}

main();
