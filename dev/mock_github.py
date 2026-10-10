"""Server de test local: servește aplicația și simulează API-ul GitHub în memorie.

Rulare (din rădăcina proiectului):
    python dev/mock_github.py
apoi deschide http://localhost:8787/?api=http://localhost:8787/api
Orice token e acceptat; tokenul "citire" simulează drept doar de citire.
Doar pentru dezvoltare — nu e folosit de site-ul publicat.
"""
import base64
import hashlib
import json
import os
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
LOCK = threading.Lock()

blobs = {}     # sha -> bytes
trees = {}     # sha -> {path: blob_sha}
commits = {}   # sha -> {"tree": sha, "parents": [...], "message": str}
refs = {}      # "owner/repo" -> commit sha pe main   (lipsă = repo gol)


def sha(data):
    return hashlib.sha1(data).hexdigest()


def tree_of(repo, ref):
    if ref is None or ref == "main":
        ref = refs.get(repo)
    if ref not in commits:
        return None
    return trees[commits[ref]["tree"]]


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s\n" % (fmt % args))

    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Accept, Content-Type, X-GitHub-Api-Version")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, OPTIONS")

    def reply(self, status, obj=None, raw=None):
        body = raw if raw is not None else json.dumps(obj).encode()
        self.send_response(status)
        self.cors()
        self.send_header("Content-Type", "application/octet-stream" if raw is not None else "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.end_headers()

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    def api(self, method):
        u = urlparse(self.path)
        parts = [unquote(p) for p in u.path.split("/")[2:]]  # fără "", "api"
        q = parse_qs(u.query)
        token = (self.headers.get("Authorization") or "").replace("Bearer ", "")
        with LOCK:
            if parts[:1] == ["raw"] and method == "GET":  # ca GitHub Pages
                tree = tree_of("/".join(parts[1:3]), None)
                path = "/".join(parts[3:])
                if tree is None or path not in tree:
                    return self.reply(404, {"message": "Not Found"})
                return self.reply(200, raw=blobs[tree[path]])
            public = len(parts) > 2 and parts[2].endswith("-public")
            if not token and not (public and method == "GET"):
                return self.reply(401, {"message": "Bad credentials"})
            can_push = bool(token) and token != "citire"
            if parts == ["user"]:
                return self.reply(200, {"login": "test", "name": "Test"})
            if len(parts) < 3 or parts[0] != "repos":
                return self.reply(404, {"message": "Not Found"})
            repo = parts[1] + "/" + parts[2]
            rest = parts[3:]
            if not rest:
                return self.reply(200, {"default_branch": "main", "permissions": {"push": can_push}})
            if method != "GET" and not can_push:
                return self.reply(403, {"message": "Resource not accessible by personal access token"})
            if rest[:3] == ["git", "ref", "heads"]:
                if repo not in refs:
                    return self.reply(409, {"message": "Git Repository is empty."})
                return self.reply(200, {"object": {"sha": refs[repo]}})
            if rest[0] == "contents":
                path = "/".join(rest[1:])
                if method == "PUT":
                    if repo in refs:
                        return self.reply(422, {"message": "sha required"})
                    data = base64.b64decode(self.body()["content"])
                    b = sha(data); blobs[b] = data
                    t = sha(json.dumps({path: b}).encode()); trees[t] = {path: b}
                    c = sha(t.encode() + b"init"); commits[c] = {"tree": t, "parents": [], "message": "init"}
                    refs[repo] = c
                    return self.reply(201, {"commit": {"sha": c}})
                tree = tree_of(repo, q.get("ref", [None])[0])
                if tree is None:
                    return self.reply(404, {"message": "Not Found"})
                if path in tree:
                    return self.reply(200, raw=blobs[tree[path]])
                prefix = path + "/"
                names = sorted({p[len(prefix):].split("/")[0] for p in tree if p.startswith(prefix)})
                if names:
                    return self.reply(200, [{"name": n, "path": prefix + n} for n in names])
                return self.reply(404, {"message": "Not Found"})
            if rest == ["git", "blobs"] and method == "POST":
                data = base64.b64decode(self.body()["content"])
                b = sha(data); blobs[b] = data
                return self.reply(201, {"sha": b})
            if rest[:2] == ["git", "commits"] and method == "GET":
                c = commits.get(rest[2])
                return self.reply(200, {"sha": rest[2], "tree": {"sha": c["tree"]}}) if c else self.reply(404, {"message": "Not Found"})
            if rest == ["git", "trees"] and method == "POST":
                d = self.body()
                t = dict(trees[d["base_tree"]])
                for e in d["tree"]:
                    t[e["path"]] = e["sha"]
                ts = sha(json.dumps(t, sort_keys=True).encode()); trees[ts] = t
                return self.reply(201, {"sha": ts})
            if rest == ["git", "commits"] and method == "POST":
                d = self.body()
                c = sha(json.dumps(d, sort_keys=True).encode() + os.urandom(4))
                commits[c] = {"tree": d["tree"], "parents": d["parents"], "message": d["message"]}
                print("COMMIT:", d["message"], file=sys.stderr)
                return self.reply(201, {"sha": c})
            if rest[:3] == ["git", "refs", "heads"] and method == "PATCH":
                d = self.body()
                if refs[repo] not in commits[d["sha"]]["parents"]:
                    return self.reply(422, {"message": "Update is not a fast forward"})
                refs[repo] = d["sha"]
                return self.reply(200, {"object": {"sha": d["sha"]}})
        return self.reply(404, {"message": "Not Found"})

    def do_GET(self):
        if self.path.startswith("/api/"):
            return self.api("GET")
        return super().do_GET()

    def do_POST(self):
        self.api("POST")

    def do_PUT(self):
        self.api("PUT")

    def do_PATCH(self):
        self.api("PATCH")


def seed_repo(repo, path, data):
    b = sha(data); blobs[b] = data
    t = sha(json.dumps({path: b}).encode()); trees[t] = {path: b}
    c = sha(t.encode() + repo.encode()); commits[c] = {"tree": t, "parents": [], "message": "seed"}
    refs[repo] = c


if __name__ == "__main__":
    # repo-ul public există deja cu un README (ca pe GitHub); cel privat pornește gol
    seed_repo("adysaba84/RegistruElectronicDocumenteAsociatie-public", "README.md", b"# public")
    print(f"http://localhost:{PORT}/?api=http://localhost:{PORT}/api", file=sys.stderr)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
