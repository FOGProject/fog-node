# Installing fog-node

fog-node runs on any operating system that runs Node.js: Linux, Windows, or
macOS. The fog-node installer does not install software on your system. You
install three prerequisites yourself, with the method that suits your OS. Then
the installer configures fog-node to use them.

This is a deliberate change from FOG 1.x. The 1.x installer did the system
administration itself, so it supported only the Linux distributions that it
knew. fog-node leaves the system to you, so it does not need to know your OS.

CI runs the full test suite on Linux (Node 22 and 26) and on Windows (Node 22).

## Prerequisites

| Software | Version | What fog-node uses it for |
|---|---|---|
| Node.js | 22 (LTS) or 26 | Runs fog-node |
| MongoDB | 7.x | The database |
| Redis | 7.x, or a Redis-compatible server | The session store. Login fails without it, because CSRF keeps its secret in the session |
| git | any | Gets the code (you can also download a release archive) |

MongoDB and Redis can run on the same machine as fog-node, or on another one.

### Linux

- **Node.js:** use your distribution's package, the NodeSource repository, or
  the installer from <https://nodejs.org>. Check the major version with
  `node --version`.
- **MongoDB:** use the MongoDB Community Server repository for your
  distribution, from <https://www.mongodb.com/docs/manual/administration/install-on-linux/>.
- **Redis:** use your distribution's `redis` (or `valkey`) package. Enable the
  service so that it starts at boot.
- The README section "Persistent deployment" gives a complete example. It runs
  MongoDB and Redis as Podman containers, fog-node as a systemd service, and
  nginx in front.

### Windows

- **Node.js:** use the Windows installer from <https://nodejs.org>.
- **MongoDB:** use the MongoDB Community Server MSI from
  <https://www.mongodb.com/try/download/community>. Select "Install MongoDB as a
  Service", so that it starts at boot.
- **Redis:** Redis has no official Windows build. Use one of these:
  - **Memurai**, a Redis-compatible Windows service (<https://www.memurai.com>).
    CI uses its developer edition.
  - Redis inside **WSL 2**. fog-node connects to it on `127.0.0.1:6379`.
  - The `redis` container image, in Docker Desktop or Podman Desktop.
- Run the commands below in PowerShell or Command Prompt. Every npm script in
  fog-node works in both.

### macOS

- **Node.js:** use the installer from <https://nodejs.org>, or
  `brew install node@22`.
- **MongoDB:** `brew tap mongodb/brew`, then `brew trust mongodb/brew` (newer
  Homebrew refuses a formula from a tap you have not trusted), then
  `brew install mongodb-community@7.0`, then
  `brew services start mongodb-community@7.0`.
- **Redis:** `brew install redis`, then `brew services start redis`.

### Containers, on any OS

The `docker-compose.yml` in this repository starts MongoDB and Redis with
`docker compose up -d` (or `podman compose up -d`). It has no authentication.
Use it for development and testing only.

## Install fog-node

```sh
git clone https://github.com/FOGProject/fog-node.git
cd fog-node
npm ci --legacy-peer-deps
npm run setup
```

`--legacy-peer-deps` is required. One old chart plugin declares a peer range
that the current chart.js does not meet.

`npm run setup` asks these questions:

| Question | Default | Notes |
|---|---|---|
| Database server address, port, and name (MongoDB) | `localhost`, `27017`, `fog` | It connects to check them |
| Database username and password (MongoDB) | none | Leave the username empty for a MongoDB with no authentication |
| Redis URL | `redis://127.0.0.1:6379/0` | It sends PING to check it. Put a password in the URL: `redis://:password@host:6379/0` |
| Each URL that browsers use, separated by commas | this computer's name, `localhost`, and each of its external IPv4 addresses, on port 1337 | See "Browser URLs" below |
| Image directory | `/images` on Linux, `/Users/Shared/fog/images` on macOS, `C:\fog\images` on Windows | It creates the directory and checks that it can write there |
| Administrator email and password | none | At least 8 characters |
| Sample data | no | For trying the UI. Not for production |

The installer writes two git-ignored files, `config/local.js` and
`config/models.js`. It changes no tracked file.

### Browser URLs

Every page opens a socket.io connection. fog-node accepts that connection only
from the URLs that you give the installer. This applies in every mode, not only
in production. From any other URL, the browser console shows socket connection
errors. No page depends on the socket yet, but live task progress will (see
`docs/roadmap.md`, Phase 2).

For example, if you give only `http://fogserver:1337`, then
`http://10.0.0.5:1337` gets socket errors. List every URL that people use. If a
reverse proxy is in front, list the proxy's URL, for example
`https://fog.example.com`.

You can run `npm run setup` again to change the answers. It keeps the data
encryption key in `config/models.js`, because a new key makes encrypted data
unreadable. It also keeps the existing Administrator account. A re-run does not
change that account's email or password, and the installer says so.

### Install without prompts

To script an install, put the answers in a JSON file and run
`npm run setup -- --answers answers.json`. Each key is the same question as
above, with the same default and the same check. A wrong answer or a failed
check ends the install with exit code 1. It does not ask again.

```json
{
  "database": {"host": "localhost", "port": 27017, "database": "fog", "username": "", "password": ""},
  "redis": {"url": "redis://127.0.0.1:6379/0"},
  "server": {"urls": "http://fogserver:1337, http://10.0.0.5:1337", "imageStorePath": "/images"},
  "admin": {"email": "admin@example.com", "password": "change-me-now"},
  "seed": {"seed": false}
}
```

Leave out a key to take its default. `admin.email` and `admin.password` have
no default, so they are required. `seed.seed` must be `true` or `false`. The
file holds the Administrator password, so delete it after the install.

## Start fog-node

```sh
npm start
```

`npm start` runs `node app.js --prod`, production mode. At each start it builds
the browser assets into two minified bundles.

Then open the URL that you gave the installer, for example
<http://fogserver:1337>, and log in as `Administrator`. To use a different port, run `node app.js --prod --port=8080`.

For development, run `node app.js`. Development mode serves each asset file
separately and rebuilds them when you change one.

## Run fog-node as a service

fog-node is one long-running Node process. Use the service manager of your OS
to start it at boot and restart it if it stops. Set its working directory to
the fog-node directory, and run `node app.js --prod` (what `npm start` runs).

- **Linux:** a systemd unit. The README section "Persistent deployment" has a
  complete example.
- **Windows:** a service wrapper such as NSSM (<https://nssm.cc>), or a Task
  Scheduler task that runs at startup.
- **macOS:** a launchd agent (a `.plist` file in `~/Library/LaunchAgents`).

Start fog-node after MongoDB and Redis. If fog-node starts first, it fails to
connect and exits, so set the service to restart on failure.

## Update fog-node

Run these steps in the fog-node directory, in this order:

1. Stop fog-node: stop the service, or end the `node` process.
2. `git pull`
3. `npm ci --legacy-peer-deps`
4. `npm run migrate`
5. Start fog-node.

Stop fog-node first. A new version can store a record in a new shape, and the
old code still writes the old shape until it stops. For example, schema
revision 2 renames the host field `tags` to `groups`: the old code writes
`tags`, and the new code reads only `groups`.

`npm run migrate` moves the database to the schema revision of the new code.
It runs only the revisions that the database does not have yet, and it says
"Migration not needed" when there are none. It asks about a database backup
before it changes anything. Make the backup, for example with `mongodump`.
That backup is the rollback: the migrator has no command that undoes a
revision.

## Put a web server in front (optional)

fog-node listens on port 1337. To serve it on 80 and 443, put a reverse proxy
in front: nginx, Caddy, Apache, or IIS with URL Rewrite. Set the proxy to pass
WebSocket upgrades through, for the socket.io connection (see "Browser URLs").
If you do this, give the installer the proxy's URL (for example
`https://fog.example.com`), not `:1337`.
