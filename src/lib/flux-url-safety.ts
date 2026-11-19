/** Exact server-configured hosts only; redirects are rejected when downloading outputs. */
export function validateFluxOutputUrl(value:string,configuredHosts:string[]):URL {
  let url:URL;try{url=new URL(value);}catch{throw new Error("FLUX returned an invalid image URL.");}
  const hosts=new Set(configuredHosts.map(host=>host.trim().toLowerCase()).filter(Boolean));
  if(url.protocol!=="https:"||url.username||url.password||url.port||!hosts.has(url.hostname.toLowerCase()))throw new Error("FLUX returned an untrusted image URL.");
  return url;
}
