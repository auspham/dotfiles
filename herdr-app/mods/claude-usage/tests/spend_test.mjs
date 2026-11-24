import assert from "node:assert/strict";
import { dollars, parseCost, pickViews, spendTotals } from "../spend.js";

const now = new Date(2026, 10, 25, 15, 0, 0).getTime();
const at = (day, hour = 9) => new Date(2026, 10, day, hour, 0, 0).getTime() / 1000;
const file = (cost, secs, limits) => JSON.stringify({ session: "s", cost, model: "Opus", at: secs, started: secs, ...(limits === undefined ? {} : { limits }) });
const totals = (files) => spendTotals(files.map(parseCost).filter(Boolean), now);

assert.equal(totals([file(2, at(25))]).today, 2, "a session counts toward today when it last reported today");
assert.equal(totals([file(2, at(24, 23))]).today, 0, "a session that last reported yesterday is not today");

assert.deepEqual(totals([file(1, at(25)), "{not json", file("3", at(25)), file(null, at(25))]),
  { today: 1, week: 1, month: 1 }, "a damaged cost file is skipped");

const week = totals([file(1, at(25)), file(2, at(19)), file(4, at(18))]);
assert.equal(week.week, 3, "last 7 days includes today");
assert.equal(week.month, 7, "this month sums every session since the 1st");

assert.equal(totals([file(5, new Date(2026, 9, 31).getTime() / 1000)]).month, 0, "last month is not this month");

assert.equal(totals([file(4, at(25), true), file(1, at(25), false)]).today, 1, "personal sessions are not counted in work spend");
assert.equal(totals([file(3, at(25))]).today, 3, "an old cost file without a limits field counts as work");

const reading = (hoursAgo) => ({ rate_limits: { five_hour: { used_percentage: 3 } }, at: now / 1000 - hoursAgo * 3600 });
const entries = (...files) => files.map(parseCost);
const both = pickViews(reading(1), entries(file(1, at(25), false)), now);
assert.deepEqual(both, { limits: true, spend: true }, "both views show when both accounts are active");
assert.equal(pickViews(reading(7), [], now).limits, false, "the limit bars hide when no reading for 6 hours");
assert.equal(pickViews(reading(5), [], now).limits, true, "a reading under 6 hours old keeps the bars");
assert.equal(pickViews({ rate_limits: null, at: now / 1000 }, [], now).limits, false, "a reading without limits shows no bars");
assert.equal(pickViews(null, entries(file(1, at(25), true)), now).spend, false, "personal sessions alone do not open the spend section");
assert.equal(pickViews(null, entries(file(1, new Date(2026, 9, 31).getTime() / 1000)), now).spend, false, "last month's work does not open the spend section");

assert.equal(dollars(1.005 * 2), "$2.01");
console.log("spend tests passed");
