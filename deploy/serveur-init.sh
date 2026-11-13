#!/bin/bash
# Installation du serveur SIMEE (Amazon Linux 2023), passée en user-data au lancement de l'EC2.
# Les valeurs __SITE_ADDRESS__ et __REF__ (commit du dépôt) sont remplacées au lancement.
# Journal de l'installation sur le serveur : /var/log/cloud-init-output.log
set -euxo pipefail

SITE_ADDRESS=__SITE_ADDRESS__
REF=__REF__
COMPOSE_VERSION=v5.6.1
COMPOSE_SHA256=47737f4236e6d3ccea7291995203f8f018058783b4c3a9469119811a0b5db8c0

dnf -y upgrade
dnf -y install docker

# Journaux des conteneurs plafonnés (sinon le disque se remplit)
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "5" } }
EOF
systemctl enable --now docker
usermod -aG docker ec2-user

# Docker Compose, version figée et somme vérifiée
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL -o /tmp/docker-compose "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-x86_64"
echo "${COMPOSE_SHA256}  /tmp/docker-compose" | sha256sum -c -
install -m 755 /tmp/docker-compose /usr/local/lib/docker/cli-plugins/docker-compose

# Fichiers de déploiement, au commit indiqué
mkdir -p /opt/sime
cd /opt/sime
for f in compose.yml charger-secrets.sh; do
  curl -fsSL -o "$f" "https://raw.githubusercontent.com/ToxiccKvG/sime_energy/${REF}/deploy/${f}"
done
echo "SITE_ADDRESS=${SITE_ADDRESS}" > .env

sh charger-secrets.sh
docker compose pull
docker compose up -d
