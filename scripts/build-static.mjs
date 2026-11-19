import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const html = await readFile(resolve(root, 'prototype.html'), 'utf8');
const dist = resolve(root, 'dist');
await mkdir(dist, { recursive: true });
await writeFile(resolve(dist, 'index.html'), html, 'utf8');
const workflow = await readFile(resolve(root, 'src/lib/timeline-workflow.ts'), 'utf8');
const compiled = ts.transpileModule(workflow, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
if (compiled.diagnostics?.some(item => item.category === ts.DiagnosticCategory.Error)) throw new Error('Timeline workflow browser build failed.');
await writeFile(resolve(dist, 'timeline-workflow.js'), compiled.outputText, 'utf8');
await writeFile(resolve(dist, 'CNAME'), 'ccai.ur-project.biz\n', 'utf8');
console.log('Static prototype and timeline module built in dist');
