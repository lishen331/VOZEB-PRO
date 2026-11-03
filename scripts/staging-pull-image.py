#!/usr/bin/env python3
# Resumable replacement for `docker pull` on the staging server: Docker 24 discards
# partially downloaded layers when a pull is cancelled, so a single stalled layer
# makes every retry start from zero. Blobs are cached by digest across runs.
import argparse
import concurrent.futures
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import tarfile
import time
import urllib.error
import urllib.parse
import urllib.request

ACCEPT = ",".join([
    "application/vnd.oci.image.index.v1+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.docker.distribution.manifest.v2+json",
])
INDEX_TYPES = {
    "application/vnd.oci.image.index.v1+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
}
READ_TIMEOUT = 20
CHUNK = 1 << 20


def log(msg):
    print(f"[pull-image] {msg}", file=sys.stderr, flush=True)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


OPENER = urllib.request.build_opener(NoRedirect)


class Registry:
    def __init__(self, host, repo):
        self.host = host
        self.repo = repo
        self.token = None

    def _authenticate(self, challenge):
        params = dict(re.findall(r'(\w+)="([^"]*)"', challenge))
        query = {"scope": f"repository:{self.repo}:pull"}
        if "service" in params:
            query["service"] = params["service"]
        url = params["realm"] + "?" + urllib.parse.urlencode(query)
        with urllib.request.urlopen(url, timeout=READ_TIMEOUT) as resp:
            body = json.load(resp)
        self.token = body.get("token") or body.get("access_token")

    def open(self, path, headers=None):
        url = f"https://{self.host}/v2/{self.repo}/{path}"
        for _ in range(2):
            req = urllib.request.Request(url, headers=dict(headers or {}))
            if self.token:
                req.add_header("Authorization", f"Bearer {self.token}")
            try:
                return OPENER.open(req, timeout=READ_TIMEOUT)
            except urllib.error.HTTPError as err:
                if err.code == 401 and self.token is None:
                    self._authenticate(err.headers.get("WWW-Authenticate", ""))
                    continue
                if err.code in (301, 302, 303, 307, 308):
                    location = urllib.parse.urljoin(url, err.headers["Location"])
                    # Signed storage URLs reject the registry bearer token.
                    plain = urllib.request.Request(location, headers=dict(headers or {}))
                    return OPENER.open(plain, timeout=READ_TIMEOUT)
                raise
        raise RuntimeError(f"{self.host}: authentication failed")

    def manifest(self, ref):
        with self.open(f"manifests/{ref}", {"Accept": ACCEPT}) as resp:
            return json.load(resp)


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(CHUNK), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch_blob(registries, digest, size, cache_dir, deadline):
    hexdigest = digest.split(":", 1)[1]
    final = os.path.join(cache_dir, hexdigest)
    partial = final + ".partial"
    if os.path.exists(final):
        if os.path.getsize(final) == size and sha256_file(final) == hexdigest:
            os.utime(final)
            log(f"{hexdigest[:12]} cached")
            return final
        os.remove(final)

    attempt = 0
    while time.monotonic() < deadline:
        registry = registries[attempt % len(registries)]
        attempt += 1
        have = os.path.getsize(partial) if os.path.exists(partial) else 0
        if have > size:
            os.remove(partial)
            have = 0
        if have < size:
            headers = {"Range": f"bytes={have}-"} if have else {}
            try:
                with registry.open(f"blobs/{digest}", headers) as resp:
                    mode = "ab"
                    if have and resp.status != 206:
                        mode, have = "wb", 0
                    with open(partial, mode) as out:
                        while True:
                            if time.monotonic() >= deadline:
                                raise TimeoutError("overall deadline reached")
                            chunk = resp.read(CHUNK)
                            if not chunk:
                                break
                            out.write(chunk)
            except Exception as err:  # stalls surface as socket timeouts; keep the partial file
                now = os.path.getsize(partial) if os.path.exists(partial) else 0
                log(f"{hexdigest[:12]} attempt {attempt} via {registry.host} stopped at "
                    f"{now}/{size} bytes: {err!r}")
                time.sleep(2)
                continue
        if os.path.getsize(partial) == size:
            if sha256_file(partial) == hexdigest:
                os.replace(partial, final)
                log(f"{hexdigest[:12]} downloaded ({size} bytes, {attempt} attempt(s))")
                return final
            log(f"{hexdigest[:12]} checksum mismatch; restarting")
            os.remove(partial)
    raise RuntimeError(f"{digest}: not downloaded before deadline")


def resolve_manifest(registries, ref, platform):
    last = None
    for registry in registries:
        try:
            manifest = registry.manifest(ref)
            if manifest.get("mediaType") in INDEX_TYPES or "manifests" in manifest:
                os_name, arch = platform.split("/")
                match = next(
                    (m for m in manifest["manifests"]
                     if m.get("platform", {}).get("os") == os_name
                     and m.get("platform", {}).get("architecture") == arch),
                    None,
                )
                if match is None:
                    raise RuntimeError(f"no {platform} manifest in index")
                manifest = registry.manifest(match["digest"])
            return manifest
        except Exception as err:
            log(f"manifest via {registry.host} failed: {err!r}")
            last = err
    raise RuntimeError(f"could not resolve manifest for {ref}") from last


def docker_load(image, config_path, layer_paths):
    proc = subprocess.Popen(["docker", "load"], stdin=subprocess.PIPE)
    try:
        with tarfile.open(fileobj=proc.stdin, mode="w|") as tar:
            config_name = os.path.basename(config_path) + ".json"
            layer_names = [f"{os.path.basename(p)}/layer.tar" for p in layer_paths]
            manifest = json.dumps([{
                "Config": config_name,
                "RepoTags": [image],
                "Layers": layer_names,
            }]).encode()
            info = tarfile.TarInfo("manifest.json")
            info.size = len(manifest)
            tar.addfile(info, fileobj=io.BytesIO(manifest))
            tar.add(config_path, arcname=config_name)
            for path, name in zip(layer_paths, layer_names):
                tar.add(path, arcname=name)
    finally:
        proc.stdin.close()
    if proc.wait() != 0:
        raise RuntimeError("docker load failed")


def prune(cache_dir, keep_days):
    cutoff = time.time() - keep_days * 86400
    for name in os.listdir(cache_dir):
        path = os.path.join(cache_dir, name)
        if os.path.isfile(path) and os.path.getmtime(path) < cutoff:
            os.remove(path)
            log(f"pruned {name[:12]}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("image", help="e.g. ghcr.io/owner/repo:tag")
    parser.add_argument("--mirror", action="append", default=["ghcr.nju.edu.cn"])
    parser.add_argument("--platform", default="linux/amd64")
    parser.add_argument("--cache-dir", default=os.path.expanduser("~/.cache/vozeb-image-blobs/sha256"))
    parser.add_argument("--timeout", type=int, default=1200, help="overall seconds")
    parser.add_argument("--jobs", type=int, default=4)
    parser.add_argument("--keep-days", type=int, default=14)
    parser.add_argument("--download-only", action="store_true")
    args = parser.parse_args()

    host, _, rest = args.image.partition("/")
    repo, _, tag = rest.rpartition(":")
    if not repo or "/" in tag:
        parser.error("image must be host/repo:tag")
    registries = [Registry(host, repo)] + [Registry(m, repo) for m in args.mirror if m and m != host]
    os.makedirs(args.cache_dir, exist_ok=True)
    deadline = time.monotonic() + args.timeout

    manifest = resolve_manifest(registries, tag, args.platform)
    blobs = [manifest["config"]] + manifest["layers"]
    total = sum(b["size"] for b in blobs)
    log(f"{args.image}: {len(manifest['layers'])} layers, {total} bytes")

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.jobs) as pool:
        futures = [pool.submit(fetch_blob, registries, b["digest"], b["size"], args.cache_dir, deadline)
                   for b in blobs]
        paths = [f.result() for f in futures]

    if not args.download_only:
        docker_load(args.image, paths[0], paths[1:])
        log(f"loaded {args.image}")
    prune(args.cache_dir, args.keep_days)


if __name__ == "__main__":
    try:
        main()
    except Exception as err:
        log(f"failed: {err}")
        sys.exit(1)
