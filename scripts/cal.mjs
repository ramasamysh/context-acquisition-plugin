#!/usr/bin/env node
/** CAL v0.2 CLI. Node >=20, dependency-free. Run from the target Git repository. */
import fs from 'node:fs';
import path from 'node:path';
import { repositoryRoot, scope, createPack, readPack, writePack, addEvidence, addRelationship, validate, handoff, discover, die } from '../lib/cal-core.mjs';

function parse(argv) {
  const opts = {};
  for (let i=0; i<argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) die(`Unexpected positional argument: ${token}`);
    const key = token.slice(2);
    if (['strict','write'].includes(key)) { if (opts[key]) die(`Duplicate --${key}`); opts[key]=true; continue; }
    if (!key || key.includes('=')) die(`Invalid flag: ${token}`);
    if (Object.hasOwn(opts,key)) die(`Duplicate flag --${key}`);
    const value = argv[++i];
    if (value === undefined || value.startsWith('--')) die(`Missing value for --${key}`);
    opts[key] = value;
  }
  return opts;
}
function required(opts,name) { if (!opts[name]) die(`Missing --${name}`); return opts[name]; }
function asInt(value, name) { if (!/^\d+$/.test(String(value ?? ''))) die(`--${name} must be a positive integer`); return Number(value); }
function usage() {
  console.log(`Context Acquisition Layer v0.2
Run from target git repository (Node >=20). Paths are relative to repository root.

  cal.mjs scope [--base origin/main]
  cal.mjs init --id task-slug --task "<task>" --profile build|review|debug|architecture [--base origin/main]
  cal.mjs discover --file src/Foo.java [--symbol Foo] [--max 25]
  cal.mjs evidence --pack .scratch/context/<id>/context-pack.json --file src/Foo.java --start 10 --end 20 --role definition --claim "<verified fact>" --why "<relevance>"
  cal.mjs relation --pack <pack> --from src/A.java --to src/B.java --kind calls --evidence E1,E2
  cal.mjs summary --pack <pack> --text "<source-backed summary>"
  cal.mjs unknown --pack <pack> --text "<question>" [--severity blocker|normal]
  cal.mjs resolve --pack <pack> --text "<exact previously recorded question>"
  cal.mjs retrieval --pack <pack> --query "<searched question>" [--stop-reason "<reason>"]
  cal.mjs validate --pack <pack> [--strict]
  cal.mjs handoff --pack <pack> --for plan|code|review [--plan <plan.md>] [--write]

The CLI does not automatically infer behavioral claims. Evidence facts are added only after inspection.`);
}
const [command, ...rawArgs] = process.argv.slice(2);
if (!command || ['--help','help','-h'].includes(command)) { usage(); process.exit(0); }
try {
  const opts = parse(rawArgs), root = repositoryRoot();
  const print = result => console.log(JSON.stringify(result, null, 2));
  if (command === 'scope') { print(scope(root, opts.base ?? null)); }
  else if (command === 'init') {
    const result = createPack(root, { id: required(opts,'id'), task: required(opts,'task'), profile: required(opts,'profile'), base: opts.base ?? null });
    print({ created: result.rel, state: 'draft', changedFiles: result.pack.changedFiles.length, next: 'Use context-scout to inspect code, then evidence + summary + validate --strict + handoff.' });
  }
  else if (command === 'discover') {
    const max = opts.max ? asInt(opts.max,'max') : 25;
    if (max < 1 || max > 100) die('--max must be 1..100');
    print(discover(root, required(opts,'file'), max, opts.symbol ?? null));
  }
  else if (['evidence','relation','summary','unknown','resolve','retrieval','validate','handoff'].includes(command)) {
    const rel = required(opts,'pack');
    const pack = readPack(root,rel);
    if (command === 'evidence') {
      const record = addEvidence(root,pack,{ file: required(opts,'file'), start: asInt(required(opts,'start'),'start'), end: asInt(required(opts,'end'),'end'), role: required(opts,'role'), claim: required(opts,'claim'), why: required(opts,'why') });
      writePack(root,rel,pack); print({ added: record.id, path: record.path, lines: `${record.startLine}-${record.endLine}`, pack:rel });
    }
    else if (command === 'relation') {
      const record = addRelationship(root,pack,{ from: required(opts,'from'), to: required(opts,'to'), kind: required(opts,'kind'), evidenceIds: required(opts,'evidence') });
      writePack(root,rel,pack); print({ addedRelationship: record });
    }
    else if (command === 'summary') {
      pack.summary = required(opts,'text').trim();
      if (pack.summary.length < 16 || pack.summary.length > 2400) die('Summary must be 16–2400 characters');
      pack.state='draft'; writePack(root,rel,pack); print({ summaryUpdated:true });
    }
    else if (command === 'unknown') {
      const text = required(opts,'text').trim(); if (text.length < 5) die('Unknown/question must be >=5 characters');
      const severity = opts.severity ?? 'normal'; if (!['normal','blocker'].includes(severity)) die('Severity must be normal or blocker');
      const list = severity === 'blocker' ? pack.blockers : pack.unknowns;
      if (!list.includes(text)) list.push(text);
      pack.state = 'draft'; writePack(root,rel,pack); print({ recorded: severity, text });
    }
    else if (command === 'resolve') {
      const text = required(opts,'text');
      const before = pack.blockers.length + pack.unknowns.length;
      pack.blockers = pack.blockers.filter(x=>x!==text);
      pack.unknowns = pack.unknowns.filter(x=>x!==text);
      if (pack.blockers.length + pack.unknowns.length === before) die('Exact question not found');
      pack.state='draft'; writePack(root,rel,pack); print({ resolved:text, warning:'Ensure the resolution is recorded as supported evidence or plan rationale.' });
    }
    else if (command === 'retrieval') {
      const query = required(opts,'query');
      if (pack.retrieval.queries.length >= 30) die('Maximum 30 retrieval queries');
      pack.retrieval.queries.push(query);
      if (opts['stop-reason']) pack.retrieval.stopReason=opts['stop-reason'];
      pack.state='draft'; writePack(root,rel,pack); print({ logged:true });
    }
    else if (command === 'validate') {
      const result = validate(root,pack,{ strict: Boolean(opts.strict) });
      if (result.readyForHandoff) pack.state='validated';
      else pack.state='draft';
      // Only update state when pack is structurally parseable; if malformed, report errors without modifying.
      if (result.valid) writePack(root,rel,pack);
      print(result);
      process.exit(result.valid ? 0 : 1);
    }
    else if (command === 'handoff') {
      const kind=required(opts,'for');
      const markdown=handoff(root,pack,{ kind, plan:opts.plan });
      if (!opts.write) console.log(markdown);
      else {
        // Only writes the computed handoff adjacent to its context pack.
        const target=path.join(path.dirname(path.join(root,rel)),`${kind}-context.md`);
        if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) die('Refusing to overwrite symlink handoff');
        fs.writeFileSync(target,markdown,{mode:0o600});
        print({ written:path.relative(root,target), for:kind });
      }
    }
  } else die(`Unknown command: ${command}`);
} catch (error) {
  console.error(`CAL ERROR: ${error.message}`);
  process.exit(1);
}
