"""Verify the public deployment against the exact frontend artifact built by CI."""
import argparse
import hashlib
import json
import re
import subprocess
import tempfile
import time
from pathlib import Path


def digest(data):
    return hashlib.sha256(data).hexdigest()


def fetch(url):
    with tempfile.TemporaryDirectory(prefix="pages-check-") as directory:
        headers = Path(directory) / "headers"
        body = Path(directory) / "body"
        result = subprocess.run(
            ["curl", "--silent", "--show-error", "--compressed", "--fail",
             "--connect-timeout", "5", "--max-time", "20",
             "--dump-header", str(headers), "--output", str(body), url],
            capture_output=True, text=True,
        )
        if result.returncode:
            raise RuntimeError(f"HTTPS check failed: {url} (curl {result.returncode})")
        values = {}
        for line in headers.read_text().splitlines():
            if ":" in line:
                key, value = line.split(":", 1)
                values[key.lower()] = value.strip()
        return values, body.read_bytes()


def verify(directory):
    index = (directory / "index.html").read_bytes()
    for required in ("_worker.js", "_routes.json", "_headers", "sw.js"):
        if not (directory / required).is_file():
            raise RuntimeError(f"Artifact is missing {required}")
    if (directory / "404.html").exists():
        raise RuntimeError("A root 404.html would disable the Pages SPA fallback")

    for base in ("https://momonihongo-web.pages.dev", "https://momonihongo.app"):
        for path in ("/", "/learn/ci-route-check", "/games/CI-ROUTE-CHECK"):
            headers, body = fetch(base + path)
            if digest(body) != digest(index):
                raise RuntimeError(f"Public HTML does not match this CI artifact: {base}{path}")
            if "text/html" not in headers.get("content-type", ""):
                raise RuntimeError(f"Incorrect SPA Content-Type: {base}{path}")
            cache = headers.get("cache-control", "")
            if "max-age=0" not in cache or "must-revalidate" not in cache:
                raise RuntimeError(f"HTML must revalidate: {base}{path}")

        assets = re.findall(r'(?:src|href)="(/assets/[^\"]+\.(?:js|css))"', index.decode())
        if not assets:
            raise RuntimeError("No fingerprinted JS/CSS entry assets in artifact")
        for path in assets:
            headers, body = fetch(base + path)
            if digest(body) != digest((directory / path.lstrip("/")).read_bytes()):
                raise RuntimeError(f"Public asset differs from CI artifact: {base}{path}")
            if "immutable" not in headers.get("cache-control", ""):
                raise RuntimeError(f"Fingerprint asset cache missing: {base}{path}")
        headers, body = fetch(base + "/sw.js")
        if body != (directory / "sw.js").read_bytes() or "no-store" not in headers.get("cache-control", ""):
            raise RuntimeError(f"Retired service worker must match artifact and not be cached: {base}")

    _, body = fetch("https://momonihongo.app/api/auth/config")
    if "channels" not in json.loads(body):
        raise RuntimeError("Legacy API proxy did not return account configuration")
    print("Pages verified: exact CI HTML/assets, SPA, cache and legacy API proxy.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, required=True)
    args = parser.parse_args()
    deadline = time.monotonic() + 180
    while True:
        try:
            verify(args.directory)
            return
        except (RuntimeError, OSError, ValueError) as error:
            if time.monotonic() >= deadline:
                raise SystemExit(str(error)) from None
            print(f"Waiting for deployment propagation: {error}", flush=True)
            time.sleep(5)


if __name__ == "__main__":
    main()
