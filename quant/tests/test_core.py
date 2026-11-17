from dataclasses import replace,asdict
from datetime import datetime,timedelta,timezone
import numpy as np
import pytest
from souls_quant.core import *
from souls_quant.pipeline import *
from souls_quant.evaluation import *

ASOF="2027-01-01T00:00:00Z"
RIGHTS=Rights("TEST_FIXTURE","TEST-ONLY","automated test","2035-01-01T00:00:00Z",True,True,True)
def bars(n=320,instrument="TEST"):
    at=datetime(2024,1,1,10,tzinfo=timezone.utc)
    return [Bar(instrument,"TEST",(at+timedelta(days=i)).isoformat(),(at+timedelta(days=i,minutes=1)).isoformat(),
            100+i*.15,102+i*.15,98+i*.15,100.5+i*.15,1000+i,traded_value=(100.25+i*.15)*(1000+i)) for i in range(n)]
def members():
    return [{"instrument_id":"TEST","valid_from":"2020-01-01T00:00:00Z","known_at":"2020-01-01T00:00:00Z","valid_until":None,"source":"TEST historical constituents"}]
def scan():
    return {"schema":"scan-v3.1","universe":"TEST PIT","timeframe":"EOD","conditions":[{"field":"close_vs_sma","op":"gt","value":1,"period":20,"unit":"ratio"}],"costs":{"feeBps":3,"slippageBps":4,"taxBps":5},"exit":{"holdingBars":3},"dataSource":"TEST-ONLY"}

def test_indicators_against_direct_arithmetic():
    a=list(range(1,80));s=sma(a,20)
    assert np.isnan(s[:19]).all()
    for i in range(19,len(a)):assert s[i]==pytest.approx(sum(a[i-19:i+1])/20)
    assert np.isnan(ema(a,20)[:19]).all()
    assert rsi(a,14)[-1]==100 and rsi(list(reversed(a)),14)[-1]==0
    assert rsi([1]*80,14)[-1]==50 and np.isnan(rsi(a,14)[:14]).all()
    assert np.isnan(atr(bars(),14)[:13]).all() and np.isnan(volatility(a,20)[:20]).all()

@pytest.mark.parametrize("p",[0,1,True,-1,253,2.5])
def test_indicator_bounds(p):
    with pytest.raises(GateError):sma([1,2,3],p)

def test_rights_and_test_fixture_gate():
    for r,kwargs in [(RIGHTS,{}),(replace(RIGHTS,expires_at="2020-01-01T00:00:00Z"),{"allow_test":True}),(replace(RIGHTS,analysis=False),{"allow_test":True}),(replace(RIGHTS,team=False),{"team":True,"allow_test":True})]:
        with pytest.raises(GateError):r.check(ASOF,**kwargs)
    RIGHTS.check(ASOF,team=True,allow_test=True)

@pytest.mark.parametrize("change",[{"close":float("nan")},{"known_at":"2030-01-01T00:00:00Z"},{"volume":-1},{"finalized":False},{"high":1},{"delivery_pct":101}])
def test_bad_bars(change):
    with pytest.raises(GateError):replace(bars(1)[0],**change).validate(ASOF)

def test_calendar_and_pit_membership():
    b=bars(3);require_calendar(b,{"TEST":[x.at for x in b]})
    with pytest.raises(GateError):require_calendar(b,{"TEST":[x.at for x in b]+["2024-02-01T10:00:00Z"]})
    m=members()+[{"instrument_id":"FUTURE","valid_from":"2020-01-01T00:00:00Z","known_at":"2028-01-01T00:00:00Z","source":"fixture"}]
    assert constituents(m,ASOF)=={"TEST"}
    m[0]["valid_until"]="2023-01-01T00:00:00Z"
    assert constituents(m,ASOF)==set()

def test_corporate_actions_and_raw_immutability():
    b=bars(4);raw=[asdict(x) for x in b]
    split=Action("TEST","SPLIT",b[2].at,b[1].at,"TEST action","1",ratio_new_per_old=2)
    adjusted,_=adjust(b,[split],ASOF)
    assert adjusted[0].close==b[0].close/2 and adjusted[0].volume==b[0].volume*2 and adjusted[2]==b[2]
    assert [asdict(x) for x in b]==raw
    assert adjust(b,[replace(split,kind="BONUS",ratio_new_per_old=1.5)],ASOF)[0][0].close==pytest.approx(b[0].close/1.5)
    rights=replace(split,kind="RIGHTS",ratio_new_per_old=.25,subscription_price=80,prior_cum_price=100)
    adj,_=adjust(b,[rights],ASOF)
    assert adj[0].close==pytest.approx(b[0].close*.96) and adj[0].volume==b[0].volume
    with pytest.raises(GateError):adjust(b,[replace(rights,prior_cum_price=None)],ASOF)
    div=replace(split,kind="DIVIDEND",cash_dividend=5,prior_cum_price=100)
    assert adjust(b,[div],ASOF)[0]==b
    assert adjust(b,[div],ASOF,total_return=True)[0][0].close==pytest.approx(b[0].close*.95)
    assert adjust(b,[replace(split,known_at="2030-01-01T00:00:00Z")],ASOF)[0]==b
    with pytest.raises(GateError):adjust(b,[replace(split,kind="MERGER")],ASOF)

def test_asof_regimes_and_restatements():
    old={"at":"2024-01-01T00:00:00Z","known_at":"2024-01-01T01:00:00Z","value":20,"source":"TEST"}
    future={**old,"known_at":"2028-01-01T00:00:00Z","value":90}
    assert asof_value([old,future],ASOF)["value"]==20
    tag=regime([{**old,"value":20000}],[old,future],ASOF)
    assert tag["volatility"]=="NORMAL" and tag["indiaVix"]==20
    assert regime([],[],ASOF)["status"]=="UNKNOWN"
    assert regime([old],[{**old,"value":25}],ASOF)["volatility"]=="HIGH"

def test_liquidity_abstention_and_proxy_label():
    b=bars(30);r=liquid(b,20,min_average_value=1,min_delivery_pct=20)
    assert not r["eligible"] and r["missing"]==["delivery_pct"]
    proxy=liquid([replace(x,traded_value=None) for x in b],20)
    assert proxy["valueMethod"]=="CLOSE_TIMES_VOLUME_PROXY"
    assert proxy["averageTradedValue"]==pytest.approx(np.mean([x.close*x.volume for x in b[-20:]]))
    assert liquid(b[:1],20)["status"]=="INSUFFICIENT_HISTORY"

def test_factor_hc3_regression_and_multicollinearity():
    rng=np.random.default_rng(123);x=rng.normal(0,.01,100);y=.001+1.4*x+rng.normal(0,.001,100)
    r=attribution(y,{"market_beta":x},source="TEST",window="100 TEST sessions")
    assert r["status"]=="ESTIMATED" and r["coefficients"]["market_beta"]==pytest.approx(np.polyfit(x,y,1)[0])
    assert r["standardErrorsHC3"]["market_beta"]>0
    assert attribution(y,{"one":x,"two":x},source="TEST",window="TEST")["status"]=="ABSTAIN_MULTICOLLINEAR_OR_MISSING"
    assert attribution([.1],{"beta":[.2]},source="TEST",window="TEST")["status"]=="INSUFFICIENT_EVIDENCE"

def test_stats_zero_one_all_wins_all_losses_and_seed():
    assert stats([])["winRate"] is None and stats([.1])["status"]=="INSUFFICIENT_EVIDENCE"
    assert stats([-.01]*30)["winRate"]==0 and stats([.01]*30)["winRate"]==1
    assert stats([.01]*30)["profitFactor"] is None and stats([.1,-.1]*20)["profitFactor"]==pytest.approx(1)
    assert stats([.1,-.1],non_overlapping=False)["maxDrawdown"] is None
    assert stats([.1,-.1]*20)["bootstrapMean95"]==stats([.1,-.1]*20)["bootstrapMean95"]

def test_walkforward_purge_mature_labels_and_embargo():
    f=walk_forward(400,100,60,60,5,2);assert f
    for w in f:
        assert max(w.train)+5<min(w.validation)-2 and max(w.validation)+5<min(w.test)-2 and max(w.test)+5<w.end
    with pytest.raises(GateError):walk_forward(20,5,5,5,5,2)

def test_next_open_costs_and_no_halted_or_unavailable_fill():
    b=bars(120);s=scan();r=simulate(b,s,list(range(20,100)),members());assert r
    i=next(i for i,x in enumerate(b) if x.at==r[0]["signalAt"])
    assert r[0]["entryPriceModel"]==pytest.approx(b[i+1].open*1.0004) and r[0]["feesAndTaxFraction"]==pytest.approx(.0011)
    assert simulate([replace(x,tradable=False) for x in b],s,list(range(20,100)),members())==[]
    assert simulate([replace(x,known_at="2027-01-01T00:00:00Z") for x in b],s,list(range(20,100)),members())==[]

def test_reproducible_oos_and_comparability():
    kwargs=dict(dataset_hash="TEST-HASH",as_of=ASOF,train=120,validation=60,test=60,embargo=3,adjustment_version="TEST-NONE")
    a=evaluate_walk_forward(bars(420),[scan()],members(),**kwargs)
    b=evaluate_walk_forward(bars(420),[scan()],members(),**kwargs)
    assert a==b and a["manifest"]["sampleType"]=="OOS" and comparable(a["manifest"],b["manifest"])["comparable"]
    assert not comparable(a["manifest"],{**a["manifest"],"datasetHash":"OTHER"})["comparable"]
    assert len({x["entryAt"] for x in a["trades"]})==len(a["trades"])

def test_sector_aligned_dates_and_constituents():
    start=datetime(2024,1,1,tzinfo=timezone.utc)
    def hist(k):return [{"at":(start+timedelta(days=i)).isoformat(),"known_at":(start+timedelta(days=i,minutes=1)).isoformat(),"value":100+k*i,"source":"TEST"} for i in range(140)]
    m=[{**members()[0],"sector":"TESTSECTOR"}]
    r=sector_strength({"TESTSECTOR":hist(2)},hist(1),m,ASOF)[0]
    assert r["status"]=="COMPUTED" and r["relativeReturn"]["21"]>0 and r["pointInTimeMembers"]==["TEST"]
    assert sector_strength({"TESTSECTOR":hist(2)[:3]},hist(1),m,ASOF)[0]["status"]=="INSUFFICIENT_EVIDENCE"

def test_atomic_ingest_duckdb_cache_and_corruption(tmp_path):
    b=bars(100);cutoff=b[-1].known_at
    m=ingest(tmp_path/"lake",b,RIGHTS,cutoff,sessions={"TEST":[x.at for x in b]},memberships=members(),corporate_action_manifest={"complete":True,"source":"TEST","version":"no-actions-fixture"},allow_test=True)
    path=tmp_path/"lake"/"raw"/RIGHTS.provider/cutoff[:10]/m["version"]/"manifest.json"
    loaded,manifest=load_dataset(path,ASOF,allow_test=True);assert loaded==b
    first=publish_cache(tmp_path/"cache",loaded,manifest)
    files,before=cache_files(tmp_path/"cache");assert files
    r=screen(tmp_path/"cache",scan(),members(),cutoff,allow_test=True)
    assert r["matches"][0]["instrument_id"]=="TEST" and r["testOnly"]
    with pytest.raises(GateError):screen(tmp_path/"cache",scan(),members(),ASOF)
    assert publish_cache(tmp_path/"cache",loaded,manifest)["partitions"]==first["partitions"]
    with pytest.raises(GateError):screen(tmp_path/"cache",scan(),members(),"2020-01-01T00:00:00Z",allow_test=True)
    (tmp_path/"cache"/".writer-lock").write_text("fixture-lock")
    with pytest.raises(GateError):publish_cache(tmp_path/"cache",loaded,manifest)
    assert cache_files(tmp_path/"cache")[1]==before
    (path.parent/"bars.parquet").write_bytes(b"corrupt fixture")
    with pytest.raises(GateError):load_dataset(path,ASOF,allow_test=True)

def test_ast_rejects_code_operators_and_wrong_units():
    s=scan()
    for c in [{"field":"eval","op":"gt","value":1,"period":2,"unit":"INR"},
              {"field":"rsi","op":"lt;DROP TABLE x","value":35,"period":14,"unit":"percent"},
              {"field":"rsi","op":"lt","value":35,"period":14,"unit":"INR"},
              {"field":"rsi","op":"lt","value":float("nan"),"period":14,"unit":"percent"}]:
        with pytest.raises(GateError):validate_scan({**s,"conditions":[c]})

def test_future_bar_perturbation_cannot_change_past_signals():
    b=bars(150);s=scan();before=signal_mask(b,s)[:80]
    changed=b[:80]+[replace(x,open=x.open*3,high=x.high*3,low=x.low*3,close=x.close*3) for x in b[80:]]
    assert np.array_equal(before,signal_mask(changed,s)[:80])

def test_corporate_action_execution_units_and_unknown_terms_abstain():
    b=bars(80);s=scan()
    i=30
    split=Action("TEST","SPLIT",b[i+2].at,b[i].at,"TEST official split","1",ratio_new_per_old=2)
    # Split takes place inside a position entered the next day.
    changed=[replace(x,open=x.open/2,high=x.high/2,low=x.low/2,close=x.close/2,volume=x.volume*2) if j>=i+2 else x for j,x in enumerate(b)]
    trades=simulate(changed,s,[i],members(),[split])
    assert trades and trades[0]["exitShareUnits"]==2
    assert trades[0]["netReturn"]>-0.1
    rights=replace(split,kind="RIGHTS",ratio_new_per_old=.2,prior_cum_price=100,subscription_price=80)
    with pytest.raises(GateError):simulate(changed,s,[i],members(),[rights])

def test_hc3_standard_errors_match_independent_sandwich():
    rng=np.random.default_rng(88);x=rng.normal(size=80);y=.3+.7*x+rng.normal(size=80)*.1
    report=attribution(y,{"beta":x},source="TEST",window="TEST")
    design=np.column_stack([np.ones(80),x]);inverse=np.linalg.inv(design.T@design)
    coef=np.linalg.lstsq(design,y,rcond=None)[0];resid=y-design@coef
    covariance=np.zeros((2,2))
    for i,row in enumerate(design):
        leverage=row@inverse@row
        covariance+=(resid[i]/(1-leverage))**2*np.outer(row,row)
    expected=np.sqrt(np.diag(inverse@covariance@inverse))
    assert report["standardErrorsHC3"]["beta"]==pytest.approx(expected[1])
