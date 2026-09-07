#!/usr/bin/env node
/**
 * Bundles each attributes/FIS15_*.yaml into bundled/, inlining the external
 * example payloads that examples[].value $refs.
 *
 * Why this exists: a $ref inside examples[].value is not an OpenAPI Reference
 * Object -- `value` is free-form data, so a conformant reader treats {"$ref": ...}
 * as literal content rather than a pointer. swagger-cli resolves it anyway
 * (generic JSON Reference resolution); Swagger Editor and Redocly do not, which
 * is why the examples look empty there. Bundling resolves them ahead of time so
 * every tool sees real payloads.
 *
 * Internal '#/components/schemas/...' refs are deliberately NOT dereferenced --
 * Swagger Editor resolves those itself, and inlining them would duplicate every
 * schema at each use site.
 */
import { readdirSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'attributes');
const outDir = join(root, 'bundled');
const validateOnly = process.argv.includes('--validate-only');

const bin = join(root, 'node_modules', '.bin', 'swagger-cli');
if (!existsSync(bin)) {
  console.error('swagger-cli not found. Run `npm install` first.');
  process.exit(1);
}

if (!validateOnly) mkdirSync(outDir, { recursive: true });

const specs = readdirSync(srcDir).filter((f) => f.endsWith('.yaml')).sort();
let failed = 0;

for (const spec of specs) {
  const src = join(srcDir, spec);

  if (validateOnly) {
    try {
      execFileSync(bin, ['validate', src], { stdio: 'pipe' });
      console.log(`  valid    ${spec}`);
    } catch (err) {
      failed++;
      console.error(`  INVALID  ${spec}`);
      console.error(
        String(err.stderr || err.stdout || err.message)
          .trim()
          .split('\n')
          .slice(0, 8)
          .map((l) => `             ${l.trim()}`)
          .join('\n')
      );
    }
    continue;
  }

  // Bundling is independent of validation on purpose. These documents use
  // const / if-then-else / contains, which are JSON Schema keywords OpenAPI 3.0
  // does not admit (they are legal in 3.1), so `swagger-cli validate` rejects
  // several of them. That does not affect $ref resolution, and the bundles
  // render correctly in Swagger Editor either way. Run `npm run validate` to
  // see the list.
  try {
    const out = join(outDir, spec);
    execFileSync(bin, ['bundle', src, '-o', out, '-t', 'yaml'], { stdio: 'pipe' });
    console.log(`  bundled  ${spec}  ->  bundled/${basename(out)}`);
  } catch (err) {
    failed++;
    console.error(`  FAILED   ${spec}`);
    console.error(String(err.stderr || err.stdout || err.message).trim().split('\n').slice(0, 6).join('\n'));
  }
}

if (validateOnly) {
  console.log(
    failed
      ? `\n${specs.length - failed}/${specs.length} valid, ${failed} rejected by the OpenAPI 3.0 metaschema.`
      : `\n${specs.length}/${specs.length} valid.`
  );
} else {
  console.log(
    failed
      ? `\n${specs.length - failed}/${specs.length} bundled, ${failed} failed.`
      : `\n${specs.length}/${specs.length} bundled. Open a file from bundled/ in Swagger Editor.`
  );
}
process.exit(failed ? 1 : 0);
