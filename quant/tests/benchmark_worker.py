"""Explicit synthetic software benchmark. Never a market-data or investment result."""
from pathlib import Path
from tempfile import TemporaryDirectory
from time import perf_counter
from datetime import datetime,timezone
import argparse,json,os,platform,tracemalloc
import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
from test_core import bars,scan,RIGHTS
from souls_quant.core import digest
from souls_quant.pipeline import ingest,publish_cache,screen
from souls_quant.evaluation import signal_mask

def main():
    parser=argparse.ArgumentParser();parser.add_argument("--output",type=Path,required=True);args=parser.parse_args()
    root=Path(__file__).resolve().parents[2]/".sites-runtime";root.mkdir(exist_ok=True)
    tracemalloc.start()
    with TemporaryDirectory(prefix="quant-benchmark-",dir=root) as scratch:
        directory=Path(scratch).resolve()
        assert directory.is_relative_to(root.resolve())
        universe=160;sessions=260
        groups=[bars(sessions,"TEST_"+str(i)) for i in range(universe)]
        data=[b for g in groups for b in g];asof=groups[0][-1].known_at
        members=[{"instrument_id":g[0].instrument_id,"valid_from":"2020-01-01T00:00:00Z","known_at":"2020-01-01T00:00:00Z","valid_until":None,"source":"TEST-ONLY"} for g in groups]
        calendar={g[0].instrument_id:[b.at for b in g] for g in groups}
        start=perf_counter()
        manifest=ingest(directory/"lake",data,RIGHTS,asof,sessions=calendar,memberships=members,corporate_action_manifest={"complete":True,"source":"TEST-ONLY","version":"TEST-NO-ACTIONS"},allow_test=True)
        publish_cache(directory/"cache",data,manifest)
        build_ms=(perf_counter()-start)*1000
        raw=next((directory/"lake").rglob("bars.parquet"))
        _,peak=tracemalloc.get_traced_memory()
        tracemalloc.stop()
        strategy=scan()
        cached=[];baseline=[];matches=None
        # One warmup and 12 timed paired repetitions.
        for iteration in range(13):
            start=perf_counter();r=screen(directory/"cache",strategy,members,asof,allow_test=True);duration=(perf_counter()-start)*1000
            start=perf_counter();records=pq.ParquetFile(raw).read().to_pylist()
            from souls_quant.core import Bar
            indexed={}
            for row in records:indexed.setdefault(row["instrument_id"],[]).append(Bar(**row))
            ids=sorted(k for k,g in indexed.items() if signal_mask(g,strategy)[-1])
            baseline_ms=(perf_counter()-start)*1000
            assert ids==sorted(m["instrument_id"] for m in r["matches"])
            matches=len(ids)
            if iteration:cached.append(duration);baseline.append(baseline_ms)
        result={"generatedAt":datetime.now(timezone.utc).isoformat(),"testOnly":True,"dataset":"SYNTHETIC SOFTWARE FIXTURE, NOT MARKET DATA",
                "rows":len(data),"instruments":universe,"sessionsPerInstrument":sessions,"repetitions":12,"warmups":1,
                "cachedEndToEndP50Ms":float(np.median(cached)),"cachedEndToEndP95Ms":float(np.percentile(cached,95)),
                "uncachedReadAndRecomputeP50Ms":float(np.median(baseline)),"uncachedReadAndRecomputeP95Ms":float(np.percentile(baseline,95)),
                "medianSpeedRatio":float(np.median(baseline)/np.median(cached)),"matchingResultsVerified":True,"matchCount":matches,
                "ingestAndCacheBuildMs":build_ms,"cacheBytes":sum(p.stat().st_size for p in (directory/"cache").rglob("*.parquet")),
                "pythonPeakTrackedBytes":peak,"memoryLimitations":"Python allocations only. DuckDB native memory and OS page cache excluded.",
                "machine":{"os":platform.platform(),"python":platform.python_version(),"logicalProcessors":os.cpu_count()},
                "timingsInstrumented":False,"cacheBuildMemoryInstrumented":True,"method":"Cached includes manifest/hash read, DuckDB connection and query. Baseline includes Parquet read, materialization and recalculation. Does not establish universal latency or field performance."}
        args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(result,indent=2),encoding="utf-8")
        print(json.dumps(result,indent=2))
if __name__=="__main__":main()
