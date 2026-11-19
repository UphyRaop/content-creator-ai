import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { copyFile, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getProject } from "./project-store";
import { calculateDerivedAudioTimeline, createPostProductionProject, createPostProductionRevision, validatePostAudioTracks, type PostAudioTrack, type PostProductionRevision } from "./post-production";

/** Node server runtime only: requires FFmpeg (libx264) and ffprobe on PATH, or CCAI_FFMPEG_PATH/CCAI_FFPROBE_PATH. Jobs are process-local; static Pages hosting cannot run these routes. */
export type RenderStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type RenderJob = { id:string; projectId:string; status:RenderStatus; progress:number; createdAt:string; updatedAt:string; error?:string; outputBytes?:number; durationSeconds?:number; kind?:"timeline"|"post-production"; parentRenderJobId?:string; parentRenderVersion?:string; revisionId?:string; revisionNumber?:number; originalRenderRef?:string; derivedVideoRef?:string|null };
export type RenderByteRange = { valid:boolean; partial:boolean; start:number; end:number };
/** Parse one HTTP byte range for the MP4 preview route; invalid/multiple ranges are rejected. */
export function parseRenderByteRange(header:string|null,size:number):RenderByteRange {
  if(!Number.isSafeInteger(size)||size<0)return {valid:false,partial:false,start:0,end:0};
  if(!header)return {valid:true,partial:false,start:0,end:Math.max(0,size-1)};
  const match=/^bytes=(\d*)-(\d*)$/.exec(header);if(!match||(!match[1]&&!match[2])||size===0)return {valid:false,partial:true,start:0,end:0};
  let start:number,end=size-1;
  if(!match[1]){const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)return {valid:false,partial:true,start:0,end:0};start=Math.max(0,size-suffix);}else start=Number(match[1]);
  if(match[1]&&match[2])end=Number(match[2]);if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=size||end<start)return {valid:false,partial:true,start:0,end:0};
  return {valid:true,partial:true,start,end:Math.min(end,size-1)};
}
type Clip = {id:string;sourceRef:string;start:number;duration:number;sourceOffset:number;text?:string;timing:string;motion:string;transitionIn:string;transitionDuration?:number;motionIntensity?:number;motionDuration?:number;cameraStart?:{x:number;y:number;scale:number};cameraEnd?:{x:number;y:number;scale:number}};
type Manifest = {version:1;timeUnit:"seconds";duration:number;tracks:Array<{id:string;kind:string;clips:Clip[]}>};
type TimelineJobInput={manifest:Manifest;format:"landscape"|"portrait";fps:30|60};
type PostAudioFile={track:PostAudioTrack;path:string};
type PostJobInput={sourceRenderJobId:string;parentRenderVersion:string;revisionId:string;revision:PostProductionRevision;originalDurationSeconds:number;audioFiles:PostAudioFile[]};
export type PostProductionAudioUpload={track:PostAudioTrack;dataUrl:string};
type JobState = {public:RenderJob; dir:string; output:string; process?:ChildProcess; cancelled:boolean; input?:TimelineJobInput; postInput?:PostJobInput};
const globals = globalThis as typeof globalThis & {ccaiRenderJobs?:Map<string,JobState>;ccaiRenderQueue?:string[];ccaiRenderActive?:boolean};
const jobs = globals.ccaiRenderJobs ||= new Map();
const queue = globals.ccaiRenderQueue ||= [];
const MAX_QUEUED=5, MAX_CLIPS=100, MAX_DURATION=300, MAX_DATA_URL=14_000_000;
const MAX_POST_AUDIO_TRACKS=12, MAX_POST_AUDIO_BYTES=24*1024*1024, MAX_POST_AUDIO_FILE_BYTES=8*1024*1024;

export function validateRenderManifest(value: unknown): value is Manifest {
  if(!value||typeof value!=="object"||Array.isArray(value))return false;
  const m=value as Record<string,unknown>;
  if(m.version!==1||m.timeUnit!=="seconds"||!Number.isFinite(m.duration)||Number(m.duration)<=0||Number(m.duration)>MAX_DURATION||!Array.isArray(m.tracks)||m.tracks.length>16)return false;
  let count=0; const ids=new Set<string>(), speech:Array<{start:number;end:number}>=[];
  for(const rt of m.tracks){if(!rt||typeof rt!=="object"||Array.isArray(rt))return false;const t=rt as Record<string,unknown>;
    if(typeof t.id!=="string"||!t.id||! ["image","narration","dialogue","caption"].includes(String(t.kind))||!Array.isArray(t.clips))return false;
    for(const rc of t.clips){count++;if(count>MAX_CLIPS||!rc||typeof rc!=="object"||Array.isArray(rc))return false;const c=rc as Record<string,unknown>;
      if(typeof c.id!=="string"||!c.id||ids.has(c.id)||typeof c.sourceRef!=="string"||c.sourceRef.length>500||!c.sourceRef||!Number.isFinite(c.start)||!Number.isFinite(c.duration)||!Number.isFinite(c.sourceOffset)||Number(c.start)<0||Number(c.duration)<=0||Number(c.start)+Number(c.duration)>MAX_DURATION||Number(c.start)+Number(c.duration)>Number(m.duration)||Number(c.sourceOffset)<0||![c.start,c.duration,c.sourceOffset].every(n=>Math.abs(Number(n)*1000-Math.round(Number(n)*1000))<1e-7))return false;
      ids.add(c.id);
      if(c.text!==undefined&&(typeof c.text!=="string"||c.text.length>12000))return false;
      if(c.transitionDuration!==undefined&&(!Number.isFinite(c.transitionDuration)||Number(c.transitionDuration)<0||Number(c.transitionDuration)>5))return false;
      if(c.motionIntensity!==undefined&&(!Number.isFinite(c.motionIntensity)||Number(c.motionIntensity)<0||Number(c.motionIntensity)>1))return false;
      if(c.motionDuration!==undefined&&(!Number.isFinite(c.motionDuration)||Number(c.motionDuration)<.1||Number(c.motionDuration)>120||Math.abs(Number(c.motionDuration)*1000-Math.round(Number(c.motionDuration)*1000))>=1e-7))return false;
      if(c.transitionDuration!==undefined&&Math.abs(Number(c.transitionDuration)*1000-Math.round(Number(c.transitionDuration)*1000))>=1e-7)return false;
      if(!["estimated","word-level"].includes(String(c.timing))||!["none","zoom-in","zoom-out","pan-left","pan-right","pan-up","pan-down"].includes(String(c.motion))||!["cut","crossfade","fade-black","wipe","slide","zoom"].includes(String(c.transitionIn)))return false;
      const pointOk=(p:any)=>p&&typeof p==="object"&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.scale)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1&&p.scale>=.1&&p.scale<=10;
      if((c.cameraStart!==undefined&&!pointOk(c.cameraStart))||(c.cameraEnd!==undefined&&!pointOk(c.cameraEnd)))return false;
      if((c.cameraStart===undefined)!==(c.cameraEnd===undefined))return false;
      if(t.kind!=="image"&&(c.motionIntensity!==undefined||c.motionDuration!==undefined||c.cameraStart!==undefined||c.cameraEnd!==undefined))return false;
      if(t.kind==="image"&&c.sourceRef.startsWith("image:")){} else if((t.kind==="narration"||t.kind==="dialogue")&&c.sourceRef.startsWith("voice:")){} else if(t.kind==="caption"){} else return false;
      if(t.kind==="narration"||t.kind==="dialogue")speech.push({start:Number(c.start),end:Number(c.start)+Number(c.duration)});
    }
  }
  speech.sort((a,b)=>a.start-b.start);for(let i=1;i<speech.length;i++)if(speech[i-1].end>speech[i].start)return false;
  return m.tracks.some((x:any)=>x.kind==="image"&&x.clips.length>0);
}

/**
 * Return the canonical approval hash for a supported render manifest. Object key
 * order is ignored, track/clip order is preserved, and timeline times are
 * normalized to the model's explicit 0.001-second precision.
 */
export function hashRenderManifest(value: unknown): string {
  if (!validateRenderManifest(value)) throw new Error("Cannot hash an invalid render manifest.");
  const m=value as Manifest;
  const round=(n:number)=>Math.round(n*1000)/1000;
  const normalized={
    version:1,
    timeUnit:"seconds",
    duration:round(m.duration),
    tracks:m.tracks.map(track=>({
      id:track.id,kind:track.kind,
      clips:track.clips.map(clip=>({
        id:clip.id,sourceRef:clip.sourceRef,start:round(clip.start),duration:round(clip.duration),sourceOffset:round(clip.sourceOffset),
        ...(clip.text===undefined?{}:{text:clip.text}),timing:clip.timing,motion:clip.motion,transitionIn:clip.transitionIn,
        ...(clip.transitionDuration===undefined?{}:{transitionDuration:round(clip.transitionDuration)}),
        ...(clip.motionIntensity===undefined?{}:{motionIntensity:clip.motionIntensity}),
        ...(clip.motionDuration===undefined?{}:{motionDuration:round(clip.motionDuration)}),
        ...(clip.cameraStart===undefined?{}:{cameraStart:{x:clip.cameraStart.x,y:clip.cameraStart.y,scale:clip.cameraStart.scale}}),
        ...(clip.cameraEnd===undefined?{}:{cameraEnd:{x:clip.cameraEnd.x,y:clip.cameraEnd.y,scale:clip.cameraEnd.scale}}),
      })),
    })),
  };
  const canonical=(item:unknown):string=>Array.isArray(item)?`[${item.map(canonical).join(",")}]`:item&&typeof item==="object"?`{${Object.keys(item as Record<string,unknown>).sort().map(key=>`${JSON.stringify(key)}:${canonical((item as Record<string,unknown>)[key])}`).join(",")}}`:JSON.stringify(item);
  return createHash("sha256").update(canonical(normalized),"utf8").digest("hex");
}

function decodeDataUrl(value:unknown, kind:"image"|"audio"):Buffer {
  if(typeof value!=="string"||value.length>MAX_DATA_URL)throw new Error("Referenced project media is missing or too large.");
  const pattern=kind==="image"?/^data:image\/(png|jpeg|webp|gif);base64,([a-z0-9+/]+=*)$/i:/^data:audio\/(wav|mpeg|mp3|mp4|x-m4a|aac|ogg|webm|x-wav);base64,([a-z0-9+/]+=*)$/i;
  const match=pattern.exec(value);if(!match)throw new Error(`Invalid ${kind} asset encoding.`);const data=Buffer.from(match[2],"base64");if(!data.length)throw new Error(`Empty ${kind} asset.`);return data;
}
function assetsFor(projectId:string,manifest:Manifest) {
  const project=getProject(projectId);if(!project)throw new Error("Project not found.");const p=project.payload;
  if(p.scriptApproved!==true)throw new Error("Approve the script before rendering.");
  const timeline=p.timeline&&typeof p.timeline==="object"&&!Array.isArray(p.timeline)?p.timeline as Record<string,any>:null;
  const approval=timeline?.renderApproval&&typeof timeline.renderApproval==="object"&&!Array.isArray(timeline.renderApproval)?timeline.renderApproval as Record<string,unknown>:null;
  const approvedHash=approval?.manifestHash;
  if(approval?.approved!==true||typeof approvedHash!=="string"||! /^[a-f0-9]{64}$/i.test(approvedHash)||approvedHash.toLowerCase()!==hashRenderManifest(manifest))throw new Error("Approve this exact timeline manifest before rendering.");
  const scenes=Array.isArray(p.scenes)?p.scenes as Array<Record<string,any>>:[];
  if(!scenes.length||scenes.some(s=>s.approved!==true||!s.image))throw new Error("Every image must be approved before rendering.");
  const voice=new Map<string,string>();for(const s of scenes){const lines=Array.isArray(s.voiceSegments)?s.voiceSegments:[];if(!lines.length)throw new Error("Every scene needs approved completed speech audio before rendering.");for(const v of lines){const src=typeof v.dataUrl==="string"?v.dataUrl:v.versions?.find((x:any)=>typeof x.dataUrl==="string")?.dataUrl;if(v.approved!==true||v.status!=="completed"||v.needsGeneration||!src)throw new Error("Every scene voice segment must be approved, completed, and backed by audio before rendering.");voice.set(`voice:${v.id}`,src);}}
  const images=new Map(scenes.map(s=>[`image:${s.id}`,s.image as string]));
  const wanted=[...manifest.tracks.flatMap(t=>t.clips.map(c=>({kind:t.kind,ref:c.sourceRef})))];
  for(const item of wanted){if(item.kind==="image"&&!images.has(item.ref))throw new Error("Manifest references an image outside this project.");if((item.kind==="narration"||item.kind==="dialogue")&&!voice.has(item.ref))throw new Error("Manifest references audio that is not approved and complete.");}
  const referenced=wanted.filter(x=>x.kind==="narration"||x.kind==="dialogue").map(x=>x.ref);
  if(referenced.length!==voice.size||new Set(referenced).size!==voice.size||[...voice.keys()].some(ref=>!referenced.includes(ref)))throw new Error("Render manifest must include every approved project voice segment exactly once.");
  return {images,voice};
}
function run(args:string[],state:JobState):Promise<void>{return new Promise((resolve,reject)=>{const ff=process.env.CCAI_FFMPEG_PATH||"ffmpeg";const child=spawn(ff,args,{stdio:["ignore","ignore","pipe"]});state.process=child;let err="";child.stderr?.on("data",chunk=>{err=(err+String(chunk)).slice(-4000);const match=/time=([0-9:.]+)/.exec(err);if(match){const parts=match[1].split(":").map(Number);const sec=parts.at(-1)!+(parts.at(-2)||0)*60+(parts.at(-3)||0)*3600;state.public.progress=Math.min(95,Math.max(state.public.progress,Math.round(sec/MAX_DURATION*100)));state.public.updatedAt=new Date().toISOString();}});child.on("error",reject);child.on("close",code=>{state.process=undefined;if(state.cancelled)reject(new Error("Render cancelled."));else if(code===0)resolve();else reject(new Error(`FFmpeg failed (${code}): ${err.slice(-3000)}`));});});}
function escDrawtext(s:string){return s.replace(/\\/g,"\\\\").replace(/:/g,"\\:").replace(/'/g,"\\'").replace(/%/g,"\\%").replace(/\[/g,"\\[").replace(/\]/g,"\\]").replace(/,/g,"\\,");}
async function render(state:JobState,manifest:Manifest,format:"landscape"|"portrait",fps:30|60){
  const projectId=state.public.projectId;const assets=assetsFor(projectId,manifest);const width=format==="portrait"?1080:1920,height=format==="portrait"?1920:1080;const imageTrack=manifest.tracks.find(t=>t.kind==="image")!;const imageClips=[...imageTrack.clips].sort((a,b)=>a.start-b.start);const audio=manifest.tracks.filter(t=>t.kind==="narration"||t.kind==="dialogue").flatMap(t=>t.clips);
  state.public.status="running";state.public.progress=1;state.public.durationSeconds=manifest.duration;state.public.updatedAt=new Date().toISOString();let index=0,visualCursor=0;const segments:Array<{path:string;duration:number;transition:string;transitionDuration?:number}>=[];
  for(const clip of imageClips){
    visualCursor=Math.round(visualCursor*1000)/1000;
    if(clip.start<visualCursor)throw new Error("Overlapping image clips are not supported by the local renderer; use a transition setting on the incoming clip.");
    if(clip.start>visualCursor){if(state.cancelled)throw new Error("Render cancelled.");const gap=clip.start-visualCursor,path=join(state.dir,`gap-${index}.mp4`),frames=Math.max(1,Math.round(gap*fps));await run(["-y","-f","lavfi","-i",`color=c=black:s=${width}x${height}:r=${fps}:d=${gap}`,"-frames:v",String(frames),"-an","-c:v","libx264","-preset","veryfast","-pix_fmt","yuv420p",path],state);segments.push({path,duration:gap,transition:"cut"});visualCursor=clip.start;index++;}
    if(state.cancelled)throw new Error("Render cancelled.");const input=join(state.dir,`image-${index}.bin`),output=join(state.dir,`segment-${index}.mp4`);await writeFile(input,decodeDataUrl(assets.images.get(clip.sourceRef),"image"));if(state.cancelled)throw new Error("Render cancelled.");
    const seconds=clip.duration,frames=Math.max(1,Math.round(seconds*fps)),activeFrames=Math.max(1,Math.round(Math.min(seconds,clip.motionDuration??seconds)*fps)),power=clip.motionIntensity??.35;let zoom="1", cameraX="0.5",cameraY="0.5";
    if(clip.cameraStart&&clip.cameraEnd){zoom=`${clip.cameraStart.scale}+(${(clip.cameraEnd.scale-clip.cameraStart.scale)*power})*min(on/${activeFrames},1)`;cameraX=`${clip.cameraStart.x}+(${(clip.cameraEnd.x-clip.cameraStart.x)*power})*min(on/${activeFrames},1)`;cameraY=`${clip.cameraStart.y}+(${(clip.cameraEnd.y-clip.cameraStart.y)*power})*min(on/${activeFrames},1)`;}
    else if(clip.motion==="zoom-in")zoom=`1+${.18*power}*min(on/${activeFrames},1)`;else if(clip.motion==="zoom-out")zoom=`1+${.18*power}*(1-min(on/${activeFrames},1))`;else if(clip.motion==="pan-left")cameraX=`0.5-${.16*power}*min(on/${activeFrames},1)`;else if(clip.motion==="pan-right")cameraX=`0.5+${.16*power}*min(on/${activeFrames},1)`;else if(clip.motion==="pan-up")cameraY=`0.5-${.16*power}*min(on/${activeFrames},1)`;else if(clip.motion==="pan-down")cameraY=`0.5+${.16*power}*min(on/${activeFrames},1)`;
    let vf=`scale=${width*2}:${height*2}:force_original_aspect_ratio=increase,crop=${width*2}:${height*2},zoompan=z='${zoom}':x='(iw-iw/zoom)*(${cameraX})':y='(ih-ih/zoom)*(${cameraY})':d=${frames}:s=${width}x${height}:fps=${fps},setsar=1`;
    if(clip.transitionIn==="fade-black"){const td=Math.min(clip.transitionDuration??.35,seconds/2);if(td>0)vf+=`,fade=t=in:st=0:d=${td},fade=t=out:st=${Math.max(0,seconds-td)}:d=${td}`;}
    vf+=",format=yuv420p";
    // A single still frame is expanded by zoompan's d=frames; looping the image input here multiplies frames.
    const args=["-y","-i",input,"-vf",vf,"-frames:v",String(frames),"-r",String(fps),"-c:v","libx264","-preset","veryfast","-pix_fmt","yuv420p","-an",output];await run(args,state);segments.push({path:output,duration:seconds,transition:clip.transitionIn,transitionDuration:clip.transitionDuration});visualCursor=Math.round((clip.start+seconds)*1000)/1000;index++;state.public.progress=Math.max(state.public.progress,Math.round(index/imageTrack.clips.length*45));
  }
  if(visualCursor<manifest.duration){const gap=manifest.duration-visualCursor,path=join(state.dir,"tail-black.mp4"),frames=Math.max(1,Math.round(gap*fps));await run(["-y","-f","lavfi","-i",`color=c=black:s=${width}x${height}:r=${fps}:d=${gap}`,"-frames:v",String(frames),"-an","-c:v","libx264","-preset","veryfast","-pix_fmt","yuv420p",path],state);segments.push({path,duration:gap,transition:"cut"});}
  const video=join(state.dir,"video.mp4");
  if(segments.some(c=>["crossfade","wipe","slide","zoom"].includes(c.transition))){
    let previousPath=segments[0].path,chainDuration=segments[0].duration;
    for(let i=1;i<segments.length;i++){
      const clip=segments[i],transition=({crossfade:"fade",wipe:"wipeleft",slide:"slideleft",zoom:"zoomin",cut:"fade","fade-black":"fadeblack"} as Record<string,string>)[clip.transition];
      const requested=clip.transition==="cut"?1/fps:(clip.transitionDuration??.35),duration=Math.min(requested,segments[i-1].duration/2,clip.duration/2);
      const output=join(state.dir,`transition-${i}.mp4`),offset=Math.max(0,chainDuration-duration),total=chainDuration+clip.duration;
      const graph=`[0:v][1:v]xfade=transition=${transition}:duration=${duration}:offset=${offset}[xf];[xf]tpad=stop_mode=clone:stop_duration=${duration},trim=duration=${total}[vout]`;
      // Encode each transition boundary before the next one so the following xfade receives a constant-frame-rate stream.
      await run(["-y","-i",previousPath,"-i",clip.path,"-filter_complex",graph,"-map","[vout]","-an","-r",String(fps),"-c:v","libx264","-preset","veryfast","-pix_fmt","yuv420p",output],state);
      chainDuration=total;previousPath=output;
    }
    await run(["-y","-i",previousPath,"-t",String(manifest.duration),"-an","-c:v","copy",video],state);
  }else{
    const list=join(state.dir,"concat.txt");await writeFile(list,segments.map(x=>`file '${x.path.replace(/'/g,"'\\''")}'`).join("\n"));await run(["-y","-f","concat","-safe","0","-i",list,"-c","copy",video],state);
  }
  const args=["-y","-i",video], filters:string[]=[];let ix=1;
  const captions=manifest.tracks.find(t=>t.kind==="caption")?.clips||[];let captionIndex=0,captionInput="0:v";
  for(const caption of captions){if(!caption.text)continue;const file=join(state.dir,`caption-final-${captionIndex}.txt`),label=`cap${captionIndex++}`;await writeFile(file,caption.text.replace(/[\r\n]+/g," "));filters.push(`[${captionInput}]drawtext=textfile=${file}:fontsize=${Math.round(height*.045)}:fontcolor=white:borderw=2:bordercolor=black:x=(w-text_w)/2:y=h-text_h-${Math.round(height*.06)}:box=1:boxcolor=black@0.35:boxborderw=12:enable='between(t,${caption.start},${caption.start+caption.duration})'[${label}]`);captionInput=label;}
  if(captionIndex)filters.push(`[${captionInput}]null[vout]`);
  for(const clip of audio){if(state.cancelled)throw new Error("Render cancelled.");const src=assets.voice.get(clip.sourceRef)!;const media=join(state.dir,`audio-${ix}.bin`);await writeFile(media,decodeDataUrl(src,"audio"));args.push("-i",media);const delay=Math.max(0,Math.round(clip.start*1000));filters.push(`[${ix}:a]atrim=start=${clip.sourceOffset}:duration=${clip.duration},asetpts=PTS-STARTPTS,adelay=${delay}|${delay}[a${ix}]`);ix++;}
  const hasCaptions=captionIndex>0;
  if(audio.length){filters.push(`${audio.map((_,i)=>`[a${i+1}]`).join("")}amix=inputs=${audio.length}:duration=longest:normalize=0,apad=pad_dur=${manifest.duration},atrim=duration=${manifest.duration}[aout]`);args.push("-filter_complex",filters.join(";"),"-map",hasCaptions?"[vout]":"0:v","-map","[aout]");}else if(hasCaptions)args.push("-filter_complex",filters.join(";"),"-map","[vout]","-an");else args.push("-map","0:v","-an");
  args.push("-t",String(manifest.duration),...(hasCaptions?["-c:v","libx264","-preset","veryfast","-pix_fmt","yuv420p"]:["-c:v","copy"]),...(audio.length?["-c:a","aac","-b:a","192k"]:[]),"-movflags","+faststart",state.output);await run(args,state);
  if(state.cancelled)throw new Error("Render cancelled.");const result=await stat(state.output);if(result.size<1024)throw new Error("FFmpeg output validation failed.");
  const probe=await new Promise<string>((resolve,reject)=>{const child=spawn(process.env.CCAI_FFPROBE_PATH||"ffprobe",["-v","error","-show_entries","format=duration:stream=codec_type,width,height","-of","json",state.output],{stdio:["ignore","pipe","pipe"]});let out="",err="";child.stdout?.on("data",x=>out+=String(x));child.stderr?.on("data",x=>err+=String(x));child.on("error",reject);child.on("close",code=>code===0?resolve(out):reject(new Error(`ffprobe failed: ${err.slice(-400)}`)));});
  const metadata=JSON.parse(probe) as {format?:{duration?:string};streams?:Array<{codec_type?:string;width?:number;height?:number}>};const expectedW=format==="portrait"?1080:1920,expectedH=format==="portrait"?1920:1080;
  if(!metadata.streams?.some(s=>s.codec_type==="video"&&s.width===expectedW&&s.height===expectedH)||!Number(metadata.format?.duration)||Math.abs(Number(metadata.format!.duration)-manifest.duration)>.15||(audio.length&&!metadata.streams?.some(s=>s.codec_type==="audio")))throw new Error("FFprobe rejected the output: expected playable MP4 streams, dimensions, and duration were not present.");
  state.public.status="completed";state.public.progress=100;state.public.outputBytes=result.size;state.public.derivedVideoRef=`render-job:${state.public.id}`;state.public.updatedAt=new Date().toISOString();
}
type ProbeInfo={format?:{duration?:string};streams?:Array<{codec_type?:string;width?:number;height?:number;duration?:string}>};
async function probeFile(filename:string):Promise<ProbeInfo>{
  const result=await new Promise<string>((resolve,reject)=>{const child=spawn(process.env.CCAI_FFPROBE_PATH||"ffprobe",["-v","error","-show_entries","format=duration:stream=codec_type,width,height,duration","-of","json",filename],{stdio:["ignore","pipe","pipe"]});let out="",err="";child.stdout?.on("data",chunk=>out+=String(chunk));child.stderr?.on("data",chunk=>err+=String(chunk));child.on("error",reject);child.on("close",code=>code===0?resolve(out):reject(new Error(`ffprobe failed: ${err.slice(-400)}`)));});
  return JSON.parse(result) as ProbeInfo;
}
async function renderPostProduction(state:JobState,input:PostJobInput){
  state.public.status="running";state.public.progress=Math.max(state.public.progress,1);state.public.updatedAt=new Date().toISOString();
  const sourceJob=getRenderJob(input.sourceRenderJobId),sourcePath=getRenderOutputFile(input.sourceRenderJobId);
  if(!sourceJob||sourceJob.status!=="completed"||!sourcePath||sourceJob.createdAt!==input.parentRenderVersion)throw new Error("The parent render is unavailable or its version changed.");
  const baseProbe=await probeFile(sourcePath),videoStream=baseProbe.streams?.find(s=>s.codec_type==="video");
  const videoDuration=Number(baseProbe.format?.duration);if(!videoStream||!Number.isFinite(videoDuration)||videoDuration<=0)throw new Error("The parent MP4 failed source validation.");
  const enabled=input.audioFiles.filter(x=>x.track.enabled);
  for(const item of input.audioFiles){if(state.cancelled)throw new Error("Render cancelled.");const probe=await probeFile(item.path),audio=probe.streams?.find(s=>s.codec_type==="audio"),measured=Number(probe.format?.duration);
    if(!audio||!Number.isFinite(measured)||Math.abs(measured-item.track.actualDurationSeconds)>.1)throw new Error(`Uploaded audio duration or stream validation failed for track ${item.track.id}.`);
  }
  const postProject=createPostProductionProject({id:sourceJob.id,version:sourceJob.createdAt,sourceRef:`render-job:${sourceJob.id}`,durationSeconds:input.originalDurationSeconds});
  const revision=input.revision;
  const plan=calculateDerivedAudioTimeline({...postProject,revisions:[revision],activeRevisionId:revision.id});
  const outputDuration=plan.outputDurationSeconds,videoTail=Math.max(0,outputDuration-videoDuration),audioStream=baseProbe.streams?.some(s=>s.codec_type==="audio");
  if(!audioStream)throw new Error("The parent MP4 has no audio stream to preserve.");
  if(state.cancelled)throw new Error("Render cancelled.");state.public.progress=Math.max(state.public.progress,2);state.public.durationSeconds=outputDuration;state.public.revisionId=revision.id;state.public.parentRenderJobId=sourceJob.id;state.public.parentRenderVersion=sourceJob.createdAt;state.public.kind="post-production";state.public.updatedAt=new Date().toISOString();
  const args=["-y","-i",sourcePath];for(const item of enabled)args.push("-i",item.path);
  const filters:string[]=[`[0:a]aresample=48000,aformat=channel_layouts=stereo,apad,atrim=duration=${outputDuration}[base]`];
  const layerLabels=new Map<string,string>();let inputIndex=1;
  for(const item of enabled){if(state.cancelled)throw new Error("Render cancelled.");const t=item.track,label=`layer_${inputIndex}`;let chain=`[${inputIndex}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=start=${t.sourceOffsetSeconds}:duration=${t.durationSeconds},asetpts=PTS-STARTPTS,volume=${t.volume}`;
    if(t.fadeInSeconds>0)chain+=`,afade=t=in:st=0:d=${t.fadeInSeconds}`;
    if(t.fadeOutSeconds>0)chain+=`,afade=t=out:st=${Math.max(0,t.durationSeconds-t.fadeOutSeconds)}:d=${t.fadeOutSeconds}`;
    chain+=`,adelay=${Math.round(t.startSeconds*1000)}:all=1[${label}]`;filters.push(chain);layerLabels.set(t.id,label);inputIndex++;
  }
  const mixedLabels:string[]=[];
  for(let trackIndex=0;trackIndex<enabled.length;trackIndex++){const item=enabled[trackIndex],t=item.track,sourceLabel=layerLabels.get(t.id)!;if(t.ducking.enabled){const targets=t.ducking.targetTrackIds.map(id=>layerLabels.get(id));if(targets.some(x=>!x))throw new Error("Ducking target is not present in the enabled audio mix.");
      let sidechain=targets[0]!;if(targets.length>1){sidechain=`side_${trackIndex}`;filters.push(`${targets.map(x=>`[${x}]`).join("")}amix=inputs=${targets.length}:duration=longest:normalize=0[${sidechain}]`);}
      const ducked=`duck_${trackIndex}`,ratio=(1+t.ducking.amount*19).toFixed(3);filters.push(`[${sourceLabel}][${sidechain}]sidechaincompress=threshold=${t.ducking.threshold}:ratio=${ratio}:attack=${Math.max(.01,t.ducking.attackSeconds*1000)}:release=${Math.max(.01,t.ducking.releaseSeconds*1000)}:makeup=1[${ducked}]`);mixedLabels.push(ducked);
    }else mixedLabels.push(sourceLabel);
  }
  const mixInputs=["base",...mixedLabels];filters.push(`${mixInputs.map(x=>`[${x}]`).join("")}amix=inputs=${mixInputs.length}:duration=longest:normalize=0,alimiter=limit=0.98,apad,atrim=duration=${outputDuration}[mixed]`);
  const hasVideoTail=videoTail>.001;
  if(hasVideoTail)filters.push(`[0:v]tpad=stop_mode=clone:stop_duration=${videoTail},trim=duration=${outputDuration}[vout]`);
  args.push("-filter_complex",filters.join(";"),...(hasVideoTail?["-map","[vout]","-c:v","libx264","-preset","veryfast","-pix_fmt","yuv420p"]:["-map","0:v","-c:v","copy"]),"-map","[mixed]","-t",String(outputDuration),"-c:a","aac","-b:a","192k","-movflags","+faststart",state.output);
  await run(args,state);if(state.cancelled)throw new Error("Render cancelled.");
  const result=await stat(state.output),metadata=await probeFile(state.output);
  if(state.cancelled)throw new Error("Render cancelled.");
  if(result.size<1024||!metadata.streams?.some(s=>s.codec_type==="video"&&s.width===videoStream.width&&s.height===videoStream.height)||!metadata.streams?.some(s=>s.codec_type==="audio")||Math.abs(Number(metadata.format?.duration)-outputDuration)>.15)throw new Error("FFprobe rejected the derived MP4 output.");
  state.public.status="completed";state.public.progress=100;state.public.outputBytes=result.size;state.public.derivedVideoRef=`render-job:${state.public.id}`;state.public.updatedAt=new Date().toISOString();if(state.postInput)state.postInput.revision={...state.postInput.revision,derivedVideoRef:state.public.derivedVideoRef};
}
function cleanupLater(state:JobState){setTimeout(()=>{if(state.dir)void rm(state.dir,{recursive:true,force:true}).catch(()=>{});jobs.delete(state.public.id);},60*60*1000).unref?.();}
export function createRenderJob(input:{projectId:string;manifest:unknown;format:"landscape"|"portrait";fps:30|60}):RenderJob{
  if(queue.length>=MAX_QUEUED)throw new Error("The render queue is full.");if(!/^[a-f0-9-]{20,80}$/i.test(input.projectId))throw new Error("Invalid project ID.");
  if(!["landscape","portrait"].includes(input.format)||![30,60].includes(input.fps))throw new Error("Invalid render settings.");
  if(!validateRenderManifest(input.manifest))throw new Error("Invalid render settings or timeline manifest.");
  assetsFor(input.projectId,input.manifest);const id=randomUUID(),createdAt=new Date().toISOString();
  const renderInput={manifest:input.manifest as Manifest,format:input.format,fps:input.fps};
  const state:JobState={public:{id,projectId:input.projectId,status:"queued",progress:0,createdAt,updatedAt:createdAt,durationSeconds:input.manifest.duration,kind:"timeline",derivedVideoRef:null},dir:"",output:"",cancelled:false,input:renderInput};jobs.set(id,state);
  queue.push(id);scheduleNext();return state.public;
}
/** Stages bounded user audio against a completed in-memory render job; no caller-supplied path is accepted. */
export async function createPostProductionExportJob(input:{sourceRenderJobId:string;parentRenderVersion:string;revisionId:string;audioAssets:PostProductionAudioUpload[]}):Promise<RenderJob>{
  if(queue.length>=MAX_QUEUED)throw new Error("The render queue is full.");
  if(typeof input.sourceRenderJobId!=="string"||input.sourceRenderJobId.length>120||typeof input.revisionId!=="string"||!input.revisionId||input.revisionId.length>120)throw new Error("Invalid parent render or revision ID.");
  const source=getRenderJob(input.sourceRenderJobId),sourcePath=getRenderOutputFile(input.sourceRenderJobId);
  if(!source||source.status!=="completed"||!sourcePath)throw new Error("The source render must be completed and available.");
  if(input.parentRenderVersion!==source.createdAt)throw new Error("The source render version does not match the completed job.");
  if(!Array.isArray(input.audioAssets)||input.audioAssets.length>MAX_POST_AUDIO_TRACKS)throw new Error("Post-production supports up to 12 imported audio tracks.");
  if(input.audioAssets.some(asset=>!asset||typeof asset.dataUrl!=="string"))throw new Error("Each audio layer must include an uploaded audio file.");
  const tracks=input.audioAssets.map(asset=>asset?.track);
  if(!validatePostAudioTracks(tracks))throw new Error("Invalid post-production audio tracks or ducking targets.");
  const trackIds=new Set(tracks.map(track=>track.id));if(trackIds.size!==tracks.length)throw new Error("Each audio layer must have one uploaded audio asset.");
  const byteBuffers:Buffer[]=[];let totalBytes=0;
  for(const asset of input.audioAssets){const data=decodeDataUrl(asset.dataUrl,"audio");if(data.length>MAX_POST_AUDIO_FILE_BYTES)throw new Error("Each uploaded audio file must be 8 MiB or smaller.");totalBytes+=data.length;if(totalBytes>MAX_POST_AUDIO_BYTES)throw new Error("Post-production audio uploads exceed the 24 MiB total limit.");byteBuffers.push(data);}
  const sourceMetadata=await probeFile(sourcePath),duration=Number(sourceMetadata.format?.duration);if(!Number.isFinite(duration)||duration<=0||duration>3600)throw new Error("The source render has an invalid duration.");
  const postProject=createPostProductionProject({id:source.id,version:source.createdAt,sourceRef:`render-job:${source.id}`,durationSeconds:duration});
  const revisedProject=createPostProductionRevision(postProject,{id:input.revisionId,createdAt:new Date().toISOString(),audioTracks:tracks}),revision=revisedProject.revisions.at(-1)!;
  const plan=calculateDerivedAudioTimeline(revisedProject);
  if(queue.length>=MAX_QUEUED)throw new Error("The render queue is full.");
  const dir=await mkdtemp(join(tmpdir(),"ccai-postprod-"));try{if(queue.length>=MAX_QUEUED)throw new Error("The render queue is full.");const audioFiles:PostAudioFile[]=[];for(let i=0;i<input.audioAssets.length;i++){const path=join(dir,`audio-${i}.bin`);await writeFile(path,byteBuffers[i],{flag:"wx"});audioFiles.push({track:tracks[i],path});}
    const id=randomUUID(),createdAt=new Date().toISOString(),postInput:PostJobInput={sourceRenderJobId:source.id,parentRenderVersion:source.createdAt,revisionId:revision.id,revision,originalDurationSeconds:duration,audioFiles};
    const state:JobState={public:{id,projectId:source.projectId,status:"queued",progress:0,createdAt,updatedAt:createdAt,durationSeconds:plan.outputDurationSeconds,kind:"post-production",parentRenderJobId:source.id,parentRenderVersion:source.createdAt,revisionId:revision.id,revisionNumber:revision.revisionNumber,originalRenderRef:revision.originalRenderRef,derivedVideoRef:null},dir,output:"",cancelled:false,postInput};jobs.set(id,state);queue.push(id);scheduleNext();return state.public;
  }catch(error){await rm(dir,{recursive:true,force:true});throw error;}
}
function scheduleNext(){if(globals.ccaiRenderActive)return;let id:string|undefined;while(queue.length&&!id){const candidate=queue.shift()!,state=jobs.get(candidate);if(state?.public.status==="queued"&&!state.cancelled)id=candidate;}if(!id)return;const state=jobs.get(id)!;globals.ccaiRenderActive=true;void (state.dir?Promise.resolve(state.dir):mkdtemp(join(tmpdir(),"ccai-render-"))).then(dir=>{state.dir=dir;state.output=join(dir,"output.mp4");return state.postInput?renderPostProduction(state,state.postInput):render(state,state.input!.manifest,state.input!.format,state.input!.fps);}).catch(async error=>{state.public.status=state.cancelled?"cancelled":"failed";state.public.error=error instanceof Error?error.message:"Render failed.";state.public.updatedAt=new Date().toISOString();if(state.dir&&!state.postInput)await rm(state.dir,{recursive:true,force:true}).catch(()=>{});}).finally(()=>{cleanupLater(state);globals.ccaiRenderActive=false;scheduleNext();});}
export function getRenderJob(id:string){return jobs.get(id)?.public||null;}
export function cancelRenderJob(id:string){const state=jobs.get(id);if(!state||!["queued","running"].includes(state.public.status))return null;state.cancelled=true;if(state.public.status==="queued"){state.public.status="cancelled";state.public.error="Render cancelled while queued.";state.public.updatedAt=new Date().toISOString();const queuedAt=queue.indexOf(id);if(queuedAt>=0)queue.splice(queuedAt,1);cleanupLater(state);scheduleNext();}else state.process?.kill("SIGTERM");return state.public;}
export function retryRenderJob(id:string){const old=jobs.get(id);if(!old||!old.public.error||!["failed","cancelled"].includes(old.public.status)||!old.input)return null;return createRenderJob({projectId:old.public.projectId,...old.input});}
export async function retryRenderJobAsync(id:string):Promise<RenderJob|null>{const old=jobs.get(id);if(!old||!old.public.error||!["failed","cancelled"].includes(old.public.status))return null;if(!old.postInput)return retryRenderJob(id);if(queue.length>=MAX_QUEUED)throw new Error("The render queue is full.");
  const dir=await mkdtemp(join(tmpdir(),"ccai-render-")),audioFiles:PostAudioFile[]=[];try{for(let i=0;i<old.postInput.audioFiles.length;i++){const source=old.postInput.audioFiles[i],path=join(dir,`audio-${i}.bin`);await copyFile(source.path,path);audioFiles.push({...source,path});}}
  catch(error){await rm(dir,{recursive:true,force:true});throw error;}
  if(queue.length>=MAX_QUEUED){await rm(dir,{recursive:true,force:true});throw new Error("The render queue is full.");}
  const jobId=randomUUID(),createdAt=new Date().toISOString(),postInput={...old.postInput,audioFiles};const state:JobState={public:{id:jobId,projectId:old.public.projectId,status:"queued",progress:0,createdAt,updatedAt:createdAt,durationSeconds:old.public.durationSeconds,kind:"post-production",parentRenderJobId:postInput.sourceRenderJobId,parentRenderVersion:postInput.parentRenderVersion,revisionId:postInput.revisionId,revisionNumber:postInput.revision.revisionNumber,originalRenderRef:postInput.revision.originalRenderRef,derivedVideoRef:null},dir,output:"",cancelled:false,postInput};jobs.set(jobId,state);queue.push(jobId);scheduleNext();return state.public;
}
export function getRenderOutputFile(id:string){const state=jobs.get(id);return state?.public.status==="completed"?state.output:null;}
export async function readRenderOutput(id:string){const state=jobs.get(id);if(!state||state.public.status!=="completed")return null;return readFile(state.output);}
