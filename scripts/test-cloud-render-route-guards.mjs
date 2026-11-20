import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';

const dir=mkdtempSync(join(tmpdir(),'ccai-cloud-render-guard-'));
process.env.CCAI_DATABASE_PATH=join(dir,'auth.sqlite');
process.env.CCAI_BOOTSTRAP_TOKEN='cloud-render-guard-bootstrap';
process.env.NODE_ENV='test';
const mocks=join(dir,'mocks.mjs');
writeFileSync(mocks,`export const getRenderJob=(id)=>({id,projectId:'owned-project',status:id==='completed-render'?'completed':'failed',kind:'timeline'});export async function retryRenderJobAsync(id){globalThis.__retryCalls=(globalThis.__retryCalls||0)+1;return{id:'retry-result',projectId:'owned-project',status:'queued'};}export async function createPostProductionExportJob(){globalThis.__postProductionCalls=(globalThis.__postProductionCalls||0)+1;return{id:'post-result',projectId:'owned-project',status:'queued'};}export async function cancelRenderJob(){return null;}`);
const approvalFile=join(dir,'approval.mjs');writeFileSync(approvalFile,'export function hasProjectApproval(){return true;}');
const projectsFile=join(dir,'projects.mjs');writeFileSync(projectsFile,"export function getOwnedProject(_owner,id){return id==='owned-project'?{id,payload:{}}:null;}");
const mockUrls={
  ffmpeg:pathToFileURL(mocks).href,
  approval:pathToFileURL(approvalFile).href,
  projects:pathToFileURL(projectsFile).href,
};
registerHooks({resolve(specifier,context,nextResolve){
  if(specifier==='next/server')return nextResolve('next/server.js',context);
  if(specifier==='@/lib/ffmpeg-renderer')return nextResolve(mockUrls.ffmpeg,context);
  if(specifier==='@/lib/approval-store')return nextResolve(mockUrls.approval,context);
  if(specifier==='@/lib/project-store')return nextResolve(mockUrls.projects,context);
  if(specifier.startsWith('@/lib/'))return nextResolve(resolve('src/lib',`${specifier.slice('@/lib/'.length)}.ts`),context);
  if(context.parentURL?.includes('/src/')&&(specifier.startsWith('./')||specifier.startsWith('../'))&&!/\.[cm]?[jt]sx?$/.test(specifier)){try{return nextResolve(`${specifier}.ts`,context);}catch{}}
  return nextResolve(specifier,context);
}});

try{
  const auth=await import('../src/lib/auth-store.ts');
  const user=auth.bootstrapOwner(process.env.CCAI_BOOTSTRAP_TOKEN,'render-guard@example.test','render-guard-password-safe');
  const session=auth.createSession(user.id),cookie=`ccai_session=${session.token}`;
  const retryRoute=await import('../src/app/api/render/[id]/route.ts');
  const postRoute=await import('../src/app/api/render/[id]/post-production/route.ts');
  const base='https://ccai.example.test';
  const retryRequest=()=>new Request(`${base}/api/render/failed-render`,{method:'POST',headers:{cookie,origin:base}});
  const postRequest=()=>new Request(`${base}/api/render/completed-render/post-production`,{method:'POST',headers:{cookie,origin:base,'content-type':'application/json'},body:JSON.stringify({parentRenderVersion:'version-1',revisionId:'revision-1',audioAssets:[]})});

  process.env.K_SERVICE='ccai-test-cloud';
  const retryBlocked=await retryRoute.POST(retryRequest(),{params:Promise.resolve({id:'failed-render'})});
  const postBlocked=await postRoute.POST(postRequest(),{params:Promise.resolve({id:'completed-render'})});
  assert.equal(retryBlocked.status,503,'cloud retry is blocked before job creation');
  assert.equal(postBlocked.status,503,'cloud post-production job is blocked before creation');
  assert.equal(globalThis.__retryCalls||0,0);
  assert.equal(globalThis.__postProductionCalls||0,0);

  delete process.env.K_SERVICE;
  const retryLocal=await retryRoute.POST(retryRequest(),{params:Promise.resolve({id:'failed-render'})});
  const postLocal=await postRoute.POST(postRequest(),{params:Promise.resolve({id:'completed-render'})});
  assert.equal(retryLocal.status,202,'local retry remains available');
  assert.equal(postLocal.status,202,'local post-production remains available');
  assert.equal(globalThis.__retryCalls,1);
  assert.equal(globalThis.__postProductionCalls,1);
  console.log('PASS cloud retry and post-production admission guards reject jobs while preserving local workflows');
}finally{rmSync(dir,{recursive:true,force:true});}
