# Commandes terminal fréquentes

Référence rapide des commandes utilisées pour travailler sur le projet SIME (Git, backend FastAPI et frontend React). Les commandes sont à exécuter depuis le dossier racine `Sime_energy/`, sauf indication contraire.

## 1. Git & gestion de la branche `shift/Maurice`
| Commande | Description |
| --- | --- |
| `git status -sb` | Vérifie l'état des fichiers suivis/non suivis (format compact). |
| `git fetch origin shift/Maurice` | Met à jour la branche distante sans modifier la copie locale. |
| `git checkout shift/Maurice` | Bascule sur la branche de travail (ou la crée en local si besoin). |
| `git pull origin shift/Maurice` | Récupère les derniers changements distants sur la branche courante. |
| `git add <chemin>` | Ajoute un ou plusieurs fichiers à l'index avant commit. |
| `git commit -m "<message>"` | Crée un commit avec les fichiers indexés. |
| `git push origin shift/Maurice` | Envoie le commit local sur la branche distante. |
| `git log --oneline -n 5` | Affiche rapidement les 5 derniers commits. |
| `git diff` | Visualise les modifications non commitées. |
| `git stash push -m "<raison>"` | Met de côté des modifications locales sans les commiter. |
| `git stash apply` | Réapplique le dernier stash (ou `git stash pop`). |

## 2. Backend FastAPI (`cd sime-backend-main`)
| Commande | Description |
| --- | --- |
| `python -m venv .venv` | Crée un environnement virtuel Python (à faire une seule fois). |
| `source .venv/bin/activate` | Active l'environnement virtuel (obligatoire avant d'installer/ lancer). |
| `pip install -r requirements.txt` | Installe les dépendances backend. |
| `uvicorn main:app --reload --host 0.0.0.0 --port 8000` | Lance l'API FastAPI en mode dev (OpenAPI sur `/docs`). |
| `pytest` (si configuré) | Point de départ pour une future suite de tests backend. |

> Pensez à exporter/charger les variables d'environnement (`.env`) avant de démarrer le serveur.

## 3. Frontend React/Vite (`cd sime-front`)
| Commande | Description |
| --- | --- |
| `bun install` | Installe les dépendances (utiliser bun uniquement). |
| `bun dev --open` | Lance l'app en mode développement sur `http://localhost:5173`. |
| `bun run build` | Génère le bundle de production (dossier `dist/`). |
| `bun preview` | Sert localement le build pour vérification. |
| `bun lint` | Lint du code via ESLint 9 + TypeScript. |

## 4. Divers & productivité
| Commande | Description |
| --- | --- |
| `cp sime-front/.env.example sime-front/.env` (si dispo) | Point de départ pour créer un fichier `.env`. |
| `ls -R | less` | Explorer rapidement l'arborescence si besoin. |
| `supabase db push` (si CLI configurée) | Synchroniser les migrations locales vers Supabase (optionnel selon setup). |

N'hésitez pas à compléter ce fichier au fur et à mesure de l'ajout d'outils (tests, scripts de déploiement, etc.).
