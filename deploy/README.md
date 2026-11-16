# Running janki standalone

The goal: janki serves on http://localhost:3001 with no VS Code, no terminal, and
no `npm run dev`, so the RAM goes to whatever else you are running.

There are two halves, and they're independent.

## 1. The Docker stack (already standalone)

`postgres` and `minio` both carry `restart: unless-stopped`, and
`snap.docker.dockerd.service` is enabled, so they come back on their own after a
reboot. Nothing to install.

```bash
docker compose up -d                        # postgres + minio
docker compose --profile tools up -d pgadmin  # only when you actually want it
```

Each service has a `mem_limit` / `cpus` ceiling — see `../docker-compose.yml`.
Together they idle at roughly 340 MB.

## 2. The Next server (this directory)

```bash
./deploy/install.sh
```

That builds the production bundle, installs `janki.service` as a **systemd user
service**, and enables it. Production mode is the big win: `next start` serves
prebuilt output, so there's no resident turbopack compiler and no file watchers —
roughly 300 MB instead of the dev server's 1.6 GB, and no idle CPU.

The unit caps itself at `MemoryHigh=512M` / `MemoryMax=768M` / `CPUQuota=100%`
(one of four cores), and runs at `Nice=5` so it yields to whatever you're
actually typing in.

### Surviving logout and reboot

User services stop at logout unless lingering is on:

```bash
sudo loginctl enable-linger $USER
```

## 3. The dock launcher

`install.sh` also installs a **janki** icon and pins it to the dock. You should
not need a terminal for normal use.

**Left-click** — opens http://localhost:3001, first starting the Docker stack and
the server if they aren't already running (~9s cold, instant when warm).

**Right-click** — a menu of actions:

| Action | What it does |
| --- | --- |
| Status | Dialog: server state, memory, HTTP code, container states |
| Restart server | Restarts the unit |
| View logs | `journalctl -f` in a terminal |
| Rebuild after code changes | `npm run build:prod`, then restart, in a terminal |
| Stop server | Stops Next; leaves Postgres/Directus/MinIO up |
| Stop everything (free RAM) | Stops the server *and* the containers |

All of it is one script, [`janki-ctl`](./janki-ctl), which works from a shell too:

```bash
janki-ctl open | start | stop | stop-all | restart | toggle | status | logs | rebuild
```

`~/.local/bin` isn't on your PATH by default — either add it, or call
`~/.local/bin/janki-ctl`. The `.desktop` file uses an absolute path, so the dock
works regardless.

`janki-ctl` is symlinked from the repo, so edits to it take effect immediately.

### Day to day

The launcher covers these, but the underlying commands are:

```bash
systemctl --user status janki
systemctl --user restart janki
systemctl --user stop janki          # reclaim the RAM entirely
systemctl --user disable --now janki # stop it starting at login
journalctl --user -u janki -f        # logs
```

### After changing code

Production mode serves a build, so changes need a rebuild:

```bash
cd app && npm run build:prod && systemctl --user restart janki
```

If you're actively iterating on janki, don't use this — use `npm run dev` (or
`npm run dev:lean` for the capped version) and stop the service first so you
aren't paying for both.

### Why there are two build directories

`npm run dev` writes to `.next`; the production build writes to `.next-prod`
(via `NEXT_DIST_DIR`, wired up in `next.config.ts` and set by the unit).

They must stay separate. A running dev server continuously rewrites the shared
manifests, and `app-paths-manifest.json` gets reduced to whatever routes dev has
compiled so far. If the production server shares that directory it then serves
**404 for every route it no longer knows about** — with the home page still
working, which makes it look like a routing bug rather than a clobbered build.
Splitting the directories means dev and prod can run simultaneously without
either corrupting the other.

## Seeing what else is running

A dev server started in the background is invisible: you see `localhost:3000`
and cannot tell which project owns it, or that a second one is quietly running
on 3001. A port number identifies nothing — the working directory does.

Right-click the dock icon → **Dev servers (all projects)**, or from a shell:

```bash
dev-servers --list     # plain text
dev-servers            # GUI picker, tick rows to stop them
```

It reports two things `ss` alone cannot give you together:

- **Listening processes** owned by you, resolved to their project via
  `/proc/<pid>/cwd`, with RAM. Electron/VS Code helper sockets are filtered out.
- **Published Docker ports**, which hold a port with *no visible PID* — the
  `docker-proxy` behind them runs as root, so `ss` cannot attribute them. These
  are matched back to their compose project via the
  `com.docker.compose.project` label.

Ticking a row stops it: `docker stop` for containers, SIGTERM then SIGKILL for
processes.
