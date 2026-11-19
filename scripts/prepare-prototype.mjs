import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const publicDir = resolve(root, 'public');
await mkdir(publicDir, { recursive: true });
await copyFile(resolve(root, 'prototype.html'), resolve(publicDir, 'prototype.html'));
console.log('Prepared public/prototype.html');
