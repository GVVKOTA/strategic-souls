import {widgetSymbolAllowed,WIDGET_OVERVIEW_SYMBOLS} from './instruments';
export type WidgetKind='overview'|'chart'|'calendar';
export const WIDGET_SCRIPT:Record<WidgetKind,string>={
 overview:'https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js',
 chart:'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js',
 calendar:'https://s3.tradingview.com/external-embedding/embed-widget-events.js',
};
/** Only fixed reviewed symbols enter vendor configuration. No user HTML or private research is sent. */
export function widgetConfiguration(kind:WidgetKind,symbol?:string):Record<string,unknown>{
 if(kind==='chart'){
  if(!symbol||!widgetSymbolAllowed(symbol))throw new Error('This chart identity has not been verified.');
  return {autosize:true,symbol,interval:'D',timezone:'Asia/Kolkata',theme:'dark',style:'1',locale:'en',allow_symbol_change:false,calendar:false,support_host:'https://www.tradingview.com'};
 }
 if(kind==='calendar')return {colorTheme:'dark',isTransparent:false,width:'100%',height:560,locale:'en'};
 return {colorTheme:'dark',dateRange:'12M',showChart:true,locale:'en',width:'100%',height:460,isTransparent:false,showSymbolLogo:true,showFloatingTooltip:true,plotLineColorGrowing:'rgba(141,205,180,1)',plotLineColorFalling:'rgba(184,198,203,1)',tabs:[{title:'Global context',symbols:WIDGET_OVERVIEW_SYMBOLS.map(s=>({s,d:s})),originalTitle:'Global context'}]};
}
export const widgetSource=(kind:WidgetKind,symbol?:string)=>kind==='calendar'?'https://www.tradingview.com/economic-calendar/':kind==='chart'&&symbol?'https://www.tradingview.com/chart/?symbol='+encodeURIComponent(symbol):'https://www.tradingview.com/markets/';
