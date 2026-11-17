import { EMPTY_SCAN, validateScan, type Scan } from './model';

export const SCAN_PRESETS = [
  { id: 'trend', title: 'Trend study', explanation: 'Ask whether the completed close is above its 50-bar simple moving average. This is a filter definition, not a buy signal.', condition: { field: 'close_vs_sma', op: 'gt', value: 1, period: 50, unit: 'ratio' } },
  { id: 'rsi', title: 'RSI study', explanation: 'Ask whether the 14-bar RSI is below 35. A low RSI alone does not predict a recovery.', condition: { field: 'rsi', op: 'lt', value: 35, period: 14, unit: 'percent' } },
  { id: 'liquidity', title: 'Liquidity study', explanation: 'Require an average traded value of at least INR 10,000,000 over 20 completed bars. Adjust this example threshold for your dataset.', condition: { field: 'avg_traded_value', op: 'gte', value: 10000000, period: 20, unit: 'INR' } },
] as const;

export function scanFromPreset(id: string): Scan {
  const preset = SCAN_PRESETS.find(p => p.id === id);
  if (!preset) throw new Error('Choose a known research template.');
  return validateScan({ ...structuredClone(EMPTY_SCAN), conditions: [{ ...preset.condition }], costs: { feeBps: 10, slippageBps: 10, taxBps: 0 } });
}

export const SCAN_LEVEL_HELP = {
  Beginner: 'Start with a transparent template, read its assumptions and edit the visible conditions. Nothing runs automatically.',
  Standard: 'Intermediate: combine up to 16 explicit conditions and review periods, units, holding horizon and costs. Version saving requires your configured research account.',
  Advanced: 'Inspect the typed definition and version comparison. Arbitrary formulas, nested logic and fundamental or pattern feeds are not implemented. Evaluation remains gated until an entitled dataset and working backend are connected.',
} as const;
