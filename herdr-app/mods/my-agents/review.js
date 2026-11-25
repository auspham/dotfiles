// Whether an agent is waiting on the user's review.

/** The status word for a terminal handed to the user (`review=yours`): "review", unless it is working or blocked. */
export function reviewState(terminal, status) {
  if (terminal?.labels?.review !== "yours") return status;
  // A live working or blocked state is newer news than the handoff.
  return status === "working" || status === "blocked" ? status : "review";
}
