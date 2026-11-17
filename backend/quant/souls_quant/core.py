from __future__ import annotations

from dataclasses import dataclass, asdict, replace
from datetime import datetime, timezone
from hashlib import sha256
from typing import Any, Iterable, Mapping, Sequence
import json
import math
import numpy as np

VERSION = "quant-3.0.0"
MIN_SAMPLE = 30  # Product reporting floor; does not establish statistical power.

def source_hash() -> str:
    from pathlib import Path
    root=Path(__file__).parent
    return sha256(b"".join(p.name.encode()+p.read_bytes().replace(b"\r\n",b"\n") for p in sorted(root.glob("*.py")))).hexdigest()



class GateError(ValueError):
    """Required data, rights, or reproducibility evidence is absent."""


def utc(value: str | datetime) -> datetime:
    result = datetime.fromisoformat(value.replace("Z", "+00:00")) if isinstance(value, str) else value
    if result.tzinfo is None:
        raise GateError("Explicit timezone required")
    return result.astimezone(timezone.utc)


def canonical(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False, default=str).encode()


def digest(value: Any) -> str:
    return sha256(canonical(value)).hexdigest()


def finite(value: Any, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise GateError(f"Finite {name} required")
    return float(value)


@dataclass(frozen=True)
class Rights:
    provider: str
    reference: str
    reviewed_by: str
    expires_at: str
    analysis: bool
    team: bool = False
    test_only: bool = False

    def check(self, at: str, *, team: bool = False, allow_test: bool = False) -> None:
        if not self.provider or not self.reference or not self.reviewed_by or not self.analysis:
            raise GateError("Analysis rights have not been established")
        if utc(at) >= utc(self.expires_at):
            raise GateError("Entitlement expired")
        if team and not self.team:
            raise GateError("No Team-derived analysis rights")
        if self.test_only and not allow_test:
            raise GateError("Test fixture cannot enter production research")


@dataclass(frozen=True)
class Bar:
    instrument_id: str
    venue: str
    at: str
    known_at: str
    open: float
    high: float
    low: float
    close: float
    volume: float
    currency: str = "INR"
    finalized: bool = True
    tradable: bool = True
    traded_value: float | None = None
    delivery_pct: float | None = None
    spread_bps: float | None = None
    impact_bps: float | None = None

    def validate(self, as_of: str) -> None:
        if not self.instrument_id or not self.venue or not self.currency:
            raise GateError("Security, venue and currency required")
        if utc(self.at) > utc(self.known_at) or utc(self.known_at) > utc(as_of) or not self.finalized:
            raise GateError("Future, unfinalized or unavailable EOD observation")
        o, h, l, c = (finite(getattr(self, n), n) for n in ("open", "high", "low", "close"))
        if min(o, h, l, c) <= 0 or h < max(o, c, l) or l > min(o, c, h):
            raise GateError("Invalid OHLC")
        if finite(self.volume, "volume") < 0:
            raise GateError("Negative volume")
        for n in ("traded_value", "delivery_pct", "spread_bps", "impact_bps"):
            v = getattr(self, n)
            if v is not None and finite(v, n) < 0:
                raise GateError(f"Negative {n}")
        if self.delivery_pct is not None and self.delivery_pct > 100:
            raise GateError("Delivery percentage above 100")


def validate_bars(bars: Sequence[Bar], as_of: str) -> None:
    keys: set[tuple[str, str]] = set()
    previous: dict[str, datetime] = {}
    for b in bars:
        b.validate(as_of)
        k = (b.instrument_id, b.at)
        if k in keys or (b.instrument_id in previous and utc(b.at) <= previous[b.instrument_id]):
            raise GateError("Duplicate or non-increasing observations")
        keys.add(k)
        previous[b.instrument_id] = utc(b.at)


def period(p: int) -> int:
    if isinstance(p, bool) or not isinstance(p, int) or not 2 <= p <= 252:
        raise GateError("Period must be 2-252 bars")
    return p


def sma(values: Sequence[float], n: int) -> np.ndarray:
    n = period(n)
    a = np.asarray(values, dtype=float)
    result = np.full(len(a), np.nan)
    if len(a) >= n:
        sums = np.r_[0.0, np.cumsum(np.where(np.isfinite(a), a, 0))]
        counts = np.r_[0, np.cumsum(np.isfinite(a))]
        valid = counts[n:] - counts[:-n] == n
        segment = (sums[n:] - sums[:-n]) / n
        result[n - 1:] = np.where(valid, segment, np.nan)
    return result


def ema(values: Sequence[float], n: int) -> np.ndarray:
    n = period(n)
    a = np.asarray(values, dtype=float)
    out = np.full(len(a), np.nan)
    if len(a) < n or not np.isfinite(a[:n]).all():
        return out
    out[n - 1] = a[:n].mean()
    for i in range(n, len(a)):
        if not np.isfinite(a[i]) or not np.isfinite(out[i - 1]):
            continue
        out[i] = (2 / (n + 1)) * a[i] + (1 - 2 / (n + 1)) * out[i - 1]
    return out


def rsi(values: Sequence[float], n: int = 14) -> np.ndarray:
    n = period(n)
    a = np.asarray(values, dtype=float)
    out = np.full(len(a), np.nan)
    if len(a) <= n or not np.isfinite(a).all():
        return out
    d = np.diff(a)
    gain, loss = np.maximum(d, 0), np.maximum(-d, 0)
    g, l = gain[:n].mean(), loss[:n].mean()
    def score(up: float, down: float) -> float:
        return 50.0 if up == down == 0 else 100.0 if down == 0 else 100 - 100 / (1 + up / down)
    out[n] = score(g, l)
    for i in range(n + 1, len(a)):
        g = ((n - 1) * g + gain[i - 1]) / n
        l = ((n - 1) * l + loss[i - 1]) / n
        out[i] = score(g, l)
    return out


def atr(bars: Sequence[Bar], n: int = 14) -> np.ndarray:
    n = period(n)
    out = np.full(len(bars), np.nan)
    if len(bars) < n:
        return out
    tr = np.array([b.high - b.low if i == 0 else max(b.high - b.low, abs(b.high - bars[i-1].close), abs(b.low - bars[i-1].close)) for i, b in enumerate(bars)])
    out[n-1] = tr[:n].mean()
    for i in range(n, len(bars)):
        out[i] = ((n-1) * out[i-1] + tr[i]) / n
    return out


def volatility(values: Sequence[float], n: int = 20, sessions: int = 252) -> np.ndarray:
    n = period(n)
    a = np.asarray(values, dtype=float)
    out = np.full(len(a), np.nan)
    for i in range(n, len(a)):
        w = a[i-n:i+1]
        if (w > 0).all() and np.isfinite(w).all():
            out[i] = np.std(np.diff(np.log(w)), ddof=1) * np.sqrt(sessions)
    return out


def liquid(bars: Sequence[Bar], n: int, *, min_average_value: float | None = None,
           min_median_turnover: float | None = None, min_delivery_pct: float | None = None,
           max_spread_bps: float | None = None, max_impact_bps: float | None = None) -> dict[str, Any]:
    n = period(n)
    if len(bars) < n:
        return {"eligible": False, "status": "INSUFFICIENT_HISTORY", "averageTradedValue": None}
    w = bars[-n:]
    # Exchange turnover is preferred. Close*volume is explicitly labelled a proxy.
    values = [b.traded_value if b.traded_value is not None else b.close * b.volume for b in w]
    average, median = float(np.mean(values)), float(np.median(values))
    tests = [(min_average_value is None or average >= min_average_value),
             (min_median_turnover is None or median >= min_median_turnover)]
    gaps = []
    last = w[-1]
    for field, threshold, minimum in (("delivery_pct", min_delivery_pct, True),
                                      ("spread_bps", max_spread_bps, False), ("impact_bps", max_impact_bps, False)):
        if threshold is not None:
            value = getattr(last, field)
            if value is None:
                gaps.append(field)
                tests.append(False)
            else:
                tests.append(value >= threshold if minimum else value <= threshold)
    return {"eligible": all(tests), "status": "MISSING_ENTITLED_MEASURES" if gaps else "EVALUATED",
            "averageTradedValue": average, "medianTurnover": median, "bars": n,
            "measureFrequency": "EOD", "valueMethod": "EXCHANGE_VALUE" if all(b.traded_value is not None for b in w) else "CLOSE_TIMES_VOLUME_PROXY",
            "missing": gaps, "notice": "Delivery percentage does not measure immediate execution liquidity."}


@dataclass(frozen=True)
class Action:
    instrument_id: str
    kind: str
    ex_at: str
    known_at: str
    source: str
    version: str
    ratio_new_per_old: float | None = None
    subscription_price: float | None = None
    prior_cum_price: float | None = None
    cash_dividend: float | None = None


def adjust(bars: Sequence[Bar], actions: Sequence[Action], as_of: str, *, total_return: bool = False) -> tuple[list[Bar], dict[str, Any]]:
    """Back-adjust only actions effective AND known by cutoff. Raw Bar objects never change."""
    validate_bars(bars, as_of)
    result = list(bars)
    applied = []
    for action in sorted(actions, key=lambda a: utc(a.ex_at), reverse=True):
        if utc(action.known_at) > utc(as_of) or utc(action.ex_at) > utc(as_of):
            continue
        if not action.source or not action.version:
            raise GateError("Corporate action provenance required")
        kind = action.kind.upper()
        if kind in ("MERGER", "DELISTING", "SYMBOL_CHANGE"):
            raise GateError("Resolve point-in-time security lineage before adjustment")
        share_factor = 1.0
        if kind in ("SPLIT", "BONUS"):
            ratio = finite(action.ratio_new_per_old, "new shares per old")
            if ratio <= 0:
                raise GateError("Invalid share ratio")
            share_factor, price_factor = ratio, 1 / ratio
        elif kind == "RIGHTS":
            ratio = finite(action.ratio_new_per_old, "offered rights shares per old")
            sub = finite(action.subscription_price, "subscription price")
            cum = finite(action.prior_cum_price, "official prior cum-rights close")
            if ratio <= 0 or sub < 0 or cum <= 0:
                raise GateError("Rights terms missing")
            terp = (cum + ratio * sub) / (1 + ratio)
            price_factor = terp / cum
            # Rights subscription volume is not a simple share split: retain reported volume.
        elif kind == "DIVIDEND":
            if not total_return:
                continue
            cash = finite(action.cash_dividend, "cash dividend")
            cum = finite(action.prior_cum_price, "cum-dividend close")
            if cash < 0 or cum <= cash:
                raise GateError("Invalid dividend terms")
            price_factor = (cum - cash) / cum
        else:
            raise GateError("Unsupported corporate action")
        result = [replace(b, open=b.open*price_factor, high=b.high*price_factor, low=b.low*price_factor,
                          close=b.close*price_factor, volume=b.volume*share_factor)
                  if b.instrument_id == action.instrument_id and utc(b.at) < utc(action.ex_at) else b for b in result]
        applied.append(asdict(action))
    return result, {"version": "ca-1", "asOf": as_of, "actionsHash": digest(applied),
                    "series": "GROSS_DIVIDEND_REINVESTMENT_PROXY" if total_return else "PRICE_SPLIT_BONUS_RIGHTS",
                    "volume": "Split/bonus inverse price factor; rights/dividends retain reported volume",
                    "taxes": "Not included in corporate-action series"}


def asof_value(rows: Sequence[Mapping[str, Any]], at: str) -> Mapping[str, Any] | None:
    eligible = [r for r in rows if utc(r["at"]) <= utc(at) and utc(r["known_at"]) <= utc(at)]
    return max(eligible, key=lambda r: (utc(r["at"]), utc(r["known_at"]))) if eligible else None


def regime(nifty: Sequence[Mapping[str, Any]], vix: Sequence[Mapping[str, Any]], failed_at: str) -> dict[str, Any]:
    n, v = asof_value(nifty, failed_at), asof_value(vix, failed_at)
    base = {"version": "regime-1", "asOf": failed_at, "thresholds": {"lowVixBelow": 15, "highVixAtLeast": 25},
            "notice": "Descriptive association, not causal proof"}
    if n is None or v is None or not n.get("source") or not v.get("source") or n.get("value") is None or v.get("value") is None:
        return {**base, "status": "UNKNOWN", "volatility": None, "nifty": None}
    vol = finite(v["value"], "India VIX")
    if vol < 0:
        raise GateError("Negative VIX")
    return {**base, "status": "KNOWN", "volatility": "HIGH" if vol >= 25 else "LOW" if vol < 15 else "NORMAL",
            "nifty": n["value"], "indiaVix": vol, "niftyObservation": dict(n), "vixObservation": dict(v)}


def attribution(returns: Sequence[float], factors: Mapping[str, Sequence[float]], *, source: str, window: str) -> dict[str, Any]:
    """OLS with HC3 standard errors, conservative sample/rank/condition abstention."""
    names = list(factors)
    n = len(returns)
    base = {"n": n, "factors": names, "source": source, "window": window, "method": "OLS_HC3",
            "notice": "Association, not causation; omitted factors and dependence can invalidate uncertainty."}
    if not source or not names or n < max(MIN_SAMPLE, 5*(len(names)+1)):
        return {**base, "status": "INSUFFICIENT_EVIDENCE"}
    if any(len(v) != n for v in factors.values()):
        raise GateError("Factor windows are not aligned")
    y = np.asarray(returns, dtype=float)
    x = np.column_stack([np.ones(n), *[np.asarray(factors[k], dtype=float) for k in names]])
    if not np.isfinite(y).all() or not np.isfinite(x).all() or np.linalg.matrix_rank(x) < x.shape[1] or np.linalg.cond(x) > 1e8:
        return {**base, "status": "ABSTAIN_MULTICOLLINEAR_OR_MISSING"}
    inv = np.linalg.inv(x.T @ x)
    beta = inv @ x.T @ y
    residuals = y-x@beta
    h = np.sum((x@inv)*x, axis=1)
    if np.any(h >= .999999):
        return {**base, "status": "ABSTAIN_HIGH_LEVERAGE"}
    cov = inv @ (x.T @ ((residuals/(1-h))**2)[:, None].__mul__(x)) @ inv
    se = np.sqrt(np.maximum(np.diag(cov), 0))
    ss = np.sum((y-y.mean())**2)
    return {**base, "status": "ESTIMATED", "coefficients": dict(zip(["alpha", *names], beta.tolist())),
            "standardErrorsHC3": dict(zip(["alpha", *names], se.tolist())),
            "approx95Intervals": {k: [float(v-1.96*s), float(v+1.96*s)] for k, v, s in zip(["alpha", *names], beta, se)},
            "rSquared": float(1-np.sum(residuals**2)/ss) if ss>0 else None,
            "conditionNumber": float(np.linalg.cond(x)), "serialDependenceAdjusted": False}


def stats(returns: Sequence[float], *, min_sample: int = MIN_SAMPLE, seed: int = 7,
          non_overlapping: bool = True) -> dict[str, Any]:
    a = np.asarray(returns, dtype=float)
    if not np.isfinite(a).all() or (a < -1).any():
        raise GateError("Invalid completed simulated returns")
    n = len(a)
    if not n:
        return {"n": 0, "status": "INSUFFICIENT_EVIDENCE", "winRate": None, "observedWinRate": None,
                "profitFactor": None, "meanReturn": None, "maxDrawdown": None, "wilson95": None}
    wins = int((a>0).sum())
    phat, z = wins/n, 1.959963984540054
    center = (phat+z*z/(2*n))/(1+z*z/n)
    half = z*math.sqrt(phat*(1-phat)/n+z*z/(4*n*n))/(1+z*z/n)
    gains, losses = a[a>0].sum(), -a[a<0].sum()
    equity = np.r_[1.0, np.cumprod(1+a)]
    dd = 1-equity/np.maximum.accumulate(equity)
    rng = np.random.default_rng(seed)
    boot = [float(rng.choice(a,n,replace=True).mean()) for _ in range(500)] if n >= min_sample else None
    return {"n": n, "status": "EVIDENCE_SAMPLE" if n>=min_sample else "INSUFFICIENT_EVIDENCE",
            "winRate": float(phat) if n>=min_sample else None, "observedWinRate": float(phat), "wins": wins,
            "wilson95": [center-half,center+half], "meanReturn": float(a.mean()), "medianReturn": float(np.median(a)),
            "expectancy": float(a.mean()), "profitFactor": float(gains/losses) if losses else None,
            "profitFactorReason": "NO_LOSSES" if not losses else None,
            "maxDrawdown": float(dd.max()) if non_overlapping else None,
            "drawdownScope": "Sequential non-overlapping fixed allocation" if non_overlapping else "Unavailable for overlapping portfolio trades",
            "bootstrapMean95": np.quantile(boot,[.025,.975]).tolist() if boot else None,
            "bootstrap": "IID diagnostic only; serial dependence and multiple testing remain unresolved",
            "minimumReportingSample": min_sample, "annualizedReturn": None}


@dataclass(frozen=True)
class Fold:
    train: tuple[int, ...]
    validation: tuple[int, ...]
    test: tuple[int, ...]
    start: int
    end: int


def walk_forward(length: int, train: int, validation: int, test: int, horizon: int, embargo: int) -> list[Fold]:
    values = (length,train,validation,test,horizon,embargo)
    if any(isinstance(v,bool) or not isinstance(v,int) for v in values) or min(train,validation,test,horizon)<1 or embargo<0:
        raise GateError("Invalid walk-forward windows")
    if min(train,validation,test) <= horizon+embargo:
        raise GateError("Windows too short for label maturity and embargo")
    folds = []
    start = 0
    while start+train+validation+test <= length:
        v0, t0, end = start+train, start+train+validation, start+train+validation+test
        f = Fold(tuple(range(start,v0-horizon-embargo)),tuple(range(v0,t0-horizon-embargo)),
                 tuple(range(t0,end-horizon)),start,end)
        if max(f.train)+horizon >= min(f.validation)-embargo or max(f.validation)+horizon >= min(f.test)-embargo:
            raise GateError("Overlapping labels")
        folds.append(f)
        start += test
    return folds


def sector_strength(histories: Mapping[str, Sequence[Mapping[str, Any]]], benchmark: Sequence[Mapping[str, Any]],
                    memberships: Sequence[Mapping[str, Any]], as_of: str, lookbacks: Iterable[int] = (21,63,126)) -> list[dict[str, Any]]:
    benchmark_pit = {r["at"]: r for r in benchmark if utc(r["known_at"])<=utc(as_of) and utc(r["at"])<=utc(as_of) and r.get("source")}
    result = []
    for sector, rows in histories.items():
        dated = {r["at"]:r for r in rows if utc(r["known_at"])<=utc(as_of) and utc(r["at"])<=utc(as_of) and r.get("source")}
        dates = sorted(set(dated)&set(benchmark_pit),key=utc)
        members = [m["instrument_id"] for m in memberships if m["sector"]==sector and utc(m["valid_from"])<=utc(as_of)
                   and (not m.get("valid_until") or utc(as_of)<utc(m["valid_until"])) and utc(m["known_at"])<=utc(as_of)]
        scores = {}
        for n in lookbacks:
            period(n)
            if len(dates)<=n:
                scores[str(n)] = None
                continue
            first,last=dates[-n-1],dates[-1]
            s0,s1,b0,b1=(finite(v,"benchmark value") for v in (dated[first]["value"],dated[last]["value"],benchmark_pit[first]["value"],benchmark_pit[last]["value"]))
            if min(s0,s1,b0,b1)<=0:
                raise GateError("Nonpositive benchmark")
            scores[str(n)] = (s1/s0-1)-(b1/b0-1)
        result.append({"sector":sector,"relativeReturn":scores,"asOf":as_of,"lastAlignedObservation":dates[-1] if dates else None,
                       "pointInTimeMembers":members,"status":"COMPUTED" if members and all(v is not None for v in scores.values()) else "INSUFFICIENT_EVIDENCE",
                       "method":"Sector minus benchmark simple return over completed aligned sessions","provenanceRequired":True})
    return sorted(result,key=lambda r: (r["relativeReturn"].get("21") is not None, r["relativeReturn"].get("21") or -1e10),reverse=True)


def comparable(a: Mapping[str, Any], b: Mapping[str, Any]) -> dict[str, Any]:
    keys = ("datasetHash","universeHash","windowStart","windowEnd","costs","executionModel","foldsHash","adjustmentVersion","evaluatorVersion","sampleType")
    reasons = [k for k in keys if a.get(k) is None or b.get(k) is None or a[k]!=b[k]]
    if a.get("sampleType")!="OOS":
        reasons.append("Out-of-sample evidence required")
    return {"comparable":not reasons,"reasons":reasons}
