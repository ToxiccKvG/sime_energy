# Project — SIMEE Frontend (CER2E)

> Plateforme de digitalisation des audits énergétiques.
> **Responsable Kevin** : Module 2 (Inventaire) + Module 3 (Mesures).

## Stack

- **Language:** TypeScript 5.8
- **Framework:** React 18 + Vite 5 (SPA — pas Next.js)
- **Routing:** React Router 6
- **Data fetching:** TanStack React Query 5 (peu utilisé actuellement — à adopter)
- **Database:** Supabase (PostgreSQL + RLS + Auth) — `src/lib/supabase.ts`
- **UI:** Tailwind CSS 3 + shadcn/ui (Radix) + Lucide icons
- **Charts:** Recharts 2
- **Maps:** Leaflet + React-Leaflet (installé, peu utilisé)
- **Forms:** React Hook Form + Zod
- **Package manager:** bun (jamais npm/npx)

## Architecture

SPA React avec 3 couches strictes :

```
lib/         → Supabase CRUD uniquement (une fonction = une query)
services/    → Logique métier + appels API backend FastAPI
pages/ + components/ → UI uniquement, appelle services/
```

Key directories:
- `src/pages/` — Routes principales (une page = une route)
- `src/components/audits/` — Composants module Audits (pattern de référence)
- `src/components/invoices/` — Composants module Facturation (pattern de référence)
- `src/components/ui/` — shadcn/ui (ne pas modifier)
- `src/lib/` — Services Supabase (audit-service.ts, invoice-service.ts, etc.)
- `src/services/` — Services métier (invoiceService.ts, measurementService.ts)
- `src/context/` — AuthContext + OrganizationContext (auth + tenant)
- `src/types/` — Types TypeScript partagés
- `supabase/migrations/` — Migrations SQL

## Conventions

- Fichiers : kebab-case (`audit-service.ts`, `measurement-upload-step.tsx`)
- Composants : PascalCase (`AuditForm.tsx`, `InventaireTree.tsx`)
- Handlers : `handle*` (`handleSave`, `handleDelete`)
- Hooks : `use*` (`useAnnotationDictionary`, `useMeasurements`)
- Supabase : toujours `const { data, error } = await supabase.from(...)` + `if (error) throw error`
- Jamais de CSS pur — Tailwind uniquement
- shadcn/ui en priorité avant composants custom
- Thème dark : `bg-[#0f111a]` fond principal, `text-slate-100`
- Retry logic sur appels API backend : utiliser `withRetry()` de `src/services/invoiceService.ts`
- Audit trail : appeler `logActivity()` (`src/lib/activity-service.ts`) sur toute action significative

## Contextes globaux (obligatoires)

```typescript
const { user } = useAuth();           // user.id pour les requêtes
const { organization } = useOrganization(); // organization.id pour le tenant
```

## What's Already Built (ne pas rebâtir)

- **Auth multi-tenant** — Login/Signup/ForgotPassword + organizations + invitations ✅
- **Module 1 — Facturation** — Import PDF/OCR, annotation, vérification, export Excel ✅
- **Audits CRUD** — Création, liste, détail, formulaire complet ✅
- **Annotation Dictionaries** — Multi-dicts, validation, persistance Supabase ✅
- **Audit Activity Trail** — Logs immutables via `audit_activity` table ✅
- **Realtime** — Supabase Realtime subscriptions (exemple dans Facturation) ✅

## Current Scope (Kevin)

### Module 2 — Inventaire/Cadastre (`src/pages/Inventaire.tsx`)
- Arborescence spatiale : SITE → NIVEAU → ZONE → PIECE (nouvelles tables DB)
- Catalogue équipements par PIECE : ECLAIRAGE / CLIMATISATION / AUTRES / PEDAGOGIQUE
- Heures de fonctionnement + coefficients correcteurs
- Moteur calcul consommation théorique (kWh = Puissance × Heures × Jours × Coef)

### Module 3 — Campagne de Mesures (`src/pages/Mesures.tsx`)
- Persistance DB des mesures importées (actuellement : rien n'est sauvegardé)
- Pipeline normalisation CSV multi-sources (Fluke, Shelly, SMA Sunny Portal)
- Visualisation séries temporelles : qualité réseau, puissance/énergie, flux PV
- Système d'alertes sur seuils (tension, déséquilibre, cos φ, puissance)
- Intégration API SMA Sunny Portal + Shelly (voir `.claude/PRD.md` pour détails)

## Do Not Touch

- `src/components/invoices/` — Module Facturation (autre scope, ne pas modifier)
- `src/components/audits/` — Module Audits (autre scope, ne pas modifier)
- `src/components/ui/` — Composants shadcn/ui (ne jamais modifier)
- `src/context/AuthContext.tsx` + `OrganizationContext.tsx` — Auth système
- `src/lib/supabase.ts` + `supabaseAdmin.ts` — Config Supabase
- `supabase/migrations/` — Ne pas modifier les migrations existantes, seulement en ajouter

## DB Tables existantes pertinentes pour Kevin

```sql
audit_sites         -- SITE avec latitude/longitude (déjà lié aux audits)
audit_buildings     -- BATIMENT (déjà lié aux sites)
audit_measurements  -- Mesures basiques (à étendre ou remplacer pour time series)
audits              -- Table parente (audit_id obligatoire sur toute donnée)
organizations       -- Tenant (organization_id obligatoire sur toute donnée)
```

## PRD complet

Voir `.claude/PRD.md` à la racine du repo pour les specs détaillées, les formules, et les points à confirmer avec le manager.
