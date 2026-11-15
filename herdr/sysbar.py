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
from typing import Final

VIRTUAL_IFACE_PREFIXES: Final[tuple[str, ...]] = ("lo", "veth", "docker", "br-", "virbr", "tun", "tap")
STATE_DIR: Final[Path] = Path(os.environ.get("XDG_RUNTIME_DIR", "/tmp")) / "herdr-sysbar"
UNITS: Final[tuple[str, ...]] = ("B", "K", "M", "G", "T")
AGENT_STATES: Final[tuple[str, ...]] = ("working", "blocked", "done", "idle")


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


def cpu() -> str:
    fields = [float(x) for x in Path("/proc/stat").read_text().split("\n", 1)[0].split()[1:]]
    idle = fields[3] + fields[4]
    previous = swap_sample("cpu", [sum(fields), idle])
    if previous is None:
        return "CPU --"
    total_delta = sum(fields) - previous[0]
    idle_delta = idle - previous[1]
    pct = 0.0 if total_delta <= 0 else 100 * (1 - idle_delta / total_delta)
    return f"CPU {pct:.0f}%"


def mem() -> str:
    info: dict[str, int] = {}
    for line in Path("/proc/meminfo").read_text().splitlines():
        key, value = line.split(":", 1)
        info[key] = int(value.split()[0]) * 1024
    used = info["MemTotal"] - info["MemAvailable"]
    return f"RAM {human(used)}/{human(info['MemTotal'])}"


def net() -> str:
    rx = tx = 0
    for line in Path("/proc/net/dev").read_text().splitlines()[2:]:
        iface, data = line.split(":", 1)
        if iface.strip().startswith(VIRTUAL_IFACE_PREFIXES):
            continue
        cols = data.split()
        rx += int(cols[0])
        tx += int(cols[8])
    now = time.monotonic()
    previous = swap_sample("net", [now, rx, tx])
    if previous is None or now <= previous[0]:
        return "↓-- ↑--"
    elapsed = now - previous[0]
    return f"↓{human((rx - previous[1]) / elapsed)}/s ↑{human((tx - previous[2]) / elapsed)}/s"


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
