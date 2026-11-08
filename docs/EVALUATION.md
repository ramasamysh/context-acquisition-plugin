# CAL Evaluation Playbook

## Objective

Measure whether CAL improves *end-to-end engineering outcomes* compared with Claude Code's existing repository exploration. A passing source fingerprint is not evidence of coding quality.

## Experimental design

Use 5–10 initial tasks, ideally expanding to 15–20. Choose representative cases: localized edit, Java interface change, cross-module caller impact, Spring configuration, domain invariant, and production bug reproduction. Record the target revision (Git SHA), allowed tools, model, exact prompt, baseline, test harness, and expected critical dependencies.

**Control:** Native Claude Code, no CAL plugin.
**Treatment:** Same model/task and tool permissions plus CAL plugin and skills.
**Optional third arm:** Deterministic relationship resolver added to CAL when developed.

Keep coding and evaluation independent; avoid letting the reviewer learn ground-truth labels from the acquisition output.

## Scorecard template

| Case ID | Profile | Critical sources required | Critical sources retrieved | False edges | Correct tests passed | Tokens control / CAL | Time control / CAL | Notes |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| Java-01 | build | | | | | | | |
| Spring-02 | review | | | | | | | |
| Invariant-03 | debug | | | | | | | |

Quantities:
- **Recall** = confirmed critical sources found / known critical sources for the case.
- **False edge rate** = source-unsubstantiated relationships / all claimed relationships.
- **Task success** = independently confirmed acceptance criteria and correct tests.
- **Cost and latency** = total for *every* subagent and main-model call, including pack construction and handoff.

## Release gates

MVP acceptance targets, not achieved claims:
- Zero stale evidence citations allowed through `validate --strict` in our local regression suite.
- No coding handoff without an existing plan.
- Better critical dependency recall or reduced duplicate exploration on representative nontrivial cases.
- No material reduction in correctness or significant unexplained cost increase.

Investigate failure modes: false call edges from lexical search; deleted file blind spots; packed evidence stale after branch switch; instructions embedded in source; and excessive collection of unrelated context.
