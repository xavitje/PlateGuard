// CI check for translations:
//  - every locale folder is listed in src/config.ts and the other way round,
//  - every key in en/ exists in every other locale, and no locale has extra keys,
//  - every message is valid ICU, with the same variables as the English message,
//  - every key used in the apps exists, and every key in en/ is used somewhere.
//
// Keys are used in full in code, for example t('tables:seat.allergyCount', { count }).
// A template literal such as t(`common:severity.${s}`) marks every key under that prefix as used.
import { parse, TYPE } from '@formatjs/icu-messageformat-parser';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(pkgRoot, '..', '..');
const localesDir = join(pkgRoot, 'locales');
const errors = [];

function flatten(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) =>
    v !== null && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]],
  );
}

function load(locale) {
  const out = new Map();
  for (const file of readdirSync(join(localesDir, locale)).filter((f) => f.endsWith('.json'))) {
    const ns = file.slice(0, -5);
    const json = JSON.parse(readFileSync(join(localesDir, locale, file), 'utf8'));
    for (const [key, value] of flatten(json)) out.set(`${ns}:${key}`, value);
  }
  return out;
}

function variables(message, key, locale) {
  const names = new Set();
  const walk = (elements) => {
    for (const el of elements) {
      if (
        el.type === TYPE.argument ||
        el.type === TYPE.number ||
        el.type === TYPE.date ||
        el.type === TYPE.time
      ) {
        names.add(el.value);
      }
      if (el.type === TYPE.plural || el.type === TYPE.select) {
        names.add(el.value);
        Object.values(el.options).forEach((o) => walk(o.value));
      }
      if (el.type === TYPE.tag) walk(el.children);
    }
  };
  try {
    walk(parse(String(message)));
  } catch (err) {
    errors.push(`${locale} ${key}: invalid ICU message (${err.message})`);
  }
  return [...names].sort().join(',');
}

// 1. Locale folders and config agree.
const configSource = readFileSync(join(pkgRoot, 'src', 'config.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');
const configured = [...configSource.matchAll(/code:\s*'([a-z]{2}(?:-[A-Z]{2})?)'/g)]
  .map((m) => m[1])
  .sort();
const folders = readdirSync(localesDir)
  .filter((d) => statSync(join(localesDir, d)).isDirectory())
  .sort();
for (const l of configured)
  if (!folders.includes(l)) errors.push(`locale ${l} is configured but locales/${l}/ is missing`);
for (const l of folders)
  if (!configured.includes(l)) errors.push(`locales/${l}/ exists but ${l} is not in src/config.ts`);

// 2 and 3. Same keys, valid ICU, same variables.
const source = load('en');
for (const locale of folders.filter((l) => l !== 'en')) {
  const target = load(locale);
  for (const [key, message] of source) {
    if (!target.has(key)) {
      errors.push(`${locale}: missing ${key}`);
      continue;
    }
    const want = variables(message, key, 'en');
    const got = variables(target.get(key), key, locale);
    if (want !== got)
      errors.push(`${locale} ${key}: variables {${got}} differ from English {${want}}`);
  }
  for (const key of target.keys())
    if (!source.has(key)) errors.push(`${locale}: extra key ${key} (not in en)`);
}
for (const [key, message] of source) variables(message, key, 'en');

// 4. Used keys exist; existing keys are used.
function sourceFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (name === 'node_modules' || name === 'dist') return [];
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}
const appDirs = readdirSync(join(repoRoot, 'apps')).map((a) => join(repoRoot, 'apps', a, 'src'));
const files = appDirs.flatMap(sourceFiles);
const namespaces = new Set([...source.keys()].map((k) => k.split(':')[0]));
const used = new Set();
const usedPrefixes = new Set();
const literal = /(['"`])([a-z]+):([A-Za-z0-9_.]+)(\$\{)?/g;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(literal)) {
    const [, , ns, key, dynamic] = m;
    if (!namespaces.has(ns)) continue;
    if (dynamic) {
      usedPrefixes.add(`${ns}:${key}`);
    } else {
      used.add(`${ns}:${key}`);
      if (!source.has(`${ns}:${key}`))
        errors.push(`${relative(repoRoot, file)}: uses ${ns}:${key}, which is not in en/`);
    }
  }
}
for (const key of source.keys()) {
  const viaPrefix = [...usedPrefixes].some((p) => key.startsWith(p));
  if (!used.has(key) && !viaPrefix) errors.push(`unused key ${key}`);
}

if (errors.length > 0) {
  console.error(`i18n check failed with ${errors.length} problem(s):\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.log(
  `i18n check passed: ${source.size} keys, locales ${folders.join(', ')}, ${files.length} source files scanned.`,
);
