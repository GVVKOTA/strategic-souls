'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import Link from 'next/link';
import {ExternalLink,ShieldCheck,RefreshCw} from 'lucide-react';
import {WIDGET_SCRIPT,widgetConfiguration,widgetSource,type WidgetKind} from '../../lib/tradingview';

/** Isolated vendor-hosted display. Never reads frame content, prices, messages or network data. */
export function TradingViewWidget({kind,symbol,title}:{kind:WidgetKind;symbol?:string;title:string}){
 const host=useRef<HTMLDivElement>(null),[enabled,setEnabled]=useState(false),[attempt,retry]=useState(0);
 const [stage,setStage]=useState<'idle'|'loading'|'frame'|'blocked'>('idle');
 const config=useMemo(()=>{try{return widgetConfiguration(kind,symbol);}catch{return null;}},[kind,symbol]);
 useEffect(()=>{
  if(!enabled||!config||!host.current)return;
  const root=host.current;let stopped=false,timer:ReturnType<typeof setTimeout>|undefined,observer:MutationObserver|undefined;
  const mount=()=>{
   if(stopped)return;
   setStage('loading');
   const container=document.createElement('div');container.className='tradingview-widget-container';container.style.height='100%';container.style.width='100%';
   const surface=document.createElement('div');surface.className='tradingview-widget-container__widget';surface.style.height='100%';surface.style.width='100%';container.appendChild(surface);
   const script=document.createElement('script');script.src=WIDGET_SCRIPT[kind];script.async=true;script.type='text/javascript';script.textContent=JSON.stringify(config);
   const fail=()=>{if(!stopped)setStage('blocked');};
   script.onerror=fail;
   observer=new MutationObserver(()=>{
    // Inspect only our container's frame element to add an accessible title and load handler.
    // Cross-origin frame content is never accessed, scraped or used for calculations.
    const frame=container.querySelector('iframe');if(!frame)return;
    frame.title=title;frame.setAttribute('loading','lazy');
    frame.addEventListener('load',()=>{if(!stopped){clearTimeout(timer);setStage('frame');}},{once:true});
    observer?.disconnect();
   });
   observer.observe(container,{childList:true,subtree:true});
   root.replaceChildren(container);container.appendChild(script);
   timer=setTimeout(fail,15000);
  };
  const intersection=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){intersection?.disconnect();mount();}},{rootMargin:'120px'});
  if(intersection)intersection.observe(root);else mount();
  const policy=(event:SecurityPolicyViolationEvent)=>{if(event.blockedURI.includes('tradingview')){clearTimeout(timer);if(!stopped)setStage('blocked');}};
  document.addEventListener('securitypolicyviolation',policy);
  return ()=>{stopped=true;clearTimeout(timer);observer?.disconnect();intersection?.disconnect();document.removeEventListener('securitypolicyviolation',policy);root.replaceChildren();};
 },[enabled,config,kind,title,attempt]);
 const label=kind==='overview'?'market overview':kind==='calendar'?'economic calendar':'chart';
 return <section className={'tv-surface tv-'+kind} aria-label={title}>
  <div className="tv-heading"><div><span className="eyebrow">OFFICIAL TRADINGVIEW / DISPLAY ONLY</span><h2>{title}</h2></div><span className="badge">TIMING VARIES</span></div>
  <p className="tv-timing">{kind==='calendar'?'Calendar times and revisions are shown by TradingView. This is a human-viewing calendar; no event API is connected.':'Data timing varies by exchange/provider — see chart source. Stock exchange data may be delayed; some symbols are unavailable in widgets.'}</p>{kind==='overview'&&<p className="micro">BTCUSDT uses Binance spot as an explicitly selected display venue. The original watchlist venue remains unverified.</p>}
  {!enabled&&<div className="tv-consent"><ShieldCheck size={26}/><h3>A wider view, on your terms.</h3><p>Loading this {label} contacts TradingView and shares your IP address, this page URL and the selected public symbols. Your Souls and holdings stay in GVV.</p><button className="secondary" disabled={!config} onClick={()=>setEnabled(true)}>Load TradingView {label}</button><Link href="/trust">Third-party privacy details</Link></div>}
  {enabled&&<><p role="status" className="tv-status">{stage==='blocked'?'The embed could not be confirmed. Your browser, network or this host may block it. Use the source link below.':stage==='frame'?'TradingView frame opened. Check symbol availability and timing inside the widget.':'Opening the official widget…'}</p><div ref={host} className="tv-host"/><div className="tv-actions"><button className="text-button" onClick={()=>retry(n=>n+1)}><RefreshCw size={14}/>Retry widget</button><button className="text-button" onClick={()=>{setEnabled(false);setStage('idle');}}>Unload third-party widget</button></div></>}
  <div className="tradingview-widget-copyright"><a href={widgetSource(kind,symbol)} target="_blank" rel="noopener noreferrer">{kind==='calendar'?'Economic Calendar':'Track all markets'} on TradingView <ExternalLink size={13}/></a></div>
  <p className="micro">Vendor-hosted human viewing. GVV does not receive widget prices or events. Charts do not power scans, alerts, portfolio values or outcomes.</p>
 </section>;
}
