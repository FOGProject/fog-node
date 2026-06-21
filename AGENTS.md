# AGENTS.md

Agent / skill configuration for the **fog-node** repo.

## Agent skills

### Issue tracker

Issues are tracked as **GitHub issues** on `fogproject/fog-node` via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default triage vocabulary — `needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix` (`wontfix` already exists; the rest are created on first triage). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context. ADRs in `docs/adr/`; no `CONTEXT.md` yet, so domain knowledge currently lives in `docs/roadmap.md` / `docs/ecosystem.md`. See `docs/agents/domain.md`.
