from __future__ import annotations
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request,urlopen
from typing import Any
import json
import os
from .core import GateError,VERSION
from .pipeline import load_dataset,publish_cache,screen

def call(name: str, arguments: dict[str,Any]) -> Any:
    url=os.environ.get("SUPABASE_URL","")
    parsed=urlparse(url)
    if not (parsed.scheme=="https" or parsed.scheme=="http" and parsed.hostname in ("localhost","127.0.0.1")):
        raise GateError("Supported HTTPS backend or local loopback required")
    token=os.environ.get("QUANT_WORKER_ACCESS_TOKEN")
    key=os.environ.get("SUPABASE_PUBLISHABLE_KEY")
    if not token or not key:
        raise GateError("A separately authorized worker identity is required")
    req=Request(url.rstrip("/")+"/rest/v1/rpc/v3_"+name,data=json.dumps(arguments).encode(),method="POST",
                headers={"Authorization":"Bearer "+token,"apikey":key,"Content-Type":"application/json"})
    with urlopen(req,timeout=20) as response:
        return json.load(response)

def work_once(catalog_path: Path,cache_root: Path) -> dict[str,Any]:
    """Catalog is operator-controlled local mapping of allowed dataset IDs to private manifests."""
    catalog=json.loads(catalog_path.read_text(encoding="utf-8"))
    job=call("worker_claim",{})
    if job is None:
        return {"status":"IDLE"}
    try:
        entry=catalog.get(job["datasetId"])
        if not isinstance(entry,dict) or not entry.get("manifest"):
            raise GateError("Claimed dataset is not in the reviewed local catalog")
        path=Path(entry["manifest"]).resolve()
        bars,manifest=load_dataset(path,job["manifest"]["asOf"])
        if manifest["version"]!=job["datasetHash"]:
            raise GateError("Queue dataset hash differs from reviewed local manifest")
        if manifest["corporateActions"].get("events"):
            from .core import Action,adjust
            bars,_=adjust(bars,[Action(**a) for a in manifest["corporateActions"]["events"]],job["manifest"]["asOf"])
        cache=cache_root/job["datasetHash"]
        publish_cache(cache,bars,manifest)
        result=screen(cache,job["ast"],manifest["memberships"],job["manifest"]["asOf"])
    except (GateError,OSError,KeyError,ValueError) as exc:
        result={"status":"BLOCKED","reason":str(exc) if isinstance(exc,GateError) else 'Local dataset unavailable; operator investigation required.',"performanceCreated":False}
    confirmed=call("worker_complete",{"p":{"id":job["id"],"datasetHash":job["datasetHash"],"evaluatorVersion":VERSION,"result":result}})
    if not confirmed or not confirmed.get('saved'):
        return {"id":job["id"],"status":"BLOCKED","reason":"Backend did not confirm completion; rights or access may have changed."}
    return {"id":job["id"],"status":result["status"]}
