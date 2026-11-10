# SiteTakipEt canlı kurulum (EnvanterTakipEt sunucusu)

Program, EnvanterTakipEt ile aynı sunucuda ayrı bir kullanıcıyla (`sitetakip`) çalışır. Kullanıcının
`sudo` yetkisi yoktur; programda bir açık çıksa bile EnvanterTakipEt'e ve sunucunun geneline dokunamaz.

| Ne | Nerede |
|---|---|
| Kod | `/home/sitetakip/sitetakipet` (GitHub'dan, yalnız okunur) |
| Ayarlar ve gizli anahtarlar | `/home/sitetakip/sitetakipet.env` (yalnız `sitetakip` okur) |
| Program | PM2 süreci `sitetakipet`, `127.0.0.1:3003`; açılışta `pm2-sitetakip` servisi başlatır. PM2'nin kendi kopyası `/opt/pm2-sitetakip` (EnvanterTakipEt'inkine dokunmaz) |
| Tanıtım sayfası | `sitetakipet.com.tr`, `www.` → `tanitim/` klasörü (nginx) |
| Program adresi | `panel.sitetakipet.com.tr` → `127.0.0.1:3003` (nginx) |
| Yedek | Her 15 dk `/var/backups/sitetakipet` (7 gün), her gece 03:40 şifreli Drive `gdrive-sifreli:sitetakipet` |
| Otomatik güncelleme | `main`'e her birleştirmede GitHub Actions → `sunucu/guncelle.sh` (önce yedek, açılmazsa geri döner) |

## Adımlar

Bütün komutlar sunucuda, SSH ile bağlıyken çalıştırılır.

**1. Betiği indirip denetleyin** (hiçbir şey değiştirmez):

```bash
curl -fsSL https://raw.githubusercontent.com/yelekciserdar/Sitetakipet/main/sunucu/kur.sh -o /tmp/sitetakipet-kur.sh
```

```bash
sudo sh /tmp/sitetakipet-kur.sh kontrol
```

`[UYARI]` satırı varsa çıktıyı Claude'a gösterin. (Cloudflare gerçek IP ve rclone uyarıları kurulumu durdurmaz.)

**2. Kurun:**

```bash
sudo sh /tmp/sitetakipet-kur.sh kur
```

Kullanıcı, veritabanı, ayar dosyası (rastgele veritabanı parolası ve `VERI_ANAHTARI`), program, PM2,
nginx (şimdilik HTTP) ve yedek zamanlaması kurulur. Sonunda "KURULUM TAMAM" yazar.

**3. `VERI_ANAHTARI`'nı saklayın.** T.C. kimlik numaraları bu anahtarla şifrelenir; kaybolursa okunamaz.

```bash
sudo grep VERI_ANAHTARI /home/sitetakip/sitetakipet.env
```

Çıkan satırı Google Drive'daki şifreli klasörünüze kaydedin. Sohbete, e-postaya, ekran görüntüsüne koymayın.

**4. Cloudflare DNS** (sitetakipet.com.tr → DNS → Records → Add record), üç kayıt, hepsi **gri bulut (DNS only)**:

| Type | Name | IPv4 address | Proxy |
|---|---|---|---|
| A | `@` | EnvanterTakipEt'in sunucu adresi | gri |
| A | `www` | aynı adres | gri |
| A | `panel` | aynı adres | gri |

**5. Sertifika** (DNS birkaç dakikada yayılır; betik önce kontrol eder):

```bash
sudo sh /home/sitetakip/sitetakipet/sunucu/kur.sh sertifika
```

"SERTIFIKA TAMAM" yazınca Cloudflare'de üç kaydı **turuncu buluta** çevirin.
Deneme: `https://sitetakipet.com.tr` ve `https://panel.sitetakipet.com.tr`.

**6. Otomatik güncelleme anahtarı:**

```bash
sudo sh /home/sitetakip/sitetakipet/sunucu/kur.sh ci-anahtar
```

Ekrana çıkan dört değeri GitHub → `yelekciserdar/Sitetakipet` → Settings → Secrets and variables →
Actions → **New repository secret** ile ekleyin: `DEPLOY_USER`, `DEPLOY_HOST`, `DEPLOY_KNOWN_HOSTS`
(birden çok satır olabilir, hepsini), `DEPLOY_SSH_KEY` (uzun tek satırın tamamı). Anahtar sunucuda
saklanmaz; kaybolursa bu adım yeniden çalıştırılır.

Sunucunun SSH ayarında `AllowUsers` satırı varsa (`sudo grep -i allowusers /etc/ssh/sshd_config`)
listeye `sitetakip` eklenip `sudo systemctl reload ssh` yapılmalı; yoksa güncelleme "Permission denied" alır.

**7. İlk firma** (müşteri ya da deneme hesabı):

```bash
sudo -u sitetakip -H sh -c 'set -a; . ~/sitetakipet.env; cd ~/sitetakipet && /opt/node-v22.23.4/bin/node scripts/firma-olustur.js --firma "Deneme Yönetim" --yonetici "Ad Soyad" --eposta deneme@ornek.com'
```

Firma adı, yönetici adı ve e-postayı kendi bilgilerinizle değiştirin; parola komut çalışınca sorulur.

## Sorun olursa

- Program günlüğü: `sudo -u sitetakip -H /opt/pm2-sitetakip/bin/pm2 logs sitetakipet --lines 50`
- Durum: `sudo sh /home/sitetakip/sitetakipet/sunucu/kur.sh kontrol`
- Yedek durumu: `sudo cat /var/backups/sitetakipet/STATUS.txt`
- Elle geri dönüş: GitHub → Actions → "Canli site guncelleme" → Run workflow → `surum: onceki`.
