// Client minimal pentru API-ul GitHub: citește fișiere din repo-ul de date și
// scrie modificări ca un singur commit atomic (Git Data API).

export class GitHubError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export class ConflictError extends Error {}

const enc = new TextEncoder();
const dec = new TextDecoder();

export function bytesToBase64(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export class GitHubRepo {
  constructor({ apiBase, token, repo }) {
    this.apiBase = apiBase.replace(/\/$/, '');
    this.token = token;
    this.repo = repo; // "owner/name"
    this.branch = null;
  }

  async request(method, path, { body, accept, allow404 = false } = {}) {
    const res = await fetch(`${this.apiBase}${path}`, {
      method,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: accept || 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (allow404 && res.status === 404) return null;
    if (!res.ok) {
      let msg = res.statusText;
      try { msg = (await res.json()).message || msg; } catch { /* corp ne-JSON */ }
      throw new GitHubError(res.status, msg);
    }
    return res;
  }

  async json(method, path, opts) {
    const res = await this.request(method, path, opts);
    return res ? res.json() : null;
  }

  repoPath(p = '') {
    return `/repos/${this.repo}${p}`;
  }

  contentsPath(path) {
    return this.repoPath(`/contents/${path.split('/').map(encodeURIComponent).join('/')}`);
  }

  async currentUser() {
    return this.json('GET', '/user');
  }

  async info() {
    const info = await this.json('GET', this.repoPath());
    this.branch = info.default_branch;
    return info;
  }

  // SHA-ul commit-ului curent; null dacă repo-ul e complet gol.
  async head() {
    try {
      const ref = await this.json('GET', this.repoPath(`/git/ref/heads/${this.branch}`), { allow404: true });
      return ref ? ref.object.sha : null;
    } catch (e) {
      if (e.status === 409) return null; // "Git Repository is empty"
      throw e;
    }
  }

  async readBytes(path, ref) {
    const q = ref ? `?ref=${ref}` : '';
    const res = await this.request('GET', this.contentsPath(path) + q, {
      accept: 'application/vnd.github.raw+json',
      allow404: true,
    });
    return res ? new Uint8Array(await res.arrayBuffer()) : null;
  }

  async readJson(path, ref) {
    const bytes = await this.readBytes(path, ref);
    return bytes ? JSON.parse(dec.decode(bytes)) : null;
  }

  async listDir(path, ref) {
    const q = ref ? `?ref=${ref}` : '';
    const items = await this.json('GET', this.contentsPath(path) + q, { allow404: true });
    return Array.isArray(items) ? items : [];
  }

  async createBlob(bytes) {
    const blob = await this.json('POST', this.repoPath('/git/blobs'), {
      body: { content: bytesToBase64(bytes), encoding: 'base64' },
    });
    return blob.sha;
  }

  // Primul commit într-un repo gol (Git Data API nu funcționează pe repo gol).
  async initEmpty(path, text, message) {
    await this.json('PUT', this.contentsPath(path), {
      body: { message, content: bytesToBase64(enc.encode(text)) },
    });
  }

  // Scrie mai multe fișiere într-un singur commit. `files` = [{path, text} | {path, blobSha}].
  // Aruncă ConflictError dacă altcineva a scris între timp (ramura nu mai e fast-forward).
  async commitFiles(parentSha, files, message) {
    const parent = await this.json('GET', this.repoPath(`/git/commits/${parentSha}`));
    const tree = [];
    for (const f of files) {
      const sha = f.blobSha || (await this.createBlob(enc.encode(f.text)));
      tree.push({ path: f.path, mode: '100644', type: 'blob', sha });
    }
    const newTree = await this.json('POST', this.repoPath('/git/trees'), {
      body: { base_tree: parent.tree.sha, tree },
    });
    const commit = await this.json('POST', this.repoPath('/git/commits'), {
      body: { message, tree: newTree.sha, parents: [parentSha] },
    });
    try {
      await this.json('PATCH', this.repoPath(`/git/refs/heads/${this.branch}`), {
        body: { sha: commit.sha, force: false },
      });
    } catch (e) {
      if (e.status === 422 || e.status === 409) throw new ConflictError('Ramura s-a modificat între timp');
      throw e;
    }
    return commit.sha;
  }

  // Citește starea curentă, aplică `build(headSha)` și face commit; la conflict
  // (două persoane salvează simultan) reia de la capăt cu datele noi.
  async transact(build, message, attempts = 5) {
    for (let i = 0; i < attempts; i++) {
      const head = await this.head();
      const { files, result } = await build(head);
      try {
        await this.commitFiles(head, files, message(result));
        return result;
      } catch (e) {
        if (!(e instanceof ConflictError) || i === attempts - 1) throw e;
        await new Promise((r) => setTimeout(r, 300 + Math.random() * 700));
      }
    }
    throw new Error('unreachable');
  }
}
