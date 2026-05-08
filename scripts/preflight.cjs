#!/usr/bin/env node
/* eslint-disable */
/**
 * Preflight: make sure the local environment is ready for the requested
 * runtime, and self-heal anything that's missing or out of sync.
 *
 * Usage:
 *   node scripts/preflight.cjs node       — the local dev/test server
 *   node scripts/preflight.cjs electron   — the desktop app
 *
 * Why this exists:
 *   1. better-sqlite3 is a native module compiled against ONE Node ABI at a
 *      time. Switching between web dev (system Node) and Electron (its own
 *      embedded Node ABI) used to require manual rebuilds.
 *   2. The Electron binary itself can be missing if its postinstall got
 *      interrupted, leaving `node_modules/electron/dist/` half-populated.
 *
 *   We detect both situations and fix them quietly. The script is a no-op
 *   on a healthy install.
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BSQ_NATIVE = path.join(
  ROOT,
  'node_modules',
  'better-sqlite3',
  'build',
  'Release',
  'better_sqlite3.node'
);

function log(msg) {
  process.stderr.write(`[preflight] ${msg}\n`);
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd: ROOT,
    shell: process.platform === 'win32', // npm/npx are .cmd on Windows
    ...opts,
  });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} exited with ${r.status}`);
  }
}

// =============================================================================
// 1. better-sqlite3 ABI check
// =============================================================================

function nativeFileExists() {
  return fs.existsSync(BSQ_NATIVE);
}

/**
 * Try to load better-sqlite3 in the *current* Node process. If we're checking
 * for the 'node' target this directly answers the question. For 'electron',
 * we instead read the .node header and compare its ABI tag against Electron's
 * NODE_MODULE_VERSION.
 */
function tryLoadNative() {
  try {
    require(BSQ_NATIVE);
    return { ok: true };
  } catch (err) {
    return { ok: false, err };
  }
}

/**
 * Get the Electron binary's NODE_MODULE_VERSION by asking it directly. This
 * is the only reliable way: each Electron version pins a specific Node.js,
 * which has its own ABI.
 */
function getElectronAbi() {
  const electronCli = require.resolve('electron');
  const electronExe = require(electronCli);
  if (!fs.existsSync(electronExe)) {
    return null;
  }
  try {
    // ELECTRON_RUN_AS_NODE makes Electron behave like plain Node — no
    // browser flags allowed, just `-e` to evaluate code. We print the
    // NODE_MODULE_VERSION (ABI) and read it back.
    const r = spawnSync(
      electronExe,
      ['-e', 'process.stdout.write(process.versions.modules)'],
      {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        encoding: 'utf8',
        timeout: 10000,
      }
    );
    if (r.status !== 0) return null;
    return parseInt(r.stdout.trim(), 10) || null;
  } catch {
    return null;
  }
}

/**
 * Read the NODE_MODULE_VERSION embedded in a compiled .node binary. Each
 * native addon has the version tagged in a known section. We use a cheap
 * heuristic: load the file and check its rejection error against the current
 * Node.js's ABI. If it loads cleanly here, ABI matches the current Node.
 */
function nativeAbiMatchesCurrentNode() {
  const r = tryLoadNative();
  return r.ok;
}

/**
 * Prefer prebuilt binaries (downloaded from GitHub releases) over source
 * builds. better-sqlite3 ships them via `prebuild-install` and they cover
 * every stable Node and Electron ABI we care about. Falls back to a source
 * build only if prebuild-install can't find a match.
 */
/**
 * Forcibly remove the existing native binary. On Windows, Defender or a
 * still-loading process can briefly hold the file with EBUSY. We retry a
 * handful of times before giving up.
 */
function removeNative() {
  if (!nativeFileExists()) return true;
  // Strategy 1: native fs.unlink. Works in the easy case.
  for (let i = 0; i < 5; i++) {
    try {
      fs.unlinkSync(BSQ_NATIVE);
      return true;
    } catch (err) {
      if (err.code !== 'EBUSY' && err.code !== 'EPERM') throw err;
      const until = Date.now() + 200;
      while (Date.now() < until) {
        /* spin */
      }
    }
  }
  // Strategy 2: rename it aside. Even if Defender/AV holds a handle on the
  // current name, Windows usually lets us rename. The renamed file can be
  // unlinked later (by a future preflight) or just garbage-collected next
  // time the user runs `npm install`.
  try {
    const sidecar = `${BSQ_NATIVE}.stale-${Date.now()}`;
    fs.renameSync(BSQ_NATIVE, sidecar);
    return true;
  } catch (err) {
    /* fall through */
  }
  // Strategy 3: shell out. POSIX `rm -f` (Git Bash MSYS) can sometimes
  // succeed via a different code path than Node's Windows fs.
  const shellCmd =
    process.platform === 'win32'
      ? { cmd: 'cmd', args: ['/c', 'del', '/f', '/q', BSQ_NATIVE] }
      : { cmd: 'rm', args: ['-f', BSQ_NATIVE] };
  const r = spawnSync(shellCmd.cmd, shellCmd.args, { stdio: 'ignore' });
  if (r.status === 0 && !nativeFileExists()) return true;

  log(
    'Could not remove the existing better_sqlite3.node — another process may have it open. ' +
      'Close any running electron/dev/test processes and retry, or run `npm install` to reset.'
  );
  return false;
}

function fetchPrebuilt({ runtime, target } = {}) {
  // Prebuild-install will refuse to overwrite a busy file; clear the way first.
  if (!removeNative()) return false;

  const args = [];
  if (runtime) args.push('--runtime', runtime);
  if (target) args.push('--target', target);
  args.push('-f');
  // Invoke prebuild-install directly so we don't depend on PATH or npx shims.
  const cwd = path.join(ROOT, 'node_modules', 'better-sqlite3');
  const cli = path.join(ROOT, 'node_modules', 'prebuild-install', 'bin.js');
  if (!fs.existsSync(cli)) return false;
  const result = spawnSync(process.execPath, [cli, ...args], {
    stdio: 'inherit',
    cwd,
  });
  return result.status === 0 && nativeFileExists();
}

function buildFromSource({ runtime, target } = {}) {
  // electron-rebuild knows how to call node-gyp with the right include path.
  // For Node target we just call npm rebuild.
  if (runtime === 'electron') {
    run('npx', ['electron-rebuild', '-f', '-w', 'better-sqlite3']);
  } else {
    run('npm', ['rebuild', 'better-sqlite3']);
  }
}

function ensureSqliteForNode() {
  if (nativeFileExists() && nativeAbiMatchesCurrentNode()) {
    writeStamp({
      target: 'node',
      mtime: nativeMtime(),
      abi: parseInt(process.versions.modules, 10),
    });
    return;
  }
  log('Fetching better-sqlite3 prebuilt for current Node...');
  if (!fetchPrebuilt()) {
    log('Prebuilt not available — building from source...');
    buildFromSource();
  }
  writeStamp({
    target: 'node',
    mtime: nativeMtime(),
    abi: parseInt(process.versions.modules, 10),
  });
}

/**
 * Cache the last "we built for ABI X" value so subsequent runs are no-ops
 * when the on-disk binary is already correct.
 */
const STAMP_FILE = path.join(ROOT, 'node_modules', '.fam-sqlite-abi.json');

function readStamp() {
  try {
    return JSON.parse(fs.readFileSync(STAMP_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeStamp(data) {
  try {
    fs.writeFileSync(STAMP_FILE, JSON.stringify(data));
  } catch {
    /* best-effort */
  }
}

function nativeMtime() {
  try {
    return fs.statSync(BSQ_NATIVE).mtimeMs;
  } catch {
    return null;
  }
}

function getElectronVersion() {
  try {
    return require(path.join(ROOT, 'node_modules', 'electron', 'package.json')).version;
  } catch {
    return null;
  }
}

function ensureSqliteForElectron() {
  const electronAbi = getElectronAbi();
  const electronVersion = getElectronVersion();

  // Stamp fast-path: last build was for the same Electron ABI and the .node
  // file hasn't changed since.
  const stamp = readStamp();
  if (
    stamp &&
    stamp.target === 'electron' &&
    electronAbi &&
    stamp.abi === electronAbi &&
    nativeFileExists() &&
    stamp.mtime === nativeMtime()
  ) {
    return;
  }

  // Optimistic: when Electron and current Node share an ABI, the existing
  // Node-built binary works as-is.
  if (
    electronAbi &&
    nativeAbiMatchesCurrentNode() &&
    parseInt(process.versions.modules, 10) === electronAbi
  ) {
    writeStamp({ target: 'electron', mtime: nativeMtime(), abi: electronAbi });
    return;
  }

  // Try to download a prebuilt for this Electron version. This needs no
  // C++ toolchain on the user's machine.
  if (electronVersion) {
    log(`Fetching better-sqlite3 prebuilt for Electron ${electronVersion}...`);
    if (fetchPrebuilt({ runtime: 'electron', target: electronVersion })) {
      writeStamp({ target: 'electron', mtime: nativeMtime(), abi: electronAbi });
      return;
    }
  }

  // Last resort: source build (requires VS Build Tools on Windows).
  log('Prebuilt not available — building from source (this needs VS C++ tools on Windows)...');
  buildFromSource({ runtime: 'electron' });
  writeStamp({ target: 'electron', mtime: nativeMtime(), abi: electronAbi });
}

// =============================================================================
// 2. Electron binary check
// =============================================================================

function ensureElectronBinary() {
  let electronExe;
  try {
    electronExe = require('electron');
  } catch {
    log('electron package not installed — run `npm install`.');
    process.exit(1);
  }
  if (typeof electronExe !== 'string' || !fs.existsSync(electronExe)) {
    log('Electron binary missing — running install.js...');
    const installScript = path.join(ROOT, 'node_modules', 'electron', 'install.js');
    if (!fs.existsSync(installScript)) {
      log('node_modules/electron/install.js not found — run `npm install`.');
      process.exit(1);
    }
    run('node', [installScript]);
  }
}

// =============================================================================
// Main
// =============================================================================

const target = process.argv[2];
if (target !== 'node' && target !== 'electron') {
  log('Usage: preflight.cjs [node|electron]');
  process.exit(2);
}

try {
  if (target === 'node') {
    ensureSqliteForNode();
  } else {
    ensureElectronBinary();
    ensureSqliteForElectron();
  }
} catch (err) {
  log(`failed: ${err.message}`);
  process.exit(1);
}
