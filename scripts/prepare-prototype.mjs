import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const publicDir = resolve(root, 'public');
await mkdir(publicDir, { recursive: true });
await copyFile(resolve(root, 'prototype.html'), resolve(publicDir, 'prototype.html'));
const workflow = await readFile(resolve(root, 'src/lib/timeline-workflow.ts'), 'utf8');
const compiled = ts.transpileModule(workflow, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
if (compiled.diagnostics?.some(item => item.category === ts.DiagnosticCategory.Error)) throw new Error('Timeline workflow browser build failed.');
await writeFile(resolve(publicDir, 'timeline-workflow.js'), compiled.outputText);
console.log('Prepared public/prototype.html and timeline workflow module');
