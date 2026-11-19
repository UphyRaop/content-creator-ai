import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const html = await readFile(resolve(root, 'prototype.html'), 'utf8');
const dist = resolve(root, 'dist');
await mkdir(dist, { recursive: true });
await writeFile(resolve(dist, 'index.html'), html, 'utf8');
await writeFile(resolve(dist, 'CNAME'), 'ccai.ur-project.biz\n', 'utf8');
console.log('Static prototype built at dist/index.html');
