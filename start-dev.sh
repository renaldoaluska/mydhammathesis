#!/usr/bin/env bash
# ============================================================
# start-dev.sh — Jalankan semua service myDhamma dalam 1 tmux session
#
#   Window 0: web-eval  (port 5001 → eval.renaldo.my.id)
#   Window 1: web-md    (port 5002 → md.renaldo.my.id)
#   Window 2: cloudflared tunnel
#
# Pemakaian:
#   chmod +x start-dev.sh
#   ./start-dev.sh          # buat session baru
#   ./start-dev.sh stop     # kill session
#   ./start-dev.sh status   # cek apakah jalan
#
# Attach:  tmux attach -t mydhamma
# ============================================================

set -euo pipefail

SESSION="mydhamma"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$(dirname "$PROJECT_DIR")/venv"
ACTIVATE="source ${VENV_DIR}/bin/activate"
CLOUDFLARED="${PROJECT_DIR}/cloudflared"

# ── Warna log ────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log()  { echo -e "${GREEN}[mydhamma]${NC} $*"; }
warn() { echo -e "${YELLOW}[mydhamma]${NC} $*"; }
err()  { echo -e "${RED}[mydhamma]${NC} $*"; }

# ── stop: matikan session ────────────────────────────────────
if [[ "${1:-}" == "stop" ]]; then
    if tmux has-session -t "$SESSION" 2>/dev/null; then
        tmux kill-session -t "$SESSION"
        log "Session ${CYAN}${SESSION}${NC} dihentikan ✓"
    else
        warn "Session ${CYAN}${SESSION}${NC} tidak ditemukan."
    fi
    exit 0
fi

# ── status: cek apakah session hidup ─────────────────────────
if [[ "${1:-}" == "status" ]]; then
    if tmux has-session -t "$SESSION" 2>/dev/null; then
        log "Session ${CYAN}${SESSION}${NC} sedang berjalan ✓"
        echo ""
        tmux list-windows -t "$SESSION" -F "  #{window_index}: #{window_name} — #{pane_current_command}"
    else
        warn "Session ${CYAN}${SESSION}${NC} tidak aktif."
    fi
    exit 0
fi

# ── Cek prasyarat ────────────────────────────────────────────
if ! command -v tmux &>/dev/null; then
    err "tmux belum terinstall. Install dulu: sudo apt install tmux"
    exit 1
fi

if [[ ! -f "${VENV_DIR}/bin/activate" ]]; then
    err "Virtualenv tidak ditemukan di: ${VENV_DIR}"
    exit 1
fi

if [[ ! -x "$CLOUDFLARED" ]]; then
    err "cloudflared tidak ditemukan di: ${CLOUDFLARED}"
    exit 1
fi

# ── Kalau session sudah ada, langsung attach ─────────────────
if tmux has-session -t "$SESSION" 2>/dev/null; then
    warn "Session ${CYAN}${SESSION}${NC} sudah berjalan. Attach ke session..."
    echo ""
    echo -e "  ${CYAN}tmux attach -t ${SESSION}${NC}"
    echo ""
    echo -e "  Mau restart? Jalankan: ${YELLOW}./start-dev.sh stop && ./start-dev.sh${NC}"
    exit 0
fi

# ── Buat tmux session dengan 3 window ────────────────────────
log "Memulai session ${CYAN}${SESSION}${NC}..."

# Window 0: web-eval (port 5001)
tmux new-session -d -s "$SESSION" -n "web-eval" -c "$PROJECT_DIR"
tmux send-keys -t "${SESSION}:web-eval" \
    "${ACTIVATE} && echo '🔶 [web-eval] Starting on port 5001...' && python web-eval/eval_app.py" Enter

# Window 1: web-md (port 5002)
tmux new-window -t "$SESSION" -n "web-md" -c "$PROJECT_DIR"
tmux send-keys -t "${SESSION}:web-md" \
    "${ACTIVATE} && echo '🟢 [web-md] Starting on port 5002...' && python web-md/app.py" Enter

# Window 2: cloudflared tunnel
tmux new-window -t "$SESSION" -n "tunnel" -c "$PROJECT_DIR"
tmux send-keys -t "${SESSION}:tunnel" \
    "echo '🔵 [cloudflared] Starting tunnel...' && cloudflared tunnel run" Enter

# Pilih window pertama sebagai default
tmux select-window -t "${SESSION}:web-eval"

# ── Selesai ──────────────────────────────────────────────────
echo ""
log "Semua service berjalan! ✓"
echo ""
echo -e "  ${CYAN}┌─────────────────────────────────────────────────┐${NC}"
echo -e "  ${CYAN}│${NC}  Window 0: ${GREEN}web-eval${NC}    → localhost:5001          ${CYAN}│${NC}"
echo -e "  ${CYAN}│${NC}             ${YELLOW}eval.renaldo.my.id${NC}                 ${CYAN}│${NC}"
echo -e "  ${CYAN}│${NC}  Window 1: ${GREEN}web-md${NC}      → localhost:5002          ${CYAN}│${NC}"
echo -e "  ${CYAN}│${NC}             ${YELLOW}md.renaldo.my.id${NC}                   ${CYAN}│${NC}"
echo -e "  ${CYAN}│${NC}  Window 2: ${GREEN}tunnel${NC}      → cloudflared            ${CYAN}│${NC}"
echo -e "  ${CYAN}└─────────────────────────────────────────────────┘${NC}"
echo ""
echo -e "  Attach   : ${CYAN}tmux attach -t ${SESSION}${NC}"
echo -e "  Pindah   : ${CYAN}Ctrl+B lalu 0/1/2${NC}"
echo -e "  Detach   : ${CYAN}Ctrl+B lalu D${NC}"
echo -e "  Stop all : ${CYAN}./start-dev.sh stop${NC}"
echo ""
