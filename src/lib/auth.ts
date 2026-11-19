import { getSession } from "./auth-store";
export type SessionUser={id:string;email:string};
export async function getSessionUser(request:Request):Promise<SessionUser|null>{
  const cookie=request.headers.get("cookie")||"";const token=cookie.split(";").map(x=>x.trim()).find(x=>x.startsWith("ccai_session="))?.slice("ccai_session=".length);
  if(!token)return null;try{return getSession(decodeURIComponent(token));}catch{return null;}
}
/** Mutations authenticated by cookies must carry an exact same-origin Origin header. */
export function isSameOriginMutation(request:Request):boolean{
  const origin=request.headers.get("origin");if(!origin)return false;
  try{return new URL(origin).origin===new URL(request.url).origin;}catch{return false;}
}
export function sessionCookie(token:string,expiresAt:string,request:Request):string{
  const secure=new URL(request.url).protocol==="https:"||process.env.NODE_ENV==="production";
  return `ccai_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Expires=${new Date(expiresAt).toUTCString()}${secure?"; Secure":""}`;
}
export function clearSessionCookie(request:Request):string{
  const secure=new URL(request.url).protocol==="https:"||process.env.NODE_ENV==="production";
  return `ccai_session=; Path=/; HttpOnly; SameSite=Strict; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0${secure?"; Secure":""}`;
}
/** Read JSON request bytes with a hard streaming cap, including requests without Content-Length. */
export async function readBoundedRequestText(request:Request,maxBytes:number):Promise<string>{
  const declared=Number(request.headers.get("content-length")||0);if(Number.isFinite(declared)&&declared>maxBytes)throw new Error("REQUEST_BODY_TOO_LARGE");
  if(!request.body)return"";const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw new Error("REQUEST_BODY_TOO_LARGE");}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return new TextDecoder().decode(bytes);
}
