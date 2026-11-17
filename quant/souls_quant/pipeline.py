from __future__ import annotations
from datetime import datetime,timezone
from dataclasses import asdict
from pathlib import Path
from typing import Any, Mapping, Sequence
from contextlib import contextmanager
from hashlib import sha256
import json
import os
import re
import shutil
import time
import uuid

import duckdb
import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq

from .core import Bar, Rights, GateError, VERSION, canonical, digest, utc, validate_bars, sma, ema, rsi, atr, volatility, period, source_hash

INDICATORS = "indicators-1:sma20,sma50,ema20,rsi14,atr14,volatility20,momentum21,avg_value20"
OPERATORS = {"gt": ">", "gte": ">=", "lt": "<", "lte": "<="}
FIELDS = {"close_vs_sma": "ratio", "rsi": "percent", "avg_traded_value": "INR", "delivery_pct": "percent",
          "median_turnover": "INR", "spread_bps": "bps", "impact_bps": "bps"}


def validate_scan(scan: Mapping[str, Any]) -> None:
    if scan.get("schema") != "scan-v3.1" or scan.get("timeframe") != "EOD" or not isinstance(scan.get("universe"),str):
        raise GateError("Unsupported scan schema or timeframe")
    conditions = scan.get("conditions")
    if not isinstance(conditions,list) or not 1 <= len(conditions) <= 16:
        raise GateError("1-16 conditions required")
    for c in conditions:
        if not isinstance(c,dict) or c.get("field") not in FIELDS or c.get("op") not in OPERATORS or c.get("unit") != FIELDS[c["field"]]:
            raise GateError("Unknown field, operator or unit")
        v=c.get("value")
        if isinstance(v,bool) or not isinstance(v,(float,int)) or not np.isfinite(v) or v<0:
            raise GateError("Invalid threshold")
        if c["field"] in ("rsi","delivery_pct") and v>100:
            raise GateError("Percent threshold above 100")
        if c["field"] in ("close_vs_sma","rsi","avg_traded_value","median_turnover"):
            period(c.get("period"))
    for k in ("feeBps","slippageBps","taxBps"):
        v=scan.get("costs",{}).get(k)
        if isinstance(v,bool) or not isinstance(v,(float,int)) or not np.isfinite(v) or not 0<=v<=1000:
            raise GateError("Explicit nonnegative cost assumptions required")
    h=scan.get("exit",{}).get("holdingBars")
    if isinstance(h,bool) or not isinstance(h,int) or not 1<=h<=252:
        raise GateError("Holding horizon invalid")


def validate_memberships(memberships: Sequence[Mapping[str,Any]]) -> None:
    for m in memberships:
        for k in ("instrument_id","valid_from","known_at","source"):
            if not m.get(k):
                raise GateError("Point-in-time constituent provenance missing")
        if m.get("valid_until") and utc(m["valid_until"]) <= utc(m["valid_from"]):
            raise GateError("Invalid membership interval")


def constituents(memberships: Sequence[Mapping[str,Any]], at: str) -> set[str]:
    validate_memberships(memberships)
    return {m["instrument_id"] for m in memberships if utc(m["known_at"])<=utc(at) and utc(m["valid_from"])<=utc(at)
            and (not m.get("valid_until") or utc(at)<utc(m["valid_until"]))}


def require_calendar(bars: Sequence[Bar], sessions: Mapping[str,Sequence[str]]) -> None:
    """An explicit source calendar, not weekday assumptions, establishes missing bars."""
    actual={}
    for b in bars:
        actual.setdefault(b.instrument_id,set()).add(b.at)
    if set(actual) != set(sessions):
        raise GateError("Calendar/security mapping does not cover the dataset")
    for instrument, expected in sessions.items():
        if set(expected) != actual[instrument] or len(set(expected)) != len(expected):
            raise GateError("Missing or unexpected completed session for "+instrument)


def _write_new(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True,exist_ok=True)
    with path.open("xb") as stream:
        stream.write(content)
        stream.flush()
        os.fsync(stream.fileno())


@contextmanager
def writer_lock(root: Path):
    root.mkdir(parents=True,exist_ok=True)
    path=root/".writer-lock"
    try:
        fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    except FileExistsError as exc:
        raise GateError("Another writer or an unreconciled lock exists; no publish performed") from exc
    try:
        os.write(fd,str(os.getpid()).encode())
        os.close(fd)
        yield
    finally:
        path.unlink()


def ingest(root: Path, bars: Sequence[Bar], rights: Rights, as_of: str, *,
           sessions: Mapping[str,Sequence[str]], memberships: Sequence[Mapping[str,Any]],
           corporate_action_manifest: Mapping[str,Any], allow_test: bool = False) -> dict[str,Any]:
    rights.check(datetime.now(timezone.utc).isoformat(),allow_test=allow_test)
    validate_bars(bars,as_of)
    if not bars:
        raise GateError("Empty dataset")
    require_calendar(bars,sessions)
    validate_memberships(memberships)
    if not corporate_action_manifest.get("complete") or not corporate_action_manifest.get("source") or not corporate_action_manifest.get("version"):
        raise GateError("Corporate action completeness/provenance not verified")
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,80}",rights.provider):
        raise GateError("Unsafe provider path")
    records=[asdict(b) for b in bars]
    version=digest({"bars":records,"memberships":memberships,"calendar":sessions,"actions":corporate_action_manifest,"rights":asdict(rights),"schema":VERSION})
    directory=root/"raw"/rights.provider/as_of[:10]/version
    with writer_lock(root):
        if (directory/"manifest.json").exists():
            previous=json.loads((directory/"manifest.json").read_text())
            for f in previous["files"]:
                if sha256((directory/f["path"]).read_bytes()).hexdigest()!=f["sha256"]:
                    raise GateError("Immutable raw data checksum changed")
            return previous
        directory.mkdir(parents=True,exist_ok=False)
        table=pa.Table.from_pylist(records)
        pq.write_table(table,directory/"bars.parquet",compression="zstd")
        raw_hash=sha256((directory/"bars.parquet").read_bytes()).hexdigest()
        manifest={"schema":"dataset-v3","version":version,"asOf":as_of,"rights":asdict(rights),
                  "memberships":list(memberships),"calendarHash":digest(sessions),"corporateActions":dict(corporate_action_manifest),
                  "files":[{"path":"bars.parquet","sha256":raw_hash}],"rows":len(bars),"testOnly":rights.test_only}
        _write_new(directory/"manifest.json",canonical(manifest))
    return manifest


def load_dataset(manifest_path: Path, at: str, *, team: bool=False, allow_test: bool=False) -> tuple[list[Bar],dict[str,Any]]:
    manifest=json.loads(manifest_path.read_text())
    Rights(**manifest["rights"]).check(datetime.now(timezone.utc).isoformat(),team=team,allow_test=allow_test)
    records=[]
    for f in manifest["files"]:
        path=(manifest_path.parent/f["path"]).resolve()
        if not path.is_relative_to(manifest_path.parent.resolve()):
            raise GateError("Manifest file escapes dataset")
        if sha256(path.read_bytes()).hexdigest()!=f["sha256"]:
            raise GateError("Dataset checksum mismatch")
        records.extend(pq.read_table(path).to_pylist())
    bars=[Bar(**r) for r in records]
    validate_bars(bars,manifest["asOf"])
    return bars,manifest


def indicator_rows(bars: Sequence[Bar]) -> list[dict[str,Any]]:
    groups:dict[str,list[Bar]]={}
    for b in bars:
        groups.setdefault(b.instrument_id,[]).append(b)
    rows=[]
    for instrument, series in groups.items():
        series.sort(key=lambda b:utc(b.at))
        close=np.array([b.close for b in series])
        val=np.array([b.traded_value if b.traded_value is not None else b.close*b.volume for b in series])
        arrays={"sma20":sma(close,20),"sma50":sma(close,50),"ema20":ema(close,20),"rsi14":rsi(close,14),
                "atr14":atr(series,14),"volatility20":volatility(close,20),"avg_value20":sma(val,20)}
        for i,b in enumerate(series):
            row=asdict(b)
            for k,a in arrays.items():
                row[k]=float(a[i]) if np.isfinite(a[i]) else None
            row["momentum21"]=float(close[i]/close[i-21]-1) if i>=21 else None
            rows.append(row)
    return rows


def publish_cache(root: Path, bars: Sequence[Bar], dataset_manifest: Mapping[str,Any]) -> dict[str,Any]:
    """Immutable generations + one atomic pointer swap. Unchanged buckets are reused."""
    signature=digest({"dataset":dataset_manifest["version"],"indicators":INDICATORS,"code":VERSION,"normalizedBarsHash":digest([asdict(b) for b in bars]),"sourceHash":source_hash()})
    previous_path=root/"CURRENT.json"
    with writer_lock(root):
        previous=json.loads(previous_path.read_text()) if previous_path.exists() else {"partitions":[]}
        old={p["bucket"]:p for p in previous["partitions"]}
        groups:dict[int,list[Bar]]={}
        for b in bars:
            bucket=int(sha256(b.instrument_id.encode()).hexdigest()[:8],16)%16
            groups.setdefault(bucket,[]).append(b)
        parts=[]
        for bucket,subset in sorted(groups.items()):
            dependency=digest({"bars":[asdict(b) for b in subset],"indicators":INDICATORS,"actions":dataset_manifest["corporateActions"],"code":VERSION,"sourceHash":source_hash()})
            if bucket in old and old[bucket]["dependencyHash"]==dependency and (root/old[bucket]["path"]).exists():
                part=old[bucket]
                if sha256((root/part["path"]).read_bytes()).hexdigest()!=part["sha256"]:
                    raise GateError("Prior cache integrity failed")
            else:
                destination=root/"generations"/signature/("bucket="+str(bucket))/"indicators.parquet"
                destination.parent.mkdir(parents=True,exist_ok=True)
                if destination.exists():
                    raise GateError("Generation already exists without a published manifest; reconcile before retry")
                pq.write_table(pa.Table.from_pylist(indicator_rows(subset)),destination,compression="zstd")
                part={"bucket":bucket,"dependencyHash":dependency,"path":destination.relative_to(root).as_posix(),
                      "sha256":sha256(destination.read_bytes()).hexdigest(),"rows":len(subset)}
            parts.append(part)
        manifest={"generation":signature,"datasetHash":dataset_manifest["version"],"definitions":INDICATORS,
                  "codeVersion":VERSION,"evaluatorSourceHash":source_hash(),"partitions":parts,"rights":dataset_manifest["rights"],"testOnly":dataset_manifest.get("testOnly",False),
                  "adjustmentVersion":dataset_manifest["corporateActions"]["version"],"publishedAt":dataset_manifest["asOf"]}
        target=root/"generations"/signature/"cache-manifest.json"
        if not target.exists():
            _write_new(target,canonical(manifest))
        temp=root/("CURRENT."+uuid.uuid4().hex+".tmp")
        _write_new(temp,canonical(manifest))
        os.replace(temp,previous_path)
    return manifest


def cache_files(root: Path) -> tuple[list[str],dict[str,Any]]:
    current=json.loads((root/"CURRENT.json").read_text())
    files=[]
    for p in current["partitions"]:
        path=(root/p["path"]).resolve()
        if not path.is_relative_to(root.resolve()) or sha256(path.read_bytes()).hexdigest()!=p["sha256"]:
            raise GateError("Cache checksum or path invalid")
        files.append(str(path))
    if not files:
        raise GateError("No published cache")
    return files,current


def screen(root: Path, scan: Mapping[str,Any], memberships: Sequence[Mapping[str,Any]], as_of: str,
           *, allow_test: bool=False) -> dict[str,Any]:
    validate_scan(scan)
    files,manifest=cache_files(root)
    Rights(**manifest["rights"]).check(datetime.now(timezone.utc).isoformat(),allow_test=allow_test)
    if manifest.get("testOnly") and not allow_test:
        raise GateError("Test cache cannot run production research")
    if utc(manifest["publishedAt"])>utc(as_of):
        raise GateError("Cache generation is newer than the requested research cutoff")
    eligible=constituents(memberships,as_of)
    if not eligible:
        raise GateError("No point-in-time eligible universe")
    terms=[];params:list[Any]=[files,as_of,as_of];expressions=[];names=[]
    for i,c in enumerate(scan["conditions"]):
        field=c["field"];p=c.get("period");alias="measure_"+str(i);names.append(alias)
        if field=="close_vs_sma":
            if p in (20,50):
                expression="close / nullif(sma"+str(p)+",0)"
            else:
                expression="case when count(close) over w"+str(p)+"="+str(p)+" then close / nullif(avg(close) over w"+str(p)+",0) end"
        elif field=="rsi":
            if p!=14:
                raise GateError("Cached RSI supports 14; rebuild declared indicator definition for another period")
            expression="rsi14"
        elif field in ("avg_traded_value","median_turnover"):
            if field=="avg_traded_value" and p==20:
                expression="avg_value20"
            else:
                aggregate="avg" if field=="avg_traded_value" else "median"
                expression="case when count(close) over w"+str(p)+"="+str(p)+" then "+aggregate+"(coalesce(traded_value,close*volume)) over w"+str(p)+" end"
        else:
            expression=field
        expressions.append(expression+" as "+alias)
        terms.append(alias+" "+OPERATORS[c["op"]]+" ?")
        params.append(c["value"])
    windows={c["period"] for c in scan["conditions"] if c.get("period") is not None and c["field"]!="rsi"}
    window_clause=(" window "+", ".join("w"+str(p)+" as (partition by instrument_id order by \"at\" rows between "+str(p-1)+" preceding and current row)" for p in sorted(windows))) if windows else ""
    con=duckdb.connect()
    try:
        # No query text from users: only fixed fields, operators and validated integer windows.
        eligible_table=pa.table({"instrument_id":sorted(eligible)})
        con.register("eligible_universe",eligible_table)
        latest=con.execute('select instrument_id,epoch(max(cast("at" as timestamptz))) from read_parquet(?,hive_partitioning=false) where cast("at" as timestamptz)<=cast(? as timestamptz) group by instrument_id',[files,as_of]).fetchall()
        dates=dict(latest)
        if any(i not in dates or (utc(as_of).timestamp()-dates[i])>7*86400 for i in eligible):
            raise GateError("Missing or stale EOD in the point-in-time universe; seven-day conservative freshness limit")
        query=("with observed as (select * from read_parquet(?,hive_partitioning=false) where cast(\"at\" as timestamptz)<=cast(? as timestamptz) and cast(known_at as timestamptz)<=cast(? as timestamptz)), "
               "measured as (select *, "+", ".join(expressions)+" from observed"+window_clause+"), "
               "latest as (select *, row_number() over(partition by instrument_id order by \"at\" desc) as rn from measured) "
               "select instrument_id,\"at\",known_at,"+",".join(names)+" from latest join eligible_universe using(instrument_id) where rn=1 and "+" and ".join(terms)+" order by instrument_id")
        start=time.perf_counter()
        rows=con.execute(query,params).fetchall()
        elapsed=(time.perf_counter()-start)*1000
    finally:
        con.close()
    return {"status":"SCREENED","matches":[{"instrument_id":r[0],"at":r[1],"known_at":r[2],
            "measures":dict(zip(names,r[3:]))} for r in rows],"elapsedMs":elapsed,"universeN":len(eligible),
            "scanHash":digest(scan),"datasetHash":manifest["datasetHash"],"asOf":as_of,
            "evaluatorVersion":VERSION,"evaluatorSourceHash":manifest["evaluatorSourceHash"],"indicatorDefinitions":manifest["definitions"],"cacheGeneration":manifest["generation"],
            "testOnly":manifest.get("testOnly",False),"notice":"A filter match is not a recommendation or a backtest."}
