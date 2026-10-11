#!/usr/bin/env python3
"""Verify Whip grammar packages offline; optionally regenerate in temporary copies.

No installation or network access. --regenerate requires the official pinned CLI
and Node already installed. Run the inherited/owned corpora separately.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import tomllib


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--regenerate", action="store_true")
    parser.add_argument("--cli", default="tree-sitter")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    pins = json.loads((root / "docs/design/grammar-pins.json").read_text())
    metadata = json.loads(subprocess.check_output(
        [os.environ.get("CARGO", "cargo"), "metadata", "--format-version", "1",
         "--locked", "--offline", "--no-default-features"], cwd=root, text=True,
    ))
    if args.regenerate:
        cli = subprocess.check_output([args.cli, "--version"], text=True).split()
        require(cli[:2] == ["tree-sitter", "0.25.10"], "requires official CLI 0.25.10")
    for language in ["python", "kotlin", "c"]:
        base = root / "grammars" / language
        manifest_path = base / "owned-provenance.json"
        manifest = json.loads(manifest_path.read_text())
        upstream = json.loads((base / "source-provenance.json").read_text())
        generated = json.loads((base / "generated-provenance.json").read_text())
        cargo = tomllib.loads((base / "Cargo.toml").read_text())["package"]
        require((cargo["name"], cargo["version"]) ==
                (manifest["package"], manifest["version"]), "package identity mismatch")
        require(manifest["upstreamCommit"] == upstream["revision"] and
                manifest["upstreamArchiveSha256"] == upstream["archiveSha256"],
                "upstream identity mismatch")
        files = {str(p.relative_to(base)) for p in base.rglob("*") if p.is_file()
                 and p.name not in ["IDENTITY", "owned-provenance.json"]}
        require(files == set(manifest["files"]), f"unrecorded/missing files: {language}")
        for relative, expected in manifest["files"].items():
            path = (base / relative).resolve()
            require(path.is_relative_to(base), "invalid package path")
            require(digest(path) == expected, f"hash mismatch: {language}/{relative}")
        # Non-generated upstream inputs must either remain identical or have an
        # original snapshot and readable patch. Generated originals are hashed in
        # the official archive manifest rather than duplicated in the package.
        for relative, expected in upstream["files"].items():
            if relative.startswith("src/") and relative in generated["files"]:
                continue
            current = base / relative
            original = base / "upstream" / relative
            require(digest(original if original.exists() else current) == expected,
                    f"upstream input drift: {language}/{relative}")
        for relative, expected in generated["files"].items():
            require(digest(base / relative) == expected,
                    f"generated output mismatch: {language}/{relative}")
        identity = (f"whip/{cargo['name']}@{cargo['version']}"
                    f"+sha256:{digest(manifest_path)}")
        require((base / "IDENTITY").read_text().strip() == identity, "identity mismatch")
        pin = next(p for p in pins["packages"] if p["package"] == cargo["name"])
        require(pin["identity"] == identity and
                pin["ownedManifestSha256"] == digest(manifest_path), "pin mismatch")
        package = next(p for p in metadata["packages"] if p["name"] == cargo["name"])
        require(package["source"] is None and package["version"] == cargo["version"]
                and Path(package["manifest_path"]).resolve() == base / "Cargo.toml",
                "Cargo resolved a different grammar package")
        # Check that the readable patch reproduces every changed original input.
        with tempfile.TemporaryDirectory(prefix="whip-grammar-") as temporary:
            copied = Path(temporary) / language
            shutil.copytree(base, copied)
            for original in (base / "upstream").rglob("*"):
                if original.is_file():
                    target = copied / original.relative_to(base / "upstream")
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(original, target)
            subprocess.run(["patch", "--batch", "--fuzz=0", "-p1", "-i",
                            str(base / "whip.patch")], cwd=copied, check=True,
                           stdout=subprocess.DEVNULL)
            for original in (base / "upstream").rglob("*"):
                if original.is_file():
                    relative = original.relative_to(base / "upstream")
                    require(digest(copied / relative) == digest(base / relative),
                            f"patch reproduction failed: {language}/{relative}")
            if args.regenerate:
                subprocess.run([args.cli, "generate", "--abi", "15"],
                               cwd=copied, check=True)
                for relative, expected in generated["files"].items():
                    require(digest(copied / relative) == expected,
                            f"regeneration differs: {language}/{relative}")
        print(f"{language}: {len(files)} hashes, Cargo identity and source patch verified"
              + ("; regenerated outputs identical" if args.regenerate else ""))


if __name__ == "__main__":
    main()
