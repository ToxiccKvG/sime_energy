"""Chaque URL d'API appelée par le front doit exister côté backend (même chemin, même méthode POST)."""
import re
from pathlib import Path

import pytest

FRONT_SRC = Path(__file__).resolve().parents[3] / "sime-front" / "src"

# '/processing/…', '/process-file/…', '/ai/…', '/auth/…' — éventuellement précédés de ${API_URL}
MOTIF = re.compile(r"""['"`](?:\$\{[\w.]+\})?(/(?:processing|process-file|ai|auth)/[\w/-]+)['"`]""")


def appels_du_front():
    appels = []
    for fichier in sorted(FRONT_SRC.rglob("*.ts*")):
        if "components/ui" in fichier.as_posix():
            continue
        for n, ligne in enumerate(fichier.read_text(encoding="utf-8").splitlines(), 1):
            for chemin in MOTIF.findall(ligne):
                appels.append(pytest.param(chemin, id=f"{fichier.relative_to(FRONT_SRC)}:{n} {chemin}"))
    return appels


@pytest.mark.systeme
@pytest.mark.parametrize("chemin", appels_du_front())
def test_url_appelee_par_le_front_existe(client, chemin):
    routes = client.app.openapi()["paths"]
    assert f"/api/V1{chemin}" in routes, f"Route inexistante côté backend : /api/V1{chemin}"
    assert "post" in routes[f"/api/V1{chemin}"]
