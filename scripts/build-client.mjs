import { existsSync, rmSync, mkdirSync, readdirSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');
const clientDir = join(__dirname, '..', '..', 'client');

if (!existsSync(distDir)) {
  throw new Error('frontend/dist not found — run "vite build" first');
}

if (existsSync(clientDir)) {
  for (const entry of readdirSync(clientDir)) {
    if (entry === 'client-package.json') continue; // Catalyst client metadata, not a build artifact
    rmSync(join(clientDir, entry), { recursive: true, force: true });
  }
} else {
  mkdirSync(clientDir, { recursive: true });
}

cpSync(distDir, clientDir, { recursive: true });

console.log(`Copied ${distDir} -> ${clientDir}`);
