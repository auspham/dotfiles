#!/usr/bin/env python3
"""Prints one system stat for herdr's tab_bar_right: cpu, mem, net or agents."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from collections import Counter
from collections.abc import Callable
from pathlib import Path
from typing import Final, NamedTuple, Protocol

LINUX_VIRTUAL_IFACE_PREFIXES: Final[tuple[str, ...]] = ("lo", "veth", "docker", "br-", "virbr", "tun", "tap")
MACOS_VIRTUAL_IFACE_PREFIXES: Final[tuple[str, ...]] = (
    "lo", "utun", "gif", "stf", "awdl", "llw", "bridge", "ap", "anpi", "vmenet", "vmnet",
)
MACOS_USED_PAGE_KINDS: Final[tuple[str, ...]] = ("Pages active", "Pages wired down", "Pages occupied by compressor")
STATE_DIR: Final[Path] = Path(os.environ.get("XDG_RUNTIME_DIR", "/tmp")) / "herdr-sysbar"
UNITS: Final[tuple[str, ...]] = ("B", "K", "M", "G", "T")
AGENT_STATES: Final[tuple[str, ...]] = ("working", "blocked", "done", "idle")


class Memory(NamedTuple):
    used: int
    total: int


class NetCounters(NamedTuple):
    rx: int
    tx: int


class Platform(Protocol):
    def cpu_percent(self) -> float | None:
        """Returns None until there is enough history to compute a rate."""
        ...

    def memory(self) -> Memory: ...

    def net_counters(self) -> NetCounters: ...


def human(n: float) -> str:
    unit = 0
    while n >= 1024 and unit < len(UNITS) - 1:
        n /= 1024
        unit += 1
    return f"{n:.0f}{UNITS[unit]}" if unit == 0 or n >= 10 else f"{n:.1f}{UNITS[unit]}"


def swap_sample(name: str, current: list[float]) -> list[float] | None:
    """Stores the current sample and returns the previous one, if any."""
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    path = STATE_DIR / f"{name}.json"
    try:
        previous: list[float] | None = json.loads(path.read_text())
    except (OSError, ValueError):
        previous = None
    path.write_text(json.dumps(current))
    return previous


def command_output(*argv: str) -> str:
    return subprocess.run(argv, capture_output=True, text=True, timeout=5, check=True).stdout


class Linux:
    def cpu_percent(self) -> float | None:
        fields = [float(x) for x in Path("/proc/stat").read_text().split("\n", 1)[0].split()[1:]]
        idle = fields[3] + fields[4]
        previous = swap_sample("cpu", [sum(fields), idle])
        if previous is None:
            return None
        total_delta = sum(fields) - previous[0]
        idle_delta = idle - previous[1]
        return 0.0 if total_delta <= 0 else 100 * (1 - idle_delta / total_delta)

    def memory(self) -> Memory:
        info: dict[str, int] = {}
        for line in Path("/proc/meminfo").read_text().splitlines():
            key, value = line.split(":", 1)
            info[key] = int(value.split()[0]) * 1024
        return Memory(used=info["MemTotal"] - info["MemAvailable"], total=info["MemTotal"])

    def net_counters(self) -> NetCounters:
        rx = tx = 0
        for line in Path("/proc/net/dev").read_text().splitlines()[2:]:
            iface, data = line.split(":", 1)
            if iface.strip().startswith(LINUX_VIRTUAL_IFACE_PREFIXES):
                continue
            cols = data.split()
            rx += int(cols[0])
            tx += int(cols[8])
        return NetCounters(rx, tx)


class MacOS:
    def cpu_percent(self) -> float | None:
        # macOS exposes no cumulative CPU counters to the shell, so sum what ps reports per process.
        per_process = sum(float(x) for x in command_output("ps", "-A", "-o", "%cpu=").split())
        return min(100.0, per_process / int(command_output("sysctl", "-n", "hw.logicalcpu")))

    def memory(self) -> Memory:
        lines = command_output("vm_stat").splitlines()
        page_size = int(lines[0].split("page size of ")[1].split()[0])
        pages: dict[str, int] = {}
        for line in lines[1:]:
            key, _, value = line.partition(":")
            if value.strip().rstrip(".").isdigit():
                pages[key.strip()] = int(value.strip().rstrip("."))
        used = sum(pages[kind] for kind in MACOS_USED_PAGE_KINDS) * page_size
        return Memory(used=used, total=int(command_output("sysctl", "-n", "hw.memsize")))

    def net_counters(self) -> NetCounters:
        rx = tx = 0
        for line in command_output("netstat", "-ibn").splitlines()[1:]:
            cols = line.split()
            # One <Link#N> row per interface. The address column can be empty, so index from the end.
            if len(cols) < 10 or not cols[2].startswith("<Link#") or cols[0].startswith(MACOS_VIRTUAL_IFACE_PREFIXES):
                continue
            rx += int(cols[-5])
            tx += int(cols[-2])
        return NetCounters(rx, tx)


PLATFORM: Final[Platform] = MacOS() if sys.platform == "darwin" else Linux()


def cpu() -> str:
    pct = PLATFORM.cpu_percent()
    return "CPU --" if pct is None else f"CPU {pct:.0f}%"


def mem() -> str:
    memory = PLATFORM.memory()
    return f"RAM {human(memory.used)}/{human(memory.total)}"


def net() -> str:
    counters = PLATFORM.net_counters()
    # Wall clock: samples are compared across processes, and macOS restarts time.monotonic() in each one.
    now = time.time()
    previous = swap_sample("net", [now, counters.rx, counters.tx])
    if previous is None or now <= previous[0]:
        return "↓-- ↑--"
    elapsed = now - previous[0]
    return f"↓{human((counters.rx - previous[1]) / elapsed)}/s ↑{human((counters.tx - previous[2]) / elapsed)}/s"


def agents() -> str:
    out = subprocess.run(["herdr", "agent", "list"], capture_output=True, text=True, timeout=5, check=False)
    try:
        listed: list[dict[str, object]] = json.loads(out.stdout)["result"]["agents"]
    except (ValueError, KeyError, TypeError):
        return "agents ?"
    counts = Counter(str(a.get("agent_status", "unknown")) for a in listed)
    parts = [f"{len(listed)} agents"]
    parts += [f"{counts[state]} {state}" for state in AGENT_STATES if counts[state]]
    return " · ".join(parts)


STATS: Final[dict[str, Callable[[], str]]] = {"cpu": cpu, "mem": mem, "net": net, "agents": agents}


def main(argv: list[str]) -> int:
    if len(argv) != 2 or argv[1] not in STATS:
        print(f"usage: {argv[0]} {{{','.join(STATS)}}}", file=sys.stderr)
        return 2
    print(STATS[argv[1]]())
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
