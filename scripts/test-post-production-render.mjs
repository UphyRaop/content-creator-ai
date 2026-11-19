import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { registerHooks } from "node:module";

registerHooks({resolve(specifier,context,nextResolve){if(specifier==="./project-store"&&context.parentURL?.endsWith("/src/lib/ffmpeg-renderer.ts"))return nextResolve("./project-store.ts",context);if(specifier==="./post-production"&&context.parentURL?.endsWith("/src/lib/ffmpeg-renderer.ts"))return nextResolve("./post-production.ts",context);return nextResolve(specifier,context);}});
const root=mkdtempSync(join(tmpdir(),"ccai-postprod-render-test-"));process.env.CCAI_DATABASE_PATH=join(root,"projects.sqlite");
try{
  const store=await import("../src/lib/project-store.ts"),renderer=await import("../src/lib/ffmpeg-renderer.ts"),post=await import("../src/lib/post-production.ts");
  const imageFile=join(root,"test.png"),voiceFile=join(root,"voice.wav"),musicFile=join(root,"music.wav");
  for(const args of [["-y","-f","lavfi","-i","color=c=navy:s=320x240:d=0.1","-frames:v","1",imageFile],["-y","-f","lavfi","-i","sine=frequency=660:duration=0.8","-ar","44100","-ac","1",voiceFile],["-y","-f","lavfi","-i","sine=frequency=220:duration=0.8","-ar","44100","-ac","1",musicFile]])assert.equal(spawnSync("ffmpeg",args,{stdio:"ignore"}).status,0,"test media fixture should be created");
  const data=(file,mime)=>`data:${mime};base64,${readFileSync(file).toString("base64")}`,image=data(imageFile,"image/png"),voiceData=data(voiceFile,"audio/wav"),musicData=data(musicFile,"audio/wav");
  const project=store.createProject("Post-production render fixture",{scriptApproved:true,scenes:[{id:"scene-1",approved:true,image,voiceSegments:[{id:"voice-1",approved:true,status:"completed",durationSeconds:.8,dataUrl:voiceData}]}]});
  const manifest={version:1,timeUnit:"seconds",duration:1,tracks:[{id:"images",kind:"image",clips:[{id:"image-1",sourceRef:"image:scene-1",start:0,duration:1,sourceOffset:0,timing:"estimated",motion:"none",transitionIn:"cut"}]},{id:"captions",kind:"caption",clips:[]},{id:"voice",kind:"narration",clips:[{id:"voice-clip",sourceRef:"voice:voice-1",start:0,duration:.8,sourceOffset:0,timing:"estimated",motion:"none",transitionIn:"cut"}]},{id:"dialogue",kind:"dialogue",clips:[]}]};
  const sourceJob=renderer.createRenderJob({projectId:project.id,manifest,format:"landscape",fps:30});let sourceState;
  const waitFor=async id=>{const deadline=Date.now()+60000;let state;do{await new Promise(resolve=>setTimeout(resolve,100));state=renderer.getRenderJob(id);if(["completed","failed","cancelled"].includes(state.status))return state;}while(Date.now()<deadline);throw new Error("render fixture timed out");};
  sourceState=await waitFor(sourceJob.id);assert.equal(sourceState.status,"completed",sourceState.error);const original=await renderer.readRenderOutput(sourceJob.id);
  const voice=post.createPostAudioTrack({id:"new-voice",kind:"voice-recording",sourceRef:"import:voice-1",actualDurationSeconds:.8});
  const music=post.updatePostAudioTrack(post.createPostAudioTrack({id:"music-1",kind:"music",sourceRef:"import:music-1",actualDurationSeconds:.8}),{enabled:true,startSeconds:0,sourceOffsetSeconds:.1,durationSeconds:.6,volume:.25,fadeInSeconds:.1,fadeOutSeconds:.1,ducking:{enabled:true,amount:.65,threshold:.12,attackSeconds:.1,releaseSeconds:.25,targetTrackIds:[voice.id]}});
  const placedVoice=post.updatePostAudioTrack(voice,{startSeconds:.2,sourceOffsetSeconds:.1,durationSeconds:.6,volume:.8,fadeInSeconds:.05,fadeOutSeconds:.1});
  const revision=await renderer.createPostProductionExportJob({sourceRenderJobId:sourceJob.id,parentRenderVersion:sourceJob.createdAt,revisionId:"revision-1",audioAssets:[{track:music,dataUrl:musicData},{track:placedVoice,dataUrl:voiceData}]});
  const outputState=await waitFor(revision.id);assert.equal(outputState.status,"completed",outputState.error);assert.equal(outputState.kind,"post-production");assert.equal(outputState.parentRenderJobId,sourceJob.id);assert.equal(outputState.revisionId,"revision-1");
  const derived=await renderer.readRenderOutput(revision.id);assert.ok(derived.length>1024);assert.notDeepEqual(derived,original,"derived MP4 should be a new version");assert.deepEqual(await renderer.readRenderOutput(sourceJob.id),original,"original render bytes must remain unchanged");
  const derivedFile=join(root,"derived.mp4");await (await import("node:fs/promises")).writeFile(derivedFile,derived);
  const probe=spawnSync("ffprobe",["-v","error","-show_entries","format=duration:stream=codec_type,width,height","-of","default=noprint_wrappers=1",derivedFile],{encoding:"utf8"});assert.equal(probe.status,0,probe.stderr);assert.match(probe.stdout,/codec_type=video/);assert.match(probe.stdout,/codec_type=audio/);assert.match(probe.stdout,/width=1920/);assert.match(probe.stdout,/height=1080/);assert.match(probe.stdout,/duration=1(?:\.0+)?/);
  await assert.rejects(renderer.createPostProductionExportJob({sourceRenderJobId:"../../etc/passwd",parentRenderVersion:"x",revisionId:"bad",audioAssets:[]}),/source render must be completed/);
  console.log("PASS post-production FFmpeg export applies imported tracks and ducking, produces playable MP4, and preserves parent render");
}finally{rmSync(root,{recursive:true,force:true});}
