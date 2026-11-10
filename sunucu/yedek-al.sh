#!/bin/sh
# Backup for installs without Docker (PM2/systemd + local PostgreSQL), run from cron:
#   */15 * * * * /bin/sh /home/sitetakip/sitetakipet/sunucu/yedek-al.sh /home/sitetakip/sitetakipet.env /var/backups/sitetakipet
# Reads DATABASE_URL from the env file, writes a verified custom-format dump with a
# .sha256 file, then applies the same retention as the Docker backup service.
set -eu
env_file=${1:?Kullanim: yedek-al.sh AYAR_DOSYASI YEDEK_KLASORU}
dir=${2:?Kullanim: yedek-al.sh AYAR_DOSYASI YEDEK_KLASORU}
here=$(cd "$(dirname "$0")" && pwd)
umask 077
[ -f "$env_file" ] || { echo "Ayar dosyasi yok: $env_file" >&2; exit 1; }
url=$(sed -n 's/^[[:space:]]*DATABASE_URL[[:space:]]*=[[:space:]]*//p' "$env_file" | tail -n 1)
url=${url%\"}; url=${url#\"}; url=${url%\'}; url=${url#\'}
[ -n "$url" ] || { echo "DATABASE_URL bulunamadi: $env_file" >&2; exit 1; }
retention=$(sed -n 's/^[[:space:]]*BACKUP_RETENTION_DAYS[[:space:]]*=[[:space:]]*//p' "$env_file" | tail -n 1)
# Optional dead-man switch (e.g. healthchecks.io): pinged after each backup, "/fail" on error.
ping=$(sed -n 's/^[[:space:]]*BACKUP_PING_URL[[:space:]]*=[[:space:]]*//p' "$env_file" | tail -n 1)
ping=${ping%\"}; ping=${ping#\"}
case "$ping" in ''|https://*|http://*) ;; *) echo 'BACKUP_PING_URL http(s) adresi olmali; bildirim atlandi.' >&2; ping='';; esac
notify() { [ -z "$ping" ] || curl -fsS -m 10 --retry 3 -o /dev/null "$ping$1" || echo 'Yedek bildirimi gonderilemedi.' >&2; }
mkdir -p "$dir"
# One backup at a time, even if a run takes longer than the cron interval.
exec 9>"$dir/.backup.lock"
flock -n 9 || { echo 'Onceki yedekleme hala suruyor; bu tur atlandi.' >&2; exit 0; }
name="depo_$(date -u +%Y%m%dT%H%M%SZ)_$$.dump"
temp="$dir/$name.partial"
status() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$1" >"$dir/STATUS.txt.next"; mv "$dir/STATUS.txt.next" "$dir/STATUS.txt"; }
fail() { rm -f "$temp"; status 'ERROR backup failed'; notify /fail; exit 1; }
trap fail HUP INT TERM
pg_dump --format=custom --no-owner --no-acl --file="$temp" --dbname="$url" || fail
pg_restore --list "$temp" >/dev/null || fail
mv "$temp" "$dir/$name"
(cd "$dir" && sha256sum "$name" >"$name.sha256")
status "OK $name"
echo "Yedek tamamlandi: $dir/$name"
notify ''
BACKUP_RETENTION_DAYS=${retention:-7} sh "$here/yedek-temizle.sh" "$dir" || echo 'Eski yedek temizligi yapilamadi; yedekler korunuyor.' >&2
