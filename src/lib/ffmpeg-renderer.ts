import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getProject } from "./project-store";

/** Node server runtime only: requires FFmpeg (libx264) and ffprobe on PATH, or CCAI_FFMPEG_PATH/CCAI_FFPROBE_PATH. Jobs are process-local; static Pages hosting cannot run these routes. */
export type RenderStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type RenderJob = { id:string; projectId:string; status:RenderStatus; progress:number; createdAt:string; updatedAt:string; error?:string; outputBytes?:number };
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
type JobState = {public:RenderJob; dir:string; output:string; process?:ChildProcess; cancelled:boolean; input:{manifest:Manifest;format:"landscape"|"portrait";fps:30|60}};
const globals = globalThis as typeof globalThis & {ccaiRenderJobs?:Map<string,JobState>;ccaiRenderQueue?:string[];ccaiRenderActive?:boolean};
const jobs = globals.ccaiRenderJobs ||= new Map();
const queue = globals.ccaiRenderQueue ||= [];
const MAX_QUEUED=5, MAX_CLIPS=100, MAX_DURATION=300, MAX_DATA_URL=14_000_000;

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

function decodeDataUrl(value:unknown, kind:"image"|"audio"):Buffer {
  if(typeof value!=="string"||value.length>MAX_DATA_URL)throw new Error("Referenced project media is missing or too large.");
  const pattern=kind==="image"?/^data:image\/(png|jpeg|webp|gif);base64,([a-z0-9+/]+=*)$/i:/^data:audio\/(wav|mpeg|mp3|mp4|x-m4a|aac|ogg|webm|x-wav);base64,([a-z0-9+/]+=*)$/i;
  const match=pattern.exec(value);if(!match)throw new Error(`Invalid ${kind} asset encoding.`);const data=Buffer.from(match[2],"base64");if(!data.length)throw new Error(`Empty ${kind} asset.`);return data;
}
function assetsFor(projectId:string,manifest:Manifest) {
  const project=getProject(projectId);if(!project)throw new Error("Project not found.");const p=project.payload;
  if(p.scriptApproved!==true)throw new Error("Approve the script before rendering.");
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
  state.public.status="running";state.public.progress=1;state.public.updatedAt=new Date().toISOString();let index=0,visualCursor=0;const segments:Array<{path:string;duration:number;transition:string;transitionDuration?:number}>=[];
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
  state.public.status="completed";state.public.progress=100;state.public.outputBytes=result.size;state.public.updatedAt=new Date().toISOString();
}
function cleanupLater(state:JobState){setTimeout(()=>{if(state.dir)void rm(state.dir,{recursive:true,force:true}).catch(()=>{});jobs.delete(state.public.id);},60*60*1000).unref?.();}
export function createRenderJob(input:{projectId:string;manifest:unknown;format:"landscape"|"portrait";fps:30|60}):RenderJob{
  if(queue.length>=MAX_QUEUED)throw new Error("The render queue is full.");if(!/^[a-f0-9-]{20,80}$/i.test(input.projectId))throw new Error("Invalid project ID.");
  if(!["landscape","portrait"].includes(input.format)||![30,60].includes(input.fps))throw new Error("Invalid render settings.");
  if(!validateRenderManifest(input.manifest))throw new Error("Invalid render settings or timeline manifest.");
  assetsFor(input.projectId,input.manifest);const id=randomUUID(),createdAt=new Date().toISOString();
  const renderInput={manifest:input.manifest as Manifest,format:input.format,fps:input.fps};
  const state:JobState={public:{id,projectId:input.projectId,status:"queued",progress:0,createdAt,updatedAt:createdAt},dir:"",output:"",cancelled:false,input:renderInput};jobs.set(id,state);
  queue.push(id);scheduleNext();return state.public;
}
function scheduleNext(){if(globals.ccaiRenderActive)return;let id:string|undefined;while(queue.length&&!id){const candidate=queue.shift()!,state=jobs.get(candidate);if(state?.public.status==="queued"&&!state.cancelled)id=candidate;}if(!id)return;const state=jobs.get(id)!;globals.ccaiRenderActive=true;void mkdtemp(join(tmpdir(),"ccai-render-")).then(dir=>{state.dir=dir;state.output=join(dir,"output.mp4");return render(state,state.input.manifest,state.input.format,state.input.fps);}).catch(async error=>{state.public.status=state.cancelled?"cancelled":"failed";state.public.error=error instanceof Error?error.message:"Render failed.";state.public.updatedAt=new Date().toISOString();if(state.dir)await rm(state.dir,{recursive:true,force:true}).catch(()=>{});}).finally(()=>{cleanupLater(state);globals.ccaiRenderActive=false;scheduleNext();});}
export function getRenderJob(id:string){return jobs.get(id)?.public||null;}
export function cancelRenderJob(id:string){const state=jobs.get(id);if(!state||!["queued","running"].includes(state.public.status))return null;state.cancelled=true;if(state.public.status==="queued"){state.public.status="cancelled";state.public.error="Render cancelled while queued.";state.public.updatedAt=new Date().toISOString();const queuedAt=queue.indexOf(id);if(queuedAt>=0)queue.splice(queuedAt,1);scheduleNext();}else state.process?.kill("SIGTERM");return state.public;}
export function retryRenderJob(id:string){const old=jobs.get(id);if(!old||!old.public.error||!["failed","cancelled"].includes(old.public.status))return null;return createRenderJob({projectId:old.public.projectId,...old.input});}
export function getRenderOutputFile(id:string){const state=jobs.get(id);return state?.public.status==="completed"?state.output:null;}
export async function readRenderOutput(id:string){const state=jobs.get(id);if(!state||state.public.status!=="completed")return null;return readFile(state.output);}
