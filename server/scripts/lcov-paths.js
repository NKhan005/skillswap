'use strict';

/**
 * Rewrites the paths in coverage/lcov.info so SonarQube can find the files.
 *
 * Node's lcov reporter records paths relative to the directory the tests ran
 * in (`server/`), and on Windows it uses backslashes. The scanner runs from
 * the repository root, so `src/utils/wallet.js` matches nothing and every
 * file silently reports as uncovered.
 *
 * This normalises separators and prefixes the module directory, turning
 *   SF:src\utils\wallet.js   ->   SF:server/src/utils/wallet.js
 *
 * Run as part of `npm run test:coverage`.
 */

const fs = require('node:fs');
const path = require('node:path');

const PREFIX = process.env.LCOV_PREFIX || 'server';
const file = path.join(__dirname, '..', 'coverage', 'lcov.info');

if (!fs.existsSync(file)) {
  console.error(`No coverage report at ${file} - did the test run fail?`);
  process.exit(1);
}

const original = fs.readFileSync(file, 'utf8');

let rewritten = 0;
const out = original
  .split('\n')
  .map((line) => {
    if (!line.startsWith('SF:')) return line;
    let p = line.slice(3).replace(/\\/g, '/');
    // Absolute paths appear on some platforms; keep only the part from src/.
    const srcAt = p.indexOf('src/');
    if (srcAt > 0) p = p.slice(srcAt);
    if (!p.startsWith(`${PREFIX}/`)) p = `${PREFIX}/${p}`;
    rewritten += 1;
    return `SF:${p}`;
  })
  .join('\n');

fs.writeFileSync(file, out);
console.log(`lcov: rewrote ${rewritten} file paths to be repository-relative`);
