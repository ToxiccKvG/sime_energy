# Tests SIMEE

```
test/
├── frontend/
│   ├── unitaire/   Vitest — calculs facturation, simulateur, saisie manuelle, import Excel, mapper OCR, anomalies, utilitaires
│   └── systeme/    Playwright — parcours réels dans le navigateur (Vite :8080 + FastAPI :8000 + vraie Supabase)
├── backend/
│   ├── unitaire/   pytest — parseurs de capteurs, KPIs, extraction facture, tableaux, hiérarchie
│   └── systeme/    pytest + TestClient — endpoints HTTP, services réels (Supabase, Textract, Bedrock, DeepSeek)
├── outils/         compte_test.py (compte fictif, non utilisé actuellement)
└── RAPPORT.md      résultats et anomalies de la dernière campagne
```

## Lancer

```bash
# Frontend (depuis test/frontend)
bun install
bun run test:unitaire          # ~2 s
bun run connexion              # une fois : ouvre Chromium, se connecter avec son compte → session sauvegardée
bun run test:systeme           # ~8 min, démarre Vite et FastAPI si besoin

# Backend (depuis test/backend, avec le Python du backend)
../../sime-backend-main/.venv/bin/python -m pip install -r requirements-test.txt
../../sime-backend-main/.venv/bin/python -m pytest unitaire
../../sime-backend-main/.venv/bin/python -m pytest systeme     # ~1 min, appels payants réels
```

## Données de test

- Les tests système utilisent **le compte connecté par `bun run connexion`** et son organisation (CER2E).
- Chaque test crée ses propres projets nommés `TEST-AUTO …`. Ils sont supprimés avant et après chaque suite
  (`systeme/nettoyage.global.ts`), ainsi que leurs sites, bâtiments, factures, lignes SENELEC et paramètres.
- La session (`frontend/playwright/.auth/`) contient un jeton : elle est ignorée par git.

## Règles de calcul de référence

Validées le 2026-10-19, ce sont elles que les tests vérifient :

| Calcul | Règle |
|---|---|
| NJ | fin − début + 1 |
| Prime fixe | Tpf × PS × NJ/30 |
| PDP | 1,5 × Tpf × (Pmax − PS) × NJ/30 |
| cos φ | barème du simulateur : neutre 0,80–0,95, pénalité par paliers (5 %, 10 %… 80 %), bonus −0,75 % par centième au-dessus de 0,95 (max 5) |
