// Where a branch forked from, for the "Since base" range. No herdr imports, so node can test it.

/** @typedef {{ name: string, rev: string }} Base */
/** @typedef {(args: string[]) => Promise<{ code: number, stdout: string }>} Git */

export const BASES = ["origin/HEAD", "main", "master", "origin/main", "origin/master", "develop"];

/** Whether two shas name the same commit, when either may be abbreviated. @param {string} a @param {string} b */
const sameRev = (a, b) => {
  const x = a.toLowerCase(), y = b.toLowerCase();
  return Boolean(x && y) && (x.startsWith(y) || y.startsWith(x));
};

/** The candidates worth comparing, in their priority order: none that is HEAD itself, and one per commit. Pure. @param {Base[]} candidates @param {string} head @returns {Base[]} */
export function forkCandidates(candidates, head) {
  const out = [];
  for (const c of candidates) if (c.rev && !sameRev(c.rev, head) && !out.some((o) => sameRev(o.rev, c.rev))) out.push(c);
  return out;
}

/**
 * The fork point nearest HEAD: the candidate every other one is an ancestor of. `tips` is what
 * `git merge-base --independent` printed for the candidates, the ones no other candidate descends from.
 * When several are left (a branch of a feature branch that later merged master), the first in priority order wins. Pure.
 * @param {Base[]} candidates from forkCandidates @param {string[]} tips @returns {Base | null}
 */
export function nearestBase(candidates, tips) {
  return candidates.find((c) => tips.some((t) => sameRev(t, c.rev))) ?? candidates[0] ?? null;
}

/**
 * The branch HEAD forked from, among the coordinator guide's fork point (when it is an ancestor of HEAD),
 * a child's base label and the usual base names: the nearest one to HEAD.
 * @param {Git} git @param {string} head HEAD's sha @param {Base | null} guide @param {string | null} child
 * @returns {Promise<Base | null>}
 */
export async function findFork(git, head, guide, child) {
  const candidates = [];
  if (guide && (await git(["merge-base", "--is-ancestor", guide.rev, "HEAD"])).code === 0) candidates.push({ name: guide.name, rev: guide.rev });
  const forkWith = async (ref, name) => {
    const mb = await git(["merge-base", "HEAD", ref]);
    if (mb.code === 0 && mb.stdout.trim()) candidates.push({ name, rev: mb.stdout.trim() });
  };
  if (child) await forkWith(child, child);
  for (const ref of BASES) await forkWith(ref, ref === "origin/HEAD" ? ref : ref.replace(/^origin\//, ""));
  const live = forkCandidates(candidates, head);
  const tips = live.length > 1 ? (await git(["merge-base", "--independent", ...live.map((c) => c.rev)])).stdout.split("\n").map((s) => s.trim()).filter(Boolean) : [];
  const found = nearestBase(live, tips);
  if (found?.name !== "origin/HEAD") return found;
  // origin/HEAD names no branch itself; show the one it points at ("master"), not "HEAD".
  const target = (await git(["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"])).stdout.trim();
  return { name: (target || "HEAD").replace(/^origin\//, ""), rev: found.rev };
}
