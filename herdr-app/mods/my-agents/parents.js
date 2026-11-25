// Where a terminal sits in the Agents tree, and whether it is on loan.

/**
 * The address a terminal nests under: a child of `hcoord spawn` goes under the
 * coordinator in its `coord` label (the borrower while lent), anything else under
 * its herdr parent.
 */
export function parentOf(terminal) {
  const labels = terminal.labels ?? {};
  const coord = labels.role === "child" ? labels.coord : "";
  // A label pointing at itself would make the tree recurse forever.
  if (coord && coord !== terminal.address) return coord;
  return terminal.parent ?? null;
}

/** A child is lent while its `owner` label names the coordinator that lent it. */
export function isLent(terminal) {
  return Boolean(terminal.labels?.owner);
}

/** Tooltip for a lent child: the owner's display name, or its address when it has none. */
export function lentNote(terminal, all) {
  const owner = terminal.labels?.owner;
  if (!owner) return null;
  const found = all.find((x) => x.address === owner);
  return `Lent by ${found?.name || owner}`;
}
