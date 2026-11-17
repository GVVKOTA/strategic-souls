from __future__ import annotations
from dataclasses import asdict
from typing import Any, Mapping, Sequence
import numpy as np
import json
from datetime import datetime,timezone

from .core import Bar, GateError, VERSION, adjust, digest, utc, validate_bars, sma, rsi, walk_forward, stats, source_hash
from .pipeline import validate_scan, constituents


def signal_mask(bars: Sequence[Bar], scan: Mapping[str,Any]) -> np.ndarray:
    validate_scan(scan)
    close=np.array([b.close for b in bars])
    value=np.array([b.traded_value if b.traded_value is not None else b.close*b.volume for b in bars])
    match=np.ones(len(bars),dtype=bool)
    for c in scan["conditions"]:
        f,p=c["field"],c.get("period")
        if f=="close_vs_sma":
            measure=close/sma(close,p)
        elif f=="rsi":
            measure=rsi(close,p)
        elif f=="avg_traded_value":
            measure=sma(value,p)
        elif f=="median_turnover":
            measure=np.array([np.median(value[i-p+1:i+1]) if i>=p-1 else np.nan for i in range(len(value))])
        else:
            measure=np.array([getattr(b,f) if getattr(b,f) is not None else np.nan for b in bars])
        operation={"gt":np.greater,"gte":np.greater_equal,"lt":np.less,"lte":np.less_equal}[c["op"]]
        match &= np.isfinite(measure)&operation(measure,c["value"])
    return match


def simulate(bars: Sequence[Bar], scan: Mapping[str,Any], indices: Sequence[int], memberships: Sequence[Mapping[str,Any]], actions:Sequence[Any]=()) -> list[dict[str,Any]]:
    """Long-only, one sequential position per series; close signal -> next tradable open.
    No synthetic/stale fallback fills. End-of-window censoring is explicit.
    """
    validate_scan(scan)
    if len({b.instrument_id for b in bars})>1:
        raise GateError("Simulate one aligned instrument series at a time; portfolio allocation needs a separate model")
    mask=signal_mask(bars,scan) if not actions else np.array([bool(signal_mask(adjust(bars[:i+1],actions,b.known_at)[0],scan)[-1]) for i,b in enumerate(bars)])
    horizon=scan["exit"]["holdingBars"]
    costs=scan["costs"]
    slip=costs["slippageBps"]/10000
    fee_tax=(2*costs["feeBps"]+costs["taxBps"])/10000
    results=[];available=0
    permitted=set(indices)
    for i in sorted(permitted):
        entry=i+1;exit_index=entry+horizon-1
        if i<available or not mask[i] or exit_index>=len(bars):
            continue
        b=bars[i];buy=bars[entry];sell=bars[exit_index]
        # A signal must have been public before the next execution timestamp.
        if utc(b.known_at)>utc(buy.at) or not buy.tradable or not sell.tradable or buy.volume<=0 or sell.volume<=0:
            continue
        if b.instrument_id not in constituents(memberships,b.at):
            continue
        # Constituent exit/delisting cannot silently become a fill in a current-only universe.
        if buy.instrument_id not in constituents(memberships,buy.at) or sell.instrument_id not in constituents(memberships,sell.at):
            continue
        units=1.0
        for action in actions:
            if action.instrument_id==b.instrument_id and utc(buy.at)<utc(action.ex_at)<=utc(sell.at):
                if utc(action.known_at)>utc(action.ex_at) or action.kind.upper() not in ("SPLIT","BONUS","DIVIDEND"):
                    raise GateError("Unresolved corporate-action execution or rights subscription policy")
                if action.kind.upper() in ("SPLIT","BONUS"):
                    ratio=action.ratio_new_per_old
                    if ratio is None or ratio<=0:raise GateError("Invalid execution share ratio")
                    units*=ratio
        entry_price=buy.open*(1+slip);exit_price=sell.close*units*(1-slip)
        net=exit_price/entry_price-1-fee_tax
        results.append({"instrument_id":b.instrument_id,"signalAt":b.at,"signalKnownAt":b.known_at,"entryAt":buy.at,
                        "exitAt":sell.at,"entryPriceModel":entry_price,"exitPriceModel":exit_price,"netReturn":net,
                        "feesAndTaxFraction":fee_tax,"turnover":2,"simulated":True,"exitShareUnits":units,"dividendPolicy":"EXCLUDED_PRICE_ONLY"})
        available=exit_index+1
    return results


def evaluate_walk_forward(bars: Sequence[Bar], candidates: Sequence[Mapping[str,Any]], memberships: Sequence[Mapping[str,Any]],
                          *, dataset_hash:str, as_of:str, train:int, validation:int, test:int, embargo:int,
                          adjustment_version:str, actions:Sequence[Any]=()) -> dict[str,Any]:
    validate_bars(bars,as_of)
    if not dataset_hash or not adjustment_version or not candidates:
        raise GateError("Reproducibility manifest missing")
    for s in candidates:
        validate_scan(s)
    horizons={s["exit"]["holdingBars"] for s in candidates}
    if len(horizons)!=1:
        raise GateError("Equalized label horizons required across candidate selection")
    h=next(iter(horizons))
    folds=walk_forward(len(bars),train,validation,test,h,embargo)
    reports=[];oos=[];seen:set[tuple[str,str]]=set()
    for number,f in enumerate(folds):
        train_results=[]
        for candidate in candidates:
            trades=simulate(bars,candidate,f.train,memberships,actions)
            score=float(np.mean([t["netReturn"] for t in trades])) if trades else float("-inf")
            train_results.append((score,candidate,trades))
        best=max(train_results,key=lambda t:t[0])
        if not np.isfinite(best[0]):
            reports.append({"fold":number,"status":"INSUFFICIENT_TRAINING_SIGNALS","trainN":0})
            continue
        frozen=json.loads(json.dumps(best[1],allow_nan=False))
        # Re-evaluate only the prefix known at each fold end. Signal functions are causal.
        val=simulate(bars[:f.end],frozen,f.validation,memberships,actions)
        out=simulate(bars[:f.end],frozen,f.test,memberships,actions)
        for t in out:
            key=(t["instrument_id"],t["entryAt"])
            if key in seen:
                raise GateError("Duplicate out-of-sample execution across folds")
            seen.add(key)
        oos.extend(out)
        reports.append({"fold":number,"status":"EVALUATED","frozenScanHash":digest(frozen),"frozenScan":frozen,
                        "train":stats([t["netReturn"] for t in best[2]]),"validation":stats([t["netReturn"] for t in val]),
                        "test":stats([t["netReturn"] for t in out]),"windows":asdict(f)})
    oos.sort(key=lambda t:utc(t["entryAt"]))
    manifest={"datasetHash":dataset_hash,"universeHash":digest(memberships),"windowStart":bars[0].at if bars else None,
              "windowEnd":bars[-1].at if bars else None,"costs":candidates[0]["costs"],"executionModel":"LONG_NEXT_OPEN_FIXED_HORIZON_V1",
              "foldsHash":digest([asdict(f) for f in folds]),"adjustmentVersion":adjustment_version,"evaluatorVersion":VERSION,"sampleType":"OOS",
              "researchCutoff":as_of,"evaluatorSourceHash":source_hash(),"dividendPolicy":"EXCLUDED_PRICE_ONLY","candidateCount":len(candidates),"scanCandidatesHash":digest(candidates)}
    return {"manifest":manifest,"manifestHash":digest(manifest),"folds":reports,"trades":oos,
            "aggregate":stats([t["netReturn"] for t in oos]),"status":"EVALUATED" if reports else "INSUFFICIENT_WINDOWS",
            "warnings":["Simulated executions, never exchange records.","30 completed observations is a reporting floor, not proof of statistical power.",
                        "Candidate selection on training data only; repeated experiments still create multiple-testing bias.",
                        "Survivorship validity depends on complete point-in-time constituents, halts and delistings.",
                        "Real transaction taxes and brokerage schedules require operator verification.",
                        "Signals replay only effective-and-known actions. Split/bonus fills adjust units. Unresolved rights, mergers and delistings abstain; dividends excluded from price-return runs."]}
