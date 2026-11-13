#!/bin/sh
# Lit les secrets du backend dans AWS SSM Parameter Store (/sime/api/*, chiffrés)
# grâce au rôle IAM du serveur, et écrit /opt/sime/api.env lisible par root seulement.
# À lancer avant `docker compose up -d`, et après chaque changement de secret.
set -eu
cd /opt/sime
umask 077
aws ssm get-parameters-by-path --region eu-west-1 --path /sime/api --with-decryption \
  --query 'Parameters[].[Name,Value]' --output text \
  | awk -F'\t' '{ n = $1; sub(".*/", "", n); print n "=" $2 }' > api.env.tmp
test -s api.env.tmp
mv api.env.tmp api.env
echo "api.env : $(wc -l < api.env) variables chargées depuis SSM"
