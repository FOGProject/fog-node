# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase. **fog-node is single-context** (one domain, no `CONTEXT-MAP.md`).

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, if it exists.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in (e.g. `0001-imaging-core-and-plugin-model.md`).

There is no `CONTEXT.md` yet. Until one exists, the de-facto domain docs are:

- **`docs/roadmap.md`** — current state + phased plan toward FOG 1.6 parity.
- **`docs/ecosystem.md`** — the FOGProject repo/plugin map.
- **`docs/plugins.md`** — the plugin contract; **`docs/imaging.md`** — imaging/FOS notes.

If `CONTEXT.md` doesn't exist, **proceed silently** — don't flag its absence or suggest creating it upfront. `/grill-with-docs` creates it lazily when domain terms or decisions actually get resolved.

## File structure (single-context)

```
/
├── CONTEXT.md            ← not present yet; created lazily by /grill-with-docs
├── docs/
│   ├── adr/0001-imaging-core-and-plugin-model.md
│   ├── roadmap.md
│   └── ecosystem.md
└── api/ assets/ config/ views/ …
```

## Use the glossary's vocabulary

When your output names a domain concept (an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md` (or, until it exists, the language used in `docs/roadmap.md` / `docs/adr/` — e.g. "Workflow", "Module/Snapin", "host fingerprint identity"). Don't drift to synonyms the docs explicitly avoid.

If the concept you need isn't documented yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0001 (imaging core + plugin model) — but worth reopening because…_
