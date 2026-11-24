import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { notificationHref, notificationTarget } from "../../backend/services/community/notification-target.ts";
import { triggeredPriceAlert } from "../../backend/engines/price-alert.ts";
import { normalizeIndianReportPeriods } from "../../backend/services/market-data/indian-report-periods.ts";
import { MAP_ENTER_GLOBE_ZOOM, MAP_EXIT_ZOOM, MAP_START_ZOOM, RETURN_GLOBE_ZOOM, mapFocus } from "../../frontend/features/global/globe-projection.ts";

test("X1 maps typed notifications to exact local destinations and rejects malformed targets", () => {
  const id = "fixture-identifier", anchor = "fixture-reply";
  const routes = [
    ["MESSAGE", "view=community&tab=chats&thread="],
    ["SOUL_LIKE", "view=community&tab=souls&post="],
    ["MENTION", "view=community&tab=rooms&room="],
    ["SCAN_COMPLETE", "view=strategy&scan="],
    ["PRICE_ALERT", "view=global&section=price-alerts&alert="],
    ["ECONOMIC_EVENT", "view=global&section=calendar&event="],
  ];
  for (const [kind, path] of routes) assert.equal(notificationHref(notificationTarget(kind, id)), "/?" + path + id);
  assert.equal(notificationHref(notificationTarget("NEW_FOLLOWER", "vishnu")), "/?view=community&tab=souls&profile=vishnu");
  assert.equal(notificationHref(notificationTarget("SECURITY", "")), "/?view=settings&section=security");
  assert.equal(notificationHref(notificationTarget("SYSTEM", "")), "/?view=settings&section=about");
  assert.equal(notificationTarget("SOUL_COMMENT", id, "soul-comment:" + anchor).anchor, anchor);
  for (const invalid of ["https://example.invalid", "../redirect", "", "%0a"]) assert.equal(notificationTarget("MESSAGE", invalid), null);
  assert.equal(notificationTarget("UNKNOWN_KIND", id), null);
});

test("X1 alert thresholds use real crossing or prior-close percentage and exact equality", () => {
  assert.equal(triggeredPriceAlert("ABOVE", 110, 100, 110), true);
  assert.equal(triggeredPriceAlert("ABOVE", 110, 110, 111), false);
  assert.equal(triggeredPriceAlert("BELOW", 99, 100, 99), true);
  assert.equal(triggeredPriceAlert("RISE", 10, 100, 110), true);
  assert.equal(triggeredPriceAlert("FALL", 10, 100, 90), true);
  assert.equal(triggeredPriceAlert("ABOVE", 110, 0, 115), false);
  assert.equal(triggeredPriceAlert("FALL", 10, Infinity, 90), false);
});

test("X1 additive alert migration delivers once without a Body ID and removes only dependent notifications", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync("drizzle").filter((name) => name.endsWith(".sql")).sort())
    db.exec(readFileSync("drizzle/" + file, "utf8"));
  const subject = "ordinary-fixture", day = "2026-11-23";
  db.prepare("INSERT INTO accounts(subject,alias,consent_at,consent_version,adult_confirmed,last_active) VALUES(?,?,?,?,1,?)")
    .run(subject, "Fixture", day, "2026-11-14-v4", day);
  db.prepare("INSERT INTO x1_price_alerts(id,subject,instrument_id,rule,threshold,recurring,state,created_at) VALUES(?,?,?,?,?,?,?,?)")
    .run("alert-fixture-01", subject, "NSE:FIXTURE", "ABOVE", 100, 1, "ACTIVE", day);
  const trigger = db.prepare("UPDATE x1_price_alerts SET trigger_session=? WHERE id='alert-fixture-01'");
  trigger.run(day); trigger.run(day);
  assert.equal(db.prepare("SELECT count(*) n FROM x1_all_notices WHERE subject=?").get(subject).n, 1);
  db.prepare("INSERT INTO x1_account_notices(id,subject,kind,target_id,event_key,created_at) VALUES (?,?,?,?,?,?)")
    .run("system-fixture-01", subject, "SYSTEM", "about", "system:fixture", day);
  db.exec("DELETE FROM x1_price_alerts WHERE id='alert-fixture-01'");
  assert.equal(db.prepare("SELECT count(*) n FROM x1_all_notices WHERE subject=?").get(subject).n, 1);
  assert.equal(db.prepare("SELECT kind FROM x1_all_notices WHERE subject=?").get(subject).kind, "SYSTEM");
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  db.close();
});

test("X1 regional projection bounds polar and antimeridian focus with distinct handoff thresholds", () => {
  assert.deepEqual(mapFocus({ lat: 22, lon: 78 }), { lat: 22, lon: 78 });
  assert.deepEqual(mapFocus({ lat: 90, lon: 181 }), { lat: 85, lon: -179 });
  assert.ok(MAP_START_ZOOM > MAP_EXIT_ZOOM);
  assert.ok(MAP_ENTER_GLOBE_ZOOM > RETURN_GLOBE_ZOOM);
});

test("X1 Indian API filings match exact instrument identity and withhold unsourced financial values", () => {
  const statement = { Type:"Annual", EndDate:"2026-03-31 00:00:00", StatementDate:"2026-04-29",
    stockFinancialMap:{ INC:[{displayName:"Revenue",value:12345}] } };
  const payload = { companyProfile:{ exchangeCodeNse:"FIXTURE", isInId:"INE000A01011" },
    financials:[statement, { ...statement, EndDate:"2026-02-30" }, { ...statement, EndDate:"2027-03-31" }] };
  const periods = normalizeIndianReportPeriods(payload, "FIXTURE", "2026-11-25");
  assert.deepEqual(periods, [{period:"ANNUAL",end:"2026-03-31",statementDate:"2026-04-29",sections:["INCOME"]}]);
  assert.throws(() => normalizeIndianReportPeriods(payload, "DIFFERENT", "2026-11-25"), /identity/);
});
