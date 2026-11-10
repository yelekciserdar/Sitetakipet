#!/bin/sh
# SiteTakipEt'i EnvanterTakipEt'in çalıştığı sunucuya kurar (Docker'sız: PM2 + yerel PostgreSQL + nginx).
# root olarak çalıştırılır; her adım tekrar çalıştırılabilir (var olanı bozmaz, atlar):
#   sh kur.sh kontrol      yalnız denetler, hiçbir şey değiştirmez (varsayılan)
#   sh kur.sh kur          kullanıcı, veritabanı, program, PM2, nginx (HTTP), yedek zamanlaması
#   sh kur.sh ci-anahtar   GitHub'ın otomatik güncelleme anahtarını üretir ve bir kez ekrana yazar
#   sh kur.sh sertifika    DNS kayıtları (gri bulut) sunucuyu gösterince Let's Encrypt sertifikası
# Düzen: kullanıcı "sitetakip" (sudo yok), kod /home/sitetakip/sitetakipet, ayarlar
# /home/sitetakip/sitetakipet.env (yalnız o kullanıcı okur), PM2 süreci "sitetakipet" 127.0.0.1:3003,
# sitetakipet.com.tr ve www → tanitim/ klasörü, panel.sitetakipet.com.tr → program.
# Gizli değerler (veritabanı parolası, VERI_ANAHTARI) sunucuda üretilir ve yalnız ayar dosyasına yazılır.
set -eu
mod=${1:-kontrol}
u=${KUR_KULLANICI:-sitetakip}
h=/home/$u
app=$h/sitetakipet
env_file=$h/sitetakipet.env
basla=$h/sitetakipet-baslat.sh
repo=${KUR_DEPO:-https://github.com/yelekciserdar/Sitetakipet.git}
dal=${KUR_DAL:-main}
db=${KUR_VERITABANI:-sitetakipet}
port=${KUR_PORT:-3003}
node_bin=${KUR_NODE_BIN:-/opt/node-v22.23.4/bin}
pm2_name=sitetakipet
# SiteTakipEt'in kendi PM2'si (EnvanterTakipEt'in PM2'sinden bağımsız; ona dokunmaz).
pm2_dir=${KUR_PM2_DIR:-/opt/pm2-sitetakip}
pm2_surum=${KUR_PM2_SURUM:-6}
backup_dir=/var/backups/sitetakipet
alan=sitetakipet.com.tr
nginx_conf=/etc/nginx/sites-available/sitetakipet
PATH=$node_bin:$pm2_dir/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH
cd /

say() { printf '%s\n' "$*"; }
ok() { say "  [tamam] $*"; }
warn() { say "  [UYARI] $*"; }
die() { say "HATA: $*" >&2; exit 1; }
as_u() { runuser -u "$u" -- env HOME="$h" USER="$u" LOGNAME="$u" PATH="$PATH" "$@"; }
as_pg() { runuser -u postgres -- "$@"; }
saglikli() {
  i=0
  while [ "$i" -lt "${1:-30}" ]; do
    if curl -fsS -m 3 "http://127.0.0.1:$port/api/saglik" 2>/dev/null | grep -q '"durum":"ok"'; then return 0; fi
    i=$((i + 1)); sleep 1
  done
  return 1
}
sunucu_ip() { hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | grep -vE '^(10|127|172\.(1[6-9]|2[0-9]|3[01])|192\.168)\.' | head -n 1; }

[ "$(id -u)" = 0 ] || die 'Bu betik root olarak calistirilmali (sudo sh kur.sh ...).'

denetle() {
  say 'Denetim:'
  sorun=0
  [ -x "$node_bin/node" ] && ok "Node $("$node_bin/node" -v) ($node_bin)" || { warn "Node bulunamadi: $node_bin"; sorun=1; }
  [ -x "$pm2_dir/bin/pm2" ] && ok "PM2 kurulu ($pm2_dir)" || say "  [ ] PM2 yok (kur adiminda $pm2_dir altina kurulur; EnvanterTakipEt'in PM2'sine dokunulmaz)"
  command -v psql >/dev/null && as_pg psql -tAc 'SELECT 1' >/dev/null 2>&1 && ok "PostgreSQL calisiyor (kapi $(as_pg psql -tAc 'SHOW port'))" || { warn 'PostgreSQL calismiyor ya da yok.'; sorun=1; }
  command -v nginx >/dev/null && ok 'nginx kurulu' || { warn 'nginx yok.'; sorun=1; }
  command -v certbot >/dev/null && ok 'certbot kurulu' || warn 'certbot yok; "sertifika" adiminda kurulur (apt install certbot python3-certbot-nginx).'
  command -v git >/dev/null && ok 'git kurulu' || { warn 'git yok.'; sorun=1; }
  if command -v ss >/dev/null && ss -ltn "sport = :$port" | grep -q LISTEN; then
    if id "$u" >/dev/null 2>&1 && [ -f "$env_file" ]; then ok "Kapi $port kullanimda (SiteTakipEt calisiyor olabilir)"; else warn "Kapi $port baska bir program tarafindan kullaniliyor; KUR_PORT ile baska kapi secin."; sorun=1; fi
  else ok "Kapi $port bos"; fi
  id "$u" >/dev/null 2>&1 && ok "Kullanici $u var" || say "  [ ] Kullanici $u yok (kur adiminda acilir)"
  [ -d "$app/.git" ] && ok "Kod $app ($(as_u git -C "$app" rev-parse --short HEAD))" || say "  [ ] Kod yok (kur adiminda indirilir)"
  [ -f "$env_file" ] && ok "Ayar dosyasi $env_file" || say "  [ ] Ayar dosyasi yok (kur adiminda uretilir)"
  as_pg psql -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" 2>/dev/null | grep -q 1 && ok "Veritabani $db var" || say "  [ ] Veritabani $db yok (kur adiminda acilir)"
  [ -f "$nginx_conf" ] && ok "nginx ayari $nginx_conf" || say "  [ ] nginx ayari yok (kur adiminda yazilir)"
  if saglikli 1; then ok "Program yanit veriyor (127.0.0.1:$port)"; else say "  [ ] Program yanit vermiyor"; fi
  [ -f /etc/nginx/conf.d/cloudflare-gercek-ip.conf ] && ok 'Cloudflare gercek IP ayari var (EnvanterTakipEt ile ortak)' || warn 'Cloudflare gercek IP ayari yok; giris kilidi icin onerilir (EnvanterTakipEt DURUM.md, 20 Ekim).'
  [ -f /home/envanter/.config/rclone/rclone.conf ] && ok 'EnvanterTakipEt rclone ayari bulundu (uzak yedek icin kopyalanacak)' || warn 'rclone ayari bulunamadi; uzak (Drive) yedek sonra kurulur.'
  return $sorun
}

kur() {
  denetle || die 'Denetimde eksik var; once yukaridaki UYARI satirlarini giderin.'
  say ''
  say 'Kurulum:'
  # 1) Ayrı sistem kullanıcısı (sudo yetkisi yok): programdaki bir açık sunucunun tamamını ele geçiremez.
  if ! id "$u" >/dev/null 2>&1; then useradd -m -s /bin/bash "$u"; ok "Kullanici $u acildi"; fi
  chmod 711 "$h"   # nginx tanıtım klasörünü okuyabilsin; ev klasörü listelenemez
  # 2) Kod (herkese açık depo; yalnız okunur).
  if [ ! -d "$app/.git" ]; then as_u git clone -q --branch "$dal" "$repo" "$app"; ok "Kod indirildi: $app"; fi
  chmod 755 "$app"
  # 3) Veritabanı ve kullanıcısı; parola rastgele, yalnız ayar dosyasında.
  pg_port=$(as_pg psql -tAc 'SHOW port' | tr -d ' ')
  if ! as_pg psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$u'" | grep -q 1; then
    [ ! -f "$env_file" ] || die "Ayar dosyasi var ama veritabani kullanicisi yok; $env_file dosyasini kontrol edin."
    pw=$(openssl rand -hex 24)
    as_pg psql -q -v ON_ERROR_STOP=1 -c "CREATE ROLE $u LOGIN PASSWORD '$pw'"
    ok "Veritabani kullanicisi $u acildi"
  fi
  if ! as_pg psql -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1; then
    as_pg psql -q -v ON_ERROR_STOP=1 -c "CREATE DATABASE $db OWNER $u ENCODING 'UTF8' TEMPLATE template0"
    as_pg psql -q -c "REVOKE ALL ON DATABASE $db FROM PUBLIC"
    ok "Veritabani $db acildi"
  fi
  # 4) Ayar dosyası (bir kez üretilir, sonra elle değiştirilmez sürece dokunulmaz).
  if [ ! -f "$env_file" ]; then
    [ -n "${pw:-}" ] || die 'Veritabani parolasi bilinmiyor (kullanici onceden acilmis). Ayar dosyasini elle olusturun.'
    umask 077
    cat >"$env_file" <<EOF
# SiteTakipEt canli ayarlari. Bu dosya gizlidir: paylasmayin, depoya koymayin.
DATABASE_URL=postgres://$u:$pw@127.0.0.1:$pg_port/$db
PORT=$port
HOST=127.0.0.1
NODE_ENV=production
GUVENLI_CEREZ=1
VEKIL_ARKASINDA=1
# T.C. kimlik no sifreleme anahtari. KAYBOLURSA kayitli T.C. numaralari okunamaz:
# bir kopyasini Google Drive'daki sifreli klasore kaydedin.
VERI_ANAHTARI=$(openssl rand -base64 32)
BACKUP_RETENTION_DAYS=7
BACKUP_RCLONE_REMOTE=gdrive-sifreli:sitetakipet
EOF
    umask 022
    chown "$u:$u" "$env_file"; chmod 600 "$env_file"
    ok "Ayar dosyasi uretildi: $env_file (veritabani parolasi ve VERI_ANAHTARI icinde)"
    unset pw
  fi
  # 5) Başlatma betiği ve paketler.
  cat >"$basla" <<EOF
#!/bin/sh
# PM2 bu betigi calistirir: ayarlari okur, programi baslatir.
set -a
. $env_file
set +a
cd $app
exec $node_bin/node server.js
EOF
  chown "$u:$u" "$basla"; chmod 700 "$basla"
  if [ ! -x "$pm2_dir/bin/pm2" ]; then
    "$node_bin/npm" install -g --prefix "$pm2_dir" --no-audit --no-fund "pm2@$pm2_surum" >/dev/null
    chmod -R a+rX "$pm2_dir"
    ok "PM2 kuruldu: $pm2_dir"
  fi
  (cd "$app" && as_u npm ci --omit=dev --no-audit --no-fund >/dev/null) && ok 'Paketler kuruldu'
  # 6) PM2 (açılışta kendiliğinden başlar). Program açılırken veritabanı göçlerini kendisi uygular.
  if as_u pm2 describe "$pm2_name" >/dev/null 2>&1; then as_u pm2 restart "$pm2_name" >/dev/null
  else as_u pm2 start "$basla" --name "$pm2_name" --interpreter sh >/dev/null; fi
  as_u pm2 save >/dev/null
  if ! systemctl is-enabled "pm2-$u" >/dev/null 2>&1; then
    "$pm2_dir/bin/pm2" startup systemd -u "$u" --hp "$h" >/dev/null && ok "Acilista baslatma: pm2-$u servisi"
  fi
  saglikli && ok "Program calisiyor: 127.0.0.1:$port" || die "Program acilmadi. Bakmak icin: sudo -u $u -H $pm2_dir/bin/pm2 logs $pm2_name --lines 50"
  # 7) nginx: önce yalnız HTTP; sertifikayı "sertifika" adımı ekler.
  if [ ! -f "$nginx_conf" ]; then
    v6=''; [ -s /proc/net/if_inet6 ] && v6='listen [::]:80;'
    cat >"$nginx_conf" <<EOF
# SiteTakipEt (sunucu/kur.sh yazdi). Sertifika satirlarini certbot ekler.
server {
    listen 80;
    $v6
    server_name $alan www.$alan;
    root $app/tanitim;
    index index.html;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header X-Frame-Options DENY always;
    location ~ /\. { deny all; }
    location ~* \.(svg|jpg|jpeg|png|webp|ico)\$ { expires 7d; try_files \$uri =404; }
    location / { try_files \$uri \$uri/ =404; }
}
server {
    listen 80;
    $v6
    server_name panel.$alan;
    client_max_body_size 12m;
    location / {
        proxy_pass http://127.0.0.1:$port;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header CF-Connecting-IP "";
        proxy_read_timeout 70s;
    }
}
EOF
    ln -sf "$nginx_conf" /etc/nginx/sites-enabled/sitetakipet
    if nginx -t 2>/dev/null; then systemctl reload nginx; ok 'nginx ayari yazildi ve yuklendi (HTTP)'
    else rm -f /etc/nginx/sites-enabled/sitetakipet "$nginx_conf"; die 'nginx ayari hatali; geri alindi, mevcut siteler etkilenmedi. "nginx -t" ciktisini Claude ile paylasin.'; fi
  fi
  # 8) Yedek: her 15 dk yerel, her gece 03:40 şifreli Drive (EnvanterTakipEt 03:30'da; çakışmasın).
  install -d -m 700 -o "$u" -g "$u" "$backup_dir"
  for log in /var/log/sitetakipet-yedek.log /var/log/sitetakipet-uzak-yedek.log; do touch "$log"; chown "$u:$u" "$log"; chmod 640 "$log"; done
  if [ ! -f "$h/.config/rclone/rclone.conf" ] && [ -f /home/envanter/.config/rclone/rclone.conf ]; then
    install -d -m 700 -o "$u" -g "$u" "$h/.config" "$h/.config/rclone"
    install -m 600 -o "$u" -g "$u" /home/envanter/.config/rclone/rclone.conf "$h/.config/rclone/rclone.conf"
    ok 'rclone ayari kopyalandi (Drive: gdrive-sifreli:sitetakipet)'
  fi
  mevcut=$(crontab -u "$u" -l 2>/dev/null || true)
  satir1="*/15 * * * * /bin/sh $app/sunucu/yedek-al.sh $env_file $backup_dir >>/var/log/sitetakipet-yedek.log 2>&1"
  satir2="40 3 * * * /bin/sh $app/sunucu/yedek-uzak.sh $env_file $backup_dir >>/var/log/sitetakipet-uzak-yedek.log 2>&1"
  yeni=$mevcut
  printf '%s\n' "$mevcut" | grep -qF 'sunucu/yedek-al.sh' || yeni=$(printf '%s\n%s' "$yeni" "$satir1")
  if [ -f "$h/.config/rclone/rclone.conf" ]; then printf '%s\n' "$mevcut" | grep -qF 'sunucu/yedek-uzak.sh' || yeni=$(printf '%s\n%s' "$yeni" "$satir2"); fi
  if [ "$yeni" != "$mevcut" ]; then printf '%s\n' "$yeni" | sed '/^$/d' | crontab -u "$u" -; ok 'Yedek zamanlamasi kuruldu'; fi
  as_u sh "$app/sunucu/yedek-al.sh" "$env_file" "$backup_dir" >/dev/null && ok "Ilk yerel yedek alindi ($backup_dir)"
  say ''
  say 'KURULUM TAMAM. Siradaki adimlar:'
  say "  1) VERI_ANAHTARI satirini Google Drive'daki sifreli klasore kaydedin:"
  say "       sudo grep VERI_ANAHTARI $env_file"
  say '     (Ciktiyi Claude ile ya da sohbette paylasmayin.)'
  say '  2) Cloudflare DNS: @, www, panel icin A kaydi -> bu sunucu (GRI bulut). Sonra:'
  say "       sudo sh $app/sunucu/kur.sh sertifika"
  say '  3) Otomatik guncelleme anahtari:'
  say "       sudo sh $app/sunucu/kur.sh ci-anahtar"
}

ci_anahtar() {
  id "$u" >/dev/null 2>&1 && [ -d "$app/.git" ] || die 'Once "kur" adimini calistirin.'
  tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
  ssh-keygen -q -t ed25519 -N '' -C sitetakipet-github-actions -f "$tmp/k"
  install -d -m 700 -o "$u" -g "$u" "$h/.ssh"
  ak=$h/.ssh/authorized_keys
  touch "$ak"
  # Eski GitHub anahtarı varsa yenisiyle değişir; yalnız guncelle.sh çalıştırabilir.
  grep -v 'sitetakipet-github-actions' "$ak" >"$tmp/ak" || true
  printf 'restrict,command="/bin/sh %s/sunucu/guncelle.sh" %s\n' "$app" "$(cat "$tmp/k.pub")" >>"$tmp/ak"
  install -m 600 -o "$u" -g "$u" "$tmp/ak" "$ak"
  ip=$(sunucu_ip)
  say 'GitHub > yelekciserdar/Sitetakipet > Settings > Secrets and variables > Actions > New repository secret:'
  say ''
  say '  DEPLOY_USER'
  say "    $u"
  say '  DEPLOY_HOST'
  say "    ${ip:-sunucunun-genel-IP-adresi}"
  say '  DEPLOY_KNOWN_HOSTS'
  for f in /etc/ssh/ssh_host_ed25519_key.pub /etc/ssh/ssh_host_ecdsa_key.pub; do [ -f "$f" ] && say "    ${ip:-IP} $(cut -d' ' -f1,2 "$f")"; done
  say '  DEPLOY_SSH_KEY  (asagidaki tek satirin tamami; baska yere kaydetmeyin, kimseyle paylasmayin)'
  say ''
  base64 -w0 "$tmp/k"; say ''
  say ''
  say 'Anahtar bu sunucuda saklanmadi. Kaybederseniz bu adimi yeniden calistirin (eskisi gecersiz olur).'
}

sertifika() {
  [ -f "$nginx_conf" ] || die 'Once "kur" adimini calistirin.'
  ip=$(sunucu_ip)
  hepsi=0
  for ad in "$alan" "www.$alan" "panel.$alan"; do
    gorunen=$(getent ahostsv4 "$ad" 2>/dev/null | awk 'NR==1 {print $1}')
    if [ -n "$ip" ] && [ "$gorunen" = "$ip" ]; then ok "$ad bu sunucuyu gosteriyor"
    else warn "$ad -> ${gorunen:-kayit yok}. Cloudflare'de A kaydi bu sunucuya ve bulut GRI olmali."; hepsi=1; fi
  done
  [ "$hepsi" = 0 ] || die 'DNS hazir degil; birkac dakika sonra tekrar deneyin.'
  if ! command -v certbot >/dev/null; then apt-get install -y certbot python3-certbot-nginx >/dev/null && ok 'certbot kuruldu'; fi
  certbot --nginx --redirect --agree-tos --keep-until-expiring -d "$alan" -d "www.$alan" -d "panel.$alan"
  nginx -t && systemctl reload nginx
  say ''
  say 'SERTIFIKA TAMAM. Simdi Cloudflare DNS sayfasinda uc kaydi da TURUNCU buluta cevirin.'
  say "Deneme: https://$alan ve https://panel.$alan"
}

case "$mod" in
  kontrol)
    if denetle; then
      say ''
      if [ -f "$env_file" ] && saglikli 1; then say 'SiteTakipEt kurulu ve calisiyor.'; else say 'Eksik yok. Kurmak icin: sudo sh kur.sh kur'; fi
    else say 'Yukaridaki UYARI satirlarini giderin.'; fi ;;
  kur) kur ;;
  ci-anahtar) ci_anahtar ;;
  sertifika) sertifika ;;
  *) die 'Kullanim: sh kur.sh kontrol | kur | ci-anahtar | sertifika' ;;
esac
