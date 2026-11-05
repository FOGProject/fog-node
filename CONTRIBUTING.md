# Contributing to fog-node

fog-node is the FOG 2.0 server, a Sails.js rewrite of FOG Project.

## Before you start

- Read `docs/roadmap.md` for the current phase and the decisions already made.
- For a new feature, open an issue first, so we can agree on the approach.
- For a security problem, do not open an issue. Follow `SECURITY.md`.

## Set up

```sh
npm ci --legacy-peer-deps
docker compose up -d        # MongoDB + Redis for development (or podman compose)
npm run setup:dev           # writes config/local.js and config/models.js
node app.js                 # http://localhost:1337
```

The README has the Node versions and the full development quickstart.

## Make a change

- Branch from `master`.
- Keep a pull request to one change.
- Match the existing style. `npm run lint` must report no warnings.
- Add a test under `test/` for each fixed bug and each new endpoint.
- Do not run `npm audit fix` or `--force`. The `comments` block in
  `package.json` explains why.
- To hold back a Dependabot update, add an `ignore` rule to
  `.github/dependabot.yml` with a comment that links the issue for the fix.
  Do not close the PR with `@dependabot ignore`. That hold lives only inside
  Dependabot: nobody can see it in the repo, and Dependabot accepts the
  `unignore` command only on an open Dependabot PR.

## Open a pull request

- Target `master`.
- Run `npm test` first. CI runs the same command on Node 22 and 26.
- If you changed a view, a client script, or a UI dependency, also run
  `npm run test:ui`. It drives a browser through the pages. Run
  `npx playwright install chromium` once before the first run. If you changed
  the asset pipeline (`tasks/`), also run `npm run test:ui:prod`. It runs the
  same checks against the minified production bundles.
- If you changed the installer (`tools/setup/`), also run
  `npm run test:install`. It runs the installer from an answers file and
  signs in to the result. It keeps your `config/local.js`.
- Say what changed and why, and how you checked it.
- A pull request merges through the merge queue after the required checks
  pass.

## License

By contributing, you agree that your contribution is licensed under the
GPL v3, the same license as the project.
