#!/usr/bin/env node
// Compatibility helper using the same safe source fingerprint rules as cal.mjs evidence.
import { repositoryRoot, fingerprintEvidence } from '../lib/cal-core.mjs';
const [relativePath,start,end] = process.argv.slice(2);
try {
  if (!relativePath || !/^[1-9]\d*$/.test(start ?? '') || !/^[1-9]\d*$/.test(end ?? '')) throw new Error('Usage: node linehash.mjs <relative-path> <start-line> <end-line>');
  console.log(fingerprintEvidence(repositoryRoot(),relativePath,Number(start),Number(end)));
} catch (err) { console.error(`CAL ERROR: ${err.message}`); process.exit(1); }
