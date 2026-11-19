import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { registerHooks } from "node:module";

registerHooks({resolve(specifier,context,nextResolve){if(specifier==="./project-store"&&context.parentURL?.endsWith("/src/lib/ffmpeg-renderer.ts"))return nextResolve("./project-store.ts",context);return nextResolve(specifier,context);}});
const root=mkdtempSync(join(tmpdir(),"ccai-render-test-"));process.env.CCAI_DATABASE_PATH=join(root,"projects.sqlite");
try{
  const store=await import("../src/lib/project-store.ts"),renderer=await import("../src/lib/ffmpeg-renderer.ts");
  const imageFile=join(root,"test.png"),audioFile=join(root,"test.wav");
  for(const args of [["-y","-f","lavfi","-i","color=c=navy:s=320x240:d=0.1","-frames:v","1",imageFile],["-y","-f","lavfi","-i","sine=frequency=440:duration=0.8","-ar","44100","-ac","1",audioFile]])assert.equal(spawnSync("ffmpeg",args,{stdio:"ignore"}).status,0,"fixture FFmpeg invocation should succeed");
  const audio=`data:audio/wav;base64,${readFileSync(audioFile).toString("base64")}`,image=`data:image/png;base64,${readFileSync(imageFile).toString("base64")}`;
  const project=store.createProject("Render fixture",{scriptApproved:true,scenes:[{id:"scene-1",approved:true,image,voiceSegments:[{id:"voice-1",approved:true,status:"completed",durationSeconds:.8,dataUrl:audio}]}]});
  const transitions=["cut","crossfade","wipe","slide","zoom","fade-black"],starts=[0,.9,1.3,1.7,2.1,2.5];
  const images=transitions.map((transition,i)=>({id:`image-${i}`,sourceRef:"image:scene-1",start:starts[i],duration:.4,sourceOffset:0,timing:"estimated",motion:i%2?"pan-right":"zoom-in",transitionIn:transition,transitionDuration:.2}));
  const manifest={version:1,timeUnit:"seconds",duration:2.9,tracks:[
    {id:"images",kind:"image",clips:images},
    {id:"captions",kind:"caption",clips:[{id:"caption-gap",sourceRef:"caption:gap",start:1,duration:.4,sourceOffset:0,text:"GAP CAPTION",timing:"estimated",motion:"none",transitionIn:"cut"}]},
    {id:"narration",kind:"narration",clips:[{id:"voice-clip",sourceRef:"voice:voice-1",start:.7,duration:.3,sourceOffset:0,text:"Delayed line",timing:"estimated",motion:"none",transitionIn:"cut"}]},
    {id:"dialogue",kind:"dialogue",clips:[]},
  ]};
  assert.equal(renderer.validateRenderManifest(manifest),true,"every accepted transition should validate");
  const outside=(kind,clip)=>({version:1,timeUnit:"seconds",duration:1,tracks:[{id:"images",kind:"image",clips:[{id:"image-ok",sourceRef:"image:scene-1",start:0,duration:.5,sourceOffset:0,timing:"estimated",motion:"none",transitionIn:"cut"}]},{id:"speech",kind:"narration",clips:[]},{id:"captions",kind:"caption",clips:[]},{id:"target",kind,clips:[clip]}]});
  assert.equal(renderer.validateRenderManifest(outside("image",{id:"image-late",sourceRef:"image:scene-1",start:.9,duration:.2,sourceOffset:0,timing:"estimated",motion:"none",transitionIn:"cut"})),false,"image end cannot exceed manifest duration");
  assert.equal(renderer.validateRenderManifest(outside("narration",{id:"audio-late",sourceRef:"voice:voice-1",start:.9,duration:.2,sourceOffset:0,timing:"estimated",motion:"none",transitionIn:"cut"})),false,"audio end cannot exceed manifest duration");
  assert.equal(renderer.validateRenderManifest(outside("caption",{id:"caption-late",sourceRef:"caption:late",start:.9,duration:.2,sourceOffset:0,text:"late",timing:"estimated",motion:"none",transitionIn:"cut"})),false,"caption end cannot exceed manifest duration");
  const omittedSpeech=structuredClone(manifest);omittedSpeech.tracks.find(track=>track.kind==="narration").clips=[];
  assert.throws(()=>renderer.createRenderJob({projectId:project.id,manifest:omittedSpeech,format:"landscape",fps:30}),/every approved project voice segment exactly once/,"a manifest cannot silently omit approved project speech");
  const mismatchedSpeech=structuredClone(manifest);mismatchedSpeech.tracks.find(track=>track.kind==="narration").clips[0].sourceRef="voice:unknown";
  assert.throws(()=>renderer.createRenderJob({projectId:project.id,manifest:mismatchedSpeech,format:"landscape",fps:30}),/not approved and complete/,"a manifest cannot substitute unrelated speech media");
  const incomplete=store.createProject("Incomplete voice fixture",{scriptApproved:true,scenes:[{id:"scene-1",approved:true,image,voiceSegments:[{id:"voice-1",approved:false,status:"completed",durationSeconds:.8,dataUrl:audio}]}]});
  assert.throws(()=>renderer.createRenderJob({projectId:incomplete.id,manifest,format:"landscape",fps:30}),/Every scene voice segment/,"unapproved audio must not bypass the render approval gate");

  const job=renderer.createRenderJob({projectId:project.id,manifest,format:"landscape",fps:30});
  const queued=[];for(let i=0;i<5;i++){const next=renderer.createRenderJob({projectId:project.id,manifest,format:"landscape",fps:30});queued.push(next);assert.equal(next.status,"queued");}
  assert.throws(()=>renderer.createRenderJob({projectId:project.id,manifest,format:"landscape",fps:30}),/queue is full/);
  const canceled=renderer.cancelRenderJob(queued[0].id);assert.equal(canceled.status,"cancelled");
  for(const waiting of queued.slice(1))renderer.cancelRenderJob(waiting.id);
  const deadline=Date.now()+120000;let state,lastProgress=0;
  do{await new Promise(resolve=>setTimeout(resolve,250));state=renderer.getRenderJob(job.id);assert.ok(state);assert.ok(state.progress>=lastProgress,"render progress must be monotonic");lastProgress=state.progress;if(["completed","failed","cancelled"].includes(state.status))break;}while(Date.now()<deadline);
  assert.equal(state.status,"completed",state.error||"render should complete locally");
  const output=await renderer.readRenderOutput(job.id);assert.equal(output.subarray(4,8).toString(),"ftyp");const result=join(root,"result.mp4");writeFileSync(result,output);
  const probe=spawnSync("ffprobe",["-v","error","-show_entries","format=duration:stream=codec_type,width,height","-of","default=noprint_wrappers=1",result],{encoding:"utf8"});assert.equal(probe.status,0,probe.stderr);assert.match(probe.stdout,/width=1920/);assert.match(probe.stdout,/height=1080/);assert.match(probe.stdout,/codec_type=audio/);assert.match(probe.stdout,/duration=2\.9/);
  const extract=spawnSync("ffmpeg",["-v","error","-ss","1.1","-i",result,"-vf","crop=1920:300:0:780,format=rgb24","-frames:v","1","-f","rawvideo","pipe:1"],{maxBuffer:8*1024*1024});assert.equal(extract.status,0);let bright=0;for(let i=0;i<extract.stdout.length;i+=3)if(extract.stdout[i]>225&&extract.stdout[i+1]>225&&extract.stdout[i+2]>225)bright++;assert.ok(bright>50,"caption should be rendered at its absolute timeline time across the image gap");
  const pcm=spawnSync("ffmpeg",["-v","error","-i",result,"-map","0:a:0","-f","s16le","-acodec","pcm_s16le","-ac","1","-ar","8000","pipe:1"],{maxBuffer:2*1024*1024});assert.equal(pcm.status,0);const samples=pcm.stdout;
  const rms=(start,end)=>{let sum=0,n=0;for(let i=Math.floor(start*8000)*2;i<Math.min(samples.length,Math.floor(end*8000)*2);i+=2){const x=samples.readInt16LE(i)/32768;sum+=x*x;n++;}return Math.sqrt(sum/Math.max(1,n));};
  assert.ok(rms(.1,.55)<.005,"audio should remain silent before its absolute timeline start");assert.ok(rms(.8,.95)>.02,"delayed audio should be audible after its timeline start");
  const smallRange=renderer.parseRenderByteRange("bytes=0-99",output.length);assert.deepEqual(smallRange,{valid:true,partial:true,start:0,end:99});
  assert.equal(renderer.parseRenderByteRange("bytes=999999999-",output.length).valid,false);assert.equal(renderer.parseRenderByteRange("bytes=-100",output.length).end,output.length-1);
  const portraitManifest={version:1,timeUnit:"seconds",duration:.4,tracks:[{id:"images",kind:"image",clips:[{id:"portrait-image",sourceRef:"image:scene-1",start:0,duration:.4,sourceOffset:0,timing:"estimated",motion:"none",transitionIn:"cut"}]},{id:"captions",kind:"caption",clips:[]},{id:"voice",kind:"narration",clips:[{id:"portrait-voice",sourceRef:"voice:voice-1",start:0,duration:.4,sourceOffset:0,timing:"estimated",motion:"none",transitionIn:"cut"}]},{id:"dialogue",kind:"dialogue",clips:[]}]};
  const portraitJob=renderer.createRenderJob({projectId:project.id,manifest:portraitManifest,format:"portrait",fps:60});let portraitState;
  do{await new Promise(resolve=>setTimeout(resolve,250));portraitState=renderer.getRenderJob(portraitJob.id);if(["completed","failed","cancelled"].includes(portraitState.status))break;}while(Date.now()<deadline);
  assert.equal(portraitState.status,"completed",portraitState.error||"portrait 60fps render should complete");const portrait=join(root,"portrait.mp4");writeFileSync(portrait,await renderer.readRenderOutput(portraitJob.id));
  const portraitProbe=spawnSync("ffprobe",["-v","error","-select_streams","v:0","-show_entries","stream=width,height,avg_frame_rate","-of","default=noprint_wrappers=1",portrait],{encoding:"utf8"});assert.equal(portraitProbe.status,0,portraitProbe.stderr);assert.match(portraitProbe.stdout,/width=1080/);assert.match(portraitProbe.stdout,/height=1920/);assert.match(portraitProbe.stdout,/avg_frame_rate=60\/1/);
  const longManifest={version:1,timeUnit:"seconds",duration:20,tracks:[{id:"images",kind:"image",clips:[{id:"long-image",sourceRef:"image:scene-1",start:0,duration:20,sourceOffset:0,timing:"estimated",motion:"zoom-in",transitionIn:"cut"}]},{id:"captions",kind:"caption",clips:[]},{id:"voice",kind:"narration",clips:[{id:"long-voice",sourceRef:"voice:voice-1",start:0,duration:.3,sourceOffset:0,timing:"estimated",motion:"none",transitionIn:"cut"}]},{id:"dialogue",kind:"dialogue",clips:[]}]};
  const active=renderer.createRenderJob({projectId:project.id,manifest:longManifest,format:"landscape",fps:30});let activeState;
  do{await new Promise(resolve=>setTimeout(resolve,10));activeState=renderer.getRenderJob(active.id);}while(activeState.status==="queued"&&Date.now()<deadline);
  assert.equal(activeState.status,"running");assert.equal(renderer.cancelRenderJob(active.id).status,"running");
  do{await new Promise(resolve=>setTimeout(resolve,50));activeState=renderer.getRenderJob(active.id);}while(["queued","running"].includes(activeState.status)&&Date.now()<deadline);
  assert.equal(activeState.status,"cancelled","active FFmpeg render should stop on cancellation");
  const badAudioProject=store.createProject("Retry fixture",{scriptApproved:true,scenes:[{id:"scene-1",approved:true,image,voiceSegments:[{id:"voice-1",approved:true,status:"completed",durationSeconds:.8,dataUrl:"data:audio/wav;base64,@"}]}]});
  const failed=renderer.createRenderJob({projectId:badAudioProject.id,manifest:portraitManifest,format:"portrait",fps:30});let failedState;
  do{await new Promise(resolve=>setTimeout(resolve,100));failedState=renderer.getRenderJob(failed.id);if(["completed","failed","cancelled"].includes(failedState.status))break;}while(Date.now()<deadline);
  assert.equal(failedState.status,"failed");const saved=store.getProject(badAudioProject.id);store.updateProject(badAudioProject.id,{payload:{...saved.payload,scenes:[{...saved.payload.scenes[0],voiceSegments:[{...saved.payload.scenes[0].voiceSegments[0],dataUrl:audio}]}]}});
  const retried=renderer.retryRenderJob(failed.id);assert.ok(retried);let retryState;
  do{await new Promise(resolve=>setTimeout(resolve,100));retryState=renderer.getRenderJob(retried.id);if(["completed","failed","cancelled"].includes(retryState.status))break;}while(Date.now()<deadline);
  assert.equal(retryState.status,"completed",retryState.error||"retry should complete after saved media is repaired");
  console.log("PASS transitions, both formats, gate/timing, queue/cancel/retry, monotonic progress, and byte-range parsing");
}finally{rmSync(root,{recursive:true,force:true});}
