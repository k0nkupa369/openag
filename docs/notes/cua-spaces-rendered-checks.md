# Rendered desk checks in a Cua Space

Verified 11 November 2026 for the OA-347 proposal-card check ([default-bot-management-design.md](default-bot-management-design.md)). This is a developer procedure for screenshotting the real desk at desktop and phone widths and as a Limited device. No browser runs on the owner's screen, and the live service is not touched. It is not product behaviour and has nothing to do with OpenAg's own computer backend ([cua.md](cua.md), sandbox `openag-main`).

## Why OpenAg runs inside the Space

A local Cua Space is an isolated container. It cannot reach the host. From `local:home-claude-code`, every route to the Mac timed out: `host.docker.internal` (the Docker host gateway), the Mac's LAN addresses, and a daemon listening on `*:4747`. Exposing the desk to the network or adding a tunnel only to take screenshots is not worth the risk. Instead, the source is built inside the Space, so the daemon, desk and Chromium all run on its own `127.0.0.1`. Building there also compiles `better-sqlite3` for Linux; the Mac's `node_modules` would not load there.

## What it needs

- The Cua Spaces app running, with a local Space on the canonical image (`ghcr.io/trycua/linux:24.04-slim` was used; arm64, 2 CPUs, 4 GB). It has Xvfb `:1`, XFCE, Chromium, `xdotool` and `wmctrl`, plus passwordless `sudo` and internet access.
- The Cua MCP tools or the `cua` CLI on the host: `space_bash`, `upload`, `computer_screenshot`, `computer_click`, `computer_scroll` and `computer_type`; or `cua sandbox exec <space> '<cmd>'` for scripted waits.

## Procedure

1. **Node in the Space.** Download the current v22 linux-arm64 tarball from nodejs.org into `~/node`. Check it against `SHASUMS256.txt` and keep the original filename, because `sha256sum -c` looks it up by that name. Then run `corepack enable --install-directory ~/node/bin`. Inside the repo, corepack picks pnpm 10.28.1 from `packageManager`.
2. **Build tools.** Run `sudo apt-get install -y build-essential`. `better-sqlite3` has no prebuilt binary for this target and compiles from source. Without the tools, `pnpm install` fails in node-gyp.
3. **Source.** On the host, run `git archive --format=tar.gz -o <scratch>/openag.tar.gz origin/staging` (or the branch under test). This includes tracked files only: no `.env`, no data, no working-tree leftovers. Upload it and extract to `~/openag`.
4. **Install and build.** Run `pnpm install --frozen-lockfile` then `pnpm -r build`, both in the background with a log. Poll for an `EXIT` line from the host:
   ```sh
   until cua sandbox exec local:<space> 'grep -q "^EXIT" ~/build.log'; do sleep 10; done
   ```
5. **Seed and start a throwaway daemon.** Use a fresh mode-700 data dir and a random token. The token is read back for API calls, and the owner credential is created inside the Space:
   ```sh
   node scripts/seed-proposal-cards.mjs ~/oag-data      # or a seed for the screen under test
   OPENAG_DATA=~/oag-data OPENAG_TOKEN=$(cat ~/oag-token) OPENAG_EMBED=off OPENAG_TZ=UTC nohup node apps/daemon/dist/main.js > ~/daemon.log 2>&1 &
   ```
   On start, the daemon probes the Claude adapter's model catalogue. That is harmless without a login.
6. **Sign in as Full.** Run `DISPLAY=:1 OPENAG_DATA=~/oag-data node apps/daemon/dist/open-desk.js`. Chromium opens a single-use pairing link with the code filled in. Click **Pair** within five minutes.
7. **Sign in as Limited.** Create a code with `POST /devices/pairing-codes` (owner bearer, body `{}`). Open a second profile with `chromium --user-data-dir=/tmp/limited-profile http://127.0.0.1:4747/` and enter the code.
8. **Widths and screenshots.** `wmctrl -l` lists windows. `wmctrl -i -r <id> -b remove,maximized_vert,maximized_horz` then `wmctrl -i -r <id> -e 0,20,30,430,700` gives a phone-width window, and `-b add,hidden` moves others aside. Click inside the feed before scrolling, so the scroll reaches the conversation and not the sidebar. `computer_screenshot` returns at most 1200 px on the long edge.
9. **Iterate.** Upload only the changed files, rebuild that package (`pnpm --filter daemon build`, `pnpm --filter desk build`), reseed a fresh data dir (stored proposal payloads keep their old display), restart and pair again.

## Gotchas

- `pkill -f "apps/daemon/dist/main.js"` inside `space_bash` matches the shell running the command and kills it (`[signal TERM]`). Use a bracketed pattern: `pkill -f "[d]aemon/dist/main.js"`.
- A new Chromium window started with `--window-size` can open behind a maximised one. Use `wmctrl -i -a <id>` to bring it forward.
- A seed that builds proposals without the automation manager leaves "next run" empty. That is a seed artefact, not a desk defect.

## Cleanup

Stop the daemon and Chromium (`pkill -f "[d]aemon/dist/main.js"; pkill -f "[c]hromium"`). Remove `~/openag`, `~/node`, `~/oag-data`, `~/oag-token`, `/tmp/limited-profile` and the uploaded archive, or delete the Space. Nothing outside the Space is created except the archive in the host scratch directory.

## Phone tests on the Linux phone test host

Set up 12 November 2026 for OA-307. the Linux test host is reached as a Cua relay Space. It is an Ubuntu 24.04 x86_64 machine: an 8-core i7 with 15 GB RAM, KVM usable by the user, and usually idle. It is on a **different network** from the owner's Mac, which makes it suitable for cross-NAT tests. Use it instead of the Mac minis, which were heavily loaded and lost `adb` mid-test.

- **Installed (per user):**
  - Android SDK `~/Android/Sdk` (emulator 37.2, platform-tools).
  - System image `android-35;google_apis_playstore;x86_64`.
  - AVD `openag-pixel` (Pixel 7, 2 GB, Android 15, Chrome 124; Play Store off, so Chrome does not update itself).
  - Node 22 in `~/node`.
  - `coturn` (package installed, service disabled).
- **Boot headless** (about 40-50 s):
  ```sh
  nohup ~/Android/Sdk/emulator/emulator -avd openag-pixel -no-window -no-audio -no-snapshot-save -no-boot-anim -gpu swiftshader_indirect >/tmp/openag-emu.log 2>&1 &
  ```
  Wait for `adb shell getprop sys.boot_completed` to return `1`. `adb` is `~/Android/Sdk/platform-tools/adb`; it is not on `PATH`.
- **Serve and open the desk:**
  - Upload `apps/desk/dist` and serve it with `python3 -m http.server 8788 --bind 127.0.0.1`.
  - Run `adb reverse tcp:8788 tcp:8788` so the emulator sees it on its own `localhost`, a secure origin.
  - Disable Chrome's first run: write `_ --disable-fre --no-default-browser-check --no-first-run` to `/data/local/tmp/chrome-command-line`, then `am set-debug-app --persistent com.android.chrome`.
  - Open the desk with `am start -n com.android.chrome/com.google.android.apps.chrome.Main -a android.intent.action.VIEW -d http://localhost:8788/`.
- **Drive Chrome over DevTools:**
  - `adb forward tcp:9333 localabstract:chrome_devtools_remote`.
  - Then script with `~/node/bin/node`, whose built-in `WebSocket` speaks CDP.
  - Android Chrome freezes background tabs. Keep exactly one desk tab: close the others with `/json/close/<id>` and bring it forward with `/json/activate/<id>`. Otherwise `Runtime.evaluate` on a frozen tab never returns.
- **Pairing invites expire after 5 minutes.** Create one just before joining. An expired invite is refused silently (`bad mac`).
- **Cross-network tests:**
  - Bind the daemon on the Mac to its LAN address with `OPENAG_RTC_BIND_IPV4`, so Tailscale candidates do not make the test pass trivially.
  - A relay for lab runs can be coturn on the Linux test host, bound to its Tailscale address. Use a throwaway secret and keep the packaged service disabled.
- **Cleanup:**
  - Remove `chrome-command-line`, then `am clear-debug-app`.
  - `adb reverse --remove-all` and `adb forward --remove-all`, then `adb emu kill`.
  - Stop the http server, and stop any lab coturn and remove its config.
  - Keep the AVD and Node for the next run.

## Limits

Coverage is the Space's Linux Chromium at the chosen window sizes. It does not establish rendering on a physical phone, Safari or WebKit, the installed PWA, dark mode (unless toggled), or anything about the live install. Record each check's scope with its ticket.
