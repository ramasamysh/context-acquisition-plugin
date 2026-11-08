#!/usr/bin/env node
// Compatibility wrapper: v0.2 now includes deleted and renamed paths.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const result=spawnSync(process.execPath,[fileURLToPath(new URL('./cal.mjs', import.meta.url)),'scope',...process.argv.slice(2)],{stdio:'inherit'});
process.exit(result.status ?? 1);
