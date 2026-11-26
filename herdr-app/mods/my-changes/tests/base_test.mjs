import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { forkCandidates, nearestBase, findFork } from "../base.js";

const A = "a".repeat(40), B = "b".repeat(40), C = "c".repeat(40);
assert.deepEqual(forkCandidates([{ name: "x", rev: A }, { name: "y", rev: B }], A).map((c) => c.name), ["y"], "HEAD itself is no fork point");
assert.deepEqual(forkCandidates([{ name: "guide", rev: "bbbbbbb" }, { name: "master", rev: B }, { name: "empty", rev: "" }], A).map((c) => c.name), ["guide"], "a short sha and a full one naming the same commit count once, the first kept");
assert.equal(nearestBase([{ name: "x", rev: A }, { name: "y", rev: B }], [B])?.name, "y", "the candidate the others are ancestors of wins");
assert.equal(nearestBase([{ name: "x", rev: A }, { name: "y", rev: B }, { name: "z", rev: C }], [C, B])?.name, "y", "of candidates no other descends from, the first in priority order wins");
assert.equal(nearestBase([{ name: "x", rev: A }], [])?.name, "x", "a lone candidate needs no comparing");
assert.equal(nearestBase([], []), null, "no candidates, no base");

// Real repositories: each scenario builds its history, then asks findFork for HEAD's base.
const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
function repo() {
  const dir = mkdtempSync(join(tmpdir(), "fork-test-"));
  const run = (...args) => execFileSync("git", args, { cwd: dir, env, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  const commit = (name) => { writeFileSync(join(dir, name), name); run("add", name); run("commit", "-q", "-m", name); return run("rev-parse", "HEAD"); };
  const git = async (args) => {
    try { return { code: 0, stdout: execFileSync("git", args, { cwd: dir, env, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }) }; }
    catch (e) { return { code: e.status ?? 1, stdout: e.stdout ?? "" }; }
  };
  run("init", "-q", "-b", "master");
  return { dir, run, commit, git, fork: (guide, child) => findFork(git, run("rev-parse", "HEAD"), guide, child) };
}

{
  // A child handed off from a feature branch, rebased onto master after the feature merged; local master is stale.
  const r = repo();
  r.commit("m1");
  r.run("checkout", "-q", "-b", "feature"); r.commit("p1"); const p2 = r.commit("p2");
  r.run("checkout", "-q", "master"); r.run("merge", "-q", "--no-ff", "-m", "merge feature", "feature");
  r.run("checkout", "-q", "-b", "upstream"); const tip = r.commit("m2");
  r.run("update-ref", "refs/remotes/origin/master", tip); r.run("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/master");
  r.run("checkout", "-q", "-b", "child"); r.commit("c1"); r.commit("c2");
  const got = await r.fork({ name: "feature", rev: p2.slice(0, 7) }, "feature");
  assert.deepEqual(got, { name: "master", rev: tip }, "the guide's fork point and the stale feature branch lose to origin/master's nearer fork point, named for the branch origin/HEAD points at");
  rmSync(r.dir, { recursive: true, force: true });
}

{
  // A branch that merged master in: its base is master as merged, not where it first forked.
  const r = repo();
  const m1 = r.commit("m1");
  r.run("checkout", "-q", "-b", "work"); r.commit("w1");
  r.run("checkout", "-q", "master"); const m2 = r.commit("m2");
  r.run("checkout", "-q", "work"); r.run("merge", "-q", "--no-ff", "-m", "merge master", "master"); r.commit("w2");
  assert.deepEqual(await r.fork({ name: "master", rev: m1 }, null), { name: "master", rev: m2 }, "the master it merged in is nearer than its first fork point");
  rmSync(r.dir, { recursive: true, force: true });
}

{
  // A child of a feature branch that later merged master: neither fork point descends from the other.
  const r = repo();
  r.commit("m1");
  r.run("checkout", "-q", "-b", "feature"); const x1 = r.commit("x1");
  r.run("checkout", "-q", "master"); r.commit("m2");
  r.run("checkout", "-q", "-b", "child", "feature"); r.commit("c1"); r.run("merge", "-q", "--no-ff", "-m", "merge master", "master");
  assert.deepEqual(await r.fork(null, "feature"), { name: "feature", rev: x1 }, "the child's own base label wins a tie");
  rmSync(r.dir, { recursive: true, force: true });
}

{
  // Working on master itself: every fork point is HEAD.
  const r = repo();
  r.commit("m1"); const head = r.commit("m2");
  assert.equal(await r.fork({ name: "master", rev: head }, "master"), null, "HEAD is never its own base");
  r.run("checkout", "-q", "-b", "topic"); r.commit("t1");
  assert.deepEqual(await r.fork({ name: "master", rev: "0".repeat(40) }, null), { name: "master", rev: head }, "a guide fork point that is not in HEAD's history is ignored");
  rmSync(r.dir, { recursive: true, force: true });
}
