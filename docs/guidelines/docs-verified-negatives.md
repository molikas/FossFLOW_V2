# Docs sweep — verified negatives

> **Status:** Living register · **Owner:** whoever runs [`/docs-sweep`](../../.claude/commands/docs-sweep.md) · **Audience:** the `consolidate` and `gate` modes, before they file anything.

Claims about this docs corpus that have already been raised and shown to be **false**. Read it before filing: a claim listed here is settled, and re-raising it costs a sweep the same refutation twice. It is the sweep's memory across sessions, which is why it lives here and not in the command body — that body loads on every invocation, and this list only grows.

**Format** — one line per claim: *the claim → why it is false → the evidence that shows it.* No date: the reason is the durable part, not when it was learned. Append when a sweep refutes a finding for a reason that will recur; a one-off refutation that turns on this month's tree does not belong here.

## Entries

- The four 2026-07-15 status flips (0022/0023/0025/0028) were **RIGHT**.
- Supersession graph is a clean DAG.
- **ADR 0020 does NOT contradict its retention policy** — `decision-log.md` + `baseline.md` are DURABLE and present; `perf-results/raw/` is gitignored exactly as specified. The deletions **were the policy working.**
- **0004↔0032 is not a missing edge** — ADR 0032 explicitly records the claim it amends 0004 *"is false."*
- **ADR 0029 is clean** · **ADR 0007 is genuinely Accepted** · **ADR 0043's `BUILD_TIME_API_KEY`** is a build-time-only Picker fallback, `null` on Cloudflare.
- **0036↔0037/0042 is the corpus's best-formed supersession** — copy its shape. (An earlier brief said "0035/0036": wrong, **0035 has no supersession edges at all.**)
