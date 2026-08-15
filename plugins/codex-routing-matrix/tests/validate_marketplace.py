from __future__ import annotations

import argparse
import json
import pathlib


PLUGIN_ROOT = pathlib.Path(__file__).resolve().parent.parent


def load_json(path: pathlib.Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


parser = argparse.ArgumentParser()
parser.add_argument("marketplace", type=pathlib.Path)
args = parser.parse_args()

manifest = load_json(PLUGIN_ROOT / ".codex-plugin" / "plugin.json")
marketplace = load_json(args.marketplace.resolve())
entries = [entry for entry in marketplace["plugins"] if entry["name"] == manifest["name"]]

assert marketplace["name"] == "codex-routing-matrix"
assert len(entries) == 1
assert entries[0]["source"] == {
    "source": "local",
    "path": "./plugins/codex-routing-matrix",
}

print("PASS repository marketplace")
