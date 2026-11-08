#!/usr/bin/env node
// Compatibility wrapper. Use --strict to enforce evidence sufficiency and freshness.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const [file,...flags]=process.argv.slice(2);
if (!file) { console.error('Usage: node validate-pack.mjs path/to/context-pack.json [--strict]'); process.exit(2); }
const result=spawnSync(process.execPath,[fileURLToPath(new URL('./cal.mjs', import.meta.url)),'validate','--pack',file,...flags],{stdio:'inherit'});
process.exit(result.status ?? 1);
