# fog-node

This is the FOG 2.0 parent repository — a Node.js ([Sails.js](https://sailsjs.com))
rewrite of the FOG Project server, backed by MongoDB.

> **Work in progress.** See [docs/roadmap.md](docs/roadmap.md) for the current
> state and the plan toward feature parity with FOG 1.6.

## Requirements

- **Node.js** — tested on Node 22 (LTS) and Node 26.
- **MongoDB** — 7.x recommended.

## Development quickstart

A fresh clone can be brought up in four steps:

```sh
# 1. Install dependencies
npm install

# 2. Start a development MongoDB (no auth — dev only)
docker compose up -d        # or: podman compose up -d
# No compose plugin? Run Mongo directly:
#   podman run -d --name fog-node-mongo -p 127.0.0.1:27017:27017 docker.io/library/mongo:7

# 3. Write dev config + seed the Administrator account (non-interactive)
npm run setup:dev

# 4. Start the server
npm start                   # or: node app.js
```

Then browse to <http://localhost:1337> and log in as `Administrator`
(default password `fogadmin1` — change it, or override at setup time).

`setup:dev` writes the git-ignored `config/local.js` and `config/models.js`
with localhost defaults. Override any of them via env vars (see the header of
[tools/setup/dev.js](tools/setup/dev.js)), e.g.:

```sh
FOG_DEV_ADMIN_PASSWORD='supersecret' FOG_DEV_DB_NAME='fogdev' npm run setup:dev
```

## Production install

For a real install, run the interactive installer instead of `setup:dev`:

```sh
node tools/setup/index.js   # prompts for DB, admin account, webserver, etc.
npm start                   # NODE_ENV=production node app.js
```

TODO:
 Build views for all the different components
 Build systemctl script (linux)
 Build launchctl script (macos)
 Build Service/Task Scheduler to start script (windows)
 Test
 Testing again
