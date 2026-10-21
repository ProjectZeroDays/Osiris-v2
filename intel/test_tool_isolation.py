"""
The worker's tool isolation.

The worker never imports a tool module into its own process. The tool
runs in a subprocess, through the bounded runner, and the answer comes
back as JSON. That is what stops a crashing tool from taking the worker
down with it, and what keeps the worker's own process from holding code
it did not write.

These tests check that the isolation is real rather than intended:

  * a tool that crashes does not take the worker down;
  * a tool that prints without end is stopped at the cap;
  * a tool that shells out can only reach what its own subprocess can;
  * a result that is not representable as JSON is summarised rather than
    lost.
"""

import json
import os
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from worker_safety import OutputTooLarge, run_tool  # noqa: E402

RUNNER = str(HERE / "tool_runner.py")


def _write_tool(source: str) -> Path:
    """A throwaway tool module."""
    d = Path(tempfile.mkdtemp(prefix="osiris-tool-"))
    p = d / "tool.py"
    p.write_text(textwrap.dedent(source), encoding="utf-8")
    return p


def _run(tool: Path, params: dict, entry: str = None, timeout: int = 60):
    """Run a tool the way the worker does, and return the parsed result."""
    params_file = Path(tempfile.gettempdir()) / "osiris-test-params.json"
    result_file = Path(tempfile.gettempdir()) / "osiris-test-result.json"
    params_file.write_text(json.dumps(params), encoding="utf-8")
    if result_file.exists():
        result_file.unlink()

    argv = [sys.executable, RUNNER, str(tool), str(params_file), str(result_file)]
    if entry:
        argv.append(entry)
    try:
        returncode, stdout, stderr = run_tool(argv, timeout=timeout)
        # The result is read before the temporary files are cleaned up.
        if result_file.exists():
            return json.loads(result_file.read_text(encoding="utf-8"))
        return {"ok": False, "returncode": returncode, "stdout": stdout, "stderr": stderr}
    finally:
        for f in (params_file, result_file):
            if f.exists():
                f.unlink()


class IsolationTests(unittest.TestCase):
    def test_a_tool_runs_and_its_result_comes_back(self):
        tool = _write_tool("""
            def main(params):
                return {"echo": params.get("value"), "doubled": params.get("value", 0) * 2}
        """)
        out = _run(tool, {"value": 21})
        self.assertTrue(out["ok"], out)
        self.assertEqual(out["result"]["doubled"], 42)

    def test_a_tool_that_crashes_does_not_take_the_worker_down(self):
        tool = _write_tool("""
            def main(params):
                raise RuntimeError("the tool fell over")
        """)
        out = _run(tool, {})
        self.assertFalse(out["ok"])
        self.assertIn("fell over", out["error"])

    def test_a_tool_that_exits_does_not_take_the_worker_down(self):
        tool = _write_tool("""
            import os
            def main(params):
                os._exit(3)
        """)
        out = _run(tool, {})
        self.assertFalse(out.get("ok", False))

    def test_a_tool_that_prints_without_end_is_stopped(self):
        tool = _write_tool("""
            import sys
            def main(params):
                while True:
                    sys.stdout.write("x" * 65536)
        """)
        # The shim's own output is capped, so the runaway tool is stopped
        # rather than filling the worker's memory.
        with self.assertRaises(OutputTooLarge):
            run_tool(
                [sys.executable, RUNNER, str(tool), _tmp_params(), _tmp_result()],
                timeout=30, max_bytes=256 * 1024,
            )

    def test_a_tool_that_shells_out_can_still_be_run(self):
        # The subprocess is not a sandbox against the operating system —
        # it is a boundary around the worker's own process and its
        # resources. A tool that shells out still runs; what it cannot do
        # is take the worker with it.
        tool = _write_tool("""
            import subprocess, sys
            def main(params):
                r = subprocess.run([sys.executable, "-c", "print('hello')"],
                                   capture_output=True, text=True)
                return {"said": r.stdout.strip()}
        """)
        out = _run(tool, {})
        self.assertTrue(out["ok"], out)
        self.assertEqual(out["result"]["said"], "hello")

    def test_a_result_that_is_not_json_is_summarised_not_lost(self):
        tool = _write_tool("""
            class Thing:
                def __repr__(self):
                    return "<a thing>"

            def main(params):
                return {"obj": Thing(), "items": {1, 2, 3}}
        """)
        out = _run(tool, {})
        self.assertTrue(out["ok"], out)
        # The shim reports that the answer was not exactly representable,
        # so the caller knows it is looking at a summary.
        self.assertFalse(out["exact"])

    def test_a_tool_with_a_named_entry_point_is_called(self):
        tool = _write_tool("""
            def build_search_url(query, engine="google"):
                return f"https://{engine}.com/search?q={query}"
        """)
        out = _run(tool, {"query": "example"}, entry="build_search_url")
        self.assertTrue(out["ok"], out)
        # The entry point returns a plain string, so the result is the
        # string itself.
        self.assertIn("example", out["result"])

    def test_a_tool_with_no_entry_point_says_so(self):
        tool = _write_tool("""
            VALUE = 1
        """)
        out = _run(tool, {})
        self.assertFalse(out["ok"])
        self.assertIn("no main", out["error"])

    def test_a_tool_that_cannot_be_imported_says_so(self):
        tool = _write_tool("""
            import a_module_that_does_not_exist
            def main(params):
                return {}
        """)
        out = _run(tool, {})
        self.assertFalse(out["ok"])
        self.assertIn("could not be imported", out["error"])

    def test_a_result_says_where_it_came_from(self):
        # A result is the tool's word. The provenance says which code
        # produced it, what that code hashed to, and when it ran — so a
        # reader can tell one run from another, and a changed tool from
        # the same tool.
        tool = _write_tool("""
            def main(params):
                return {"ok": True}
        """)
        out = _run(tool, {})
        self.assertTrue(out["ok"], out)
        p = out["provenance"]
        self.assertEqual(p["tool"], "tool")
        self.assertEqual(p["entry"], "main")
        self.assertEqual(len(p["tool_sha256"]), 64)
        self.assertIn("started_at", p)
        self.assertGreaterEqual(p["duration_ms"], 0)

    def test_the_hash_follows_the_tool_s_source(self):
        # Change the source and the hash changes. A result recorded
        # against the old hash is visibly a result from a different tool.
        tool = _write_tool("""
            def main(params):
                return {"value": 1}
        """)
        first = _run(tool, {})
        self.assertTrue(first["ok"], first)

        tool.write_text(
            "def main(params):\n    return {'value': 2}\n", encoding="utf-8")
        second = _run(tool, {})
        self.assertTrue(second["ok"], second)

        self.assertNotEqual(
            first["provenance"]["tool_sha256"],
            second["provenance"]["tool_sha256"],
        )

    def test_a_tool_cannot_see_the_platform_secret(self):
        # The secret is in the worker's environment, and a tool runs as
        # the worker's child. The environment it is given is built from
        # an allowlist, so the secret is not in it.
        tool = _write_tool("""
            import os
            def main(params):
                return {
                    "secret": os.environ.get("OSIRIS_WORKER_KEY"),
                    "path": os.environ.get("PATH") is not None,
                }
        """)
        previous = os.environ.get("OSIRIS_WORKER_KEY")
        os.environ["OSIRIS_WORKER_KEY"] = "the-platform-secret"
        try:
            out = _run(tool, {})
        finally:
            if previous is None:
                os.environ.pop("OSIRIS_WORKER_KEY", None)
            else:
                os.environ["OSIRIS_WORKER_KEY"] = previous

        self.assertTrue(out["ok"], out)
        self.assertIsNone(out["result"]["secret"])
        # The path is still there, so the tool can find its own binaries.
        self.assertTrue(out["result"]["path"])


def _tmp_params() -> str:
    p = Path(tempfile.gettempdir()) / "osiris-test-params.json"
    p.write_text("{}", encoding="utf-8")
    return str(p)


def _tmp_result() -> str:
    p = Path(tempfile.gettempdir()) / "osiris-test-result.json"
    if p.exists():
        p.unlink()
    return str(p)


if __name__ == "__main__":
    unittest.main(verbosity=2)
