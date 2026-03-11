#!/bin/bash

# PP Dice Plesk Deployment Script
# Features:
# - Automatische Node.js-Pfaderkennung (nodenv, Plesk, NVM)
# - Rollback bei Build-Fehler
# - Automatische Backups mit Cleanup
# - Zero-Downtime Build (Staging-Verzeichnis)
# - Conditional npm install (Hash-basiert)

set -eo pipefail

DEPLOY_START=$(date +%s)

# =============================================================================
# KONFIGURATION
# =============================================================================
APP_DIR="${APP_DIR:?APP_DIR must be set (e.g. /var/www/vhosts/example.com/httpdocs)}"
LOG_DIR="${APP_DIR}/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/deploy-$(date +%Y%m%d-%H%M%S).log"
KEEP_LOGS="${KEEP_LOGS:-10}"
KEEP_BACKUPS="${KEEP_BACKUPS:-3}"
USE_PASSENGER="${USE_PASSENGER:-true}"

# =============================================================================
# NODE.JS PFADERKENNUNG
# =============================================================================
VHOST_BASE=$(echo "$APP_DIR" | grep -oP '/var/www/vhosts/[^/]+' 2>/dev/null || echo "")

if [ -n "$VHOST_BASE" ] && [ -d "$VHOST_BASE/.nodenv/shims" ]; then
    export PATH="$VHOST_BASE/.nodenv/shims:$PATH"
elif SHARED_NODENV=$(find /var/www/vhosts -maxdepth 2 -path "*/.nodenv/shims" 2>/dev/null | head -1) && [ -n "$SHARED_NODENV" ]; then
    export PATH="$SHARED_NODENV:$PATH"
elif NODENV_PATH=$(find /var/www/vhosts -maxdepth 2 -type d -name ".nodenv" 2>/dev/null | head -1) && [ -n "$NODENV_PATH" ]; then
    export PATH="$NODENV_PATH/shims:$PATH"
elif [ -d "/opt/plesk/node/20/bin" ]; then
    export PATH="/opt/plesk/node/20/bin:$PATH"
elif [ -d "/opt/plesk/node/18/bin" ]; then
    export PATH="/opt/plesk/node/18/bin:$PATH"
elif [ -d "$HOME/.nvm" ]; then
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
fi

if ! command -v node &> /dev/null; then
    echo "FATAL: Node.js not found in PATH!"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "FATAL: npm not found in PATH!"
    exit 1
fi

# =============================================================================
# LOGGING
# =============================================================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date '+%H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"; }
error() { echo -e "${RED}[$(date '+%H:%M:%S')] ERROR:${NC} $1" | tee -a "$LOG_FILE"; }
warning() { echo -e "${YELLOW}[$(date '+%H:%M:%S')] WARNING:${NC} $1" | tee -a "$LOG_FILE"; }
info() { echo -e "${BLUE}[$(date '+%H:%M:%S')] INFO:${NC} $1" | tee -a "$LOG_FILE"; }

# =============================================================================
# ROLLBACK
# =============================================================================
BACKUP_DIR=""

rollback() {
    echo ""
    error "!!! DEPLOYMENT FEHLGESCHLAGEN !!!"

    if [ -n "$BACKUP_DIR" ] && [ -d "$BACKUP_DIR" ]; then
        warning "Stelle Backup wieder her von: $BACKUP_DIR"

        if [ -d "$BACKUP_DIR/next" ]; then
            rm -rf .next .next-staging .next-old 2>/dev/null || true
            mv "$BACKUP_DIR/next" .next
            log "Backup .next/ wiederhergestellt"
        fi

        if [ -d "$BACKUP_DIR/dist" ]; then
            rm -rf dist 2>/dev/null || true
            mv "$BACKUP_DIR/dist" dist
            log "Backup dist/ wiederhergestellt"
        fi

        rm -rf "$BACKUP_DIR"

        if [ "$USE_PASSENGER" = "true" ]; then
            mkdir -p tmp && touch tmp/restart.txt
        fi

        warning "Rollback abgeschlossen"
    else
        error "Kein Backup verfügbar für Rollback!"
    fi

    exit 1
}

trap rollback ERR

# =============================================================================
# BACKUP
# =============================================================================
create_backup() {
    BACKUP_DIR="${APP_DIR}/.backup-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$BACKUP_DIR"

    if [ -d ".next" ]; then
        cp -r .next "$BACKUP_DIR/next"
    fi
    if [ -d "dist" ]; then
        cp -r dist "$BACKUP_DIR/dist"
    fi

    log "Backup erstellt: $BACKUP_DIR"
}

cleanup_old_backups() {
    cd "$APP_DIR"
    BACKUPS=($(ls -dt .backup-* 2>/dev/null || true))
    if [ "${#BACKUPS[@]}" -gt "$KEEP_BACKUPS" ]; then
        for ((i=KEEP_BACKUPS; i<${#BACKUPS[@]}; i++)); do
            rm -rf "${BACKUPS[$i]}"
        done
        log "$((${#BACKUPS[@]} - KEEP_BACKUPS)) alte Backups gelöscht"
    fi
}

# =============================================================================
# HAUPTPROGRAMM
# =============================================================================

if [ ! -d "$APP_DIR" ]; then
    error "App directory $APP_DIR does not exist!"
    exit 1
fi

cd "$APP_DIR" || { error "Cannot change to app directory"; exit 1; }

# Deployment Lock
LOCK_FILE="${APP_DIR}/.deploy.lock"
if [ -f "$LOCK_FILE" ]; then
    LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
    LOCK_AGE=$(( $(date +%s) - $(stat -c %Y "$LOCK_FILE" 2>/dev/null || stat -f %m "$LOCK_FILE" 2>/dev/null || echo "0") ))
    if [ "$LOCK_AGE" -gt 1800 ]; then
        warning "Stale lock detected (${LOCK_AGE}s old) - removing"
        rm -f "$LOCK_FILE"
    elif [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
        error "Another deployment is running (PID: $LOCK_PID)"
        exit 0
    else
        rm -f "$LOCK_FILE"
    fi
fi

echo "$$" > "$LOCK_FILE"
cleanup_lock() { rm -f "$LOCK_FILE"; }
trap 'cleanup_lock' EXIT

# Alte Logs bereinigen
LOG_FILES=($(ls -t "$LOG_DIR"/deploy-*.log 2>/dev/null || true))
if [ "${#LOG_FILES[@]}" -gt "$KEEP_LOGS" ]; then
    for ((i=KEEP_LOGS; i<${#LOG_FILES[@]}; i++)); do
        rm -f "${LOG_FILES[$i]}"
    done
fi

# .env.local laden
if [ -f ".env.local" ]; then
    set -a; source .env.local; set +a
    info "Umgebungsvariablen aus .env.local geladen"
fi

export NEXT_TELEMETRY_DISABLED=1

log "========================================"
log "PP Dice Deployment"
log "========================================"
log "Node.js: $(node -v)"
log "npm: $(npm -v)"

# Alte Backups bereinigen & neues Backup erstellen
cleanup_old_backups
create_backup

# =============================================================================
# DEPENDENCIES (conditional)
# =============================================================================
LOCKFILE_HASH_FILE="${APP_DIR}/.last-lockfile-hash"
CURRENT_LOCKFILE_HASH=$(md5sum package-lock.json 2>/dev/null | cut -d' ' -f1 || md5 -q package-lock.json 2>/dev/null || echo "unknown")
LAST_LOCKFILE_HASH=$(cat "$LOCKFILE_HASH_FILE" 2>/dev/null || echo "none")

if [ "$CURRENT_LOCKFILE_HASH" != "$LAST_LOCKFILE_HASH" ]; then
    log "Dependencies changed - installing..."
    npm install 2>&1 | tee -a "$LOG_FILE"
    echo "$CURRENT_LOCKFILE_HASH" > "$LOCKFILE_HASH_FILE"
else
    log "Dependencies unchanged - skipping npm install"
fi

# =============================================================================
# BUILD SERVER (TypeScript -> dist/)
# =============================================================================
log "Building server (TypeScript)..."
npm run build:server 2>&1 | tee -a "$LOG_FILE"

# =============================================================================
# BUILD NEXT.JS (Zero-Downtime)
# =============================================================================
log "Building Next.js (staging)..."

rm -rf .next-staging 2>/dev/null || true

# Build-Cache übernehmen
if [ -d ".next/cache" ]; then
    mkdir -p .next-staging
    cp -r .next/cache .next-staging/cache
    log "Build-Cache übernommen"
fi

NEXT_BUILD_DIR=".next-staging" npm run build:next 2>&1 | tee -a "$LOG_FILE"

log "Build completed"

# =============================================================================
# ATOMISCHER SWAP
# =============================================================================
log "Swapping build directories..."

if [ -d ".next" ]; then
    mv .next .next-old
fi
mv .next-staging .next
rm -rf .next-old 2>/dev/null || true

log "Build swap completed"

# =============================================================================
# APP NEUSTARTEN
# =============================================================================
log "Restarting application..."

if [ "$USE_PASSENGER" = "true" ]; then
    mkdir -p tmp && touch tmp/restart.txt
    log "Passenger restart signalisiert"
fi

# =============================================================================
# ERFOLG
# =============================================================================
trap - ERR

DEPLOY_END=$(date +%s)
DEPLOY_DURATION=$((DEPLOY_END - DEPLOY_START))
DEPLOY_MINUTES=$((DEPLOY_DURATION / 60))
DEPLOY_SECONDS=$((DEPLOY_DURATION % 60))

log "========================================"
log "Deployment successful!"
log "Duration: ${DEPLOY_MINUTES}m ${DEPLOY_SECONDS}s"
log "========================================"
