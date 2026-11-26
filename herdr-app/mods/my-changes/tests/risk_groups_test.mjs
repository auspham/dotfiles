import assert from "node:assert/strict";
import { LEVELS, pathFlags, levelOf, riskGroups } from "../triage.js";

const areas = ["auth", "casino", "wallet", "community", "payments", "docs", "session", "promo"];
const dirs = ["api", "types", "db/migrations", "lib/utils", "__unittests__", "schema"];
const files = [];
for (let i = 0; i < 1500; i++) {
  const ext = i % 9 === 0 ? ".test.ts" : i % 13 === 0 ? ".sql" : i % 17 === 0 ? ".md" : i % 19 === 0 ? ".lock" : ".ts";
  files.push({ path: `services/${areas[i % areas.length]}/${dirs[(i * 7) % dirs.length]}/file${i}${ext}`, status: i % 11 === 0 ? "D" : "M", add: (i * 37) % 200, del: (i * 11) % 50 });
}
files.push({ path: "yarn.lock", status: "M", add: 900, del: 900 });

let flagCalls = 0;
const flagsOf = (f) => { flagCalls++; return pathFlags(f); };
const scored = files.map((f) => { const flags = flagsOf(f); return { f, flags, level: levelOf(flags, null) }; });
const groups = riskGroups(scored);
assert.equal(flagCalls, files.length, "each file's flags are worked out once, not per comparison");

// The order the Risk view always had, from a comparator that recomputes the flags each time.
const weight = (f) => pathFlags(f).filter((x) => x.level === "high").length;
const expected = LEVELS.map((level) => files.filter((f) => levelOf(pathFlags(f), null) === level)
  .sort((a, b) => weight(b) - weight(a) || (b.add + b.del) - (a.add + a.del) || a.path.localeCompare(b.path)).map((f) => f.path));
assert.deepEqual(groups.map((g) => g.level), LEVELS, "one group per level, in level order");
assert.deepEqual(groups.map((g) => g.files.map((f) => f.path)), expected, "files sort as before: most high flags, then biggest change, then by path");
assert.equal(groups.reduce((n, g) => n + g.files.length, 0), files.length, "every file lands in exactly one group");
assert.ok(groups[0].files.length > 0 && groups[2].files.some((f) => f.path === "yarn.lock"), "the fixture fills the high and skim groups");
