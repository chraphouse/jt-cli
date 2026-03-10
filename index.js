#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const VERSION = '1.0.0';
const HELP = `
jt - Swiss army knife for JSON

Usage: jt <command> [options] [file|stdin]

Commands:
  fmt, format     Pretty-print JSON (default 2-space indent)
  min, minify     Minify JSON (remove whitespace)
  q, query <path> Query JSON with dot notation (e.g. "users.0.name")
  keys            List top-level keys
  vals, values    List top-level values
  type            Show type of JSON value
  count           Count items in array or keys in object
  flat, flatten   Flatten nested JSON into dot-notation paths
  unflat          Unflatten dot-notation back to nested JSON
  diff <a> <b>    Show differences between two JSON files
  validate        Validate JSON and show errors
  csv             Convert JSON array to CSV
  tsv             Convert JSON array to TSV
  sort            Sort object keys recursively
  pick <keys>     Pick specific keys (comma-separated)
  omit <keys>     Omit specific keys (comma-separated)
  lines, ndjson   Convert JSON array to newline-delimited JSON
  fromlines       Convert NDJSON to JSON array
  stats           Show stats (depth, keys, types, size)

Options:
  -i, --indent <n>  Indent spaces (default: 2)
  -c, --color       Colorize output
  -r, --raw         Output raw strings (no quotes)
  -h, --help        Show this help
  -v, --version     Show version

Examples:
  cat data.json | jt fmt
  jt query users.0.name data.json
  jt diff a.json b.json
  jt csv data.json > data.csv
  jt flatten data.json
  echo '{"a":1}' | jt keys
`;

// Parse args
const args = process.argv.slice(2);
if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
  console.log(HELP);
  process.exit(0);
}
if (args.includes('-v') || args.includes('--version')) {
  console.log(VERSION);
  process.exit(0);
}

const command = args[0];
const flags = {};
const positional = [];

for (let i = 1; i < args.length; i++) {
  if (args[i] === '-i' || args[i] === '--indent') { flags.indent = parseInt(args[++i]) || 2; }
  else if (args[i] === '-c' || args[i] === '--color') { flags.color = true; }
  else if (args[i] === '-r' || args[i] === '--raw') { flags.raw = true; }
  else { positional.push(args[i]); }
}

const indent = flags.indent || 2;

async function main() {
  try {
    const result = await run(command, positional, flags);
    if (result !== undefined) {
      console.log(result);
    }
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
}

async function run(cmd, pos, flags) {
  switch (cmd) {
    case 'fmt':
    case 'format': {
      const data = await readJson(pos[0]);
      return flags.color ? colorize(data, indent) : JSON.stringify(data, null, indent);
    }

    case 'min':
    case 'minify': {
      const data = await readJson(pos[0]);
      return JSON.stringify(data);
    }

    case 'q':
    case 'query': {
      const queryPath = pos[0];
      if (!queryPath) throw new Error('Query path required. Usage: jt query users.0.name');
      const data = await readJson(pos[1]);
      const result = queryJson(data, queryPath);
      if (flags.raw && typeof result === 'string') return result;
      return typeof result === 'object' ? JSON.stringify(result, null, indent) : String(result);
    }

    case 'keys': {
      const data = await readJson(pos[0]);
      if (typeof data !== 'object' || data === null) throw new Error('Input must be an object or array');
      return Array.isArray(data) ? data.map((_, i) => i).join('\n') : Object.keys(data).join('\n');
    }

    case 'vals':
    case 'values': {
      const data = await readJson(pos[0]);
      if (typeof data !== 'object' || data === null) throw new Error('Input must be an object or array');
      const vals = Array.isArray(data) ? data : Object.values(data);
      return vals.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join('\n');
    }

    case 'type': {
      const data = await readJson(pos[0]);
      if (data === null) return 'null';
      if (Array.isArray(data)) return `array (${data.length} items)`;
      if (typeof data === 'object') return `object (${Object.keys(data).length} keys)`;
      return typeof data;
    }

    case 'count': {
      const data = await readJson(pos[0]);
      if (Array.isArray(data)) return String(data.length);
      if (typeof data === 'object' && data !== null) return String(Object.keys(data).length);
      throw new Error('Input must be an object or array');
    }

    case 'flat':
    case 'flatten': {
      const data = await readJson(pos[0]);
      return JSON.stringify(flattenObj(data), null, indent);
    }

    case 'unflat':
    case 'unflatten': {
      const data = await readJson(pos[0]);
      return JSON.stringify(unflattenObj(data), null, indent);
    }

    case 'diff': {
      if (pos.length < 2) throw new Error('Two files required. Usage: jt diff a.json b.json');
      const a = JSON.parse(fs.readFileSync(pos[0], 'utf8'));
      const b = JSON.parse(fs.readFileSync(pos[1], 'utf8'));
      const diffs = diffJson(a, b, '$');
      if (diffs.length === 0) return 'No differences';
      return diffs.join('\n');
    }

    case 'validate': {
      const raw = pos[0] ? fs.readFileSync(pos[0], 'utf8') : await readStdin();
      try {
        JSON.parse(raw);
        return 'Valid JSON';
      } catch (e) {
        const match = e.message.match(/position (\d+)/);
        let msg = 'Invalid JSON: ' + e.message;
        if (match) {
          const pos = parseInt(match[1]);
          const line = raw.substring(0, pos).split('\n').length;
          msg += ` (line ${line})`;
        }
        process.exitCode = 1;
        return msg;
      }
    }

    case 'csv':
    case 'tsv': {
      const data = await readJson(pos[0]);
      if (!Array.isArray(data)) throw new Error('Input must be a JSON array');
      const sep = cmd === 'tsv' ? '\t' : ',';
      return arrayToCsv(data, sep);
    }

    case 'sort': {
      const data = await readJson(pos[0]);
      return JSON.stringify(sortKeys(data), null, indent);
    }

    case 'pick': {
      const keys = pos[0]?.split(',').map(k => k.trim());
      if (!keys?.length) throw new Error('Keys required. Usage: jt pick name,age');
      const data = await readJson(pos[1]);
      if (typeof data !== 'object' || Array.isArray(data)) throw new Error('Input must be an object');
      const result = {};
      for (const k of keys) { if (k in data) result[k] = data[k]; }
      return JSON.stringify(result, null, indent);
    }

    case 'omit': {
      const keys = new Set(pos[0]?.split(',').map(k => k.trim()));
      if (!keys.size) throw new Error('Keys required. Usage: jt omit password,secret');
      const data = await readJson(pos[1]);
      if (typeof data !== 'object' || Array.isArray(data)) throw new Error('Input must be an object');
      const result = {};
      for (const [k, v] of Object.entries(data)) { if (!keys.has(k)) result[k] = v; }
      return JSON.stringify(result, null, indent);
    }

    case 'lines':
    case 'ndjson': {
      const data = await readJson(pos[0]);
      if (!Array.isArray(data)) throw new Error('Input must be a JSON array');
      return data.map(item => JSON.stringify(item)).join('\n');
    }

    case 'fromlines': {
      const raw = pos[0] ? fs.readFileSync(pos[0], 'utf8') : await readStdin();
      const items = raw.trim().split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
      return JSON.stringify(items, null, indent);
    }

    case 'stats': {
      const raw = pos[0] ? fs.readFileSync(pos[0], 'utf8') : await readStdin();
      const data = JSON.parse(raw);
      const stats = getStats(data);
      return [
        `Size: ${raw.length} bytes (${(raw.length / 1024).toFixed(1)} KB)`,
        `Type: ${stats.type}`,
        `Depth: ${stats.depth}`,
        `Total keys: ${stats.totalKeys}`,
        `Total values: ${stats.totalValues}`,
        `Arrays: ${stats.arrays}`,
        `Objects: ${stats.objects}`,
        `Strings: ${stats.strings}`,
        `Numbers: ${stats.numbers}`,
        `Booleans: ${stats.booleans}`,
        `Nulls: ${stats.nulls}`,
      ].join('\n');
    }

    default:
      // If no command matches, try to format the first arg as a file
      if (fs.existsSync(cmd)) {
        const data = JSON.parse(fs.readFileSync(cmd, 'utf8'));
        return flags.color ? colorize(data, indent) : JSON.stringify(data, null, indent);
      }
      throw new Error(`Unknown command: ${cmd}. Run 'jt --help' for usage.`);
  }
}

// Read JSON from file or stdin
async function readJson(filePath) {
  const raw = filePath ? fs.readFileSync(filePath, 'utf8') : await readStdin();
  return JSON.parse(raw);
}

function readStdin() {
  return new Promise((resolve, reject) => {
    if (process.stdin.isTTY) {
      reject(new Error('No input. Pipe JSON via stdin or provide a file path.'));
      return;
    }
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

// Query with dot notation: "users.0.name"
function queryJson(data, path) {
  const parts = path.split('.');
  let current = data;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current) && /^\d+$/.test(part)) {
      current = current[parseInt(part)];
    } else {
      current = current[part];
    }
  }
  return current;
}

// Flatten nested object
function flattenObj(obj, prefix = '', result = {}) {
  if (typeof obj !== 'object' || obj === null) {
    result[prefix] = obj;
    return result;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => flattenObj(item, prefix ? `${prefix}.${i}` : String(i), result));
  } else {
    for (const [key, val] of Object.entries(obj)) {
      flattenObj(val, prefix ? `${prefix}.${key}` : key, result);
    }
  }
  return result;
}

// Unflatten dot-notation
function unflattenObj(obj) {
  const result = {};
  for (const [key, val] of Object.entries(obj)) {
    const parts = key.split('.');
    let current = result;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const next = parts[i + 1];
      if (!(part in current)) {
        current[part] = /^\d+$/.test(next) ? [] : {};
      }
      current = current[part];
    }
    current[parts[parts.length - 1]] = val;
  }
  return result;
}

// Diff two JSON values
function diffJson(a, b, path) {
  const diffs = [];
  const typeA = Array.isArray(a) ? 'array' : typeof a;
  const typeB = Array.isArray(b) ? 'array' : typeof b;

  if (typeA !== typeB) {
    diffs.push(`~ ${path}: type changed from ${typeA} to ${typeB}`);
    return diffs;
  }

  if (a === null || b === null || typeof a !== 'object') {
    if (a !== b) diffs.push(`~ ${path}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
    return diffs;
  }

  if (Array.isArray(a)) {
    const maxLen = Math.max(a.length, b.length);
    for (let i = 0; i < maxLen; i++) {
      if (i >= a.length) diffs.push(`+ ${path}.${i}: ${JSON.stringify(b[i])}`);
      else if (i >= b.length) diffs.push(`- ${path}.${i}: ${JSON.stringify(a[i])}`);
      else diffs.push(...diffJson(a[i], b[i], `${path}.${i}`));
    }
  } else {
    const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of allKeys) {
      if (!(key in a)) diffs.push(`+ ${path}.${key}: ${JSON.stringify(b[key])}`);
      else if (!(key in b)) diffs.push(`- ${path}.${key}: ${JSON.stringify(a[key])}`);
      else diffs.push(...diffJson(a[key], b[key], `${path}.${key}`));
    }
  }

  return diffs;
}

// Sort keys recursively
function sortKeys(obj) {
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (typeof obj !== 'object' || obj === null) return obj;
  const sorted = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeys(obj[key]);
  }
  return sorted;
}

// Array of objects to CSV
function arrayToCsv(arr, sep = ',') {
  if (arr.length === 0) return '';
  const headers = [...new Set(arr.flatMap(Object.keys))];
  const escape = (val) => {
    const str = val === null || val === undefined ? '' : String(val);
    if (str.includes(sep) || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };
  const rows = [headers.map(escape).join(sep)];
  for (const item of arr) {
    rows.push(headers.map(h => escape(item[h])).join(sep));
  }
  return rows.join('\n');
}

// Colorize JSON output
function colorize(data, indent) {
  const json = JSON.stringify(data, null, indent);
  return json
    .replace(/"([^"]+)":/g, '\x1b[36m"$1"\x1b[0m:')
    .replace(/: "([^"]*)"/g, ': \x1b[32m"$1"\x1b[0m')
    .replace(/: (-?\d+\.?\d*)/g, ': \x1b[33m$1\x1b[0m')
    .replace(/: (true|false)/g, ': \x1b[35m$1\x1b[0m')
    .replace(/: (null)/g, ': \x1b[31m$1\x1b[0m');
}

// Get stats about JSON
function getStats(data, stats) {
  stats = stats || { depth: 0, totalKeys: 0, totalValues: 0, arrays: 0, objects: 0, strings: 0, numbers: 0, booleans: 0, nulls: 0, _currentDepth: 0 };
  if (data === null) { stats.nulls++; stats.totalValues++; return stats; }
  if (typeof data === 'string') { stats.strings++; stats.totalValues++; return stats; }
  if (typeof data === 'number') { stats.numbers++; stats.totalValues++; return stats; }
  if (typeof data === 'boolean') { stats.booleans++; stats.totalValues++; return stats; }
  stats._currentDepth++;
  if (stats._currentDepth > stats.depth) stats.depth = stats._currentDepth;
  if (Array.isArray(data)) {
    stats.arrays++;
    data.forEach(item => getStats(item, stats));
  } else {
    stats.objects++;
    const keys = Object.keys(data);
    stats.totalKeys += keys.length;
    keys.forEach(k => getStats(data[k], stats));
  }
  stats._currentDepth--;
  stats.type = Array.isArray(data) ? 'array' : 'object';
  return stats;
}

main();
