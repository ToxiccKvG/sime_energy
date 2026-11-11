# Mise en ligne et cycle des modifications

> Rédigé le 2026-09-21, avant la mise en ligne (chantier « Mise en ligne », 30/09 → 03/10).
> Décrit ce qui sera mis en place et comment on travaillera ensuite. À relire le jour J.

## 1. État au 21/09/2026 : rien n'est en ligne

| Élément | Constat |
|---|---|
| **Supabase** (base, Edge function `poll-shelly`, buckets) | **En production** depuis le début : toute migration appliquée avec `supabase db query --linked` est immédiatement en prod. C'est la seule chose déployée. |
| **Backend Python** (`sime-backend-main`) | Aucun hébergeur. `Procfile` + `runtime.txt` (python-3.10) prêts pour Render / Railway / Heroku ; lit `$PORT`. Tourne uniquement en local (`127.0.0.1:8000`). |
| **Frontend** (`sime-front`) | `vercel.json` prêt (build `bun`, framework Vite, rewrite SPA). **Aucun projet SIME sur le compte Vercel** de l'utilisateur. Aucun CI. `VITE_API_URL` → `127.0.0.1`. |

Conséquence : la plateforme n'est utilisable que depuis le poste de développement. « Déployer » = créer les deux hébergements de zéro, pas mettre à jour une version existante.

## 2. Ce qui sera mis en place (jour J, ~½ journée)

1. **Décision 1 — hébergeur du backend** : Render ou Railway (pas Vercel : pandas/openpyxl/xlrd, process long). Variables d'environnement à y poser : `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `AWS_ACCESS_KEY_ID` / `SECRET`, `LLM_MODEL`, `FRONTEND_URL`. `requirements.txt` inclut `xlrd` (18/09).
2. **Projet Vercel** relié au dépôt `ToxiccKvG/sime_energy`, racine `Sime_energy/sime-front`. Variables : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL` = URL du backend hébergé.
3. **Deux environnements Vercel** : branche `dev` → **préprod** (`sime-dev.vercel.app` ou équivalent), branche `main` → **production**.
4. **CORS** du backend resserré du `*` actuel aux deux domaines Vercel.
5. Audit sécurité des tables restantes (½ journée, prévu au plan) avant d'ouvrir l'accès.

## 3. Cycle d'une modification, après la mise en ligne

```
poste local  →  shift/Maurice  →  dev = PRÉPROD  →  main = PRODUCTION
(on développe)   (commits)         (on vérifie)       (les utilisateurs)
```

- **Local** : inchangé — `localhost:8080`, backend local, branche `shift/Maurice`. Invisible des utilisateurs.
- **Préprod** : à la demande explicite de l'utilisateur, fusion de `shift/Maurice` dans `dev` ; Vercel redéploie la préprod en ~2 min. On la teste comme un utilisateur, depuis n'importe quel poste.
- **Production** : à la demande explicite, fusion de `dev` dans `main`. Aucune fusion n'est faite d'initiative (règle déjà en vigueur pour `dev`).
- **Backend** : un service par branche si l'hébergeur le permet ; sinon, au début, un seul backend de prod que la préprod utilise aussi (valable tant que le changement ne touche pas le backend).

## 4. Trois règles à connaître

1. **La base est unique.** Pas de préprod Supabase : préprod et prod lisent la même base. Une migration est en prod dès qu'elle est appliquée. Donc : **ajouter, jamais renommer ni supprimer** ; l'ancien front doit continuer à fonctionner avec la nouvelle base. Une base de test séparée = second projet Supabase (coût + duplication) — seulement si le besoin vient.
2. **Retour arrière en 30 s.** Vercel conserve chaque version : « Rollback » sur la précédente, sans toucher au code. Idem pour le backend (redéploiement d'une version antérieure).
3. **Les clés vivent chez l'hébergeur**, jamais dans le code ni dans le dépôt. Une clé compromise se change dans Vercel / Render, sans redéployer.

## 5. Pour l'utilisateur, concrètement

| Tu dis | Ce qui se passe |
|---|---|
| « fais ceci » | livré en local, commité sur `shift/Maurice` |
| « passe-le en préprod » | fusion dans `dev`, URL de préprod à tester |
| « mets en ligne » | fusion dans `main`, en production |
| « reviens à la version d'avant » | rollback Vercel / hébergeur |
