# FOG ecosystem map (for fog-node / FOG 2.0)

A categorized view of the FOGProject repos that matter for 2.0, where the
plugins live, and the open issues that actually relate to the rewrite. (Captured
2026-06-20 to make the cross-repo picture easy to pick up later.)

## 2.0 server stack

| Repo | Lang | Role |
|---|---|---|
| **fog-node** | JS | **The current 2.0 server** (this repo; "FOG-Too Rename"). |
| fog-too | JS | The earlier 2.0 reboot; fog-node descends from it. Holds the original design issues. |
| fog-core | JS | Crypto libs (AES/RSA/hash/encode) — secure client comms, mirrors Zazzles. |
| fog-base-storage | JS | Storage base library. |
| sails-util-micro-apps | JS | **The plugin mechanism** — injects self-contained "micro-apps" (plugins) into the Sails app via a hook. |
| sails-mongo | JS | Mongo/Waterline adapter (fog-node uses the `fogproject/sails-mongo` fork). |
| SailsSocketIOClientDotNet | JS | Sails socket.io client for .NET. |

## Plugins for fog-node (each its own repo — the "one repo per plugin" plan)

| plugins.json key | Repo |
|---|---|
| `wol` | **fog-plugin-wol** ("wake-on-lan plugin for FOG 2") |
| `dhcp-proxy` | **node-dhcproxy** ("A DHCP Proxy written in Node js") |
| `tftp-server` | (no split repo found — built-in or not yet extracted) |
| (snapins) | fog-plugin-snapin |
| (printing) | fog-plugin-print ("Printer plugin for FOG 2.0") / fog-plugin-printer ("fog-too plugin … printer management") |
| (admin auth) | fog-plugin-activedirectory — **AD authentication for logging into fog-node**, NOT the host AD-join fields. |

> The Host's `useAD`/`ADDomain`/… fields are a *post-deploy* "join the imaged
> machine to the domain" concern (done by FOS/fog-client) — unrelated to the
> fog-plugin-activedirectory admin-auth plugin.

Mechanism: `sails-util-micro-apps`. All plugin repos currently have **0 open
issues**.

## 2.0 imaging (Phase 2 — paused)

| Repo | Lang | Role |
|---|---|---|
| fog-imager | Shell | "FOG Project 2.0 imaging submodule" — the 2.0 imaging side. |
| fos | C | FOG Operating System (the imaging OS; currently 1.x-oriented). |
| partclone | C | Partition imaging utility (fork). |
| mac-boot | - | Mac PXE boot helper. |

## Relevant open issues (the "ideas/threads" worth tracking)

**fog-too — original 2.0 design intent (2015–16):**
- #8 Plugins can add client features · #5 Plugins can add services — the plugin
  system vision (now realized via sails-util-micro-apps + the plugin repos).
- #12 Add local authentication — done in fog-node.
- #1 backend unit tests · #2 fpm terminal support · #3 fpm unit tests.

**fog-imager — 2.0 imaging OS roadmap (2015):**
- #9 LTS kernel · #10 update buildroot · #5 xfs/jfs support · #4 driver script ·
  #6/#7 Linux/Windows multicast server scripts.

**fos — imaging OS (active, mostly 1.x but informs 2.0 imaging):**
- enhancements: #34 capture/deploy LVM info · #71 remove NBD from kernel ·
  #48 remove MACs from multicast without restarting · #42 better network-error
  info · #55 performance testing.
- bugs: #109 init.xz normalize() · #108 EFI stub stuck · #107 Arrow Lake VMD ·
  #102 https without `curl -k` · #75 ESXi 7.0U3.

**fog-node:** only #10 "how to contribute?" (stale) — the current 2.0 work has no
real issue backlog; thoughts live in fog-too (design) + fog-imager/fos (imaging).

**fogproject (1.x):** no open issues explicitly reference the 2.0 rewrite.
