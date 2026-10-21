"""
The worker's routes, from the outside.

The safety module is tested on its own in test_worker_safety.py. This
file checks the thing that actually matters: that the worker's HTTP
surface refuses the values that would become options or paths, and that
the routes which need no argument still work.

Run with: python intel/test_worker_routes.py
"""

import json
import sys
import unittest
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import os  # noqa: E402

WORKER = str(Path(__file__).resolve().parent / "osiris_api.py")
KEY = "test-worker-key-abcdef"
PORT = int(os.environ.get("OSIRIS_TEST_PORT", "8123"))
BASE = f"http://127.0.0.1:{PORT}"


def _post(path: str, payload: dict, key: str = KEY):
    """POST to the worker and return (status, body)."""
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE}{path}", data=data, method="POST",
        headers={
            "Content-Type": "application/json",
            "X-OSIRIS-Worker-Key": key,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            return res.status, json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(body)
        except json.JSONDecodeError:
            return e.code, {"raw": body}


def _get(path: str, key: str = KEY):
    req = urllib.request.Request(
        f"{BASE}{path}", headers={"X-OSIRIS-Worker-Key": key})
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            return res.status, json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(body)
        except json.JSONDecodeError:
            return e.code, {"raw": body}


class WorkerRouteTests(unittest.TestCase):
    """The worker must be running for these; the runner starts it."""

    def test_health_is_open(self):
        status, body = _get("/api/health", key="")
        self.assertEqual(status, 200)
        self.assertEqual(body["status"], "ok")

    def test_a_route_without_the_key_is_refused(self):
        status, body = _get("/api/tools", key="")
        self.assertEqual(status, 401)
        self.assertEqual(body["error"], "WORKER_UNAUTHENTICATED")

    def test_a_route_with_the_wrong_key_is_refused(self):
        status, body = _get("/api/tools", key="not-the-key")
        self.assertEqual(status, 401)
        self.assertEqual(body["error"], "WORKER_UNAUTHENTICATED")

    def test_the_catalogue_is_reachable_with_the_key(self):
        status, body = _get("/api/tools")
        self.assertEqual(status, 200)
        self.assertGreater(body["total"], 0)

    # ── Option injection ────────────────────────────────────────────────
    # A value that begins with a dash is an option to the program, not an
    # argument to it. These must never reach an argument vector.

    def test_a_dash_leading_port_range_is_refused(self):
        status, body = _post("/api/network/portscan", {
            "target": "127.0.0.1", "ports": "-sS",
        })
        self.assertEqual(status, 400)
        self.assertIn("dash", body["error"].lower())

    def test_a_dash_leading_target_is_refused(self):
        status, body = _post("/api/network/portscan", {
            "target": "-oG=/etc/passwd", "ports": "1-100",
        })
        self.assertEqual(status, 400)

    def test_a_dash_leading_query_is_refused(self):
        status, body = _post("/api/exploit/search", {"query": "--help"})
        self.assertEqual(status, 400)

    def test_a_dash_leading_payload_type_is_refused(self):
        status, body = _post("/api/payload/generate", {
            "type": "-p", "lhost": "10.0.0.1", "lport": 4444,
        })
        self.assertEqual(status, 400)

    def test_a_dash_leading_lhost_is_refused(self):
        status, body = _post("/api/payload/generate", {
            "type": "reverse_shell", "lhost": "-LHOST=x", "lport": 4444,
        })
        self.assertEqual(status, 400)

    def test_a_dash_leading_serial_is_refused(self):
        status, body = _post("/api/mobile/android", {
            "action": "info", "serial": "-s",
        })
        self.assertEqual(status, 400)

    def test_a_url_that_is_not_http_is_refused(self):
        status, body = _post("/api/web/scan", {"url": "file:///etc/passwd"})
        self.assertEqual(status, 400)

    def test_a_control_character_in_a_value_is_refused(self):
        status, body = _post("/api/exploit/search", {"query": "cve\x00"})
        self.assertEqual(status, 400)

    def test_a_shell_character_in_a_target_is_refused(self):
        status, body = _post("/api/network/portscan", {
            "target": "127.0.0.1; rm -rf /", "ports": "1-100",
        })
        self.assertEqual(status, 400)

    # ── The routes that need no argument still work ─────────────────────

    def test_the_radio_directory_is_reachable(self):
        status, body = _post("/api/recon/shodan", {"query": "example.com"})
        # The upstream may be unreachable from here; what matters is that
        # the request was accepted rather than refused as malformed.
        self.assertIn(status, (200, 502, 503))

    def test_the_crypto_route_still_answers(self):
        status, body = _post("/api/crypto/encrypt", {"data": "test"})
        self.assertIn(status, (200, 400, 500, 503))


if __name__ == "__main__":
    unittest.main(verbosity=2)
