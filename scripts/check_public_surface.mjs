import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';

const runGit = (...args) => execFileSync('git', args, {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
}).trim();
const manifest = JSON.parse(readFileSync('release/public_release_manifest.json', 'utf8'));
const expectedPaths = [...manifest.paths].sort();
const actualPaths = runGit('ls-files', '--cached', '--others', '--exclude-standard')
  .split('\n')
  .filter(Boolean)
  .sort();

if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
  const missing = expectedPaths.filter((path) => !actualPaths.includes(path));
  const extra = actualPaths.filter((path) => !expectedPaths.includes(path));
  throw new Error(`Public path allowlist mismatch. Missing: ${missing.join(', ') || 'none'}. Extra: ${extra.join(', ') || 'none'}.`);
}

const forbidden = [
  ['direct-browser header', ['anthropic', 'dangerous', 'direct', 'browser', 'access'].join('-')],
  ['client credential header', ['x', 'api', 'key'].join('-')],
  ['provider endpoint', ['api', 'anthropic', 'com'].join('.')],
  ['provider console', ['console', 'anthropic', 'com'].join('.')],
  ['provider credential prompt', ['Anthropic', 'API', 'key'].join(' ')],
  ['career framing', ['Built for ', 'Anthropic Life Sciences Research Engineer ', 'application'].join('')],
  ['legacy personal email', ['silveray1563', 'gmail.com'].join('@')],
  ['legacy model id', ['claude', 'sonnet', '4', '20250514'].join('-')],
  ['local user path', ['/', 'Users', '/'].join('')],
  ['cloud-sync path', ['Drop', 'box', '/'].join('')],
  ['credential prefix', `${['sk', 'ant'].join('-')}-`],
];
const personalEmail = new RegExp(`[A-Z0-9._%+-]+@(?:${['gmail', 'yahoo', 'hotmail', 'outlook'].join('|')})\\.[A-Z]{2,}`, 'i');
const allowedExtensions = new Set(['', '.cff', '.csv', '.css', '.html', '.js', '.json', '.jsx', '.lock', '.md', '.mjs', '.svg', '.txt', '.yml']);

function scanContent(path, buffer, scope) {
  if (buffer.includes(0)) throw new Error(`${scope} contains a binary file: ${path}`);
  const text = buffer.toString('utf8');
  for (const [label, pattern] of forbidden) {
    if (text.toLowerCase().includes(pattern.toLowerCase())) {
      throw new Error(`${scope} contains forbidden ${label}: ${path}`);
    }
  }
  if (personalEmail.test(text)) throw new Error(`${scope} contains a personal email address: ${path}`);
}

for (const path of actualPaths) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) throw new Error(`Symlinks are not allowed: ${path}`);
  if (stat.size > 1_000_000) throw new Error(`Public files must be 1 MB or smaller: ${path}`);
  if (!allowedExtensions.has(extname(path))) throw new Error(`Unsupported public file type: ${path}`);
  scanContent(path, readFileSync(path), 'Current tree');
}

const networkCall = new RegExp(`\\b(?:${['fetch', 'XMLHttpRequest', 'WebSocket'].join('|')})\\s*\\(`);
for (const path of actualPaths.filter((path) => path.startsWith('src/'))) {
  if (networkCall.test(readFileSync(path, 'utf8'))) {
    throw new Error(`Runtime network call is not allowed in the local-only source: ${path}`);
  }
}

let headExists = true;
try {
  runGit('rev-parse', '--verify', 'HEAD');
} catch {
  headExists = false;
}

if (!headExists) {
  console.log(`PUBLIC_TREE_CHECK_OK paths=${actualPaths.length}`);
  console.log('PUBLIC_HISTORY_CHECK_SKIPPED no commits');
  process.exit(0);
}

const roots = runGit('rev-list', '--max-parents=0', '--all').split('\n').filter(Boolean);
if (roots.length !== 1) throw new Error(`Expected one parentless public root; found ${roots.length}.`);

const emails = runGit('log', '--all', '--format=%ae%n%ce').split('\n').filter(Boolean);
if (emails.some((email) => !email.endsWith('@users.noreply.github.com'))) {
  throw new Error('Every public commit must use a GitHub noreply author and committer email.');
}

const objectLines = runGit('rev-list', '--objects', '--all').split('\n').filter(Boolean);
let blobCount = 0;
for (const line of objectLines) {
  const [sha, ...pathParts] = line.split(' ');
  const path = pathParts.join(' ') || sha;
  if (runGit('cat-file', '-t', sha) !== 'blob') continue;
  const buffer = execFileSync('git', ['cat-file', 'blob', sha]);
  scanContent(path, buffer, 'Reachable history');
  blobCount += 1;
}

console.log(`PUBLIC_TREE_CHECK_OK paths=${actualPaths.length}`);
console.log(`PUBLIC_HISTORY_CHECK_OK blobs=${blobCount} roots=${roots.length}`);
