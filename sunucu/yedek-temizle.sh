#!/bin/sh
# Rolling retention. Never prune without a recent, checksum-verified backup.
set -eu
dir=${1:-/backups}
days=${BACKUP_RETENTION_DAYS:-7}
now=${BACKUP_NOW:-$(date -u +%s)}
case "$days" in ''|*[!0-9]*) echo 'Gecersiz BACKUP_RETENTION_DAYS.' >&2; exit 1;; esac
case "$now" in ''|*[!0-9]*) echo 'Gecersiz BACKUP_NOW.' >&2; exit 1;; esac
[ "${#days}" -le 4 ] && [ "$days" -ge 1 ] && [ "$days" -le 3650 ] || exit 1
[ "${#now}" -le 10 ] || exit 1
[ -d "$dir" ] && [ ! -L "$dir" ] || exit 1
lifetime=$((days * 86400))
created_at() {
  stamp=${1#depo_}; stamp=${stamp%%_*}
  day=${stamp%%T*}
  clock=$(printf '%s' "${stamp#*T}" | sed 's/^\(..\)\(..\)\(..\)Z$/\1:\2:\3/')
  date -u -d "$day $clock" +%s
}
files=$(ls -1 "$dir" | grep -E '^depo_[0-9]{8}T[0-9]{6}Z_[0-9]+\.dump$' | sort -r)
verified=''
for file in $files; do
  [ -f "$dir/$file.sha256" ] || continue
  [ ! -L "$dir/$file" ] && [ ! -L "$dir/$file.sha256" ] || exit 1
  created=$(created_at "$file") || exit 1
  age=$((now - created))
  [ "$age" -ge 0 ] || continue
  [ "$age" -lt "$lifetime" ] || break
  expected=$(awk 'NR==1 {print $1}' "$dir/$file.sha256")
  case "$expected" in ''|*[!a-f0-9]*) exit 1;; esac
  [ "${#expected}" = 64 ] || exit 1
  actual=$(sha256sum "$dir/$file" | awk '{print $1}')
  [ "$actual" = "$expected" ] || { echo 'Son yedek dogrulanamadi; temizlik durduruldu.' >&2; exit 1; }
  verified=$file
  break
done
[ -n "$verified" ] || { echo 'Guncel dogrulanmis yedek yok; eski yedekler korundu.' >&2; exit 1; }
removed=0
for file in $files; do
  [ -f "$dir/$file.sha256" ] || continue
  [ ! -L "$dir/$file" ] && [ ! -L "$dir/$file.sha256" ] || exit 1
  created=$(created_at "$file") || exit 1
  if [ $((now - created)) -ge "$lifetime" ]; then
    # Old update markers no longer exempt snapshots from retention.
    rm -f "$dir/$file" "$dir/$file.sha256" "$dir/$file.keep"
    removed=$((removed + 1))
  fi
done
find "$dir" -maxdepth 1 -type f -name 'depo_*.dump.partial' -mmin +$((days * 1440)) -exec rm -f {} +
echo "Yedek temizligi: $removed eski yedek silindi; saklama $days gun."
