"""
The worker's interior safety.

These tests check the two things that go wrong inside a subprocess call
in the worker, and the third that goes wrong in its own Python:

  * option injection — a value that begins with a dash is an option to
    the program, not an argument to it;
  * unbounded output — a program that prints without end;
  * path traversal — a name that walks out of the directory it was
    supposed to stay in.

Run with: python -m pytest intel/test_worker_safety.py
or directly: python intel/test_worker_safety.py
"""

import os
import re
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from worker_safety import (  # noqa: E402
    OutputTooLarge,
    UnsafeArgument,
    run_tool,
    safe_arg,
    safe_environment,
    safe_filename_component,
    safe_int,
    safe_port_range,
    safe_target,
    safe_temp_path,
    safe_upload_path,
    safe_url,
)


class SafeArgTests(unittest.TestCase):
    def test_accepts_an_ordinary_value(self):
        self.assertEqual(safe_arg("example.com"), "example.com")
        self.assertEqual(safe_arg("CVE-2024-0001"), "CVE-2024-0001")

    def test_refuses_a_value_that_begins_with_a_dash(self):
        # This is the important one: a dash makes it an option.
        for value in ("-oG=/etc/passwd", "--help", "-h"):
            with self.assertRaises(UnsafeArgument):
                safe_arg(value)

    def test_refuses_control_characters(self):
        for value in ("a\nb", "a\x00b", "a\tb", "a\x1bb"):
            with self.assertRaises(UnsafeArgument):
                safe_arg(value)

    def test_refuses_an_over_long_value(self):
        with self.assertRaises(UnsafeArgument):
            safe_arg("x" * 1000)

    def test_refuses_an_empty_or_missing_value(self):
        with self.assertRaises(UnsafeArgument):
            safe_arg("")
        with self.assertRaises(UnsafeArgument):
            safe_arg(None)

    def test_refuses_a_non_string(self):
        with self.assertRaises(UnsafeArgument):
            safe_arg(42)


class SafeIntTests(unittest.TestCase):
    def test_accepts_a_number_in_range(self):
        self.assertEqual(safe_int(4444, "LPORT", 1, 65535), 4444)
        self.assertEqual(safe_int("80", "x"), 80)

    def test_refuses_a_number_out_of_range(self):
        with self.assertRaises(UnsafeArgument):
            safe_int(0, "LPORT", 1, 65535)
        with self.assertRaises(UnsafeArgument):
            safe_int(70000, "LPORT", 1, 65535)

    def test_refuses_a_non_number(self):
        for value in ("abc", None, True, [1]):
            with self.assertRaises(UnsafeArgument):
                safe_int(value, "x")


class SafePortRangeTests(unittest.TestCase):
    def test_accepts_a_range(self):
        self.assertEqual(safe_port_range("1-1000"), "1-1000")
        self.assertEqual(safe_port_range("22,80,443"), "22,80,443")

    def test_refuses_a_dash_leading_value(self):
        with self.assertRaises(UnsafeArgument):
            safe_port_range("-sS")

    def test_refuses_anything_that_is_not_a_port_list(self):
        for value in ("22; rm -rf /", "-oG=/etc/passwd", "80 --script=x"):
            with self.assertRaises(UnsafeArgument):
                safe_port_range(value)


class SafeTargetTests(unittest.TestCase):
    def test_accepts_a_host_an_address_and_a_block(self):
        self.assertEqual(safe_target("example.com"), "example.com")
        self.assertEqual(safe_target("203.0.113.10"), "203.0.113.10")
        self.assertEqual(safe_target("192.168.1.0/24"), "192.168.1.0/24")

    def test_refuses_a_dash_leading_target(self):
        with self.assertRaises(UnsafeArgument):
            safe_target("-oG=/etc/passwd")

    def test_refuses_a_target_with_a_shell_character(self):
        for value in ("example.com; rm -rf /", "example.com`id`", "a$(b)"):
            with self.assertRaises(UnsafeArgument):
                safe_target(value)

    def test_refuses_a_block_that_is_not_a_block(self):
        with self.assertRaises(UnsafeArgument):
            safe_target("192.168.1.0/etc/passwd")


class SafeUrlTests(unittest.TestCase):
    def test_accepts_an_http_url(self):
        self.assertEqual(safe_url("https://example.com/x"), "https://example.com/x")

    def test_refuses_a_url_that_is_not_http(self):
        for value in ("file:///etc/passwd", "ftp://example.com", "javascript:alert(1)"):
            with self.assertRaises(UnsafeArgument):
                safe_url(value)

    def test_refuses_a_dash_leading_url(self):
        with self.assertRaises(UnsafeArgument):
            safe_url("-u")


class SafeFilenameTests(unittest.TestCase):
    def test_accepts_an_ordinary_name(self):
        self.assertEqual(safe_filename_component("report.pdf"), "report.pdf")

    def test_refuses_a_path(self):
        for value in ("../etc/passwd", "a/b", "a\\b", "..", "."):
            with self.assertRaises(UnsafeArgument):
                safe_filename_component(value)

    def test_refuses_unsupported_characters(self):
        for value in ("a b", "a;rm", "a\x00b"):
            with self.assertRaises(UnsafeArgument):
                safe_filename_component(value)


class TempPathTests(unittest.TestCase):
    def test_a_generated_path_stays_in_the_temporary_directory(self):
        p = safe_temp_path("osiris-", ".json")
        self.assertEqual(p.parent, Path(tempfile.gettempdir()))
        self.assertTrue(p.name.startswith("osiris-"))

    def test_an_upload_lands_under_a_name_the_worker_generated(self):
        # The name in the upload cannot choose where the file goes.
        p = safe_upload_path("../../../../etc/passwd")
        self.assertEqual(p.parent, Path(tempfile.gettempdir()))
        self.assertNotIn("..", p.name)
        self.assertFalse(str(p).startswith("/etc"))

    def test_an_upload_keeps_a_useful_suffix(self):
        p = safe_upload_path("photo.png")
        self.assertTrue(p.name.endswith(".png"))


class RunToolTests(unittest.TestCase):
    def test_returns_the_output_and_the_status(self):
        code, out, err = run_tool(
            [sys.executable, "-c", "print('hello')"], timeout=30)
        self.assertEqual(code, 0)
        self.assertIn("hello", out)
        self.assertEqual(err, "")

    def test_kills_a_program_that_prints_without_end(self):
        # A program with no end is stopped rather than allowed to take
        # the worker's memory with it.
        with self.assertRaises(OutputTooLarge):
            run_tool(
                [sys.executable, "-c",
                 "import sys\nwhile True: sys.stdout.write('x' * 65536)\n"],
                timeout=30, max_bytes=256 * 1024,
            )

    def test_kills_a_program_that_never_ends(self):
        import subprocess
        with self.assertRaises(subprocess.TimeoutExpired):
            run_tool(
                [sys.executable, "-c", "import time; time.sleep(30)"],
                timeout=2,
            )

    def test_reports_a_missing_program(self):
        with self.assertRaises(FileNotFoundError):
            run_tool(["a-program-that-does-not-exist"], timeout=5)


class EnvironmentTests(unittest.TestCase):
    """The environment a tool or a program is given."""

    def test_the_platform_secret_is_not_handed_on(self):
        env = safe_environment({
            "OSIRIS_WORKER_KEY": "the-secret",
            "PATH": "/usr/bin",
        })
        self.assertNotIn("OSIRIS_WORKER_KEY", env)
        self.assertEqual(env["PATH"], "/usr/bin")

    def test_nothing_else_unlisted_is_handed_on(self):
        env = safe_environment({
            "OSIRIS_WORKER_KEY": "the-secret",
            "DATABASE_URL": "postgres://user:pass@host/db",
            "POSTGRES_PASSWORD": "hunter2",
            "CSC_LINK": "a-certificate",
            "SOME_RANDOM_VARIABLE": "value",
        })
        for name in ("OSIRIS_WORKER_KEY", "DATABASE_URL", "POSTGRES_PASSWORD",
                     "CSC_LINK", "SOME_RANDOM_VARIABLE"):
            self.assertNotIn(name, env)

    def test_the_variables_a_tool_needs_are_kept(self):
        env = safe_environment({
            "PATH": "/usr/bin",
            "TEMP": "/tmp",
            "HOME": "/home/op",
            "SHODAN_API_KEY": "an-operator-key",
            "SystemRoot": "C:\\Windows",
        })
        self.assertEqual(env["PATH"], "/usr/bin")
        self.assertEqual(env["TEMP"], "/tmp")
        self.assertEqual(env["HOME"], "/home/op")
        self.assertEqual(env["SHODAN_API_KEY"], "an-operator-key")
        self.assertEqual(env["SystemRoot"], "C:\\Windows")

    def test_a_missing_variable_is_simply_absent(self):
        env = safe_environment({"PATH": "/usr/bin"})
        self.assertNotIn("TEMP", env)

    def test_a_program_does_not_see_the_secret(self):
        # The real thing: a program run through the runner must not find
        # the platform's secret in its environment.
        script = (
            "import os, sys; "
            "print('SEEN' if os.environ.get('OSIRIS_WORKER_KEY') else 'ABSENT')"
        )
        previous = os.environ.get("OSIRIS_WORKER_KEY")
        os.environ["OSIRIS_WORKER_KEY"] = "the-secret"
        try:
            _code, out, _err = run_tool(
                [sys.executable, "-c", script], timeout=30)
            self.assertIn("ABSENT", out)
        finally:
            if previous is None:
                os.environ.pop("OSIRIS_WORKER_KEY", None)
            else:
                os.environ["OSIRIS_WORKER_KEY"] = previous


class TestNoUnboundedSubprocess(unittest.TestCase):
    """
    The bounded runner is a claim about the whole worker, not about the
    paths someone remembered to check.

    python-nmap calls subprocess.Popen itself, and its `timeout` defaults
    to 0 — which it documents as "wait indefinitely". A scan against an
    unresponsive network would therefore hold the worker thread until the
    client gave up, with no cap on what it accumulates either. Both
    port-scan paths are given the same lifetime now, and this test is what
    keeps the library path from drifting back to the default.
    """

    API = Path(__file__).resolve().parent / "osiris_api.py"

    def test_portscan_bounds_both_paths(self):
        source = self.API.read_text(encoding="utf-8")
        self.assertIn("timeout=SCAN_TIMEOUT_SECONDS", source)
        # The unbounded form: python-nmap's scan with no timeout at all.
        self.assertNotRegex(
            source,
            r"nm\.scan\([^)]*arguments='-sS -T4'\)",
            "nm.scan is called without a timeout — that waits indefinitely",
        )

    def test_every_run_tool_call_passes_a_timeout(self):
        # A bounded runner called with no lifetime is not bounded. Any
        # run_tool call must name either the constant or a literal.
        source = self.API.read_text(encoding="utf-8")
        for match in re.finditer(r"run_tool\(", source):
            window = source[match.start():match.start() + 400]
            # Stop at the closing paren of this call.
            depth, end = 0, len(window)
            for i, ch in enumerate(window):
                if ch == "(":
                    depth += 1
                elif ch == ")":
                    depth -= 1
                    if depth == 0:
                        end = i
                        break
            call = window[:end]
            self.assertIn(
                "timeout=", call,
                f"run_tool call at line {source[:match.start()].count(chr(10)) + 1} "
                f"passes no timeout: {call[:80]!r}",
            )

    def test_no_direct_popen_outside_the_runner(self):
        source = self.API.read_text(encoding="utf-8")
        for match in re.finditer(r"subprocess\.Popen\s*\(", source):
            line = source[:match.start()].count("\n") + 1
            self.fail(f"direct subprocess.Popen at osiris_api.py:{line}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
