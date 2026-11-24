// Sounds and toasts for agents, replacing Herdr's built-in alerts (settings.json sounds.enabled is false).
// Why: the built-in alerts cannot skip one agent, and a coordinator's children should not ding when they finish.

import { View, div } from "gpui-kit";
import { agents, checking, notify, playSound, terminals } from "herdr";
import { alertFor } from "./alerts.js";

const POLL_MS = 500;

export default class MySound extends View {
  /** @type {Map<string, string>} */
  last = new Map();

  init(_props, cx) {
    if (checking()) return;
    cx.timer.every(POLL_MS, () => this.poll());
  }

  poll() {
    const roles = new Map(terminals().map((t) => [t.address, t.labels?.role]));
    const seen = new Set();
    for (const agent of agents()) {
      seen.add(agent.address);
      const alert = alertFor(this.last.get(agent.address), agent.status, roles.get(agent.address));
      this.last.set(agent.address, agent.status);
      if (alert) this.announce(agent, alert);
    }
    for (const address of this.last.keys()) if (!seen.has(address)) this.last.delete(address);
  }

  // A sound always; a toast too unless the person is already looking at that agent.
  announce(agent, alert) {
    playSound(alert.sound);
    if (agent.focused) return;
    const name = agent.title || agent.space_name || agent.address;
    notify({ title: `${name} ${alert.verb}`, level: alert.level, action: { name: "agent.focus", args: { terminal: agent.address } } });
  }

  render() {
    return div().size_full();
  }
}
