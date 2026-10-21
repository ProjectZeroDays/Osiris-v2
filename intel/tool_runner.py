#!/usr/bin/env python3
"""
The tool runner shim.

A tool module is run in *this* process, which is a process the platform
started, which has the worker's key in its environment, and which holds
the worker's connections. That is a lot of trust to hand a file from a
collection of a thousand tools.

So the tool does not run here. The worker starts this script as a
subprocess, and this script imports the tool, calls it, and writes the
answer out. The worker's own process never holds the tool's code: a
crashing tool takes this subprocess down and nothing else, a tool that
shells out can only reach what this subprocess can, and the worker's
bounded runner caps what comes back.

Usage:
    python tool_runner.py <module-path> <params-json-path> <result-json-path> [entry]

The result file holds JSON. A result that cannot be represented as JSON
is written as its repr, with a note saying so — losing the shape of a
result is better than losing the result.

The optional entry names the function to call, for a tool whose entry
point is not called main, run or execute.
"""

import hashlib
import json
import os
import sys
import time
import traceback
from pathlib import Path

# How the result is described when it cannot be written as JSON.
MAX_REPR_CHARS = 200_000

# The entry points a tool may offer, in the order the tools themselves
# use. `search` is here because several of the collection's tools are
# libraries dressed as one.
ENTRY_POINTS = ("main", "run", "execute", "search")


def _source_hash(path: Path) -> str:
    """
    A hash of the tool's source.

    A result is the tool's word. A hash of the code that produced it is
    what lets a reader tell one run from another: if the tool's source
    changes, the hash changes, and a result recorded against the old hash
    is visibly a result from a different tool.
    """
    try:
        digest = hashlib.sha256()
        with open(path, "rb") as fh:
            for chunk in iter(lambda: fh.read(65536), b""):
                digest.update(chunk)
        return digest.hexdigest()
    except OSError:
        return ""


def _provenance(module_path: Path, entry_name: str, started: float) -> dict:
    """Where a result came from, and when."""
    return {
        "tool": module_path.stem,
        "tool_path": str(module_path),
        "tool_sha256": _source_hash(module_path),
        "entry": entry_name,
        # The wall clock, for when it ran.
        "started_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time())),
        # The monotonic clock, for how long it took.
        "duration_ms": int((time.monotonic() - started) * 1000),
    }


def _write(path: str, payload: dict) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, default=str)


def _jsonable(value):
    """
    A JSON-safe version of a result.

    Most results are dicts and lists already. A set, a bytes, an object
    with a cycle, or a plain custom class is not, and `default=str` in
    `json.dump` handles the leaf values but not a structure that cannot
    be walked. This walks it safely and gives up gracefully.
    """
    try:
        json.dumps(value)
        return value, True
    except (TypeError, ValueError, RecursionError):
        pass

    def walk(node, depth=0):
        if depth > 12:
            return "<too deep>"
        if node is None or isinstance(node, (bool, int, float, str)):
            return node
        if isinstance(node, bytes):
            try:
                return node.decode("utf-8", errors="replace")
            except Exception:
                return "<bytes>"
        if isinstance(node, dict):
            out = {}
            for k, v in list(node.items())[:2000]:
                out[str(k)[:256]] = walk(v, depth + 1)
            return out
        if isinstance(node, (list, tuple, set, frozenset)):
            return [walk(v, depth + 1) for v in list(node)[:2000]]
        return repr(node)[:1024]

    return walk(value), False


def _call(entry, params):
    """
    Call the tool's entry point.

    Most of these take the parameter dictionary. Some take a single
    value — a query, a target — and the dictionary holds it under
    `query` or `value`. The dictionary is tried first, and a single
    positional argument second, so a tool that wants one gets one.
    """
    try:
        return entry(params)
    except TypeError as first:
        for key in ("query", "value", "target", "data"):
            if key in params and isinstance(params[key], (str, int, float)):
                try:
                    return entry(params[key])
                except TypeError:
                    break
        raise first


def main() -> int:
    if len(sys.argv) not in (4, 5):
        print("usage: tool_runner.py <module-path> <params-json> <result-json> [entry]")
        return 2

    module_path = Path(sys.argv[1])
    params_path = Path(sys.argv[2])
    result_path = Path(sys.argv[3])
    wanted_entry = sys.argv[4] if len(sys.argv) == 5 else None
    started = time.monotonic()

    try:
        with open(params_path, "r", encoding="utf-8") as fh:
            params = json.load(fh)
    except Exception as exc:
        _write(result_path, {
            "ok": False,
            "error": f"the parameters could not be read: {exc}",
        })
        return 1

    if not isinstance(params, dict):
        params = {"value": params}

    # The tool's own directory goes on the path, because these tools import
    # their siblings. The collection's root goes on it too, because they
    # also import the shared `quantum` package that lives there.
    for extra in (os.environ.get("OSIRIS_TOOLS_ROOT"), str(module_path.parent)):
        if extra and extra not in sys.path:
            sys.path.insert(0, extra)

    module = None
    try:
        import importlib.util

        spec = importlib.util.spec_from_file_location(
            f"osiris_tool_{module_path.stem}", module_path)
        if spec is None or spec.loader is None:
            raise ImportError(f"the module could not be loaded: {module_path}")
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
    except Exception as exc:
        _write(result_path, {
            "ok": False,
            "error": f"the module could not be imported: {exc}",
            "traceback": traceback.format_exc()[-4000:],
        })
        return 1

    # The entry point is whichever the tool offers, in the order the
    # tools themselves use, or the one the caller named.
    entry = None
    entry_name = ""
    candidates = (wanted_entry,) if wanted_entry else ENTRY_POINTS
    for name in candidates:
        if name and hasattr(module, name) and callable(getattr(module, name)):
            entry = getattr(module, name)
            entry_name = name
            break

    if entry is None:
        # A class with a run or execute method is the other shape these
        # tools take.
        for attr_name in dir(module):
            attr = getattr(module, attr_name)
            if isinstance(attr, type) and attr_name.lower() != "object":
                try:
                    instance = attr()
                except Exception:
                    continue
                for name in ("run", "execute"):
                    if hasattr(instance, name) and callable(getattr(instance, name)):
                        entry = getattr(instance, name)
                        entry_name = f"{attr_name}.{name}"
                        break
                if entry is not None:
                    break

    if entry is None:
        _write(result_path, {
            "ok": False,
            "error": "the module has no main, run, execute or search",
            "provenance": _provenance(module_path, "", started),
        })
        return 1

    try:
        result = _call(entry, params)
    except Exception as exc:
        _write(result_path, {
            "ok": False,
            "error": str(exc),
            "traceback": traceback.format_exc()[-4000:],
            "provenance": _provenance(module_path, entry_name, started),
        })
        return 1

    safe, exact = _jsonable(result)
    _write(result_path, {
        "ok": True,
        "result": safe,
        "exact": exact,
        "provenance": _provenance(module_path, entry_name, started),
    })
    return 0


if __name__ == "__main__":
    sys.exit(main())
