# Phase 2 — Imaging (design)

Status: **design / in progress.** The boot entry point (`GET /boot.ipxe`) ships;
the capture/deploy engine below is the plan, to be built in verifiable steps.

## The imaging core (the crux)

fog-node core is just the imaging essentials; everything else is a plugin:

1. **iPXE boot generation + forwarding** — generate the per-host iPXE script and
   forward/chain the machine to the right next stage (FOS + kernel on the storage
   node hosting its image). `GET /boot.ipxe` is the start of this.
2. **Storage node** — who is hosting the images (and serves/receives the bytes).
3. **Hosts** — the machines being imaged (+ Images, + Tasks/Workflow).

Note: a host's `useAD`/`ADDomain`/… are a *post-deploy domain-join* concern
(handled by FOS/fog-client), **not** the `fog-plugin-activedirectory` plugin
(which is AD authentication for logging into fog-node).

## Context (from the sibling repos)

- **fog-too** — the earlier "FOG 2.0" Sails app; **fog-node** is the current
  revamp and inherits its data model (`Host`, `Image`, `Task`, `Workflow`, ...).
- **fog-core** — Node crypto libraries (AES, RSA, hash, encode/decode, generate)
  intended to *mimic Zazzles*, i.e. the secure client⇄server primitives.
- **fog-client (Zazzles)** — the existing .NET service: it **registers** a host
  and **polls for tasks** over HTTP, encrypting with the host's key.
- The `Host` model already carries `pubKey`, `secToken`, `secTime` — the per-host
  key material for authorized comms — and `Task`/`Workflow` already model the
  job lifecycle.

## Principles (decided)

1. **HTTP-based protocol.** No NFS/1.x FOS protocol. Images and control both
   flow over HTTP(S).
2. **Per-client authorization.** A machine may only image when it is
   **authorized** for a task — it presents a token/key tied to the host, so
   random machines can't pull/push images.
3. **FOS gets a 2.0-specific fork.** The imaging OS is updated to speak this
   protocol (it does not need to match 1.x FOS).

## End-to-end flow

```
PXE → iPXE → GET /boot.ipxe?mac=…        (done)
            → if host has an active task: chain to FOS-2.0 (kernel+init)   [gated]
            → else: sanboot local disk
FOS boots → POST /api/v1/client/checkin  (authorize by host key/token)
          → server returns the active Task (deploy|capture) + a scoped token
deploy:  FOS GET  /api/v1/image/:id/stream         (token-scoped pull)
capture: FOS PUT  /api/v1/image/:id/stream         (token-scoped push)
FOS → POST /api/v1/task/:id/progress     (periodic % + state)
FOS → POST /api/v1/task/:id/complete     (or /fail) → server finalizes
```

## Authorization model

- **Registration**: an unknown host (from `/boot.ipxe` or FOS) can be
  quick-registered; the server generates/records the host key (`pubKey` /
  `secToken`). Mirrors Zazzles registration.
- **Task authorization**: scheduling a task on a host mints a **scoped,
  short-lived token** bound to that host + task. FOS presents it on check-in and
  on the image stream endpoints. No valid task ⇒ no image access.
- Reuse `fog-core` crypto (or jsonwebtoken, already a dep) for signing; the host
  key proves identity, the task token authorizes the specific image transfer.

## Data model (reuse existing)

- **Workflow** = a unit of work for a host (e.g. "deploy Win11 to pc-01").
- **Task** = a step with `runner` (server|client/FOS), `state`, `payload`
  (`{type:'deploy'|'capture', image, partition,…}`), `progress`, `progressText`,
  `startTime`, `completionTime`.
- **StorageNode** = where image data lives; in this protocol it serves/receives
  image bytes over HTTP (master node, replication later).

## Proposed endpoints

| Endpoint | Who | Purpose |
|---|---|---|
| `GET /boot.ipxe` | iPXE | boot menu / chain (shipped) |
| `POST /api/v1/client/register` | FOS/host | quick-register, get host key |
| `POST /api/v1/client/checkin` | FOS | authorize + fetch active task |
| `GET /api/v1/image/:id/stream` | FOS | deploy: pull image (token-scoped) |
| `PUT /api/v1/image/:id/stream` | FOS | capture: push image (token-scoped) |
| `POST /api/v1/task/:id/progress` | FOS | report % / state |
| `POST /api/v1/task/:id/complete` \| `/fail` | FOS | finalize |

(There are already stub `image/capture` + `image/deploy` controllers and image
read/write-lock helpers to build on.)

## Incremental build plan (each step verifiable on its own)

1. **Boot entry point** — `GET /boot.ipxe`. ✅ shipped.
2. **Host registration + per-host token** — HTTP register/checkin returning the
   host + a scoped token; verifiable with curl (no FOS needed).
3. **Schedule a task** — admin action to create a Workflow+Task (deploy/capture)
   on a host; check-in returns it; `/boot.ipxe` reflects "has active task".
4. **Image stream endpoints** — token-scoped pull/push wired to a StorageNode
   path; verify byte transfer + the existing image locks.
5. **Progress + task state machine** — progress/complete/fail update the Task;
   surface on the dashboard/active-tasks views.
6. **FOS-2.0 integration + real PXE/FOS testing** — the part that needs hardware;
   wire the boot chain to the FOS-2.0 kernel/init.

## Open questions

- Token format/lifetime and exactly which `fog-core` vs `jsonwebtoken` pieces to
  use for client auth.
- Image on-disk format/compression for the HTTP store (partclone output streamed
  as-is vs a container).
- How storage-node selection/replication factors into the stream endpoints.
- FOS-2.0 fork: repo, kernel/init, and the minimal client it needs.
