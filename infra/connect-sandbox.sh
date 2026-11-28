#!/usr/bin/env bash
# Connecte NkapLingua à la sandbox SAFINUM.
#   1. vérifie la clé d'équipe et affiche le PASS du simulateur
#   2. démarre la pile Docker (sauf --no-docker : gateway déjà lancé sur le port 8080)
#   3. ouvre un tunnel public cloudflared vers le gateway
#   4. vérifie que le tunnel atteint bien le gateway
#   5. déclare https://<tunnel>/hook/<HOOK_SECRET> pour les six canaux
#   6. relit la configuration enregistrée par la sandbox
#
# Usage : bash infra/connect-sandbox.sh [--no-docker]
# Prérequis : infra/.env rempli (SAFINUM_TEAM_KEY, HOOK_SECRET, STUDIO_SECRET, SEED_PASSWORD),
#             cloudflared, curl, node. Laisser ce terminal ouvert : le fermer coupe le tunnel.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/infra/.env"
API="https://safinum.cm/api/v1"
PORT=8080
CHANNELS=(ussd sms ivr mobile web atm)
USE_DOCKER=1
[ "${1:-}" = "--no-docker" ] && USE_DOCKER=0

die() { echo "ERREUR : $*" >&2; exit 1; }
step() { echo; echo "==> $*"; }

# Affiche un JSON lisible, en masquant la clé d'équipe si elle y figure.
pretty() { node -e '
  let s = ""; process.stdin.on("data", (c) => (s += c)).on("end", () => {
    try {
      const mask = (o) => Array.isArray(o) ? o.map(mask) : o && typeof o === "object"
        ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, /key|secret|token/i.test(k) ? "<masqué>" : mask(v)])) : o;
      console.log(JSON.stringify(mask(JSON.parse(s)), null, 2));
    } catch { console.log(s); }
  });'; }

for tool in curl node cloudflared; do command -v "$tool" >/dev/null || die "$tool est introuvable. Installez-le puis relancez."; done
[ -f "$ENV_FILE" ] || die "$ENV_FILE manquant : cp infra/.env.example infra/.env puis remplissez-le."
set -a; source "$ENV_FILE"; set +a
[ -n "${SAFINUM_TEAM_KEY:-}" ] || die "SAFINUM_TEAM_KEY est vide dans infra/.env."
[ "${#HOOK_SECRET}" -ge 24 ] 2>/dev/null || die "HOOK_SECRET doit faire au moins 24 caractères (openssl rand -hex 24)."
case "${SAFINUM_BANK_URL:-https://safinum.cm/api/v1}" in
  https://safinum.cm/*) ;;
  *) die "SAFINUM_BANK_URL pointe vers ${SAFINUM_BANK_URL} : pour la vraie sandbox, laissez-la vide ou mettez https://safinum.cm/api/v1." ;;
esac

step "1. Vérification de la clé d'équipe"
CODE=$(curl -s -o /tmp/nkap-endpoint.json -w '%{http_code}' -H "X-Team-Key: $SAFINUM_TEAM_KEY" -H 'Accept: application/json' "$API/sandbox/endpoint")
[ "$CODE" = "200" ] || { cat /tmp/nkap-endpoint.json; echo; die "clé refusée (HTTP $CODE). Demandez une clé valide au jury."; }
echo "Clé acceptée. Configuration actuelle (le PASS du simulateur y figure) :"
pretty < /tmp/nkap-endpoint.json

if [ "$USE_DOCKER" = "1" ]; then
  step "2. Démarrage de la pile Docker"
  docker compose -f "$ROOT/infra/docker-compose.yml" --env-file "$ENV_FILE" up -d --build
else
  step "2. Pile Docker ignorée (--no-docker)"
fi

echo "Attente du gateway sur le port $PORT..."
for _ in $(seq 1 60); do curl -sf "http://127.0.0.1:$PORT/health" >/dev/null && break; sleep 2; done
curl -sf "http://127.0.0.1:$PORT/health" >/dev/null || die "le gateway ne répond pas sur http://127.0.0.1:$PORT/health"
echo "Gateway prêt."

step "3. Ouverture du tunnel public"
LOG=$(mktemp)
cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:$PORT" >"$LOG" 2>&1 &
TUNNEL_PID=$!
trap 'echo; echo "Fermeture du tunnel."; kill $TUNNEL_PID 2>/dev/null || true' EXIT
TUNNEL=""
for _ in $(seq 1 45); do
  TUNNEL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1 || true)
  [ -n "$TUNNEL" ] && break; sleep 1
done
[ -n "$TUNNEL" ] || { tail -20 "$LOG"; die "cloudflared n'a pas fourni d'URL."; }
echo "Tunnel : $TUNNEL"

step "4. Vérification du tunnel"
for _ in $(seq 1 30); do curl -sf "$TUNNEL/health" >/dev/null && break; sleep 2; done
curl -sf "$TUNNEL/health" >/dev/null || die "le tunnel n'atteint pas le gateway ($TUNNEL/health)."
echo "Le tunnel atteint le gateway."

HOOK_URL="$TUNNEL/hook/$HOOK_SECRET"
step "5. Déclaration de l'URL secrète sur les six canaux"
for ch in "${CHANNELS[@]}"; do
  CODE=$(curl -s -o /tmp/nkap-declare.json -w '%{http_code}' -X POST "$API/sandbox/endpoint" \
    -H "X-Team-Key: $SAFINUM_TEAM_KEY" -H 'Content-Type: application/json' -H 'Accept: application/json' \
    -d "{\"channel\":\"$ch\",\"url\":\"$HOOK_URL\"}")
  if [ "$CODE" = "200" ] || [ "$CODE" = "201" ]; then echo "  $ch : déclaré"
  else echo "  $ch : ÉCHEC (HTTP $CODE) $(cat /tmp/nkap-declare.json)"; fi
done

step "6. Configuration enregistrée par la sandbox"
curl -s -H "X-Team-Key: $SAFINUM_TEAM_KEY" -H 'Accept: application/json' "$API/sandbox/endpoint" | pretty

cat <<EOF

Prêt. Testez dans les simulateurs (équipe « shun and Co », PASS ci-dessus, un compte de test) :
  USSD   https://safinum.cm/sandbox/ussd
  Mobile https://safinum.cm/sandbox/channel/mobile
  Web    https://safinum.cm/sandbox/channel/web
  SMS    https://safinum.cm/sandbox/sms
  GAB    https://safinum.cm/sandbox/atm
  Vocal  https://safinum.cm/sandbox/ivr

Journal en direct du gateway : docker compose -f infra/docker-compose.yml logs -f gateway
Laissez ce terminal ouvert ; Ctrl+C ferme le tunnel (il faudra alors relancer ce script).
EOF
wait "$TUNNEL_PID"
