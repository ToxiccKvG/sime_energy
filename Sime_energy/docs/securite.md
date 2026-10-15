# Sécurité — constat, correctifs, ce qui reste

> Rédigé le 2026-09-28, pendant le chantier 4 « Sécurité » (23 → 29/09).
> Part de l'audit du 22/09 (backend, Edge Functions, migrations, front), corrigé
> et complété par ce qui a été vérifié en production les 25 et 28/09.
> À relire avant la mise en ligne.

## 1. Le principe à garder en tête

Aujourd'hui, la sécurité de la plateforme tient largement au fait que **le front et
le backend ne sont pas déployés**. Seul Supabase est en production : la base, les
Edge Functions et les buckets. Tout ce qui est accessible depuis Internet passe
donc par Supabase, et c'est là que les correctifs ont porté.

Le jour où le backend Python sera hébergé, cette protection tombe. Les points
ouverts de la section 4 deviennent alors exploitables.

## 2. Ce qui est en place et fonctionne

| Protection | Depuis | Vérifié |
|---|---|---|
| RLS active sur les tables Shelly et applicatives | 11/06 puis 15/09 | oui |
| `anon` ne lit plus `shelly_cl`, `shelly_cl_horaire`, `shelly_cl_journalier` ni les `fn_energy_*` | migration `20260914` | oui — `401 permission denied` |
| `auth_key` des comptes Shelly invisible du navigateur | migration `20260720` | oui — voir 3.1 |
| Invitations par RPC `accept_invitation` | 15/09 | oui |
| Buckets `iot-files` et `measurement-files` isolés par utilisateur | 16 et 17/09 | oui |
| JWT exigé sur `poll-shelly` et `test-shelly-account` | — | oui |
| Helpers RLS non récursifs `user_org_ids()`, `user_admin_org_ids()`, `is_org_creator()` | migration `20260915` | oui |

## 3. Ce qui a été corrigé pendant le chantier

### 3.1 `shelly_accounts` — l'écriture était ouverte à tout compte connecté

*Migration `20260925_shelly_accounts_write_admin_only.sql` — commit `55910c07` — appliquée en production le 25/09.*

**Constat.** La politique d'origine était `FOR ALL USING (auth.role() = 'authenticated')`.
La migration `20260720` avait bien fermé la **lecture** de `auth_key` au niveau colonne,
mais un `GRANT` de colonne ne couvre pas l'écriture. Vérifié en production : le rôle
`authenticated` conservait `INSERT` et `UPDATE` sur `auth_key`.

Conséquence : n'importe quel compte connecté — simple membre, invité — pouvait
écraser la clé Shelly Cloud, détourner `server_url` vers un serveur tiers, basculer
`actif` à `false` pour arrêter silencieusement la collecte, ou supprimer la ligne.

> L'audit du 22/09 était plus pessimiste que la réalité : il annonçait la clé
> lisible par tout compte connecté. Elle ne l'était pas. Le problème portait sur
> l'écriture, pas sur la lecture.

**Correctif.** La politique unique est remplacée par quatre politiques :

| Politique | Opération | Qui |
|---|---|---|
| `shelly_accounts_read` | `SELECT` | tout utilisateur connecté |
| `shelly_accounts_admin_insert` | `INSERT` | admins d'organisation |
| `shelly_accounts_admin_update` | `UPDATE` | admins d'organisation |
| `shelly_accounts_admin_delete` | `DELETE` | admins d'organisation |

L'appartenance passe par `public.user_admin_org_ids()`, le helper déjà introduit par
`20260915`. `service_role` n'est pas concerné : `poll-shelly` et `test-shelly-account`
contournent RLS et continuent d'écrire `last_poll_*`.

**Vérification**, en transaction annulée, avec deux vrais utilisateurs :

| Test | Résultat |
|---|---|
| non-admin → `UPDATE` | 0 ligne |
| non-admin → `DELETE` | 0 ligne |
| non-admin → `SELECT` | 3 lignes — lecture conservée |
| admin → `UPDATE` | 1 ligne |

Puis dans l'application : édition et sauvegarde d'un compte depuis l'onglet
Paramètres IOT, sans erreur, clés intactes, polling toujours `ok`.

**Limite assumée.** `shelly_accounts` ne porte pas de `organization_id`. « Admin »
signifie donc « admin d'au moins une organisation », pas « admin de l'organisation
propriétaire du compte ». Le cloisonnement fin relève de l'isolation multi-tenant.

### 3.2 Webhook Shelly — le secret n'était pas vérifié

*`SHELLY_GCP_00/supabase/functions/shelly-webhook/index.ts` — commit `2d5317b7` — déployé le 25/09.*

**Constat.** La fonction est déployée sans vérification de JWT, ce qui est normal :
c'est un appareil Shelly qui la contacte, pas un utilisateur connecté. Le secret
partagé était donc la seule barrière — sauf qu'il était vérifié sous `if (webhookSecret)`.
Or `supabase secrets list` montre que **`SHELLY_WEBHOOK_SECRET` n'est pas défini**.
Le contrôle était entièrement sauté : un simple `POST` public suffisait à insérer
dans `shelly_cl`, avec `device_id`, `site`, horodatage et valeurs électriques choisis
par l'appelant.

Ceci répond au point laissé « non vérifiable depuis le code » par l'audit du 22/09 :
**le secret n'était pas posé.**

**Impact réel : nul.** Ce webhook n'a jamais écrit une seule ligne — zéro ligne
portant sa signature (`name = device_id`, type `SPEM-003CEBEU`). Toute la collecte
passe par `poll-shelly`.

**Correctif.**

| Avant | Après |
|---|---|
| contrôle sauté si le secret n'est pas défini | **503**, refus total — *fail closed* |
| comparaison `!==` | comparaison à temps constant |
| secret en query param seul | en-tête `X-Webhook-Secret`, query param en repli |
| `device_id` pris tel quel dans l'URL | motif imposé, puis appareil devant être connu — **403** sinon |
| `site` pris dans l'URL | **déduit de l'appareil**, `?site=` ignoré |
| `ts` accepté tel quel | borné à +5 min / −24 h |
| corps illimité | plafonné à 64 Ko |
| erreur d'insertion renvoyée telle quelle | message générique, détail dans les logs |

Le secret reste accepté en query param parce que le firmware Shelly (`Webhook.Create`)
ne sait poster que des URL, sans en-têtes. C'est une contrainte matérielle, pas un
choix : l'URL configurée sur un appareil est donc **aussi sensible qu'un mot de passe**.

**Vérification en production**, après déploiement :

```
GET                              → 405
POST sans secret                 → 503
POST secret erroné (query)       → 503
POST secret erroné (en-tête)     → 503
POST ?site=PIRATE                → 503
POST device_id=../../etc/passwd  → 503
```

Aucune ligne insérée, polling toujours `ok` sur les trois comptes. La logique pure
(comparaison du secret, motif d'identifiant, bornes d'horodatage) est couverte par
23 assertions passées avant déploiement.

**Point de déploiement à retenir :** la fonction doit être déployée avec
`--no-verify-jwt`. Sans ce drapeau, la CLI active la vérification JWT et un appareil
Shelly, incapable d'émettre un JWT, serait rejeté.

```
supabase functions deploy shelly-webhook --project-ref amctayugahwhxwytqiqf --no-verify-jwt
```

**État voulu aujourd'hui :** le secret n'est volontairement pas posé, donc le point
d'entrée refuse tout. C'est la bonne posture tant que le webhook ne sert pas. À poser
le jour où il servira :

```
supabase secrets set SHELLY_WEBHOOK_SECRET=<valeur>
```
puis reporter la même valeur dans `SHELLY_GCP_00/.env`, sinon `configure_webhooks.py`
refuse de tourner — il a été mis à jour pour ne plus configurer d'appareils avec des
webhooks morts, et ne transmet plus `site`.

### 3.3 En-têtes de sécurité du front, CSP comprise

*`Sime_energy/sime-front/vercel.json` — 28/09. Prend effet au premier déploiement Vercel, rien n'est en ligne aujourd'hui.*

Cinq en-têtes sont posés : `Content-Security-Policy`, `X-Content-Type-Options`,
`Referrer-Policy`, `Permissions-Policy` et `Strict-Transport-Security`.

La CSP autorise exactement les origines dont l'application a besoin, et rien d'autre :

| Directive | Autorisé | Pourquoi |
|---|---|---|
| `script-src` | `'self'` uniquement | aucun script tiers ; c'est ce qui protège la session en `localStorage` |
| `style-src` | `'self'`, `'unsafe-inline'`, Google Fonts | `'unsafe-inline'` est imposé par shadcn/ui, qui injecte une balise `<style>` (`components/ui/chart.tsx:70`) |
| `font-src` | `'self'`, `fonts.gstatic.com` | la police Inter |
| `img-src` | `'self'`, `data:`, `blob:`, Supabase, `*.tile.openstreetmap.org` | tuiles Leaflet, aperçus d'images, fichiers du stockage |
| `connect-src` | `'self'`, Supabase (https + **wss**), Edge Functions, `localhost:8000` | REST, temps réel, fonctions, backend en développement |
| `worker-src` | `'self'`, `blob:` | exports Excel et CSV (`URL.createObjectURL`) |
| `object-src`, `frame-ancestors` | `'none'` | pas de plugin, pas d'iframe tierce : bloque le détournement de clic |

**Vérifié le 28/09** en servant le build de production en local avec ces en-têtes
réellement appliqués, puis en testant depuis la page :

| Test | Résultat |
|---|---|
| Supabase REST | autorisé — HTTP 401, la requête atteint le serveur |
| Supabase temps réel (`wss://`) | non bloqué par la CSP |
| Backend `127.0.0.1:8000` | autorisé — HTTP 200 |
| Tuile OpenStreetMap | image chargée |
| Feuille de style Google Fonts | chargée |
| Police Inter depuis gstatic | 2 faces chargées |
| **Script externe (jsdelivr)** | **refusé** — la CSP mord bien |
| Violations dans la console | **aucune** |

> `document.fonts.check('1em Inter')` renvoie `false` même quand la police est
> chargée : ce n'est pas un symptôme de CSP. Le test fiable est
> `await document.fonts.load('600 1em Inter')`.

**À faire avant la mise en ligne.** `connect-src` ne contient pas encore l'origine
du backend hébergé, puisque la décision 1 n'est pas prise. **Sans cet ajout, toute
la Facturation cassera en production** : les 8 routes du backend seront bloquées par
le navigateur. Ajouter l'URL de l'hébergeur et retirer les deux entrées `localhost`.

## 4. Ce qui reste ouvert

### 4.1 Le backend Python n'a aucune authentification — reporté

**Décision du 25/09 : traité après la fusion des codes avec Kevin.** Les 6 des
8 routes relèvent de la Facturation, le backend est commun et il n'existe pas de
frontière par module : activer l'authentification avant la fusion casserait son front.

**Conséquence assumée : la faille reste ouverte à la mise en ligne.**

État vérifié le 28/09, à ne pas ré-auditer :

- Les **8 routes** de `app/api/V1/processing/proccesing.py` sont sans protection.
  Aucune ne porte `Depends(verify_token)` — vérifié, zéro occurrence dans tout le backend.
  Deux d'entre elles déclenchent des services **payants à l'appel** : `/pdf-invoices`
  (Textract) et `/analyze-energy-label` (Bedrock).
- `app/core/auth.py` est **cassé à trois endroits** et ne s'importe même pas :
  `HTTPAuthCredentials` n'existe pas — c'est `HTTPAuthorizationCredentials` ;
  `from config import settings` vise le mauvais module — c'est `app.core.config` ;
  et la classe `Settings` y est entièrement commentée. Le module lève `ImportError`.
  Ce n'est pas du code désactivé, c'est du code qui n'a jamais tourné.
- **`SUPABASE_JWT_SECRET` du `.env` backend n'est pas le secret JWT : c'est la clé
  anon publique**, strictement identique à `VITE_SUPABASE_ANON_KEY` du front (vérifié
  en décodant : `role: "anon"`, même `ref` projet). Même réparé, tout jeton serait
  rejeté. Le vrai secret est dans Supabase → Settings → API → JWT Secret.
- Piège à connaître : les jetons Supabase portent `aud: "authenticated"` ; `jose`
  vérifie l'audience par défaut → passer `audience="authenticated"` explicitement.
- `main.py:50` — `allow_origins=["*"]` avec `allow_credentials=True`. Combinaison que
  la spécification CORS interdit.
- Aucune limite de taille d'upload, devant des parseurs lourds (poppler, Pillow,
  OpenCV, xlrd, msoffcrypto, weasyprint).
- Le front n'envoie **aucun en-tête `Authorization`** — 6 points d'appel dans
  `invoiceService.ts` (×2), `measurementService.ts` (×3), `custom-sensor-service.ts` (×1),
  plus un appel direct hors couche service dans `InvoiceImportDialog.tsx:183`.

**Option retenue pour la reprise :** livrer avec un interrupteur `AUTH_REQUIRED`, afin
de découpler les déploiements du front de Kevin et du backend.

**Deux singularités relevées au passage :**
`src/services/auditWorkflowService.ts` est du **code mort** — zéro import dans tout le
front — et c'est pourtant la seule porte vers la route LLM payante `/analyze-energy-label`.
Et `processHierarchy` vit dans `measurementService.ts` mais n'est appelée que par
`components/invoices/SchemaDesignerStep.tsx`.

### 4.2 Points mineurs non traités

| Point | Détail |
|---|---|
| ~~`run_migration.mjs`~~ | **Supprimé le 28/09.** La clé qui s'y trouvait en dur était la clé **anon publique**, identique à celle que le front embarque déjà dans le navigateur : ce n'était donc pas une fuite, seulement un mauvais signal. Le script était mort par ailleurs — il visait un fichier de migration qui n'existe plus, n'était référencé nulle part, et ne pouvait pas fonctionner : l'API Management exige un jeton personnel, pas une clé anon. Le chemin qui marche est `supabase db query --linked` (section 5). |
| Session Supabase | en `localStorage`, donc lisible par un script injecté. Atténué par la CSP `script-src 'self'` (section 3.3), qui bloque le chargement d'un script tiers. |
| Dépendances | non auditées. |
| Fonctions déployées orphelines | `shelly-web-hook` (v6 du 20/04) et `poll-shelly` sous le slug **`swift-processor`** (v8 du 20/04) : absentes du dépôt, source perdue. `shelly-web-hook` est protégée par JWT, donc pas une porte ouverte. **Supprimées le 15/10/2026** : aucun appel sur 7 jours (journaux Supabase), aucun cron ni code ne les appelait. |

### 4.3 Écarté volontairement

Deux cartes du chantier ont été mises de côté par l'utilisateur le 28/09 et ne
doivent pas être traitées sans qu'il le redemande :

- **Isolation par organisation des données Shelly** — RLS multi-tenant. Acceptable
  tant qu'il n'y a qu'un client.
- **CI : `npm audit` + `pip-audit` + tests RLS automatisés.**

## 5. Comment vérifier, concrètement

La CLI Supabase est authentifiée et le projet lié. C'est le seul chemin qui marche
pour exécuter du SQL en production :

```bash
cd Sime_energy/sime-front
supabase db query --linked -o table "<requête>"
supabase db query --linked -f <fichier.sql>
```

Quelques requêtes utiles :

```sql
-- Politiques RLS d'une table
select policyname, cmd, qual, with_check
from pg_policies where tablename = 'shelly_accounts';

-- Ce que le rôle authenticated peut faire, colonne par colonne
select privilege_type, string_agg(column_name, ', ' order by column_name)
from information_schema.column_privileges
where table_name = 'shelly_accounts' and grantee = 'authenticated'
group by privilege_type;

-- Qui est admin
select u.email, ou.role, o.name
from auth.users u
left join public.organization_users ou on ou.user_id = u.id
left join public.organizations o on o.id = ou.organization_id;
```

Et pour les secrets des Edge Functions :

```bash
supabase secrets list
supabase functions list
```

## 6. Trois règles à retenir

1. **Un `GRANT` de colonne ne protège que la lecture.** C'est l'erreur qui a laissé
   `auth_key` modifiable pendant deux mois alors qu'on la croyait protégée. Fermer une
   lecture et fermer une écriture sont deux gestes distincts.
2. **Une vérification conditionnelle n'est pas une vérification.** `if (secret)` laisse
   la porte ouverte quand la variable n'est pas définie — et elle ne l'était pas.
   Une protection doit échouer fermée : pas de secret, pas de service.
3. **Ne jamais faire confiance à ce que l'appelant fournit dans l'URL.** Le webhook
   acceptait `device_id` et `site` tels quels. Ces valeurs se déduisent désormais de la
   plateforme, jamais de la requête.
