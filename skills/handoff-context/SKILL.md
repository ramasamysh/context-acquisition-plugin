---
name: handoff-context
description: Explicitly validate and hand off an existing Context Pack to planning, coding, or review without rediscovering the repository.
argument-hint: "--id <task-id> --for plan|code|review [--plan <relative-path>]"
disable-model-invocation: true
---

# Context Pack handoff

Input: $ARGUMENTS

1. Locate `.scratch/context/<id>/context-pack.json` in the current Git repository. Do not create or replace a pack.
2. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/cal.mjs" validate --pack <pack> --strict`. If validation fails, DO NOT proceed. Explain what changed and retrieve only the missing/stale evidence via the acquisition skill.
3. For planning, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/cal.mjs" handoff --pack <pack> --for plan --write`.
4. For coding, require an actual approved or user-accepted implementation plan in the repository, ideally `.scratch/context/<id>/implementation-plan.md`; pass it using `--for code --plan <plan-path> --write`. No coding handoff without a plan.
5. For review, use `--for review --write`.
6. Return the generated Markdown path and recommend reopening critical source files before decisions or edits. Never claim that a codebase has been verified just because hashes match.
