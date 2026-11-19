/** Pure Phase 10 publishing data helpers; no AI, media generation, accounts, or publication calls. */
export type ThumbnailOrientation = "landscape" | "portrait";
export type ThumbnailStatus = "draft" | "approved" | "rejected";
export type ThumbnailVariantVersion = { id: string; text: string; prompt: string; assetRef: string; createdAt: string };
export type ThumbnailVariant = {
  id: string;
  orientation: ThumbnailOrientation;
  status: ThumbnailStatus;
  prompt: string;
  text: string;
  fontFamily: string;
  textColor: string;
  backgroundColor: string;
  brandKitId: string | null;
  referenceSceneIds: string[];
  assetRef: string;
  source: "simulated" | "upload";
  createdAt: string;
  versions: ThumbnailVariantVersion[];
};
export type PublishingMetadata = {
  platform: "youtube" | "tiktok" | "instagram" | "facebook";
  title: string;
  description: string;
  captions: string;
  hashtags: string[];
  keywords: string[];
  createdAt: string;
};
export type PublishingExport = {
  thumbnail: ThumbnailVariant;
  metadata: PublishingMetadata;
  generatedAt: string;
  autoPublish: false;
};

const MAX_VARIANTS=10, MIN_VARIANTS=6, MAX_VERSION_COUNT=100, MAX_SCENES=100, MAX_HASHTAGS=30, MAX_KEYWORDS=50;
const safeId=/^[A-Za-z0-9_-]{1,120}$/;
const hexColor=/^#[\da-f]{6}(?:[\da-f]{2})?$/i;
const MAX_UPLOAD_BYTES=2*1024*1024;
const imageDataUrl=/^data:image\/(?:png|jpeg|webp);base64,((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?)$/;
function validAssetRef(value:unknown,source?:unknown):value is string {
  if(typeof value!=="string")return false;
  const match=imageDataUrl.exec(value);
  if(match){const body=match[1];const padding=body.endsWith("==")?2:body.endsWith("=")?1:0;const decodedBytes=Math.floor(body.length*3/4)-padding;return decodedBytes>0&&decodedBytes<=MAX_UPLOAD_BYTES&&(source===undefined||source==="upload");}
  return value.length<=500&&value.startsWith("simulated:")&&(source===undefined||source==="simulated");
}

export function validateThumbnailVariant(value:unknown):value is ThumbnailVariant {
  if(!value||typeof value!=="object"||Array.isArray(value))return false;const v=value as Record<string,unknown>;
  if(typeof v.id!=="string"||!safeId.test(v.id)||!(v.orientation==="landscape"||v.orientation==="portrait")||!["draft","approved","rejected"].includes(String(v.status)))return false;
  if(typeof v.prompt!=="string"||v.prompt.length>4000||typeof v.text!=="string"||v.text.length>200||typeof v.fontFamily!=="string"||!v.fontFamily.trim()||v.fontFamily.length>100||typeof v.textColor!=="string"||!hexColor.test(v.textColor)||typeof v.backgroundColor!=="string"||!hexColor.test(v.backgroundColor))return false;
  if(v.brandKitId!==null&&(typeof v.brandKitId!=="string"||!safeId.test(v.brandKitId)))return false;
  if(!Array.isArray(v.referenceSceneIds)||v.referenceSceneIds.length>MAX_SCENES||v.referenceSceneIds.some(id=>typeof id!=="string"||!safeId.test(id))||new Set(v.referenceSceneIds).size!==v.referenceSceneIds.length)return false;
  if(!["simulated","upload"].includes(String(v.source))||!validAssetRef(v.assetRef,v.source)||!validDate(v.createdAt))return false;
  if(!Array.isArray(v.versions)||v.versions.length>MAX_VERSION_COUNT)return false;
  const versionIds=new Set<string>();for(const raw of v.versions){if(!raw||typeof raw!=="object"||Array.isArray(raw))return false;const x=raw as Record<string,unknown>;if(typeof x.id!=="string"||!safeId.test(x.id)||versionIds.has(x.id)||typeof x.text!=="string"||x.text.length>200||typeof x.prompt!=="string"||x.prompt.length>4000||!validAssetRef(x.assetRef)||!validDate(x.createdAt))return false;versionIds.add(x.id);}
  return true;
}
export function validateThumbnailVariants(value:unknown):value is ThumbnailVariant[]{
  if(!Array.isArray(value)||value.length<MIN_VARIANTS||value.length>MAX_VARIANTS||!value.every(validateThumbnailVariant)||new Set(value.map(v=>v.id)).size!==value.length)return false;
  const landscape=value.filter(v=>v.orientation==="landscape").length,portrait=value.length-landscape;
  return landscape>=3&&landscape<=5&&portrait>=3&&portrait<=5;
}

/** Build 3–5 editable local variations carrying explicit brand and reference-scene context. */
export function createSimulatedThumbnailVariants(input:{count:3|4|5;orientation:ThumbnailOrientation;prompt:string;text:string;fontFamily:string;textColor:string;backgroundColor:string;brandKitId:string|null;referenceSceneIds:string[];createdAt:string;idPrefix:string}):ThumbnailVariant[]{
  if(![3,4,5].includes(input.count)||!(input.orientation==="landscape"||input.orientation==="portrait")||typeof input.prompt!=="string"||input.prompt.length>4000||typeof input.text!=="string"||input.text.length>200||!input.idPrefix||!safeId.test(input.idPrefix)||!validDate(input.createdAt))throw new Error("Invalid simulated thumbnail request.");
  const variants=Array.from({length:input.count},(_,i)=>{
    const id=`${input.idPrefix}-${i+1}`;
    return {id,orientation:input.orientation,status:"draft" as const,prompt:`${input.prompt.trim()} (variation ${i+1})`,text:input.text,fontFamily:input.fontFamily,textColor:input.textColor,backgroundColor:input.backgroundColor,brandKitId:input.brandKitId,referenceSceneIds:[...input.referenceSceneIds],assetRef:`simulated:thumbnail:${id}`,source:"simulated" as const,createdAt:input.createdAt,versions:[]};
  });
  if(!variants.every(validateThumbnailVariant))throw new Error("Invalid thumbnail variation settings.");return variants;
}

function snapshot(v:ThumbnailVariant,id:string,createdAt:string):ThumbnailVariantVersion{return {id,text:v.text,prompt:v.prompt,assetRef:v.assetRef,createdAt};}
function indexOf(variants:ThumbnailVariant[],id:string){const i=variants.findIndex(v=>v.id===id);if(i<0)throw new Error("Thumbnail variant not found.");return i;}
function versionIdAvailable(v:ThumbnailVariant,id:string){if(!safeId.test(id)||v.versions.some(x=>x.id===id))throw new Error("Thumbnail version ID must be safe and unique.");}

/** Save the old view in history and return a new edited object. */
export function editThumbnailVariant(variants:ThumbnailVariant[],id:string,patch:Partial<Pick<ThumbnailVariant,"prompt"|"text"|"fontFamily"|"textColor"|"backgroundColor"|"brandKitId"|"referenceSceneIds"|"assetRef">>,version:{id:string;createdAt:string}):ThumbnailVariant[]{
  if(!validateThumbnailVariants(variants))throw new Error("Invalid thumbnail variants.");const i=indexOf(variants,id),current=variants[i];if(current.status==="approved")throw new Error("Approved thumbnail variants are locked; create a new variant to edit.");
  versionIdAvailable(current,version.id);if(!validDate(version.createdAt))throw new Error("Invalid thumbnail version timestamp.");
  const next={...current,...patch,referenceSceneIds:patch.referenceSceneIds?[...patch.referenceSceneIds]:[...current.referenceSceneIds],versions:[...current.versions,snapshot(current,version.id,version.createdAt)]};
  if(!validateThumbnailVariant(next))throw new Error("Invalid thumbnail edit.");return variants.map((v,n)=>n===i?next:v);
}

/** Explicit user selection creates the sole currently approved thumbnail. */
export function approveSelectedThumbnail(variants:ThumbnailVariant[],selectedId:string):ThumbnailVariant[]{
  if(!validateThumbnailVariants(variants))throw new Error("Choose from a valid set of 3–5 thumbnail variants.");const i=indexOf(variants,selectedId);
  return variants.map((v,n)=>n===i?{...v,status:"approved" as const}:v.status==="approved"?{...v,status:"draft" as const}:v);
}
export function rejectThumbnailVariant(variants:ThumbnailVariant[],selectedId:string):ThumbnailVariant[]{
  if(!validateThumbnailVariants(variants))throw new Error("Invalid thumbnail variants.");const i=indexOf(variants,selectedId);if(variants[i].status==="approved")throw new Error("An approved thumbnail cannot be rejected; select another unapproved variant.");
  return variants.map((v,n)=>n===i?{...v,status:"rejected" as const}:v);
}
/** Local regeneration touches one unapproved variant only; supplied asset refs remain simulated data records. */
export function regenerateThumbnailVariant(variants:ThumbnailVariant[],selectedId:string,input:{prompt:string;text:string;assetRef:string;versionId:string;createdAt:string}):ThumbnailVariant[]{
  if(!validateThumbnailVariants(variants))throw new Error("Invalid thumbnail variants.");const i=indexOf(variants,selectedId),current=variants[i];if(current.status==="approved")throw new Error("Regenerate an unapproved thumbnail only.");
  versionIdAvailable(current,input.versionId);if(!validDate(input.createdAt)||typeof input.prompt!=="string"||input.prompt.length>4000||typeof input.text!=="string"||input.text.length>200||!validAssetRef(input.assetRef,"simulated"))throw new Error("Invalid thumbnail regeneration inputs.");
  const next={...current,prompt:input.prompt,text:input.text,assetRef:input.assetRef,source:"simulated" as const,status:"draft" as const,createdAt:input.createdAt,versions:[...current.versions,snapshot(current,input.versionId,input.createdAt)]};
  return variants.map((v,n)=>n===i?next:v);
}

export function validatePublishingMetadata(value:unknown):value is PublishingMetadata {
  if(!value||typeof value!=="object"||Array.isArray(value))return false;const m=value as Record<string,unknown>;
  return ["youtube","tiktok","instagram","facebook"].includes(String(m.platform))&&typeof m.title==="string"&&m.title.trim().length>0&&m.title.length<=150&&typeof m.description==="string"&&m.description.length<=5000&&typeof m.captions==="string"&&m.captions.length<=12000&&validDate(m.createdAt)&&Array.isArray(m.hashtags)&&m.hashtags.length<=MAX_HASHTAGS&&m.hashtags.every(x=>typeof x==="string"&&x.replace(/^#/u,"").trim().length>0&&x.length<=100)&&new Set(m.hashtags.map(x=>String(x).replace(/^#/u,"").trim().toLowerCase())).size===m.hashtags.length&&Array.isArray(m.keywords)&&m.keywords.length<=MAX_KEYWORDS&&m.keywords.every(x=>typeof x==="string"&&x.trim().length>0&&x.length<=100)&&new Set(m.keywords.map(x=>String(x).trim().toLowerCase())).size===m.keywords.length;
}
/** Trim fields, add hashtag prefixes, and remove case-insensitive duplicates without publishing anything. */
export function normalizePublishingMetadata(input:PublishingMetadata):PublishingMetadata {
  if(!input||typeof input!=="object"||!Array.isArray(input.hashtags)||!Array.isArray(input.keywords))throw new Error("Invalid publishing metadata or platform limits exceeded.");
  const unique=(items:string[])=>items.map(x=>x.trim()).filter((x,i,a)=>a.findIndex(y=>y.toLowerCase()===x.toLowerCase())===i);
  const normalized={...input,title:input.title.trim(),description:input.description.trim(),captions:input.captions.trim(),hashtags:unique(input.hashtags.map(x=>x.startsWith("#")?x:`#${x}`)),keywords:unique(input.keywords)};
  if(!validatePublishingMetadata(normalized))throw new Error("Invalid publishing metadata or platform limits exceeded.");
  return normalized;
}

export function buildPublishingExport(variants:ThumbnailVariant[],selectedId:string,metadata:PublishingMetadata,generatedAt:string):PublishingExport {
  if(!validateThumbnailVariants(variants))throw new Error("A valid set of thumbnail variants is required.");const selected=variants.find(v=>v.id===selectedId);
  if(!selected||selected.status!=="approved"||variants.filter(v=>v.status==="approved").length!==1)throw new Error("Approve exactly one selected thumbnail before preparing the publishing export.");
  if(!validDate(generatedAt))throw new Error("Invalid export timestamp.");const normalized=normalizePublishingMetadata(metadata);
  return {thumbnail:{...selected,referenceSceneIds:[...selected.referenceSceneIds],versions:selected.versions.map(v=>({...v}))},metadata:normalized,generatedAt,autoPublish:false};
}
function validDate(value:unknown):value is string{return typeof value==="string"&&value.length<=40&&!Number.isNaN(Date.parse(value));}
