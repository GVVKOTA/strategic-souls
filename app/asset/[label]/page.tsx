import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireChatGPTUser} from '../../chatgpt-auth';
import {instrumentByLabel} from '../../../lib/instruments';
import {TradingViewWidget} from '../../../components/research/tradingview-widget';
export const dynamic='force-dynamic';
export default async function AssetPage({params}:{params:Promise<{label:string}>}){
 const {label}=await params,instrument=instrumentByLabel(label);if(!instrument)notFound();
 await requireChatGPTUser('/asset/'+encodeURIComponent(label));
 return <main className="asset-page"><Link className="secondary" href="/workspace">← Research workspace</Link><header className="section-intro"><span className="eyebrow">STRATEGIC GLOBAL / ORIGINAL WATCHLIST IDENTITY</span><h1>{instrument.label}</h1><p>{instrument.name}</p></header>
 {instrument.label==='BTCUSDT'&&<div className="notice">Selected display venue: Binance spot Bitcoin/TetherUS. The original watchlist venue remains unverified. This choice supplies no numeric API or trading connection.</div>}
 {instrument.widgetSupport.startsWith('RESTRICTED')?<section className="panel"><span className="badge">PUBLIC WIDGET RESTRICTED</span><h2>This chart is available at its source.</h2><p>On 14 November 2026, TradingView’s public embed reported this symbol was only available on TradingView. The documented identity is retained; no other contract is substituted.</p><a className="secondary" href={instrument.sourceUrl} target="_blank" rel="noopener noreferrer">Open the original chart ↗</a></section>:instrument.vendorSymbol?<TradingViewWidget kind="chart" symbol={instrument.vendorSymbol} title={instrument.label+' · '+instrument.vendorSymbol}/>:<section className="panel"><span className="badge">MAPPING UNVERIFIED</span><h2>This instrument needs an exact identity.</h2><p>Its original venue, contract or public-widget support is not verified. No different contract or exchange has been substituted.</p><a href={instrument.sourceUrl} target="_blank" rel="noopener noreferrer">View official market coverage ↗</a></section>}
 <section className="panel"><div className="panel-heading"><h2>GVV numeric data</h2><span className="badge">NOT CONFIGURED</span></div><p>No authorized numeric provider is connected. Price, change, volume, event time and session state are unavailable. Widget data is not copied into GVV.</p><details><summary>Source and contract details</summary><dl className="data-list">{Object.entries(instrument).map(([key,value])=><div key={key}><dt>{key.replace(/([a-z])([A-Z])/g,'$1 $2')}</dt><dd>{value===null?'Not verified / unavailable':String(value)}</dd></div>)}</dl></details><a href={instrument.sourceUrl} target="_blank" rel="noopener noreferrer">Identity / coverage evidence ↗</a></section></main>;
}
