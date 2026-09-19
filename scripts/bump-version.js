import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const pkgPath = path.join(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

// Semver bump: 1.0.0 -> 1.0.1, etc.
const parts = pkg.version.split('.').map(Number);
if (parts.length === 3 && !parts.some(isNaN)) {
  parts[2] += 1;
  pkg.version = parts.join('.');
} else {
  pkg.version = '1.0.1';
}

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
console.log(`[Version Bump] Bumped package.json to v${pkg.version}`);

// Also update index.html version display if present
const indexPath = path.join(rootDir, 'index.html');
if (fs.existsSync(indexPath)) {
  let indexContent = fs.readFileSync(indexPath, 'utf8');
  if (indexContent.includes('id="app-version"')) {
    indexContent = indexContent.replace(
      /<span id="app-version">.*?<\/span>/,
      `<span id="app-version">v${pkg.version}</span>`
    );
    fs.writeFileSync(indexPath, indexContent, 'utf8');
    console.log(`[Version Bump] Updated index.html version indicator to v${pkg.version}`);
  }
}

