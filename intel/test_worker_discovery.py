"""
The worker's discovery of the tool collection.

The worker never imports a tool module. It finds the tools on disk, and
the tool runs in a subprocess through the bounded runner. So this
discovery is the whole of what the worker knows about the collection, and
two things about it matter:

* It has to find every tool. A tool the worker cannot see is a tool a
  caller cannot run.
* It has to be quick. The health check is what a caller waits on, and
  the worker used to take almost a minute to answer it, because the scan
  walked into the vendored trees in the collection and read a
  description out of every file it found.

The tests build a small collection of their own rather than reading the
operator's, so they say what they mean and do not depend on what
happens to be installed.
"""

import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import osiris_api


def _write_tool(path: Path, name: str, description: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        f'"""{description}"""\n\n\ndef main():\n    return "{name}"\n',
        encoding="utf-8",
    )


class WorkerDiscoveryTests(unittest.TestCase):
    """The scan, over a collection built for the test."""

    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="osiris-tools-"))
        self.addCleanup(shutil.rmtree, self.root, ignore_errors=True)

        # Two real tools, one in a subdirectory.
        _write_tool(self.root / "alpha" / "one.py", "one", "The first tool.")
        _write_tool(self.root / "alpha" / "nested" / "two.py", "two", "The second tool.")

        # A vendored tree, which must not be walked into.
        _write_tool(self.root / "alpha" / "node_modules" / "pkg" / "vendored.py",
                    "vendored", "Not a tool.")

        # A private file, which is not a tool.
        _write_tool(self.root / "alpha" / "_helper.py", "helper", "Not a tool.")

        self._original_root = osiris_api.TOOLS_PATH
        osiris_api.TOOLS_PATH = self.root
        osiris_api._tool_cache = None
        osiris_api._description_cache = None
        self.addCleanup(self._restore)

    def _restore(self):
        osiris_api.TOOLS_PATH = self._original_root
        osiris_api._tool_cache = None
        osiris_api._description_cache = None

    def test_it_finds_every_tool(self):
        tools = osiris_api.discover_tools()
        names = sorted(t["name"] for t in tools.get("alpha", []))
        self.assertEqual(names, ["one", "two"])

    def test_it_does_not_walk_into_vendored_trees(self):
        # A category is a checkout in its own right sometimes, and one of
        # them carries a node_modules. Reading a thousand vendored files
        # that are not tools is what made the worker take a minute to
        # start.
        tools = osiris_api.discover_tools()
        for tool in tools.get("alpha", []):
            self.assertNotIn("node_modules", tool["full_path"])

    def test_a_private_file_is_not_a_tool(self):
        tools = osiris_api.discover_tools()
        names = [t["name"] for t in tools.get("alpha", [])]
        self.assertNotIn("helper", names)

    def test_a_tool_has_no_description_until_it_is_asked_for(self):
        # An empty description would say the tool has none, which is a
        # different claim from "nobody has read it yet".
        tools = osiris_api.discover_tools()
        for tool in tools.get("alpha", []):
            self.assertNotIn("description", tool)

    def test_asking_for_the_collection_reads_the_descriptions(self):
        tools = osiris_api.describe_tools(osiris_api.discover_tools())
        descriptions = {t["name"]: t["description"] for t in tools.get("alpha", [])}
        self.assertEqual(descriptions.get("one"), "The first tool.")
        self.assertEqual(descriptions.get("two"), "The second tool.")

    def test_the_descriptions_are_cached(self):
        first = osiris_api.describe_tools(osiris_api.discover_tools())
        second = osiris_api.describe_tools(osiris_api.discover_tools())
        self.assertIs(first, second)

    def test_a_changed_tool_list_gets_its_descriptions_read_again(self):
        # The description cache is tied to the list it describes, so a
        # tool added while the worker is running is described rather than
        # served with the old list's description.
        first = osiris_api.describe_tools(osiris_api.discover_tools())

        _write_tool(self.root / "alpha" / "three.py", "three", "The third tool.")
        osiris_api._tool_cache = None
        osiris_api._description_cache = None

        second = osiris_api.describe_tools(osiris_api.discover_tools())
        self.assertIsNot(first, second)
        names = [t["name"] for t in second.get("alpha", [])]
        self.assertIn("three", names)


if __name__ == "__main__":
    unittest.main()
