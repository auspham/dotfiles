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

/**
 * The name a terminal goes by in the tree: the label its own agent row would show
 * (`names`, by address), else its task label, else whatever the terminal says.
 * hcoord children have no terminal name, so the row label is what tells them apart.
 */
export function displayName(terminal, names) {
  const label = names.get(terminal.address);
  // An automatic tab number says nothing about the agent.
  if (label && !/^\d+$/.test(label)) return label;
  return terminal.labels?.task || terminal.name || terminal.template || terminal.program?.name || terminal.address;
}

/** Tooltip for a lent child: the owner's display name, or its address when it is gone. */
export function lentNote(terminal, all, names) {
  const owner = terminal.labels?.owner;
  if (!owner) return null;
  const found = all.find((x) => x.address === owner);
  return `Lent by ${found ? displayName(found, names) : owner}`;
}
