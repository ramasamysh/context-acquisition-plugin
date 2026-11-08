import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../scripts/cal.mjs', import.meta.url));
function run(repo, ...args) {
  const res = spawnSync(process.execPath,[CLI,...args],{cwd:repo,encoding:'utf8',timeout:20000});
  return { code:res.status, stdout:res.stdout, stderr:res.stderr, json: (()=>{try{return JSON.parse(res.stdout);}catch{return null;}})() };
}
function git(repo, ...args) {
  const r = spawnSync('git',args,{cwd:repo,encoding:'utf8'});
  if (r.status!==0) throw new Error(r.stderr);
  return r.stdout.trim();
}
function setup(t) {
  const repo=fs.mkdtempSync(path.join(os.tmpdir(),'cal-test-'));
  t.after(()=>fs.rmSync(repo,{recursive:true,force:true}));
  git(repo,'init','-q'); git(repo,'config','user.email','test@example.com'); git(repo,'config','user.name','Tester');
  fs.mkdirSync(path.join(repo,'src'),{recursive:true});
  fs.writeFileSync(path.join(repo,'src','RateService.java'), ['public class RateService {','  private RateValidator validator;','  public int compute(int rate) {','    return validator.check(rate);','  }','}'].join('\n')+'\n');
  fs.writeFileSync(path.join(repo,'src','RateValidator.java'), ['public class RateValidator {','  public int check(int rate) {','    return rate;','  }','}'].join('\n')+'\n');
  fs.writeFileSync(path.join(repo,'src','Unused.java'),'class Unused {}\n');
  fs.writeFileSync(path.join(repo,'.env'),'SECRET_TOKEN=DO_NOT_READ\n');
  git(repo,'add','src'); git(repo,'commit','-q','-m','fixture');
  return repo;
}
const id='rate-guard', pack='.scratch/context/rate-guard/context-pack.json';
function prepareValid(t) {
  const repo=setup(t);
  assert.equal(run(repo,'init','--id',id,'--task','Review existing rate validation behavior','--profile','build').code,0);
  assert.equal(run(repo,'evidence','--pack',pack,'--file','src/RateService.java','--start','1','--end','5','--role','definition','--claim','RateService calls validator.check on the provided rate','--why','Main validation path').code,0);
  assert.equal(run(repo,'summary','--pack',pack,'--text','RateService delegates the provided rate to RateValidator for checking.').code,0);
  return repo;
}
test('scope includes deleted and untracked; excludes context scratch artifacts',t=>{
  const repo=setup(t);
  git(repo,'rm','-q','src/Unused.java');
  fs.writeFileSync(path.join(repo,'src','Extra.java'),'class Extra {}\n');
  let result=run(repo,'scope');
  assert.equal(result.code,0,result.stderr);
  assert(result.json.changedFiles.some(f=>f.path==='src/Unused.java' && f.status==='D'));
  assert(result.json.changedFiles.some(f=>f.path==='src/Extra.java' && f.source==='untracked' || f.sources?.includes('untracked')));
  assert.equal(run(repo,'init','--id',id,'--task','Investigate rate validation dependencies','--profile','review').code,0);
  result=run(repo,'scope');
  assert.equal(result.json.changedFiles.some(f=>f.path.includes('context-pack')),false);
});
test('strict validation rejects an empty pack and accepts verified evidence',t=>{
  const repo=setup(t);
  const init=run(repo,'init','--id',id,'--task','Review existing rate validation behavior','--profile','build');
  assert.equal(init.code,0,init.stderr);
  const before=run(repo,'validate','--pack',pack,'--strict');
  assert.equal(before.code,1);
  assert(before.json.errors.some(x=>x.includes('evidence pack is empty')));
  const ev=run(repo,'evidence','--pack',pack,'--file','src/RateService.java','--start','1','--end','5','--role','definition','--claim','RateService calls validator.check on the rate','--why','Main validation path');
  assert.equal(ev.code,0,ev.stderr);
  assert.equal(ev.json.added,'E1');
  assert.equal(run(repo,'summary','--pack',pack,'--text','The RateService delegates validation to its RateValidator field.').code,0);
  const valid=run(repo,'validate','--pack',pack,'--strict');
  assert.equal(valid.code,0,JSON.stringify(valid.json));
  assert.equal(valid.json.readyForHandoff,true);
});
test('plan and code handoffs require ready evidence and a plan file for code',t=>{
  const repo=prepareValid(t);
  const plan=run(repo,'handoff','--pack',pack,'--for','plan','--write');
  assert.equal(plan.code,0,plan.stderr);
  assert(fs.existsSync(path.join(repo,'.scratch/context/rate-guard/plan-context.md')));
  assert.match(fs.readFileSync(path.join(repo,'.scratch/context/rate-guard/plan-context.md'),'utf8'),/\[E1\]/);
  assert.equal(run(repo,'handoff','--pack',pack,'--for','code').code,1);
  const planPath='.scratch/context/rate-guard/implementation-plan.md';
  fs.writeFileSync(path.join(repo,planPath),'# Approved plan\nChange validation boundary.\n');
  const code=run(repo,'handoff','--pack',pack,'--for','code','--plan',planPath,'--write');
  assert.equal(code.code,0,code.stderr);
  assert(fs.existsSync(path.join(repo,'.scratch/context/rate-guard/code-context.md')));
});
test('modified source invalidates evidence fingerprint',t=>{
  const repo=prepareValid(t);
  fs.appendFileSync(path.join(repo,'src','RateService.java'),'// updated after evidence capture\n');
  // Source lines 1–5 still match, but working-tree fingerprint changes.
  const strict=run(repo,'validate','--pack',pack,'--strict');
  assert.equal(strict.code,1);
  assert(strict.json.errors.some(x=>x.includes('scope changed')));
  fs.writeFileSync(path.join(repo,'src','RateService.java'),fs.readFileSync(path.join(repo,'src','RateService.java'),'utf8').replace('return validator.check(rate)','return rate'));
  const stale=run(repo,'validate','--pack',pack,'--strict');
  assert.equal(stale.code,1);
  assert(stale.json.errors.some(x=>x.includes('stale fingerprint')));
});
test('blocking unknowns prevent strict handoff until resolved',t=>{
  const repo=prepareValid(t);
  const question='What fallback is approved for stale rates?';
  assert.equal(run(repo,'unknown','--pack',pack,'--severity','blocker','--text',question).code,0);
  assert.equal(run(repo,'validate','--pack',pack,'--strict').code,1);
  assert.equal(run(repo,'resolve','--pack',pack,'--text',question).code,0);
  assert.equal(run(repo,'validate','--pack',pack,'--strict').code,0);
});
test('lexical discovery returns references but does not claim call edges',t=>{
  const repo=setup(t);
  const res=run(repo,'discover','--file','src/RateValidator.java','--max','10');
  assert.equal(res.code,0,res.stderr);
  assert(res.json.candidates.some(c=>c.path==='src/RateService.java'));
  assert(res.json.candidates.every(c=>c.classification==='lexical-candidate-only'));
});
test('rejects path traversal and sensitive source evidence',t=>{
  const repo=prepareValid(t);
  const base=['evidence','--pack',pack,'--start','1','--end','1','--role','other','--claim','This is a claim that is long enough','--why','Test scope'];
  assert.equal(run(repo,...base,'--file','../outside.java').code,1);
  assert.equal(run(repo,...base,'--file','.env').code,1);
  assert.equal(run(repo,...base,'--file','src/../.env').code,1);
});
test('relationship needs valid evidence IDs and real endpoints',t=>{
  const repo=prepareValid(t);
  assert.equal(run(repo,'relation','--pack',pack,'--from','src/RateService.java','--to','src/RateValidator.java','--kind','calls','--evidence','E9').code,1);
  assert.equal(run(repo,'relation','--pack',pack,'--from','src/RateService.java','--to','src/RateValidator.java','--kind','calls','--evidence','E1').code,0);
  assert.equal(run(repo,'validate','--pack',pack,'--strict').code,0);
});
test('init refuses to clobber existing context',t=>{
  const repo=prepareValid(t);
  assert.equal(run(repo,'init','--id',id,'--task','Review existing rate validation behavior','--profile','build').code,1);
});
test('new commits make a previously valid context pack stale',t=>{
  const repo=prepareValid(t);
  fs.writeFileSync(path.join(repo,'src','NewService.java'),'class NewService {}\n');
  git(repo,'add','src/NewService.java'); git(repo,'commit','-q','-m','additional change');
  const result=run(repo,'validate','--pack',pack,'--strict');
  assert.equal(result.code,1);
  assert(result.json.errors.some(x=>x.includes('HEAD changed')));
});
test('symbolic links and outside plan paths are refused',t=>{
  const repo=prepareValid(t);
  fs.symlinkSync(path.join(repo,'src','RateService.java'),path.join(repo,'src','Linked.java'));
  const base=['evidence','--pack',pack,'--start','1','--end','1','--role','other','--claim','Some recorded source evidence claim','--why','Security test'];
  assert.equal(run(repo,...base,'--file','src/Linked.java').code,1);
  assert.equal(run(repo,'handoff','--pack',pack,'--for','code','--plan','/etc/passwd').code,1);
});
