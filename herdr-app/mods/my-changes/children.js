// Which terminals are a coordinator's children, and in what order to show them. Pure: no herdr imports, so node can test it.

/** @typedef {{ address: string, task: string, branch: string, yours: boolean, reviewed: boolean }} Child */
/** @typedef {Child & { chip: string }} QueuedChild */

/** The children of the coordinator at `address`: their terminal, task, branch and review state. Pure. @returns {Child[]} */
export function childrenOf(all, address) {
  return all
    .filter((t) => t.labels?.role === "child" && t.labels?.coord === address)
    .map((t) => ({ address: t.address, task: t.labels?.task ?? t.address, branch: t.labels?.branch ?? "", yours: t.labels?.review === "yours", reviewed: t.labels?.review === "reviewed" }));
}

/** @param {Child} k @returns {QueuedChild} */
const queued = (k) => ({ ...k, chip: k.reviewed ? "Reviewed by you" : "" });

/** The coordinator's "needs you" list: children waiting for the user's review first, under a heading that counts them, then the rest. @param {Child[]} kids @returns {{ heading: string, waiting: QueuedChild[], rest: QueuedChild[] }} */
export function reviewQueue(kids) {
  const waiting = kids.filter((k) => k.yours).map(queued);
  const heading = waiting.length ? `Waiting for your review (${waiting.length})` : "Nothing is waiting for your review";
  return { heading, waiting, rest: kids.filter((k) => !k.yours).map(queued) };
}
