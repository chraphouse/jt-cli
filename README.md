# jt — Swiss Army Knife for JSON

A zero-dependency CLI tool for working with JSON. Format, minify, query, diff, validate, flatten, convert to CSV, and more.

## Install

```bash
npm install -g jt-cli
```

Or run directly with npx:

```bash
npx jt-cli fmt data.json
```

## Usage

```bash
# Format / pretty-print
cat data.json | jt fmt
jt format data.json -c        # with colors

# Minify
jt min data.json

# Query with dot notation
jt query users.0.name data.json
echo '{"a":{"b":42}}' | jt q a.b

# List keys / values
jt keys data.json
jt values data.json

# Flatten nested JSON
echo '{"user":{"name":"Adam","addr":{"city":"Rabat"}}}' | jt flatten
# → {"user.name":"Adam","user.addr.city":"Rabat"}

# Diff two JSON files
jt diff before.json after.json
# + $.newKey: "added"
# - $.removed: "gone"
# ~ $.changed: "old" → "new"

# Validate
jt validate data.json
echo '{bad json' | jt validate

# Convert to CSV
jt csv users.json > users.csv
jt tsv users.json > users.tsv

# Sort keys
jt sort messy.json

# Pick / omit keys
echo '{"a":1,"b":2,"c":3}' | jt pick a,c
echo '{"a":1,"secret":"x"}' | jt omit secret

# NDJSON
jt ndjson array.json           # array → newline-delimited
jt fromlines stream.ndjson     # newline-delimited → array

# Stats
jt stats large.json
# Size: 1.2 MB
# Type: array
# Depth: 4
# Total keys: 15000
# ...
```

## Why jt?

- **Zero dependencies** — just Node.js
- **Pipes well** — reads stdin, writes stdout
- **Fast** — no startup overhead
- **Familiar** — if you know jq, you'll feel at home
- **20+ commands** — covers common JSON operations

## Commands

| Command | Description |
|---------|-------------|
| `fmt` | Pretty-print with indentation |
| `min` | Minify (remove whitespace) |
| `query <path>` | Query with dot notation |
| `keys` | List top-level keys |
| `values` | List top-level values |
| `type` | Show JSON value type |
| `count` | Count items/keys |
| `flatten` | Flatten nested to dot paths |
| `unflatten` | Reverse flatten |
| `diff <a> <b>` | Diff two JSON files |
| `validate` | Check if valid JSON |
| `csv` | Convert array to CSV |
| `tsv` | Convert array to TSV |
| `sort` | Sort keys recursively |
| `pick <keys>` | Keep only listed keys |
| `omit <keys>` | Remove listed keys |
| `ndjson` | Array to newline-delimited |
| `fromlines` | NDJSON to array |
| `stats` | Show depth, types, counts |

## License

MIT
