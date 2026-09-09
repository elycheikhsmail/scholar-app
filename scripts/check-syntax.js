const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
function javascriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? javascriptFiles(file) : file.endsWith('.js') ? [file] : [];
  });
}
const files = [
  ...fs.readdirSync(root).filter(name => name.endsWith('.js')).map(name => path.join(root, name)),
  ...['public', 'scripts', 'tests'].flatMap(name => javascriptFiles(path.join(root, name)))
];
let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed = true;
    console.error(path.relative(root, file), result.error?.message || result.stderr || result.stdout);
  }
}
if (failed) process.exitCode = 1;
else console.log(`Syntax OK: ${files.length} JavaScript files.`);
