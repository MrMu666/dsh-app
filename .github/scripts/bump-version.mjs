/**
 * 每次推送自动递增小版本号（patch + 1），供 .github/workflows/build-android.yml 使用。
 *
 * 版本唯一来源是 package.json；src-tauri/tauri.conf.json 的 version 指向它
 *（Tauri 官方支持 version 写成 package.json 的相对路径），因此只需改一处。
 * Android 的 versionCode 由 Tauri 依据该版本号推导：
 *   versionCode = major * 1000000 + minor * 1000 + patch
 * 所以 patch 递增会同时抬高 versionCode，新包可直接覆盖安装。
 *
 * 打印新版本号（workflow 用它做 tag 与产物命名）。
 * 用法：node .github/scripts/bump-version.mjs
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TAURI_CONF = 'src-tauri/tauri.conf.json';
/** tauri.conf.json 里的 version 指向 package.json（相对 conf 文件所在目录）。 */
const TAURI_CONF_VERSION = '../package.json';

function readText(rel) {
  return readFileSync(resolve(root, rel), 'utf8');
}

/** 按原文件的行尾风格与缩进写回，避免整个文件出现无意义的换行符 diff。 */
function writeJson(rel, obj, original) {
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  const next = JSON.stringify(obj, null, 2).replace(/\n/g, eol) + eol;
  if (next === original) return false; // 内容未变则不动文件
  writeFileSync(resolve(root, rel), next, 'utf8');
  return true;
}

// 1) package.json 递增 patch
const pkgRaw = readText('package.json');
const pkg = JSON.parse(pkgRaw);
const parts = String(pkg.version).split('.').map((n) => parseInt(n, 10));
if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) {
  console.error(`无法解析 package.json 的版本号: ${pkg.version}`);
  process.exit(1);
}
const [major, minor, patch] = parts;
const next = `${major}.${minor}.${patch + 1}`;
pkg.version = next;
writeJson('package.json', pkg, pkgRaw);

// 2) tauri.conf.json 的 version 指向 package.json（首次运行时改写，之后保持）
if (existsSync(resolve(root, TAURI_CONF))) {
  const confRaw = readText(TAURI_CONF);
  const conf = JSON.parse(confRaw);
  conf.version = TAURI_CONF_VERSION;
  writeJson(TAURI_CONF, conf, confRaw);
}

// 3) package-lock.json 里记录着根包版本，一并同步（保持仓库状态干净）
if (existsSync(resolve(root, 'package-lock.json'))) {
  const lockRaw = readText('package-lock.json');
  const lock = JSON.parse(lockRaw);
  lock.version = next;
  if (lock.packages && lock.packages['']) lock.packages[''].version = next;
  writeJson('package-lock.json', lock, lockRaw);
}

console.log(next);
