// Sounds and toasts for agents, replacing Herdr's built-in alerts (settings.json sounds.enabled is false).
// Why: the built-in alerts cannot skip one agent, and a coordinator's children should not ding when they finish.

import { View, div } from "gpui-kit";
import { agents, appHome, checking, notify, playSound, readTextFile, terminals } from "herdr";
import { alertFor, isQuiet, parseArchived } from "./alerts.js";

const POLL_MS = 500;
const ARCHIVE_MS = 3000;

export default class MySound extends View {
  /** @type {Map<string, string>} */
  last = new Map();

  /** @type {Set<string>} */
  archived = new Set();

  init(_props, cx) {
    if (checking()) return;
    cx.timer.every(POLL_MS, () => this.poll());
    const load = () => readTextFile(`${appHome()}/archived-spaces.json`).catch(() => null).then((text) => { this.archived = parseArchived(text); });
    load();
    cx.timer.every(ARCHIVE_MS, load);
  }

  poll() {
    const roles = new Map(terminals().map((t) => [t.address, t.labels?.role]));
    const seen = new Set();
    for (const agent of agents()) {
      seen.add(agent.address);
      const alert = alertFor({ before: this.last.get(agent.address), now: agent.status, role: roles.get(agent.address) });
      this.last.set(agent.address, agent.status);
      if (alert && !isQuiet(agent.space, this.archived)) this.announce(agent, alert);
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
