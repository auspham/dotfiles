// Closing a coordinator with its children from the Agents list: who goes, and what to tell the user.

/**
 * How many live children `hcoord close <coord>` would stop: those whose `coord` label names it now,
 * borrowed ones included and lent-out ones not.
 * @param {{ address: string, state?: string, labels?: Record<string, string> }[]} all terminals()
 * @param {string} coord the coordinator's address
 * @returns {number}
 */
export function liveChildren(all, coord) {
  return all.filter((t) => t.state === "live" && t.labels?.role === "child" && t.labels?.coord === coord).length;
}

/** "1 agent", "3 agents". @param {number} n @returns {string} */
export const agentCount = (n) => `${n} agent${n === 1 ? "" : "s"}`;

/**
 * The toast for what `hcoord close` printed: the kept worktrees by name and why, else that the clean ones went.
 * @param {{ code: number, stdout: string, stderr: string }} result
 * @returns {{ title: string, body: string, level: "success" | "warning" | "error" }}
 */
export function closeToast(result) {
  if (result.code !== 0) {
    const why = result.stderr.trim().split("\n").at(-1)?.replace(/^hcoord: /, "") || `hcoord exited with ${result.code}`;
    return { title: "Could not close the coordinator", body: why, level: "error" };
  }
  const lines = result.stdout.split("\n");
  const kept = lines.map((l) => /^kept the worktree of (\S+) at .*: (.+)$/.exec(l)).filter(Boolean).map((m) => ({ name: m[1], why: m[2] }));
  const closed = /^closed the coordinator and (\d+) agents/.exec(lines.find((l) => l.startsWith("closed ")) ?? "");
  const title = `Closed the coordinator and ${agentCount(Number(closed?.[1] ?? 0))}`;
  // The toast shows one line, so the names come first and a shared reason is said once.
  const whys = new Set(kept.map((k) => k.why));
  const names = whys.size === 1 ? `${kept.map((k) => k.name).join(", ")}: ${kept[0].why}` : kept.map((k) => `${k.name} (${k.why})`).join(", ");
  if (kept.length) return { title, body: `Kept ${names}. Branches are kept.`, level: "warning" };
  return { title, body: "Removed their worktrees. Branches are kept.", level: "success" };
}
