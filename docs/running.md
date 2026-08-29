# Running the planner continuously

The app runs as a Windows scheduled task on the host — not in a container. That is deliberate: the `claude-subscription` provider spawns a Claude Code executable that authenticates from Windows Credential Manager, and `lib/core/locks.ts` keys its cross-process write lock on the resolved data-root path. Both break the moment the app runs in a container while the MCP server runs on the host.

## What is set up

| Piece | Value |
|---|---|
| Scheduled task | `Planner`, triggers at logon, hidden window, restarts on failure (1 min, up to 999 times) |
| Command | `node node_modules/next/dist/bin/next start -p 80` |
| Working directory | the repo root |
| Port | 80, so the hostname needs no port suffix |
| Hostname | `planner.test` via a hosts entry |

`.env.local` is read at runtime, so `PLANNER_DATA_DIR` and the API keys apply to the production server exactly as they do in dev.

## One-time host setup

Needs an elevated shell — the hosts file is not writable by a normal user:

```powershell
Add-Content -Path "$env:SystemRoot\System32\drivers\etc\hosts" -Value "127.0.0.1 planner.test"
ipconfig /flushdns
```

`.test` is reserved by the IETF for exactly this, so it can never collide with a real domain and no resolver will try the internet.

## Day-to-day

```powershell
schtasks /Run   /TN "Planner"      # start now
schtasks /End   /TN "Planner"      # stop
schtasks /Query /TN "Planner" /FO LIST   # is it running
```

After pulling code changes, rebuild and restart — `next start` serves the build, it does not compile on the fly:

```powershell
npm run build
schtasks /End /TN "Planner"; schtasks /Run /TN "Planner"
```

## Notes

- The task starts **at logon**, not at boot. Windows cannot run an interactive-token task before a user signs in, and the Claude credentials live in that user's profile. If the machine reboots unattended, the app comes back when you log in.
- Port 80 binds without administrator rights on Windows. If something else claims it (IIS, another dev server), change `-p 80` in the task and use `planner.test:PORT`.
- The auto-distill timer in `instrumentation.ts` fires every 15 minutes. Running continuously is what makes it useful; set `PLANNER_AUTO_DISTILL=0` in `.env.local` to disable it.
- To edit the task by hand: Task Scheduler → Task Scheduler Library → `Planner`.
