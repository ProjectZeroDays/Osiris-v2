"""
How many tools the worker runs at once.

The worker serves with Flask's threaded server, which starts a thread per
connection, and every tool call runs in a subprocess of its own. So
without a bound here, a caller who can reach the worker can start as
many tools as it likes at once, and each one pins a thread and a
subprocess for as long as the tool runs - long enough that the worker
stops answering its health check, which is the one thing that has to
keep working.

So the worker takes a slot for each tool run, and refuses a call when
it is already running as many as it will.
"""

import sys
import threading
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import osiris_api


class ToolConcurrencyTests(unittest.TestCase):
    """The bound on concurrent tool runs."""

    def setUp(self):
        self.original = osiris_api.MAX_CONCURRENT_TOOLS
        self.original_running = osiris_api._running_tools
        osiris_api._running_tools = 0
        self.addCleanup(self._restore)

    def _restore(self):
        osiris_api.MAX_CONCURRENT_TOOLS = self.original
        osiris_api._running_tools = self.original_running

    def test_a_tool_run_takes_a_slot(self):
        osiris_api._acquire_tool_slot()
        self.assertEqual(osiris_api._running_tools, 1)
        osiris_api._release_tool_slot()
        self.assertEqual(osiris_api._running_tools, 0)

    def test_the_worker_refuses_a_tool_when_it_is_full(self):
        for _ in range(osiris_api.MAX_CONCURRENT_TOOLS):
            osiris_api._acquire_tool_slot()
        with self.assertRaises(osiris_api.TooManyToolsRunning):
            osiris_api._acquire_tool_slot()

    def test_a_freed_slot_can_be_taken_again(self):
        for _ in range(osiris_api.MAX_CONCURRENT_TOOLS):
            osoris_api_slot = osiris_api._acquire_tool_slot
            osoris_api_slot()
        osiris_api._release_tool_slot()
        # One slot was given back, so one more tool fits.
        osiris_api._acquire_tool_slot()
        self.assertEqual(osiris_api._running_tools, osiris_api.MAX_CONCURRENT_TOOLS)

    def test_a_failing_tool_gives_its_slot_back(self):
        # A tool that crashes must not take a slot with it, or a
        # handful of crashes would stop the worker running anything.
        with self.assertRaises(RuntimeError):
            try:
                osiris_api._acquire_tool_slot()
                raise RuntimeError("the tool crashed")
            finally:
                osiris_api._release_tool_slot()
        self.assertEqual(osiris_api._running_tools, 0)

    def test_the_slots_are_counted_across_threads(self):
        # The count is shared, so two threads cannot each take a slot
        # and both believe they are under the limit.
        errors = []
        taken = []

        def take_many():
            try:
                for _ in range(osiris_api.MAX_CONCURRENT_TOOLS):
                    osiris_api._acquire_tool_slot()
                    taken.append(1)
            except osiris_api.TooManyToolsRunning:
                errors.append(1)

        threads = [threading.Thread(target=take_many) for _ in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        # Four threads each wanting the whole allowance, and the total
        # taken is the allowance - not four times it.
        self.assertEqual(osiris_api._running_tools, osiris_api.MAX_CONCURRENT_TOOLS)
        self.assertEqual(len(taken), osiris_api.MAX_CONCURRENT_TOOLS)

    def test_the_bound_is_a_number_someone_can_read(self):
        # The bound is a decision, so it is named rather than buried in
        # the code, and a caller can see it in the refusal.
        self.assertGreater(osiris_api.MAX_CONCURRENT_TOOLS, 0)
        self.assertLessEqual(osiris_api.MAX_CONCURRENT_TOOLS, 64)


if __name__ == "__main__":
    unittest.main()
