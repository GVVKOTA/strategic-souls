/** Deterministic synthetic adapter. No market API or generative AI is used. */
export const MODEL = "soul-demo-1.0.0";
export const SOURCE = { id: "gvv-synthetic-v1", title: "GVV synthetic scenario generator v1", type: "SYNTHETIC", licence: "Original generated demonstration data. No exchange data ingested.", reference: "/legal/data-sources" };
export const DATES = ["2026-10-09", "2026-10-12", "2026-10-15", "2026-10-19", "2026-10-23"];
export type Instrument = { symbol: string; name: string; sector: string; base: number; seed: number; drift: number };
export const INSTRUMENTS: Instrument[] = [
  {symbol:"AURORA",name:"Aurora Systems",sector:"Technology",base:1420,seed:2,drift:.0018},
  {symbol:"MERIDIAN",name:"Meridian Bank",sector:"Financials",base:820,seed:5,drift:.0007},
  {symbol:"PRISM",name:"Prism Healthcare",sector:"Healthcare",base:2180,seed:8,drift:.0014},
  {symbol:"VECTOR",name:"Vector Energy",sector:"Energy",base:340,seed:12,drift:-.0012},
  {symbol:"CIRRUS",name:"Cirrus Consumer",sector:"Consumer",base:760,seed:15,drift:.0004},
  {symbol:"ATLAS",name:"Atlas Infrastructure",sector:"Industrials",base:1680,seed:20,drift:.001},
  {symbol:"NOVA",name:"Nova Materials",sector:"Materials",base:510,seed:25,drift:-.0007},
  {symbol:"ORBIT",name:"Orbit Mobility",sector:"Industrials",base:940,seed:28,drift:.0011},
];
export type Point = { at: string; availableAt: string; close: number; volume: number };
const round = (x:number) => Math.round(x * 100) / 100;
const clamp = (x:number,low:number,high:number) => Math.min(high,Math.max(low,x));
export function cutoff(date:string):string {
  if(!DATES.includes(date)) throw new Error("Choose a supported demonstration snapshot.");
  return date+"T10:30:00.000Z";
}
/** O(n) time and space. Synthetic availability equals the observation time. */
export function series(instrument:Instrument, asOf:string):Point[] {
  const result:Point[]=[]; let price=instrument.base;
  for(let n=0;n<116;n++) {
    const time=new Date(Date.UTC(2026,6,1+n,10,30));
    if(time.getUTCDay()===0||time.getUTCDay()===6)continue;
    price*=1+instrument.drift+Math.sin(n*.73+instrument.seed)*.012+Math.cos(n*.23+instrument.seed*.3)*.007;
    const at=time.toISOString();
    result.push({at,availableAt:at,close:round(price),volume:Math.round((700000+instrument.seed*85000)*(1.15+Math.sin(n*.83+instrument.seed)*.42))});
  }
  return result.filter(p=>p.availableAt<=asOf&&p.at<=asOf);
}
export type Metrics = { last:number; change:number; momentum:number; volatility:number; relativeVolume:number; sma20:number; points:number };
/** O(n) time, O(n) space. Reject incomplete, non-finite or future input. */
export function metrics(points:Point[],asOf:string):Metrics {
  if(points.length<21)throw new Error("At least 21 eligible observations are required.");
  if(points.some(p=>p.at>asOf||p.availableAt>asOf||!Number.isFinite(p.close)||p.close<=0||!Number.isFinite(p.volume)||p.volume<=0))throw new Error("Invalid or future information rejected.");
  const tail=points.slice(-21),last=tail.at(-1)!;const returns=tail.slice(1).map((p,i)=>Math.log(p.close/tail[i].close));
  const mean=returns.reduce((a,b)=>a+b,0)/returns.length;
  const variance=returns.reduce((a,b)=>a+(b-mean)**2,0)/(returns.length-1);
  const averageVolume=tail.slice(0,-1).reduce((a,p)=>a+p.volume,0)/20;
  return {last:last.close,change:round((last.close/tail.at(-2)!.close-1)*100),momentum:round((last.close/tail.at(-6)!.close-1)*100),volatility:round(Math.sqrt(variance)*Math.sqrt(252)*100),relativeVolume:round(last.volume/averageVolume),sma20:round(tail.slice(1).reduce((a,p)=>a+p.close,0)/20),points:points.length};
}
export type Echo = {id:string; snapshotAt:string; similarity:number; state:string; outcome:string|null};
export type Soul = { id:string; createdAt:string; snapshotAt:string; horizon:number; modelVersion:string; source:typeof SOURCE; instrument:Instrument; inputs:Point[]; metrics:Metrics; score:number; components:{label:string;value:number;weight:number;formula:string}[]; baseState:string; keeper:{before:string;after:string;changes:string[];sample:number}; evidence:string[]; contradictions:string[]; unknowns:string[]; echoes:Echo[]; trace:{step:string;status:string;detail:string}[]; validation:{sampleSize:number; performance:string}; digest?:string };
export type Outcome = {soulId:string;recordedAt:string;availableAt:string;observedAt:string;change:number;status:"PERSISTED"|"CHANGED"|"INCONCLUSIVE";autopsy:string;failureDNA:string[];source:typeof SOURCE};
export function state(m:Metrics):string{return m.momentum>1?"Expanding momentum":m.momentum< -1?"Contracting momentum":"Mixed momentum";}
/** O(h log h) time and O(h) space; history is bounded to 200 records. */
export function eligibleEchoes(current:Metrics,asOf:string,history:{soul:Soul;outcome?:Outcome}[]):Echo[]{
  return history.filter(({soul})=>soul.snapshotAt<asOf&&soul.inputs.every(p=>p.availableAt<=soul.snapshotAt)).map(({soul,outcome})=>{
    const a=soul.metrics;const distance=Math.abs(a.momentum-current.momentum)/10+Math.abs(a.volatility-current.volatility)/50+Math.abs(a.relativeVolume-current.relativeVolume)/3;
    return {id:soul.id,snapshotAt:soul.snapshotAt,similarity:round(clamp(1-distance/3,0,1)*100),state:soul.baseState,outcome:outcome&&outcome.availableAt<=asOf?outcome.status:null};
  }).filter(e=>e.similarity>=50).sort((a,b)=>b.similarity-a.similarity).slice(0,5);
}
/** Base computation completes before Keeper. O(n + h log h) time/space. */
export function analyze(symbol:string,date:string,horizon:number,history:{soul:Soul;outcome?:Outcome}[]=[],createdAt=new Date().toISOString()):Soul {
  const instrument=INSTRUMENTS.find(x=>x.symbol===symbol);if(!instrument)throw new Error("Unknown demonstration instrument.");
  if(![1,3,5,20,60].includes(horizon))throw new Error("Unsupported horizon.");
  const snapshotAt=cutoff(date),inputs=series(instrument,snapshotAt),m=metrics(inputs,snapshotAt);
  const components=[
    {label:"Momentum magnitude",value:round(clamp(Math.abs(m.momentum)/5*100,0,100)),weight:.4,formula:"min(abs(5-session change) / 5 × 100, 100)"},
    {label:"Volume participation",value:round(clamp(m.relativeVolume/2*100,0,100)),weight:.3,formula:"min(relative volume / 2 × 100, 100)"},
    {label:"Trend alignment",value:Math.sign(m.momentum)===Math.sign(m.last-m.sma20)?100:0,weight:.3,formula:"100 when momentum and price vs SMA20 signs agree; otherwise 0"},
  ];
  const score=round(components.reduce((a,c)=>a+c.value*c.weight,0));const baseState=state(m);
  const echoes=eligibleEchoes(m,snapshotAt,history.filter(h=>h.soul.createdAt<createdAt));
  const failures=echoes.filter(e=>e.outcome==="CHANGED");
  const contradictions=[m.relativeVolume<1?"Current volume is below the prior 20-session mean.":"Above-average volume does not establish institutional participation.","Price-derived momentum and trend alignment are correlated evidence, not independent votes."];
  const changes=failures.length?[`${failures.length} eligible synthetic analogue(s) changed state. Keeper adds a persistence caution; the base state and rating remain unchanged.`]:["No eligible matured contradiction supports an adjustment. Keeper retains the base interpretation."];
  return {id:crypto.randomUUID(),createdAt,snapshotAt,horizon,modelVersion:MODEL,source:SOURCE,instrument,inputs,metrics:m,score,components,baseState,keeper:{before:baseState,after:failures.length?baseState+" · persistence caution":baseState,changes,sample:echoes.length},evidence:[`Five-session synthetic price change: ${m.momentum}%.`,`Relative volume: ${m.relativeVolume}× the prior 20-session mean.`,`Synthetic close ${m.last>=m.sma20?"above":"below"} the 20-session average (${m.sma20}).`],contradictions,unknowns:["Fundamentals, earnings, news, institutional flows and genuine sector breadth are unavailable.","Heuristic weights have not been calibrated. Rating measures this demo's observed evidence activity, not investment quality or profit probability.","No forward forecast, price target or personal portfolio assessment is produced."],echoes,trace:[{step:"Data rights",status:"COMPLETE",detail:"Original synthetic generator only; external ingestion blocked."},{step:"Point-in-time gate",status:"COMPLETE",detail:`${inputs.length} observations available at or before ${snapshotAt}.`},{step:"Quant engine",status:"COMPLETE",detail:"5-session change, sample log-return volatility, SMA20 and relative volume calculated."},{step:"Context",status:"UNAVAILABLE",detail:"No fabricated news, fundamentals or institutional context."},{step:"Keeper",status:"COMPLETE",detail:`${echoes.length} eligible earlier state(s); ${failures.length} known state changes. No generative AI called.`}],validation:{sampleSize:0,performance:"Unvalidated educational heuristic. No accuracy, return or backtest claims."}};
}
/** Separate append-only outcome; the creation-time record is never modified. */
export function evaluate(soul:Soul,recordedAt=new Date().toISOString()):Outcome {
  const all=series(soul.instrument,cutoff(DATES.at(-1)!));const at=all.findIndex(p=>p.at===soul.inputs.at(-1)!.at);const next=all[at+soul.horizon];
  if(!next||next.availableAt>recordedAt)throw new Error("Outcome horizon has not matured in the synthetic dataset.");
  const change=round((next.close/soul.metrics.last-1)*100);
  const direction=Math.sign(soul.metrics.momentum);const status=Math.abs(soul.metrics.momentum)<=1||Math.abs(change)<.1?"INCONCLUSIVE":Math.sign(change)===direction?"PERSISTED":"CHANGED";
  return {soulId:soul.id,recordedAt,observedAt:next.at,availableAt:next.availableAt,change,status,source:SOURCE,autopsy:status==="CHANGED"?"The synthetic horizon movement opposed the creation-time momentum sign. This demonstrates state persistence failure; it is not a failed trade or a financial performance statistic.":status==="PERSISTED"?"Synthetic horizon movement retained the earlier momentum sign. A single example provides no predictive validation.":"Mixed creation-time momentum or near-flat outcome prevents a directional persistence label.",failureDNA:status==="CHANGED"?[soul.metrics.relativeVolume<1?"Below-average participation":"Elevated participation",soul.metrics.volatility>15?"Higher variability":"Lower variability","Momentum state changed"]:[]};
}
export async function digest(payload:unknown):Promise<string>{const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(payload)));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("");}
export function market(date=DATES.at(-1)!){const at=cutoff(date);return INSTRUMENTS.map(instrument=>{const points=series(instrument,at);return {...instrument,metrics:metrics(points,at),points};});}
