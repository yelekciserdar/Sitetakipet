#!/bin/sh
# Off-site copy of the newest verified backup with rclone (Google Drive, S3, R2...), run daily from cron:
#   30 3 * * * /bin/sh /home/sitetakip/sitetakipet/sunucu/yedek-uzak.sh /home/sitetakip/sitetakipet.env /var/backups/sitetakipet
# Env file: BACKUP_RCLONE_REMOTE=gdrive:envantertakipet-yedek (required), BACKUP_OFFSITE_DAYS (default 30),
# BACKUP_OFFSITE_PING_URL (optional dead-man switch, "/fail" on error).
set -eu
env_file=${1:?Kullanim: yedek-uzak.sh AYAR_DOSYASI YEDEK_KLASORU}
dir=${2:?Kullanim: yedek-uzak.sh AYAR_DOSYASI YEDEK_KLASORU}
[ -f "$env_file" ] || { echo "Ayar dosyasi yok: $env_file" >&2; exit 1; }
setting() { v=$(sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$env_file" | tail -n 1); v=${v%\"}; v=${v#\"}; v=${v%\'}; v=${v#\'}; printf '%s' "$v"; }
remote=$(setting BACKUP_RCLONE_REMOTE)
days=$(setting BACKUP_OFFSITE_DAYS); days=${days:-30}
ping=$(setting BACKUP_OFFSITE_PING_URL)
case "$ping" in ''|https://*|http://*) ;; *) echo 'BACKUP_OFFSITE_PING_URL http(s) adresi olmali; bildirim atlandi.' >&2; ping='';; esac
notify() { [ -z "$ping" ] || curl -fsS -m 10 --retry 3 -o /dev/null "$ping$1" || echo 'Bildirim gonderilemedi.' >&2; }
status() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$1" >"$dir/OFFSITE_STATUS.txt.next"; mv "$dir/OFFSITE_STATUS.txt.next" "$dir/OFFSITE_STATUS.txt"; }
fail() { echo "$1" >&2; [ ! -d "$dir" ] || status "ERROR $1"; notify /fail; exit 1; }
case "$remote" in
  *..*|*[!A-Za-z0-9_.:/-]*) fail 'BACKUP_RCLONE_REMOTE gecersiz karakter iceriyor.';;
  [A-Za-z0-9_-]*:*) ;;
  *) fail 'BACKUP_RCLONE_REMOTE gerekli; ornek: gdrive:envantertakipet-yedek';;
esac
remote=${remote%/}
case "$days" in ''|*[!0-9]*) fail 'BACKUP_OFFSITE_DAYS sayi olmali.';; esac
[ "$days" -ge 2 ] && [ "$days" -le 3650 ] || fail 'BACKUP_OFFSITE_DAYS 2-3650 arasi olmali.'
[ -d "$dir" ] && [ ! -L "$dir" ] || fail "Yedek klasoru yok: $dir"
command -v rclone >/dev/null || fail 'rclone kurulu degil.'

# Newest complete backup (the checksum is written last); a checksum mismatch is an error, not a skip.
file=''
for f in $(ls -1 "$dir" | grep -E '^depo_[0-9]{8}T[0-9]{6}Z_[0-9]+\.dump$' | sort -r); do
  [ -f "$dir/$f.sha256" ] || continue
  expected=$(awk 'NR==1 {print $1}' "$dir/$f.sha256")
  actual=$(sha256sum "$dir/$f" | awk '{print $1}')
  [ "$actual" = "$expected" ] || fail "Yerel yedek bozuk: $f"
  file=$f
  break
done
[ -n "$file" ] || fail 'Dogrulanmis yerel yedek bulunamadi.'

# rclone copyto checks size and, where the remote supports it, the hash of every upload.
rclone copyto "$dir/$file" "$remote/$file" || fail "Yukleme basarisiz: $file"
rclone copyto "$dir/$file.sha256" "$remote/$file.sha256" || fail "Yukleme basarisiz: $file.sha256"
rclone lsf "$remote/" --include "$file" | grep -qx "$file" || fail "Yuklenen dosya uzakta gorunmuyor: $file"
status "OK $file"
echo "Uzak kopya tamamlandi: $remote/$file"
notify ''
# Only after a successful upload: drop remote copies older than the retention period.
rclone delete "$remote/" --min-age "${days}d" --include 'depo_*.dump' --include 'depo_*.dump.sha256' \
  || echo 'Eski uzak kopyalar temizlenemedi; kopyalar korunuyor.' >&2
