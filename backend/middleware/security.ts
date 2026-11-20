export class HttpError extends Error { status:number; constructor(status:number,message:string){super(message);this.status=status;} }
export const SITE_ORIGIN="https://strategic-souls.vishnukota20071005.workers.dev";
/** O(1). Mutations must be same-origin JSON; no cookie-derived form writes. */
export function protectMutation(request:Request,maxBytes=32768):void{
  const origin=request.headers.get("origin");
  if(!origin||origin!==new URL(request.url).origin)throw new HttpError(403,"Cross-origin request rejected.");
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))throw new HttpError(415,"JSON content type required.");
  const length=Number(request.headers.get("content-length")||0);
  if(length>maxBytes)throw new HttpError(413,"Request too large.");
}
/** O(b), bounded to 4096 bytes even for chunked transfer. */
export async function body(request:Request,maxBytes=4096):Promise<Record<string,unknown>>{
  const reader=request.body?.getReader();if(!reader)throw new HttpError(400,"JSON body required.");let total=0;const parts:Uint8Array[]=[];
  while(true){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>maxBytes){await reader.cancel();throw new HttpError(413,"Request too large.");}parts.push(value);}
  const bytes=new Uint8Array(total);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
  try{const value=JSON.parse(new TextDecoder().decode(bytes));if(!value||Array.isArray(value)||typeof value!=="object")throw new Error();return value;}catch{throw new HttpError(400,"Invalid JSON object.");}
}
export function assertOwner(owned:boolean):void{if(!owned)throw new HttpError(404,"Record not found.");}
export function assertAdultConsent(accepted:boolean):void{if(!accepted)throw new HttpError(403,"Adult confirmation and privacy consent are required.");}
export const DISABLED_FEATURES=new Set(["payments","subscribe","trade","advice","feed","publish","social","recommendations"]);
