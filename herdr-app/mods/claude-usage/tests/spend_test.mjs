import assert from "node:assert/strict";
import { dollars, parseCost, pickView, spendTotals } from "../spend.js";

const now = new Date(2026, 10, 25, 15, 0, 0).getTime();
const at = (day, hour = 9) => new Date(2026, 10, day, hour, 0, 0).getTime() / 1000;
const file = (cost, secs) => JSON.stringify({ session: "s", cost, model: "Opus", at: secs, started: secs });
const totals = (files) => spendTotals(files.map(parseCost).filter(Boolean), now);

assert.equal(totals([file(2, at(25))]).today, 2, "a session counts toward today when it last reported today");
assert.equal(totals([file(2, at(24, 23))]).today, 0, "a session that last reported yesterday is not today");

assert.deepEqual(totals([file(1, at(25)), "{not json", file("3", at(25)), file(null, at(25))]),
  { today: 1, week: 1, month: 1 }, "a damaged cost file is skipped");

const week = totals([file(1, at(25)), file(2, at(19)), file(4, at(18))]);
assert.equal(week.week, 3, "last 7 days includes today");
assert.equal(week.month, 7, "this month sums every session since the 1st");

assert.equal(totals([file(5, new Date(2026, 9, 31).getTime() / 1000)]).month, 0, "last month is not this month");

assert.equal(pickView({ rate_limits: { five_hour: { used_percentage: 3 } }, at: 1 }), "limits", "rate limits present keeps the limit bars");
assert.equal(pickView({ rate_limits: null, at: 1 }), "spend", "no rate limits shows the spend view");
assert.equal(pickView(null), "spend", "no usage file shows the spend view");

assert.equal(dollars(1.005 * 2), "$2.01");
console.log("spend tests passed");
