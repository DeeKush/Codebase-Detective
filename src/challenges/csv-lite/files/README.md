# CSV Lite

- `parse(text, { delimiter })` returns rows of strings. Quoted fields, doubled quotes and `\n` / `\r\n` are supported. **Blank lines are ignored.**
- `stringify(rows)` writes rows, quoting only when needed.
- `parseObjects(text)` uses the first row as the header.
