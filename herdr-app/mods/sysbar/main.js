// A bottom bar: agent counts by status, CPU, RAM and network throughput.
// Props: `chrome: true` draws the status bar background and top border, to sit beside workspace-status.

import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { agents, props, readTextFile, theme } from "herdr";

const POLL_MS = 2000;
const UNITS = ["B", "K", "M", "G", "T"];
const VIRTUAL_IFACE_PREFIXES = ["lo", "veth", "docker", "br-", "virbr", "tun", "tap"];
/** @type {readonly import("herdr").Status[]} */
const STATUS_ORDER = ["working", "blocked", "done", "idle"];

/** @typedef {{ total: number, idle: number }} CpuSample */
/** @typedef {{ at: number, rx: number, tx: number }} NetSample */
/** @typedef {{ cpu: number | null, memUsed: number, memTotal: number, down: number | null, up: number | null }} Stats */

/** @param {number} n */
function human(n) {
  let unit = 0;
  while (n >= 1024 && unit < UNITS.length - 1) {
    n /= 1024;
    unit++;
  }
  return unit === 0 || n >= 10 ? `${Math.round(n)}${UNITS[unit]}` : `${n.toFixed(1)}${UNITS[unit]}`;
}

/** @param {string} text @returns {CpuSample} */
function parseCpu(text) {
  const fields = text.split("\n", 1)[0].trim().split(/\s+/).slice(1).map(Number);
  return { total: fields.reduce((a, b) => a + b, 0), idle: fields[3] + fields[4] };
}

/** @param {string} text @returns {{ used: number, total: number }} */
function parseMem(text) {
  /** @type {Record<string, number>} */
  const kb = {};
  for (const line of text.split("\n")) {
    const [key, value] = line.split(":");
    if (value) kb[key] = parseInt(value, 10);
  }
  return { used: (kb.MemTotal - kb.MemAvailable) * 1024, total: kb.MemTotal * 1024 };
}

/** @param {string} text @returns {NetSample} */
function parseNet(text) {
  let rx = 0;
  let tx = 0;
  for (const line of text.split("\n").slice(2)) {
    const [iface, data] = line.split(":");
    if (!data || VIRTUAL_IFACE_PREFIXES.some((p) => iface.trim().startsWith(p))) continue;
    const cols = data.trim().split(/\s+/).map(Number);
    rx += cols[0];
    tx += cols[8];
  }
  return { at: Date.now(), rx, tx };
}

export default class SysBar extends View {
  /** @param {unknown} _props @param {any} cx */
  init(_props, cx) {
    /** @type {CpuSample | null} */
    this.lastCpu = null;
    /** @type {NetSample | null} */
    this.lastNet = null;
    /** @type {Stats | null} */
    this.stats = null;
    cx.timer.every(POLL_MS, (/** @type {any} */ cx) => this.refresh(cx));
    this.refresh(cx);
  }

  /** @param {any} cx */
  refresh(cx) {
    cx.spawn(async (/** @type {any} */ cx) => {
      const [stat, meminfo, netdev] = await Promise.all(["/proc/stat", "/proc/meminfo", "/proc/net/dev"].map((p) => readTextFile(p)));
      if (!stat || !meminfo || !netdev) return;
      const cpu = parseCpu(stat);
      const net = parseNet(netdev);
      const mem = parseMem(meminfo);
      const prevCpu = this.lastCpu;
      const prevNet = this.lastNet;
      const cpuDelta = prevCpu ? cpu.total - prevCpu.total : 0;
      const seconds = prevNet ? (net.at - prevNet.at) / 1000 : 0;
      this.stats = {
        cpu: cpuDelta > 0 ? 100 * (1 - (cpu.idle - prevCpu.idle) / cpuDelta) : null,
        memUsed: mem.used,
        memTotal: mem.total,
        down: seconds > 0 ? (net.rx - prevNet.rx) / seconds : null,
        up: seconds > 0 ? (net.tx - prevNet.tx) / seconds : null,
      };
      this.lastCpu = cpu;
      this.lastNet = net;
      cx.notify();
    });
  }

  render() {
    const t = theme();
    const list = agents();
    const s = this.stats;
    const sep = () => div().text_color(t.border).child("│");
    const item = (/** @type {string} */ label, /** @type {string} */ value) =>
      h_flex().gap(5).child(div().text_color(t.dim).child(label)).child(div().text_color(t.foreground).child(value));
    const dot = (/** @type {string} */ color) => div().size(6).rounded(3).bg(color);
    const statuses = STATUS_ORDER.map((status) => ({ status, count: list.filter((a) => a.status === status).length })).filter((x) => x.count > 0);

    /** @type {{ chrome?: boolean }} */
    const opts = props() ?? {};
    return h_flex().size_full().px(10).gap(12).items_center().text_size(12).text_color(t.muted)
      .when(Boolean(opts.chrome), (el) => el.bg(t.chrome).border_t(1).border_color(t.border))
      .child(h_flex().gap(10).items_center()
        .child(item("agents", String(list.length)))
        .children(statuses.map(({ status, count }) =>
          h_flex().gap(5).items_center().child(dot(t[status])).child(`${count} ${status}`))))
      .child(div().flex_1())
      .child(item("CPU", s?.cpu == null ? "--" : `${Math.round(s.cpu)}%`))
      .child(sep())
      .child(item("RAM", s ? `${human(s.memUsed)}/${human(s.memTotal)}` : "--"))
      .child(sep())
      .child(item("↓", s?.down == null ? "--" : `${human(s.down)}/s`))
      .child(item("↑", s?.up == null ? "--" : `${human(s.up)}/s`));
  }
}
