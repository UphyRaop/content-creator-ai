import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { getOwnedProject, type ProjectRow } from "./project-store";

export type ProjectApprovalStage="brief"|"script"|"image"|"voice"|"timeline"|"thumbnail"|"export";
export type ProjectApprovalRecord={stage:ProjectApprovalStage;resourceId:string|null;approvedAt:string;contentHash:string};
const stages:ProjectApprovalStage[]=["brief","script","image","voice","timeline","thumbnail","export"];
const globals=globalThis as typeof globalThis&{ccaiApprovalDb?:DatabaseSync};
function db(){if(globals.ccaiApprovalDb)return globals.ccaiApprovalDb;const filename=process.env.CCAI_DATABASE_PATH||resolve(process.cwd(),"data","ccai.sqlite");if(filename!==":memory:")mkdirSync(dirname(filename),{recursive:true});const conn=new DatabaseSync(filename);conn.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;");conn.exec(`CREATE TABLE IF NOT EXISTS project_approvals(owner_id TEXT NOT NULL,project_id TEXT NOT NULL,stage TEXT NOT NULL,resource_id TEXT NOT NULL DEFAULT '',content_hash TEXT NOT NULL,project_updated_at TEXT NOT NULL,approved_at TEXT NOT NULL,PRIMARY KEY(owner_id,project_id,stage,resource_id)); CREATE INDEX IF NOT EXISTS project_approvals_project ON project_approvals(owner_id,project_id);`);globals.ccaiApprovalDb=conn;return conn;}
const canonical=(item:unknown):string=>Array.isArray(item)?`[${item.map(canonical).join(",")}]`:item&&typeof item==="object"?`{${Object.keys(item as Record<string,unknown>).sort().map(key=>`${JSON.stringify(key)}:${canonical((item as Record<string,unknown>)[key])}`).join(",")}}`:JSON.stringify(item);
const hash=(value:unknown)=>createHash("sha256").update(canonical(value),"utf8").digest("hex");
function project(ownerId:string,projectId:string){const value=getOwnedProject(ownerId,projectId);if(!value)throw new Error("Project not found.");return value;}
function sceneFor(payload:ProjectRow["payload"],id:string){const scenes=Array.isArray(payload.scenes)?payload.scenes as Array<Record<string,any>>:[];return scenes.find(scene=>scene.id===id);}
function linesFor(payload:ProjectRow["payload"]){return(Array.isArray(payload.scenes)?payload.scenes as Array<Record<string,any>>:[]).flatMap(scene=>(Array.isArray(scene.voiceSegments)?scene.voiceSegments:[]).map((line:any)=>({scene,line})));}
function selectedThumbnail(payload:ProjectRow["payload"],id:string){const p=payload as Record<string,any>;const lists=[p.thumbnailVariants,p.publishingKit?.thumbnailVariants,p.publishingKit?.variants,p.publishing?.thumbnailVariants];for(const list of lists)if(Array.isArray(list)){const found=list.find((item:any)=>item?.id===id);if(found)return found;}return null;}
function exportValue(payload:ProjectRow["payload"]){const p=payload as Record<string,any>;return p.exportPackage??p.publishingExport??p.publishingKit?.export??p.publishing?.export??null;}
function targetFor(row:ProjectRow,stage:ProjectApprovalStage,resourceId:string|null):unknown{
  const p=row.payload as Record<string,any>;
  switch(stage){
    case"brief": return p.brief&&typeof p.brief==="object"?omit(p.brief,["approved","approvalStatus","decision"]):null;
    case"script": return typeof p.script==="string"&&p.script.trim()?{script:p.script,versions:p.scriptVersions??p.scriptVersionsHistory??[]}:null;
    case"image": {const s=resourceId?sceneFor(row.payload,resourceId):null;if(!s)return null;const bytes=typeof s.imageData==="string"&&s.imageData?s.imageData:(Array.isArray(s.imageVersions)?s.imageVersions.at(-1)?.image:null)??(typeof s.image==="string"&&s.image!=="true"?s.image:null);return typeof bytes==="string"&&bytes?{id:s.id,prompt:s.prompt??"",scriptText:s.scriptText??s.line??"",image:bytes,imagePromptUsed:s.imagePromptUsed??"",scriptTextUsed:s.scriptTextUsed??"",provider:s.imageProvider??"",version:s.version??0,versions:s.imageVersions??[]}:null;}
    case"voice": {const found=resourceId?linesFor(row.payload).find(x=>x.line.id===resourceId):null;if(!found)return null;const v=found.line,source=v.dataUrl??v.versions?.find((x:any)=>typeof x.dataUrl==="string")?.dataUrl;if(v.status!=="completed"||typeof source!=="string"||!source||!Number.isFinite(v.durationSeconds)||v.durationSeconds<=0)return null;return{sceneId:found.scene.id,id:v.id,text:v.text,role:v.role,profileId:v.profileId,status:v.status,durationSeconds:v.durationSeconds,dataUrl:v.dataUrl??null,versions:v.versions??[]};}
    case"timeline": {const t=p.timeline;if(!t||typeof t!=="object"||!Array.isArray(t.tracks)||t.tracks.length===0)return null;const approval=t.renderApproval;if(!approval||typeof approval.manifestHash!=="string"||! /^[a-f0-9]{64}$/i.test(approval.manifestHash))return null;return{...t,renderApproval:{manifestHash:approval.manifestHash}};}
    case"thumbnail": {const v=resourceId?selectedThumbnail(row.payload,resourceId):null;return v&&typeof v.assetRef==="string"&&v.assetRef?omit(v,["approved","approvalStatus","decision","status"]):null;}
    case"export": {const value=exportValue(row.payload);return value&&typeof value==="object"?omit(value,["approved","approvalStatus","decision"]):null;}
  }
}
function omit(value:any,keys:string[]):unknown{if(Array.isArray(value))return value.map(v=>omit(v,keys));if(!value||typeof value!=="object")return value;return Object.fromEntries(Object.entries(value).filter(([key])=>!keys.includes(key)).map(([key,item])=>[key,omit(item,keys)]));}
function requirePrior(ownerId:string,row:ProjectRow,stage:ProjectApprovalStage,resourceId?:string){if(!hasProjectApproval(ownerId,row.id,stage,resourceId))throw new Error(`Approve the required ${stage} stage first.`);}
function assertPrerequisites(ownerId:string,row:ProjectRow,stage:ProjectApprovalStage,resourceId:string|null){
  const p=row.payload as Record<string,any>;if(stage!=="brief")requirePrior(ownerId,row,"brief");
  if(stage==="image"||stage==="voice"||stage==="timeline"||stage==="thumbnail"||stage==="export")requirePrior(ownerId,row,"script");
  if(stage==="voice") {const found=linesFor(row.payload).find(x=>x.line.id===resourceId);if(!found||!hasProjectApproval(ownerId,row.id,"image",String(found.scene.id)))throw new Error("Approve the scene image before approving its voice segment.");}
  if(stage==="timeline"||stage==="thumbnail"||stage==="export"){
    const scenes=Array.isArray(p.scenes)?p.scenes as Array<Record<string,any>>:[];if(!scenes.length)throw new Error("At least one approved scene is required.");
    for(const scene of scenes){if(!hasProjectApproval(ownerId,row.id,"image",String(scene.id)))throw new Error(`Approve the image for scene ${String(scene.id)} first.`);const lines=Array.isArray(scene.voiceSegments)?scene.voiceSegments:[];if(!lines.length)throw new Error(`Scene ${String(scene.id)} requires an approved voice segment.`);for(const line of lines)if(!hasProjectApproval(ownerId,row.id,"voice",String(line.id)))throw new Error(`Approve voice segment ${String(line.id)} first.`);}
    if(stage==="thumbnail"||stage==="export")requirePrior(ownerId,row,"timeline");
  }
  if(stage==="export") {const variants=(p.thumbnailVariants??p.publishingKit?.thumbnailVariants??p.publishingKit?.variants??p.publishing?.thumbnailVariants) as Array<Record<string,any>>|undefined;const approved=variants?.filter(v=>v.status==="approved")??[];if(approved.length!==1||!hasProjectApproval(ownerId,row.id,"thumbnail",String(approved[0].id)))throw new Error("Approve exactly one thumbnail before export approval.");}
}
function lookup(ownerId:string,projectId:string,stage:ProjectApprovalStage,resourceId:string|null){return db().prepare("SELECT content_hash,project_updated_at,approved_at FROM project_approvals WHERE owner_id=? AND project_id=? AND stage=? AND resource_id=?").get(ownerId,projectId,stage,resourceId??"") as any;}
export function approveProjectStage(ownerId:string,projectId:string,stage:ProjectApprovalStage,resourceId?:string|null):ProjectApprovalRecord{
  if(!stages.includes(stage))throw new Error("Unknown project approval stage.");const resource=resourceId??null,needsResource=stage==="image"||stage==="voice"||stage==="thumbnail";if(needsResource&&(!resource||resource.length>120))throw new Error("This approval stage requires a resource ID.");if(!needsResource&&resource!==null)throw new Error("This approval stage does not accept a resource ID.");
  const row=project(ownerId,projectId);assertPrerequisites(ownerId,row,stage,resource);const content=targetFor(row,stage,resource);if(content===null)throw new Error("The current project content is not ready for this approval stage.");const contentHash=hash(content),approvedAt=new Date().toISOString();
  const conn=db();conn.exec("BEGIN IMMEDIATE");try{
    if(stage==="thumbnail")conn.prepare("DELETE FROM project_approvals WHERE owner_id=? AND project_id=? AND stage='thumbnail'").run(ownerId,projectId);
    conn.prepare("INSERT INTO project_approvals(owner_id,project_id,stage,resource_id,content_hash,project_updated_at,approved_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(owner_id,project_id,stage,resource_id) DO UPDATE SET content_hash=excluded.content_hash,project_updated_at=excluded.project_updated_at,approved_at=excluded.approved_at").run(ownerId,projectId,stage,resource??"",contentHash,row.updatedAt,approvedAt);
    conn.exec("COMMIT");
  }catch(error){conn.exec("ROLLBACK");throw error;}
  return{stage,resourceId:resource,approvedAt,contentHash};
}
export function hasProjectApproval(ownerId:string,projectId:string,stage:ProjectApprovalStage,resourceId?:string|null):boolean{
  if(!stages.includes(stage))return false;const row=getOwnedProject(ownerId,projectId);if(!row)return false;const content=targetFor(row,stage,resourceId??null);if(content===null)return false;const approval=lookup(ownerId,projectId,stage,resourceId??null);
  if(!approval||approval.content_hash!==hash(content))return false;
  const p=row.payload as Record<string,any>;
  if(stage!=="brief"&&!hasProjectApproval(ownerId,projectId,"brief"))return false;
  if(["image","voice","timeline","thumbnail","export"].includes(stage)&&!hasProjectApproval(ownerId,projectId,"script"))return false;
  if(stage==="voice"){const found=linesFor(row.payload).find(x=>x.line.id===resourceId);if(!found||!hasProjectApproval(ownerId,projectId,"image",String(found.scene.id)))return false;}
  if(["timeline","thumbnail","export"].includes(stage)){
    const scenes=Array.isArray(p.scenes)?p.scenes as Array<Record<string,any>>:[];if(!scenes.length)return false;
    for(const scene of scenes){if(!hasProjectApproval(ownerId,projectId,"image",String(scene.id)))return false;const lines=Array.isArray(scene.voiceSegments)?scene.voiceSegments:[];if(!lines.length||lines.some((line:any)=>!hasProjectApproval(ownerId,projectId,"voice",String(line.id))))return false;}
    if(["thumbnail","export"].includes(stage)&&!hasProjectApproval(ownerId,projectId,"timeline"))return false;
  }
  if(stage==="export"){const variants=(p.thumbnailVariants??p.publishingKit?.thumbnailVariants??p.publishingKit?.variants??p.publishing?.thumbnailVariants) as Array<Record<string,any>>|undefined;const chosen=variants?.filter(v=>v.status==="approved")??[];if(chosen.length!==1||!hasProjectApproval(ownerId,projectId,"thumbnail",String(chosen[0].id)))return false;}
  return true;
}

/** Remove server approvals whose stage source changed; cascade each invalidation downstream. */
export function invalidateChangedProjectApprovals(ownerId:string,projectId:string,previousPayload:ProjectRow["payload"],nextPayload:ProjectRow["payload"]){
  const rows=db().prepare("SELECT stage,resource_id,content_hash FROM project_approvals WHERE owner_id=? AND project_id=?").all(ownerId,projectId) as any[];if(!rows.length)return;
  const before:ProjectRow={id:projectId,ownerId,title:"",createdAt:"",updatedAt:"",payload:previousPayload},after={...before,payload:nextPayload};
  const invalid=rows.filter(record=>{const target=targetFor(after,record.stage,record.resource_id||null);return target===null||hash(target)!==record.content_hash;});if(!invalid.length)return;
  const deleteStages=new Set<string>(),deleteKeys=new Set<string>();
  for(const record of invalid){const stage=String(record.stage),resource=String(record.resource_id||"");
    if(stage==="brief"){for(const s of stages)deleteStages.add(s);}
    else if(stage==="script"){for(const s of ["script","image","voice","timeline","thumbnail","export"])deleteStages.add(s);}
    else if(stage==="image"){deleteKeys.add(`image:${resource}`);for(const s of ["timeline","thumbnail","export"])deleteStages.add(s);}
    else if(stage==="voice"){deleteKeys.add(`voice:${resource}`);for(const s of ["timeline","thumbnail","export"])deleteStages.add(s);}
    else if(stage==="timeline"){for(const s of ["timeline","thumbnail","export"])deleteStages.add(s);}
    else if(stage==="thumbnail"){deleteKeys.add(`thumbnail:${resource}`);deleteStages.add("export");}
    else if(stage==="export")deleteStages.add("export");
  }
  const conn=db();for(const stage of deleteStages)conn.prepare("DELETE FROM project_approvals WHERE owner_id=? AND project_id=? AND stage=?").run(ownerId,projectId,stage);
  for(const key of deleteKeys){const split=key.indexOf(":");conn.prepare("DELETE FROM project_approvals WHERE owner_id=? AND project_id=? AND stage=? AND resource_id=?").run(ownerId,projectId,key.slice(0,split),key.slice(split+1));}
}
export function getProjectApprovals(ownerId:string,projectId:string):ProjectApprovalRecord[]{
  const current=getOwnedProject(ownerId,projectId);if(!current)return[];return(db().prepare("SELECT stage,resource_id,approved_at,content_hash FROM project_approvals WHERE owner_id=? AND project_id=? ORDER BY approved_at").all(ownerId,projectId) as any[]).filter(r=>hasProjectApproval(ownerId,projectId,r.stage,r.resource_id||null)).map(r=>({stage:r.stage as ProjectApprovalStage,resourceId:r.resource_id||null,approvedAt:String(r.approved_at),contentHash:String(r.content_hash)}));
}
