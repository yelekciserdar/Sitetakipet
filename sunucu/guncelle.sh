#!/bin/sh
# SiteTakipEt canlı güncelleme. GitHub Actions SSH ile "zorunlu komut" olarak çalıştırır:
#   restrict,command="/bin/sh /home/sitetakip/sitetakipet/sunucu/guncelle.sh" ssh-ed25519 AAAA... github-actions
# İstemci yalnız testten geçmiş commit kimliğini (ya da elle geri dönüş için "onceki") gönderir;
# gerisine bu betik karar verir: commit origin/main üzerinde mi, veritabanı değişikliğinin gerisine
# dönülüyor mu, önce yedek, sonra kod, npm ci, PM2 yeniden başlatma, sağlık kontrolü.
# Yeni sürüm açılmazsa önceki commit'e döner. (EnvanterTakipEt'in deploy-live.sh'ından uyarlandı.)
set -eu
# Depo (ve bu dosya) çalışma sırasında değişir; özel bir kopyadan çalış.
if [ -z "${DEPLOY_SELF_COPY:-}" ]; then
  copy=$(mktemp)
  cp "$0" "$copy"
  DEPLOY_SELF_COPY=$copy exec sh "$copy" "$@"
fi
trap 'rm -f "$DEPLOY_SELF_COPY"' EXIT

home=${HOME:?HOME tanimli degil}
app=${DEPLOY_APP_DIR:-$home/sitetakipet}
env_file=${DEPLOY_ENV_FILE:-$home/sitetakipet.env}
backup_dir=${DEPLOY_BACKUP_DIR:-/var/backups/sitetakipet}
node_bin=${DEPLOY_NODE_BIN:-/opt/node-v22.23.4/bin}
pm2_name=${DEPLOY_PM2_NAME:-sitetakipet}
health=${DEPLOY_HEALTH_URL:-http://127.0.0.1:3003/api/saglik}
npm=${DEPLOY_NPM:-npm}
pm2=${DEPLOY_PM2:-pm2}
PATH=$node_bin:/usr/local/bin:/usr/bin:/bin
export PATH

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }
fail() { log "HATA: $*" >&2; exit 1; }

sha=${1:-${SSH_ORIGINAL_COMMAND:-}}
if [ "$sha" != onceki ]; then
  case "$sha" in *[!0-9a-f]*|'') fail 'Gecersiz commit kimligi.';; esac
  [ "${#sha}" = 40 ] || fail 'Commit kimligi 40 karakter olmali.'
fi

exec 9>"$home/.sitetakipet-guncelle.lock"
flock -n 9 || fail 'Baska bir guncelleme suruyor.'

cd "$app"
git fetch -q origin main
previous=$(git rev-parse HEAD)
if [ "$sha" = onceki ]; then
  sha=$(git rev-parse --verify -q "$previous^1") || fail 'Canli surumden onceki commit bulunamadi.'
  log "Elle geri donus istendi: $previous -> $sha"
fi
git merge-base --is-ancestor "$sha" origin/main || fail "Commit origin/main uzerinde degil: $sha"
if [ "$previous" = "$sha" ]; then log "Zaten guncel: $sha"; exit 0; fi
# Geri dönüş, eski kodun tanımadığı bir veritabanı şemasında bırakmamalı.
if git merge-base --is-ancestor "$sha" "$previous"; then
  yeni=$(git diff --name-only --diff-filter=A "$sha" "$previous" -- migrations)
  [ -z "$yeni" ] || fail "Geri donus durduruldu: bu surumden sonra veritabani degisikligi var ($(echo $yeni | tr '\n' ' ')). Hicbir sey degismedi; yedekten donus gerekir."
fi

healthy() {
  i=0
  while [ "$i" -lt "${DEPLOY_HEALTH_TRIES:-30}" ]; do
    if curl -fsS -m 3 "$health" 2>/dev/null | grep -q '"durum":"ok"'; then return 0; fi
    i=$((i + 1)); sleep 1
  done
  return 1
}
switch_to() {
  git checkout -q -f -B main "$1" &&
    "$npm" ci --omit=dev --no-audit --no-fund &&
    "$pm2" restart "$pm2_name" >/dev/null
}

if [ "${DEPLOY_BACKUP:-1}" = 1 ]; then
  sh "$app/sunucu/yedek-al.sh" "$env_file" "$backup_dir" || fail 'Guncelleme oncesi yedek alinamadi; hicbir sey degismedi.'
fi

log "Guncelleniyor: ${previous} -> ${sha}"
if switch_to "$sha" && healthy; then
  "$pm2" save >/dev/null 2>&1 || true
  log "GUNCELLEME BASARILI: $sha"
  exit 0
fi

log "Yeni surum saglikli acilmadi; onceki surume donuluyor: $previous" >&2
if switch_to "$previous" && healthy; then
  fail "Geri donus basarili. Canli surum: $previous"
fi
fail 'GERI DONUS DA BASARISIZ. Sunucuya baglanip "sudo -u sitetakip -H pm2 logs sitetakipet" ile kontrol edin.'
