#!/usr/bin/env bash
# BEGIN FILETRUST INSTALL BANNER — from root singature.txt
filetrust_install_banner() {
  local banner_dir banner_version='unknown' banner_line
  banner_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
  if [[ -r "$banner_dir/package.json" ]]; then
    while IFS= read -r banner_line; do
      if [[ $banner_line =~ \"version\"[[:space:]]*:[[:space:]]*\"([^\"]+)\" ]]; then
        banner_version=${BASH_REMATCH[1]}
        break
      fi
    done < "$banner_dir/package.json"
  fi
  cat <<'FILETRUST_BANNER_TOP'
███████╗██╗██╗     ███████╗████████╗██████╗ ██╗   ██╗███████╗████████╗
██╔════╝██║██║     ██╔════╝╚══██╔══╝██╔══██╗██║   ██║██╔════╝╚══██╔══╝
█████╗  ██║██║     █████╗     ██║   ██████╔╝██║   ██║███████╗   ██║
██╔══╝  ██║██║     ██╔══╝     ██║   ██╔══██╗██║   ██║╚════██║   ██║
██║     ██║███████╗███████╗   ██║   ██║  ██║╚██████╔╝███████║   ██║
╚═╝     ╚═╝╚══════╝╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚══════╝   ╚═╝


Author: Ali Farahpoor
Company: Electra Sphere Innovations (ElectraSI.es)
Location: Barcelona, Spain
Contact: support@filetrust.io

FILETRUST_BANNER_TOP
  printf 'Version: %s %s\n' 'Explorer' "$banner_version"
  cat <<'FILETRUST_BANNER_BOTTOM'
Release Date: 25 October 2026

Documentation: https://docs.filetrust.io
Website: https://www.filetrust.io
FILETRUST_BANNER_BOTTOM
  printf '\n'
}
filetrust_install_banner
unset -f filetrust_install_banner
# END FILETRUST INSTALL BANNER
#
# One-command setup for the FileTrust Explorer.
#
#   ./install.sh --network-config https://config.filetrust.io/v1/network-config
#
#   --network-config URL  the network to show. Everything else -- the contract
#                         addresses, the chain id, the RPC url -- comes from
#                         there, so nothing is typed in by hand.
#   --rpc URL             override the network's RPC (checked against its chain id)
#   --price-url URL       override the network's price service
#   --chain TYPE          cosmos, hardhat, or evm; normally supplied by the network
#   --port N              serve on this port instead of 3001
#   --bind ADDRESS        what it listens on. 0.0.0.0 by default, so a plain
#                         install is reachable. Behind a proxy, 127.0.0.1:
#                         then the name is the only way in and the port
#                         cannot be called around it.
#   --no-service          set up only; you start it yourself
#   --user                install the service for this user, not the machine
#   --fresh               ALSO empty the indexed history. Only after a redeploy
#                         that replaced the contracts: without it, last chain's
#                         events sit beside this one's.
#   --skip-build          do everything but the build, for a quick re-point
#   --dry-run             show what would happen, change nothing
#   --verbose             show every check, not only what needs doing
#
# The Explorer answers its screens from two stores -- Postgres for current
# state, ClickHouse for the event log -- not from the chain. This installs
# both if they are missing, starts them if they are down, and uses them if
# they are already serving. They live under ~/.filetrust-data as this user,
# with nothing in system paths.
#
# A reinstall KEEPS that history. Reinstalling is the normal way to pick up a
# redeploy, and emptying months of indexed events every time somebody wanted
# new contract addresses would be a trap. Pass --fresh when you really mean it.
#
# The addresses are compiled into the build, so a re-point is a rebuild. That
# is why this exists as a script rather than a setting.

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="filetrust-explorer"
INDEXER_SERVICE_NAME="filetrust-explorer-indexer"
ORIGINAL_ARGS=("$@")
WANT_SERVICE=1
USER_UNIT=0
DRY_RUN=0
VERBOSE=0
FRESH=0
SKIP_BUILD=0
PORT=""
BIND=""
NETWORK_CONFIG_URL=""
CONFIG_OVERRIDES=()

while [ $# -gt 0 ]; do
  case "$1" in
    --service) WANT_SERVICE=1 ;;
    --no-service) WANT_SERVICE=0 ;;
    --user) USER_UNIT=1 ;;
    --fresh) FRESH=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --port) shift; PORT="${1:-}" ;;
    --bind|--hostname) shift; BIND="${1:-}" ;;
    --network-config) shift; NETWORK_CONFIG_URL="${1:-}" ;;
    --rpc|--price-url|--chain) CONFIG_OVERRIDES+=("$1" "${2:-}"); shift ;;
    --dry-run) DRY_RUN=1 ;;
    --verbose|-v) VERBOSE=1 ;;
    -h|--help) awk 'NR>2 && /^#/ {sub(/^# ?/, ""); print; next} NR>2 {exit}' \
                 "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
step() { [ "$VERBOSE" = 1 ] && say "$*"; return 0; }
note() { [ "$VERBOSE" = 1 ] && printf '%s\n' "$*"; return 0; }
warn() { printf '\033[33m%s\033[0m\n' "$*" >&2; }
die()  { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

PORT_IN_USE="${PORT:-3001}"

# ── Who does the work ────────────────────────────────────────────────────────
# Only the systemd unit needs root. Everything else must be done by whoever
# owns this folder, and the stores are the reason it matters: they live in that
# person's home directory. Run the whole script as root and it builds a second,
# empty pair under /root, while the real indexed history sits untouched in the
# owner's home -- and the Explorer comes up, answers every request, and shows
# an empty network. That looks like a working deployment and is not one.
#
# So root does the owner's part as the owner, and keeps only the unit for
# itself. A login shell, because a node installed by nvm is not on the path
# otherwise.
DIR_OWNER="$(stat -c '%U' "$APP_DIR" 2>/dev/null || echo root)"
if [ "$(id -u)" = 0 ] && [ "$DIR_OWNER" != "root" ] && [ "$USER_UNIT" = 0 ] \
   && [ -z "${FT_EXPLORER_REEXEC:-}" ]; then
  say "Running the install as $DIR_OWNER, who owns this folder"
  # Stop it here, not in there. The owner cannot stop a machine-wide service,
  # so left to itself the inner run rebuilds underneath a live server: npm ci
  # empties node_modules and the build replaces .next, and the running server
  # starts answering 500 for pages that worked a moment ago.
  if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    systemctl stop "$SERVICE_NAME" || true
    systemctl stop "$INDEXER_SERVICE_NAME" 2>/dev/null || true
    echo "  stopped it while it is rebuilt"
  fi
  # Earlier root-run builds can leave generated traces/cache unwritable by
  # the application owner. Repair only generated output before the owner rebuilds.
  for generated_dir in "$APP_DIR/.next" "$APP_DIR/__pycache__"; do
    if [ "$DRY_RUN" = 0 ] && [ -e "$generated_dir" ]; then
      [ ! -L "$generated_dir" ] || die "The generated directory must not be a symlink."
      chown -Rh -- "$DIR_OWNER:$(stat -c '%G' "$APP_DIR")" "$generated_dir"
    fi
  done
  INNER_ARGS=""
  for arg in "${ORIGINAL_ARGS[@]+"${ORIGINAL_ARGS[@]}"}"; do
    [ "$arg" = "--service" ] && continue
    INNER_ARGS="$INNER_ARGS $(printf '%q' "$arg")"
  done
  # nvm installs node per user and puts it on the path from ~/.bashrc, which a
  # non-interactive shell skips. Without this the owner's own node is invisible
  # and the install stops at "node is not installed" on a machine that has it.
  NVM_LINE='export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh";'
  su - "$DIR_OWNER" -c "$NVM_LINE FT_EXPLORER_REEXEC=1 $(printf '%q' "$APP_DIR/install.sh")$INNER_ARGS --no-service" \
    || die "the install failed as $DIR_OWNER; nothing was changed as root."
  if [ "$WANT_SERVICE" = 1 ]; then
    # Carry on below as root, for the one thing that needs it. Skipping the
    # work already done rather than repeating it as the wrong user.
    SKIP_BUILD=1
    NETWORK_CONFIG_URL=""
    FT_ROOT_SERVICE_ONLY=1
  else
    exit 0
  fi
fi

# ── Node and Python ──────────────────────────────────────────────────────────
# Node builds and serves the app; Python only sets up the two stores.
#
# Skipped on the root pass, which installs a unit and nothing else: root on a
# machine where node belongs to one user has neither node nor npm, and asking
# it for them stops an install that needs neither.
if [ -z "${FT_ROOT_SERVICE_ONLY:-}" ]; then
  step "Checking what is needed"
  command -v node >/dev/null 2>&1 || die \
    "node is not installed. The Explorer needs Node 22 or newer."
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$NODE_MAJOR" -ge 22 ] || die "Node 22 or newer is needed. This machine has $(node -v)."
  command -v npm >/dev/null 2>&1 || die "npm is not on the path, though node is."
  command -v python3 >/dev/null 2>&1 || die \
    "python3 is not installed; the Explorer's stores are set up with it."
  note "  node $(node -v), npm $(npm -v), $(python3 -V 2>&1)"
fi

# ── Anything already serving from this folder ────────────────────────────────
# npm ci empties node_modules and the build replaces .next, both underneath a
# running server. A Next.js server holds its chunks open by path: pull them out
# from under it and it starts answering 500 for pages that were working a
# second ago, and nothing in its log says why.
#
# A service is stopped and started again around the work. A server somebody
# started by hand cannot be, so it is named and the person is asked.
RESTART_SERVICE=0
if [ "$DRY_RUN" = 0 ]; then
  if command -v systemctl >/dev/null 2>&1; then
    if [ "$USER_UNIT" = 1 ]; then
      systemctl --user is-active --quiet "$SERVICE_NAME" 2>/dev/null && RESTART_SERVICE=1
    else
      systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null && RESTART_SERVICE=1
    fi
  fi
  if [ "$RESTART_SERVICE" = 1 ]; then
    step "Stopping the Explorer while it is rebuilt"
    if [ "$USER_UNIT" = 1 ]; then
      systemctl --user stop "$SERVICE_NAME" || true
      systemctl --user stop "$INDEXER_SERVICE_NAME" 2>/dev/null || true
    elif [ "$(id -u)" = 0 ]; then
      systemctl stop "$SERVICE_NAME" || true
      systemctl stop "$INDEXER_SERVICE_NAME" 2>/dev/null || true
    else
      sudo -n systemctl stop "$SERVICE_NAME" >/dev/null 2>&1 || RESTART_SERVICE=0
      sudo -n systemctl stop "$INDEXER_SERVICE_NAME" >/dev/null 2>&1 || true
    fi
  elif command -v ss >/dev/null 2>&1 && ss -ltn 2>/dev/null | grep -q ":$PORT_IN_USE "; then
    warn "  Something is already serving on port $PORT_IN_USE and it is not a"
    warn "  service this script can stop. Rebuilding underneath it will make it"
    warn "  answer 500 until it is restarted. Stop it first, or restart it after."
  fi
fi

# ── The app's packages ───────────────────────────────────────────────────────
# Already done by the owner above, when root re-ran this as them.
#
# npm ci, not npm install: it installs exactly the lock file and starts from a
# clean node_modules. A folder copied between machines keeps its files but
# loses its symlinks, and then `next` is simply not found.
if [ "$DRY_RUN" = 1 ]; then
  note "  would run npm ci"
elif [ -n "${FT_ROOT_SERVICE_ONLY:-}" ]; then
  note "  packages were installed by $DIR_OWNER"
else
  step "Installing the app's packages"
  cd "$APP_DIR"
  if [ -f package-lock.json ]; then
    npm ci --no-audit --no-fund >/dev/null 2>&1 || die \
      "npm ci failed. Run it by hand in $APP_DIR to see why."
  else
    npm install --no-audit --no-fund >/dev/null 2>&1 || die \
      "npm install failed. Run it by hand in $APP_DIR to see why."
  fi
  note "  packages are up to date"
fi

# ── Which network this Explorer shows ────────────────────────────────────────
if [ "$DRY_RUN" = 0 ] && [ -z "${FT_ROOT_SERVICE_ONLY:-}" ]; then
  say "Reading the network settings"
  CONFIG_ARGS=("${CONFIG_OVERRIDES[@]}")
  [ -n "$NETWORK_CONFIG_URL" ] && CONFIG_ARGS+=(--network-config "$NETWORK_CONFIG_URL")
  python3 "$APP_DIR/configure.py" "${CONFIG_ARGS[@]}" \
    || die "could not configure this Explorer from the network service"
elif [ "$DRY_RUN" = 0 ] && [ ! -f "$APP_DIR/src/lib/addresses.ts" ]; then
  die "This Explorer has no addresses yet. Give --network-config <url>."
fi

# Kept in .env.local rather than only in this run's arguments: the service is
# started by systemd later, with no command line of yours to read, and a
# re-install must not quietly put a loopback-only Explorer back on 0.0.0.0.
if { [ -n "$PORT" ] || [ -n "$BIND" ]; } && [ "$DRY_RUN" = 0 ]; then
  FT_DIR="$APP_DIR" FT_PORT="$PORT" FT_BIND="$BIND" python3 - <<'APPLY_PORT'
import os, sys
from pathlib import Path
sys.path.insert(0, os.environ["FT_DIR"])
import configure

values = {}
if os.environ.get("FT_PORT"):
    values["PORT"] = os.environ["FT_PORT"]
if os.environ.get("FT_BIND"):
    values["EXPLORER_BIND"] = os.environ["FT_BIND"]
changed = configure.merge_env(Path(os.environ["FT_DIR"]) / ".env.local", values)
if changed:
    print("  set " + ", ".join(changed))
APPLY_PORT
fi

# What the service will listen on, from this run or from an earlier one.
BIND_IN_USE="$BIND"
if [ -z "$BIND_IN_USE" ] && [ -f "$APP_DIR/.env.local" ]; then
  BIND_IN_USE="$(sed -n 's/^EXPLORER_BIND=//p' "$APP_DIR/.env.local" | tail -1)"
fi
BIND_IN_USE="${BIND_IN_USE:-0.0.0.0}"

# ── The two stores ───────────────────────────────────────────────────────────
# Installed if missing, started if down, used if already serving. The history
# in them is kept unless --fresh: a reinstall is how a redeploy is picked up,
# and emptying the index every time would make that unusable.
if [ "$DRY_RUN" = 1 ]; then
  note "  would bring up Postgres and ClickHouse (keeping the index)"
elif [ -n "${FT_ROOT_SERVICE_ONLY:-}" ]; then
  note "  the stores belong to $DIR_OWNER and were brought up as them"
else
  say "The Explorer's stores"
  if [ "$FRESH" = 1 ]; then
    warn "  --fresh: the indexed history will be emptied"
  fi
  FT_DIR="$APP_DIR" FT_FRESH="$FRESH" python3 - <<'STORES'
import os, sys
sys.path.insert(0, os.environ["FT_DIR"])
from explorer_stores import StoreError, ensure_stores

def log(message):
    print(f"  {message}", flush=True)

try:
    ensure_stores(log, fresh=os.environ.get("FT_FRESH") == "1")
except StoreError as exc:
    print(f"  the stores could not be brought up: {exc}", file=sys.stderr)
    raise SystemExit(1)
STORES
fi

# ── Building it ──────────────────────────────────────────────────────────────
# The addresses are compiled in, so a change of network is a rebuild. Never
# while a dev server is running on this folder: the build replaces .next
# underneath it and the running server starts serving pieces that are gone.
if [ "$SKIP_BUILD" = 1 ]; then
  note "  --skip-build: not rebuilding"
elif [ "$DRY_RUN" = 1 ]; then
  note "  would run npm run build"
else
  say "Building"
  cd "$APP_DIR"
  npm run build >/dev/null 2>&1 || die \
    "the build failed. Run 'npm run build' in $APP_DIR to see why."
  echo "  built"
fi

# ── Start again what was stopped ─────────────────────────────────────────────
# Only when a service is not about to be installed below, which starts it
# anyway. Stopping something and not starting it again is the worst outcome
# here: the Explorer was up before this ran.
if [ "$RESTART_SERVICE" = 1 ] && [ "$WANT_SERVICE" = 0 ]; then
  if [ "$USER_UNIT" = 1 ]; then
    systemctl --user start "$SERVICE_NAME" || warn "  could not start $SERVICE_NAME again"
    systemctl --user start "$INDEXER_SERVICE_NAME" 2>/dev/null || true
  elif [ "$(id -u)" = 0 ]; then
    systemctl start "$SERVICE_NAME" || warn "  could not start $SERVICE_NAME again"
    systemctl start "$INDEXER_SERVICE_NAME" 2>/dev/null || true
  else
    sudo -n systemctl start "$SERVICE_NAME" >/dev/null 2>&1 \
      || warn "  could not start $SERVICE_NAME again; do it by hand"
    sudo -n systemctl start "$INDEXER_SERVICE_NAME" >/dev/null 2>&1 || true
  fi
  echo "  started again"
fi

# ── Keeping it running ───────────────────────────────────────────────────────
if [ "$WANT_SERVICE" = 1 ] && ! command -v systemctl >/dev/null 2>&1; then
  warn "  this machine has no systemd, so nothing can start it for you."
  warn "  start it yourself with: npm run start"
  WANT_SERVICE=0
fi

if [ "$WANT_SERVICE" = 1 ] && [ "$DRY_RUN" = 0 ]; then
  if [ "$USER_UNIT" = 1 ]; then UNIT_TARGET="default.target"; else UNIT_TARGET="multi-user.target"; fi
  RUN_AS=""
  if [ "$USER_UNIT" = 0 ]; then
    DIR_OWNER="$(stat -c '%U' "$APP_DIR" 2>/dev/null || true)"
    DIR_GROUP="$(stat -c '%G' "$APP_DIR" 2>/dev/null || true)"
    if [ -n "${DIR_OWNER:-}" ] && [ "$DIR_OWNER" != "root" ]; then
      RUN_AS="User=$DIR_OWNER
Group=$DIR_GROUP"
    fi
  fi
  # The full path to node, not the name. Under systemd there is no login
  # shell, so a node installed by nvm is not on the path and the service dies
  # at once with "node: not found".
  #
  # And the owner's node, not root's: when root installs this, the two can be
  # different versions, and the one that must run the app is the owner's.
  NODE_BIN="$(command -v node 2>/dev/null || true)"
  if [ -n "${FT_ROOT_SERVICE_ONLY:-}" ]; then
    OWNER_NODE="$(su - "$DIR_OWNER" -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; command -v node' 2>/dev/null || true)"
    [ -n "$OWNER_NODE" ] && NODE_BIN="$OWNER_NODE"
  fi
  [ -n "$NODE_BIN" ] || die "could not find node to run the service with."
  NEXT_BIN="$APP_DIR/node_modules/.bin/next"
  WEB_RUN_AS="$RUN_AS"
  WEB_HARDENING="NoNewPrivileges=yes
UMask=0077
MemoryHigh=1G
MemoryMax=1536M
CPUQuota=200%
TasksMax=128"
  if [ "$USER_UNIT" = 0 ]; then
    NODE_ROOT="$(dirname "$(dirname "$NODE_BIN")")"
    WEB_RUN_AS="DynamicUser=yes"
    WEB_HARDENING="$WEB_HARDENING
PrivateTmp=yes
PrivateDevices=yes
ProtectSystem=strict
ProtectHome=tmpfs
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
ProtectProc=invisible
RestrictSUIDSGID=yes
LockPersonality=yes
CapabilityBoundingSet=
CacheDirectory=$SERVICE_NAME
BindReadOnlyPaths=\"$APP_DIR\" \"$NODE_ROOT\" /dev/null:\"$APP_DIR/.env.local\"
BindPaths=/var/cache/$SERVICE_NAME:\"$APP_DIR/.next/cache\"
InaccessiblePaths=-\"$APP_DIR/.security-backups\" -\"$APP_DIR/.deployment-backups\" -\"$APP_DIR/.git\""
  fi
  # Two units, not one.
  #
  # The Explorer reads its screens from an index, and the index only stays
  # current while something keeps it so. Left alone it falls behind and the
  # Explorer serves a bounded recent window -- correct, and quietly not the
  # whole story. That refresher used to be started by the chain role, which
  # means an Explorer installed anywhere else never had one.
  INDEXER_UNIT_BODY="[Unit]
Description=FileTrust Explorer index refresher
Documentation=https://github.com/FileTrust/Explorer
After=network-online.target ${SERVICE_NAME}.service
Wants=network-online.target

[Service]
Type=simple
${RUN_AS:+$RUN_AS
}WorkingDirectory=$APP_DIR
NoNewPrivileges=yes
PrivateTmp=yes
MemoryMax=2G
CPUQuota=200%
TasksMax=256
Environment=NODE_ENV=production
Environment=INDEX_WATCH_INTERVAL_MS=60000
ExecStart=$NODE_BIN $APP_DIR/scripts/index_watch.mjs
Restart=always
RestartSec=10

[Install]
WantedBy=$UNIT_TARGET
"
  UNIT_BODY="[Unit]
Description=FileTrust Explorer
Documentation=https://github.com/FileTrust/Explorer
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=0

[Service]
Type=simple
${WEB_RUN_AS:+$WEB_RUN_AS
}WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
EnvironmentFile=$APP_DIR/.env.web
$WEB_HARDENING
ExecStart=$NODE_BIN $NEXT_BIN start --port $PORT_IN_USE --hostname $BIND_IN_USE
Restart=always
RestartSec=5

[Install]
WantedBy=$UNIT_TARGET
"
  say "Service"
  if [ "$USER_UNIT" = 1 ]; then
    UNIT_PATH="$HOME/.config/systemd/user/$SERVICE_NAME.service"
    mkdir -p "$(dirname "$UNIT_PATH")"
    printf '%s' "$UNIT_BODY" > "$UNIT_PATH"
    printf '%s' "$INDEXER_UNIT_BODY" > "$(dirname "$UNIT_PATH")/$INDEXER_SERVICE_NAME.service"
    systemctl --user daemon-reload
    systemctl --user enable --now "$SERVICE_NAME" >/dev/null 2>&1 \
      || warn "  could not enable it; see: systemctl --user status $SERVICE_NAME"
    systemctl --user enable --now "$INDEXER_SERVICE_NAME" >/dev/null 2>&1 \
      || warn "  the index refresher did not start; see: systemctl --user status $INDEXER_SERVICE_NAME"
    command -v loginctl >/dev/null 2>&1 && {
      loginctl enable-linger "$USER" >/dev/null 2>&1 \
        || sudo -n loginctl enable-linger "$USER" >/dev/null 2>&1 \
        || warn "  could not enable lingering; it will stop when you log out."
    }
    echo "  installed for $USER, starts at boot, restarts if it ever stops"
  else
    UNIT_PATH="/etc/systemd/system/$SERVICE_NAME.service"
    INDEXER_UNIT_PATH="/etc/systemd/system/$INDEXER_SERVICE_NAME.service"
    if [ "$(id -u)" = 0 ]; then
      printf '%s' "$UNIT_BODY" > "$UNIT_PATH"
      printf '%s' "$INDEXER_UNIT_BODY" > "$INDEXER_UNIT_PATH"
      systemctl daemon-reload
      systemctl enable --now "$SERVICE_NAME" >/dev/null 2>&1 \
        || warn "  could not enable it; see: systemctl status $SERVICE_NAME"
      systemctl enable --now "$INDEXER_SERVICE_NAME" >/dev/null 2>&1 \
        || warn "  the index refresher did not start; see: systemctl status $INDEXER_SERVICE_NAME"
    elif command -v sudo >/dev/null 2>&1; then
      printf '%s' "$UNIT_BODY" | sudo -n tee "$UNIT_PATH" >/dev/null 2>&1 \
        && printf '%s' "$INDEXER_UNIT_BODY" | sudo -n tee "$INDEXER_UNIT_PATH" >/dev/null 2>&1 \
        && sudo -n systemctl daemon-reload \
        && sudo -n systemctl enable --now "$SERVICE_NAME" >/dev/null 2>&1 \
        && sudo -n systemctl enable --now "$INDEXER_SERVICE_NAME" >/dev/null 2>&1 \
        || true
    else
      warn "  installing a machine-wide service needs root. Run this again as"
      warn "  root, or with --user to install it for $USER only."
      WANT_SERVICE=0
    fi
    # Say it is installed only if it is.
    if [ "$WANT_SERVICE" = 1 ] && [ -f "$UNIT_PATH" ]; then
      echo "  installed, starts at boot, restarts if it ever stops"
    elif [ "$WANT_SERVICE" = 1 ]; then
      warn "  NOT installed: writing $UNIT_PATH needs root, and this account"
      warn "  could not get it. Run this again as root, or use --user."
      WANT_SERVICE=0
    fi
  fi
fi

# ── Does it answer? ──────────────────────────────────────────────────────────
if [ "$WANT_SERVICE" = 1 ] && [ "$DRY_RUN" = 0 ]; then
  say "Checking it answers"
  ANSWERED=0
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
    if curl -fsS -m 3 "http://127.0.0.1:$PORT_IN_USE/" >/dev/null 2>&1; then
      ANSWERED=1; break
    fi
    sleep 2
  done
  if [ "$ANSWERED" = 1 ]; then
    echo "  http://127.0.0.1:$PORT_IN_USE/  (listening on $BIND_IN_USE)"
  else
    warn "  not answering yet. Check with:"
    if [ "$USER_UNIT" = 1 ]; then
      warn "      journalctl --user -u $SERVICE_NAME -n 40"
    else
      warn "      journalctl -u $SERVICE_NAME -n 40"
    fi
  fi
fi

if [ "$WANT_SERVICE" = 1 ] && [ "$USER_UNIT" = 0 ] && [ "$DRY_RUN" = 0 ]; then
  if [ "$(id -u)" = 0 ]; then
    python3 "$APP_DIR/network_config_refresh.py" --install-timer
  else
    warn "Enable hourly network checks: sudo python3 $APP_DIR/network_config_refresh.py --install-timer"
  fi
fi

say "Done"
if [ "$WANT_SERVICE" = 1 ] && [ "$USER_UNIT" = 1 ]; then
  echo "      systemctl --user status $SERVICE_NAME"
elif [ "$WANT_SERVICE" = 1 ]; then
  echo "      systemctl status $SERVICE_NAME"
else
  echo "      cd $APP_DIR && npm run start"
fi
