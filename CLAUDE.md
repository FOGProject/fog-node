# fog-node — agent context

fog-node is "FOG 2.0": a from-scratch Sails.js (Node.js) rewrite of the FOG
Project server, backed by MongoDB, with Redis as the session store. It is not a
port of the PHP 1.x code. The goal is visual and functional parity with FOG
1.6, with imaging over the HTTP protocol in `docs/imaging.md` instead of NFS.

Read these first:

- `docs/roadmap.md`: where the rewrite stands, the phases, and the decisions.
- `docs/imaging.md`: the imaging design (HTTP stream, per-client authorization).
- `docs/install.md`: the install guide for every OS.
- `docs/plugins.md`: the plugin contract. Core is imaging; the rest is plugins.
- `docs/adr/`: architecture decisions. ADR 0001 removed Groups on purpose
  (host tags and bulk actions replace them). Do not reintroduce Groups.
- `AGENTS.md`: the issue tracker, triage labels, and domain-doc layout.

## Commands

| Task | Command |
|---|---|
| Install | `npm ci --legacy-peer-deps` |
| Dev MongoDB + Redis | `docker compose up -d` (or `podman compose up -d`) |
| Dev config + admin | `npm run setup:dev` (writes git-ignored `config/local.js`, `config/models.js`) |
| Production config | `npm run setup` (interactive; checks MongoDB and Redis) |
| Run | `node app.js` (development, port 1337). `npm start` runs production mode: minified bundles, built at each start |
| Lint | `npm run lint` (eslint, `--max-warnings=0`) |
| Test | `npm test` (lint, then the mocha suite) |
| UI smoke test | `npm run test:ui` (lifts with grunt on, drives Chromium through every routed page; run `npx playwright install chromium` once) |
| UI smoke test, production build | `npm run test:ui:prod` (the same checks against the minified bundles) |
| Installer smoke test | `npm run test:install` (the real installer from an answers file, a production lift, a sign-in, the socket origins; keeps your `config/`) |

CI (`.github/workflows/tests.yml`) runs `npm test` on Linux (Node 22 and 26)
and on Windows (Node 22), `npx grunt prod` on Linux (Node 22 and 26),
`npm run test:ui` plus `npm run test:ui:prod` on Linux (Node 22), and
`npm run test:install` on Linux (Node 22 and 26), Windows, and macOS, for
every pull request and merge-queue entry. The macOS job is not yet a required
check. `master` takes changes only through a pull
request and the merge queue.

## Testing

- The mocha suite lifts a real Sails app on port 1338, with grunt off. It needs
  MongoDB and Redis running, and the config that `npm run setup:dev` writes.
- Put new tests under `test/`. Mocha runs with `--recursive`.
- `npm test` never loads the UI. A change to a view, a client script, or a UI
  dependency needs `npm run test:ui` (`tools/smoke/ui.js`). A new page goes in
  its `PAGES` list.
- A fixed bug gets the test that would have caught it.

## Rules that are easy to break

- **fog-node runs on any OS that runs Node.** The installer configures fog-node
  only. It must never install packages or services. Every npm script must run
  in both POSIX sh and Windows cmd: no `VAR=value` prefixes, no `./path`
  executables. CI runs the suite on Windows to catch this. Use `path.join`, not
  string paths, and never hardcode `/images` or another Linux path as the only
  choice.

- **Do not run `npm audit fix`, `npm install <pkg>` without a reason, or
  `--force`.** The `overrides` in `package.json` and its `comments` block
  explain the pinned build chain. Some advisories have no fix short of
  replacing the grunt/Babel 6 asset toolchain.
- **Hold a Dependabot update in `.github/dependabot.yml`, never with an
  `@dependabot ignore` comment.** The comment hold is invisible in the repo
  and can only be lifted on an open Dependabot PR. An `ignore` rule names its
  issue and leaves with the PR that fixes it.
- **CI runs the installer only from an answers file** (`npm run
  test:install`), so the prompts themselves and `tools/migrate/` are not
  tested. A Dependabot PR for inquirer, or for a package only
  `tools/migrate/` uses, needs `npm run setup` run by hand on Node 22 and 26.
- **`views/layouts/layout.ejs` changes by itself.** Grunt's sails-linker
  rewrites its `<script>`/`<link>` block from the globs in
  `tasks/pipeline.js` at each development lift. Commit only the lines your
  change needs. Production (`npm start`) never rewrites it: the layout links
  the minified bundles itself, so a production install stays clean for
  `git pull`. CI fails if a UI smoke run leaves a tracked file changed.
- **CSRF is on** (`config/security.js`). `/api/v1/*` routes are `csrf: false`
  in `config/routes.js`, so a cookie-authenticated mutation under `/api/v1`
  must carry the `apiCsrfGuard` policy in `config/policies.js`. Page forms get
  `_csrf` from `views/pages/create.ejs`; `assets/fog/fog.csrf.js` adds the
  header to jQuery and `fetch` calls.
- **`migrate: 'safe'`.** The ORM never auto-migrates. Schema revisions go in
  `tools/migrate/`.
- **`User.create` requires `email`.**
- **Forms come from `api/helpers/form-generator.js`.** Change a form or a
  dropdown there, not in one view.
- **The UI is server-rendered EJS + jQuery on AdminLTE 4 / Bootstrap 5.** Do
  not add a frontend framework.

## Layout

| Path | What |
|---|---|
| `api/models/` | Waterline models. A model with a `stock.<identity>` entry in `config/permissions.js` gets the generic `:model` CRUD routes |
| `api/controllers/general/` | The generic CRUD and DataTables endpoints |
| `api/controllers/pages/` | Page controllers for the EJS views |
| `api/helpers/` | Shared helpers: forms, DataTables, image locks and stream, search |
| `api/hooks/` | `fog-version`, `plugins` (loads `plugins.json`), `watchdog` |
| `plugins/<name>/` | Plugins: `ad`, `printer`, `snapin`, `wol` |
| `tools/setup/` | The production installer (`index.js`) and the dev setup (`dev.js`) |
| `views/` | EJS layouts and pages |
