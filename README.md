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

## Persistent deployment (systemd autostart + nginx reverse proxy)

To run fog-node as a managed service that survives reboots — and reach it on the
standard ports (80/443) behind nginx instead of `:1337` — wire it up with systemd
and a reverse proxy. The example below targets a Linux host with **rootless
Podman**; adjust the IP, user, and paths to your machine.

### 1. MongoDB as a Podman Quadlet (systemd `--user`)

`~/.config/containers/systemd/fog-node-mongo.container`:

```ini
[Unit]
Description=fog-node MongoDB (podman)
After=network-online.target
Wants=network-online.target

[Container]
ContainerName=fog-node-mongo
Image=docker.io/library/mongo:7
PublishPort=127.0.0.1:27017:27017
Volume=fog-node-mongo-data:/data/db

[Service]
Restart=always
TimeoutStartSec=300

[Install]
WantedBy=default.target
```

`systemctl --user daemon-reload` generates `fog-node-mongo.service` from this
file. The named volume `fog-node-mongo-data` keeps your data across container
re-creation.

### 2. fog-node as a systemd `--user` service

`~/.config/systemd/user/fog-node.service` (replace `<user>`):

```ini
[Unit]
Description=fog-node (Sails.js) server on :1337
After=fog-node-mongo.service network-online.target
Wants=fog-node-mongo.service network-online.target
StartLimitIntervalSec=0

[Service]
Type=simple
WorkingDirectory=/home/<user>/fog-node
Environment=PATH=/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/local/bin/node app.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

`Restart=on-failure` also covers the boot race where fog-node lifts before
MongoDB is accepting connections — it just retries.

### 3. Enable autostart at boot

```sh
# let your user's services start at boot without an active login session
sudo loginctl enable-linger "$USER"

systemctl --user daemon-reload
systemctl --user enable --now fog-node-mongo.service
systemctl --user enable --now fog-node.service
```

Manage with `systemctl --user {status,restart,stop} fog-node`; follow logs via
`journalctl --user -u fog-node -f`.

### 4. nginx reverse proxy (80 + 443 → :1337)

Sails uses socket.io, so the proxy **must** forward WebSocket upgrades or the live
UI/sockets break. `/etc/nginx/conf.d/fog-node.conf` (replace `10.0.0.10` with your
host's IP):

```nginx
map $http_upgrade $fognode_connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    server_name 10.0.0.10;
    client_max_body_size 3000m;
    location / {
        proxy_pass http://127.0.0.1:1337;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $fognode_connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}

server {
    listen 10.0.0.10:443 ssl;
    server_name 10.0.0.10;
    client_max_body_size 3000m;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_certificate     /etc/nginx/certs/fog-node.crt;
    ssl_certificate_key /etc/nginx/certs/fog-node.key;
    location / {
        proxy_pass http://127.0.0.1:1337;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $fognode_connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
```

Self-signed cert for a LAN install, then test + reload:

```sh
sudo mkdir -p /etc/nginx/certs
sudo openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
  -keyout /etc/nginx/certs/fog-node.key -out /etc/nginx/certs/fog-node.crt \
  -subj "/CN=10.0.0.10" -addext "subjectAltName=IP:10.0.0.10"

sudo nginx -t && sudo systemctl reload nginx
```

> **Gotchas**
> - If you host other nginx vhosts, give each its own `ssl_session_cache` zone
>   name (or omit it). Duplicate `shared:NAME:size` zones with mismatched sizes
>   make `nginx -t` fail.
> - The app's entry point is `/login`; a bare `/` returns 403 by design.

TODO:
 Build views for all the different components
 Build systemctl script (linux) — documented above ("Persistent deployment")
 Build launchctl script (macos)
 Build Service/Task Scheduler to start script (windows)
 Test
 Testing again
