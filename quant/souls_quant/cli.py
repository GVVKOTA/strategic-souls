from __future__ import annotations
import argparse
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
import json
import sys
from .core import Bar,Rights,GateError,VERSION,adjust
from .pipeline import ingest,load_dataset,publish_cache,screen

def main() -> int:
    parser=argparse.ArgumentParser(description="Provenance-gated local EOD research. Never executes trades.")
    sub=parser.add_subparsers(dest="command",required=True)
    sub.add_parser("health")
    p=sub.add_parser("work-once")
    p.add_argument("--catalog",type=Path,required=True)
    p.add_argument("--cache",type=Path,required=True)
    p=sub.add_parser("ingest")
    p.add_argument("--input",type=Path,required=True,help="Operator-reviewed JSON with bars, rights, sessions, memberships and corporateActions")
    p.add_argument("--root",type=Path,required=True)
    p.add_argument("--as-of",required=True)
    p=sub.add_parser("cache")
    p.add_argument("--manifest",type=Path,required=True)
    p.add_argument("--root",type=Path,required=True)
    p.add_argument("--as-of",required=True)
    p=sub.add_parser("screen")
    p.add_argument("--manifest",type=Path,required=True)
    p.add_argument("--cache",type=Path,required=True)
    p.add_argument("--scan",type=Path,required=True)
    p.add_argument("--as-of",required=True)
    args=parser.parse_args()
    try:
        if args.command=="health":
            result={"worker":VERSION,"status":"LOCAL_PROCESS_READY","marketData":"NOT_CONFIGURED","queue":"NOT_CONNECTED","tradeExecution":False}
        elif args.command=="work-once":
            from .worker import work_once
            result=work_once(args.catalog,args.cache)
        elif args.command=="ingest":
            data=json.loads(args.input.read_text(encoding="utf-8"))
            result=ingest(args.root,[Bar(**b) for b in data["bars"]],Rights(**data["rights"]),args.as_of,
                          sessions=data["sessions"],memberships=data["memberships"],corporate_action_manifest=data["corporateActions"])
        elif args.command=="cache":
            bars,manifest=load_dataset(args.manifest,args.as_of)
            if manifest["corporateActions"].get("events"):
                from .core import Action
                bars,adjustment=adjust(bars,[Action(**a) for a in manifest["corporateActions"]["events"]],args.as_of)
                manifest={**manifest,"adjustment":adjustment}
            result=publish_cache(args.root,bars,manifest)
        else:
            _,manifest=load_dataset(args.manifest,args.as_of)
            result=screen(args.cache,json.loads(args.scan.read_text(encoding="utf-8")),manifest["memberships"],args.as_of)
        print(json.dumps(result,indent=2,allow_nan=False))
        return 0
    except (GateError,KeyError,ValueError,OSError) as exc:
        print(json.dumps({"status":"BLOCKED","error":str(exc),"resultCreated":False}),file=sys.stderr)
        return 2

if __name__=="__main__":
    raise SystemExit(main())
