// Which terminals are a coordinator's children. Pure: no herdr imports, so node can test it.

/** The children of the coordinator at `address`: their terminal, task, branch and whether the review is the user's. Pure. */
export function childrenOf(all, address) {
  return all
    .filter((t) => t.labels?.role === "child" && t.labels?.coord === address)
    .map((t) => ({ address: t.address, task: t.labels?.task ?? t.address, branch: t.labels?.branch ?? "", yours: t.labels?.review === "yours" }));
}
