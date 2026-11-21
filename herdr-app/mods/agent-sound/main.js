// Plays the "done" sound when an agent you are looking at finishes.
// The app already covers agents that finish out of sight and agents that block.

import { View, div } from "gpui-kit";
import { agents, checking, playSound } from "herdr";

const POLL_MS = 500;

export default class AgentSound extends View {
  /** @type {Map<string, import("herdr").Status>} */
  last = new Map();

  init(_props, cx) {
    if (checking()) return;
    cx.timer.every(POLL_MS, () => this.poll());
  }

  poll() {
    const seen = new Set();
    for (const agent of agents()) {
      seen.add(agent.address);
      const before = this.last.get(agent.address);
      this.last.set(agent.address, agent.status);
      if (before === "working" && agent.status === "idle") playSound("done");
    }
    for (const address of this.last.keys()) if (!seen.has(address)) this.last.delete(address);
  }

  render() {
    return div().size_full();
  }
}
