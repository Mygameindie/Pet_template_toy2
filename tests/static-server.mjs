// Tiny static file server for the browser smoke tests (no dependencies).
// Serves GAME_DIR (default: the repo root) on PORT (default 4173).
//   node tests/static-server.mjs            -> serves this game
//   GAME_DIR=../SomeGame node tests/static-server.mjs
//
// Only real files inside the game folder are served: no path outside it
// (also not through a symlink), and nothing whose path has a part starting
// with "." (.git, .env, .github, ...). See tests/static-server.test.mjs.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".gif": "image/gif", ".svg": "image/svg+xml", ".mp3": "audio/mpeg",
  ".wav": "audio/wav", ".ogg": "audio/ogg", ".txt": "text/plain; charset=utf-8",
};

// Real (symlink-free) path of the folder to serve.
export function realRoot(dir) {
  return fs.realpathSync(path.resolve(dir));
}

// Maps a request path to a real file inside root, or returns
// { status } for a refused (403), missing (404) or malformed (400) path.
// root must come from realRoot().
export function resolveRequest(root, urlPath) {
  let rel;
  try { rel = decodeURIComponent(new URL(urlPath, "http://x").pathname); }
  catch { return { status: 400 }; }
  if (rel.includes("\0") || rel.includes("\\")) return { status: 400 };
  if (rel.endsWith("/")) rel += "index.html";
  const parts = rel.split("/").filter(Boolean);
  // no "..", ".", ".git", ".env", ...: any part starting with a dot is refused
  if (parts.some(p => p.startsWith("."))) return { status: 403 };
  const candidate = path.join(root, ...parts);
  let real;
  try { real = fs.realpathSync(candidate); }
  catch { return { status: 404 }; }
  // path-aware containment on the REAL path (a symlink pointing out is refused)
  const inside = path.relative(root, real);
  if (!inside || inside.startsWith("..") || path.isAbsolute(inside)) return { status: 403 };
  if (inside.split(path.sep).some(p => p.startsWith("."))) return { status: 403 };
  let st;
  try { st = fs.statSync(real); } catch { return { status: 404 }; }
  if (!st.isFile()) return { status: 404 };
  return { status: 200, file: real };
}

export function createServer(dir) {
  const root = realRoot(dir);
  const server = http.createServer((req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
    const r = resolveRequest(root, req.url);
    if (r.status !== 200) { res.writeHead(r.status); return res.end(); }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(r.file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(r.file).pipe(res);
  });
  server.root = root;
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const port = Number(process.env.PORT || 4173);
  const server = createServer(process.env.GAME_DIR || path.join(here, ".."));
  server.listen(port, "127.0.0.1", () => console.log(`serving ${server.root} on http://127.0.0.1:${port}`));
}
