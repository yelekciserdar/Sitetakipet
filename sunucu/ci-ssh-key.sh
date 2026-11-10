#!/bin/sh
# Writes the deploy private key from $KEY (GitHub secret) to the given file.
# Accepts an OpenSSH private key pasted with broken whitespace (CRLF, trailing
# spaces, lines joined or re-wrapped) or the key as one base64 line
# (`base64 -w0 key`), which survives copying from a terminal.
set -eu
out=${1:?Kullanim: ci-ssh-key.sh CIKTI_DOSYASI}
umask 077
head='-----BEGIN OPENSSH PRIVATE KEY-----'
foot='-----END OPENSSH PRIVATE KEY-----'
key=$(printf '%s' "${KEY:-}" | tr -d '\r')
case "$key" in
  *"$head"*) ;;
  *) key=$(printf '%s' "$key" | tr -d ' \t\n' | base64 -d 2>/dev/null | tr -d '\r') || key='' ;;
esac
case "$key" in
  *"$head"*"$foot"*) ;;
  *) echo '::error::DEPLOY_SSH_KEY bir OpenSSH ozel anahtari degil.' >&2; exit 1 ;;
esac
# Rebuild the armor from the base64 body so any whitespace damage disappears.
body=${key#*"$head"}
body=${body%%"$foot"*}
body=$(printf '%s' "$body" | tr -d ' \t\n')
{ echo "$head"; printf '%s\n' "$body" | fold -w 70; echo "$foot"; } >"$out"
chmod 600 "$out"
ssh-keygen -y -f "$out" >/dev/null 2>&1 || { echo '::error::DEPLOY_SSH_KEY okunamadi; anahtari yeniden olusturup base64 -w0 ciktisini ekleyin.' >&2; exit 1; }
echo 'Anahtar dogrulandi.'
