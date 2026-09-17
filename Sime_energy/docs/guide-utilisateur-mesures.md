# Guide utilisateur — Campagne de mesure, organisation et sources IOT

> Plateforme SIMEE (CER2E) · Menus **Mesures** et **IOT**
> Version du 16/09/2026 (chantiers 1 et 2 du plan de travail).

Ce guide s'adresse à l'auditeur énergétique qui revient de terrain avec des fichiers
exportés par ses appareils de mesure (analyseur réseau, compteur, station d'air,
portail photovoltaïque…) et veut les lire, les comparer et en tirer des conclusions.
La section 6 couvre la gestion de l'organisation (inviter un collègue, rôles) et la
section 7 les sources du module IOT (rôles des appareils, raccourci vers l'analyse).

Le module se parcourt de gauche à droite : **Upload → Analyse → Visualisation →
Modèles → Comparaison**. Les onglets restent grisés tant qu'aucun fichier n'est chargé.

---

## 1. Upload — charger ses fichiers

1. Glisser-déposer un ou plusieurs fichiers (CSV, XLS, XLSX) dans la zone, ou cliquer dessus.
   **Un dossier entier** peut aussi être déposé, ou choisi avec **Importer un dossier** :
   les sous-dossiers sont parcourus, et les fichiers parasites (`._xxx` des clés USB,
   verrous Excel `~$xxx`, `.DS_Store`) sont ignorés d'office.
2. Pour chaque fichier, le **type d'appareil est deviné** d'après le nom du fichier
   (`trend`, `demand`, `solaredge`, `shelly`, `m100`…) ou, pour un capteur personnalisé,
   d'après ses **colonnes** : un fichier qui a les mêmes en-têtes que le fichier exemple
   d'un capteur enregistré lui est rattaché tout seul. Il apparaît en bleu quand il a
   été deviné : vérifiez-le et corrigez-le dans le menu de la ligne si besoin. Le
   sélecteur au-dessus de la zone sert de valeur par défaut aux fichiers non reconnus.
3. Cliquer **Traiter N fichier(s)**. Les fichiers valides passent en vert ; un fichier
   refusé affiche la raison (le cas le plus fréquent : *le fichier ne correspond pas au
   capteur sélectionné*).
4. La liste **Mes relevés** en bas récapitule tout ce qui est enregistré : appareil,
   nombre de mesures, période couverte, grandeur. Le crayon permet de **donner un nom**
   au relevé (ex. « Départ TGBT — CA 8335 ») ; c'est ce nom qui apparaîtra partout
   ensuite. La corbeille **supprime** le relevé du serveur (confirmation demandée).

### Appareils reconnus

| Appareil | Fichier attendu | Grandeur principale |
|---|---|---|
| C.A 8335 — Qualité réseau (Trend 10 min) | `*trend*.xlsx` | Puissance active (W) |
| C.A 8335 — Demande énergétique (5 min) | `*demand*.xlsx` | Énergie active (Wh) |
| Station qualité d'air M100 | `Air station M100*.xlsx` | CO₂ (ppm) |
| PV SolarEdge (15 min) | export portail `.csv` | Puissance produite (kW) |
| PV Huawei FusionSolar (journalier) | statistiques quotidiennes `.xlsx` | Production (kWh) |
| Compteur Shelly (journalier) | export cloud `.csv` | Énergie consommée (Wh) |

### Capteurs personnalisés

Pour un appareil absent de la liste, choisir **Créer un capteur personnalisé…** et
déposer un fichier exemple. **Le formulaire se pré-remplit** d'après le fichier : nom
(repris de l'en-tête de l'enregistreur, ex. « Logging Name »), colonne de date, colonne
d'heure si elle est séparée (loggers DATE / TIME), grandeur principale (première colonne
numérique hors compteur de lignes), unité (lue dans l'en-tête « Temperature(°C) » ou le
préambule, ou devinée d'après le nom : `temperature` → °C, `humidity` → %…), libellé, et
**toutes les autres colonnes** proposées en colonnes supplémentaires, texte compris — une
colonne texte (état, mode, commentaire) est gardée telle quelle dans le tableau et l'export,
mais n'apparaît pas dans les graphiques (étiquette « texte »). Sont écartées d'office les
colonnes **vides** et les colonnes **constantes** (site, pièce, nom d'appareil… même valeur
sur toutes les lignes : ce sont des métadonnées d'export) ; le compteur au-dessus de la
liste dit combien, et « Ajouter » permet d'en reprendre une. Les boutons **Toutes les
colonnes** / **Aucune** évitent de les cocher une à une. Vérifiez, corrigez, puis
**Analyser maintenant** ou **Sauvegarder le capteur**.

L'encadré **Dates interprétées** montre le premier et le dernier relevé, le pas et le
nombre de lignes tels qu'ils seront lus. C'est là qu'on repère une date lue à l'envers :
`09-05-2026` peut être le 5 septembre (mois-jour, exports américains) ou le 9 mai
(jour-mois). L'ordre est deviné quand le fichier le permet ; s'il est ambigu (un seul
jour, valeurs ≤ 12), choisissez **Jour-mois** ou **Mois-jour** — le format est alors
enregistré avec le capteur.

Le capteur est enregistré pour votre organisation avec l'**empreinte des colonnes** de
son fichier exemple : les prochains fichiers du même appareil sont reconnus au dépôt sans
rien choisir. Le **type de grandeur** (puissance / énergie / autre) est proposé d'après
l'unité ; il détermine comment le cumul est calculé (voir encadré ci-dessous) —
corrigez-le si l'unité est ambiguë.

> **Puissance, énergie ou autre ?**
> - *Puissance* (W, kW, VA…) : le cumul est obtenu en intégrant dans le temps → Wh.
> - *Énergie* (Wh, kWh…) : chaque ligne est un incrément, le cumul est la somme.
> - *Autre* (ppm, °C, %, Hz, V, A…) : pas de cumul, seule la moyenne a un sens.

---

## 2. Analyse — les chiffres

Pour le relevé courant (flèches ‹ › pour passer d'un relevé à l'autre) :

- **Période** : deux champs date/heure pour restreindre l'analyse. Cette période est
  **partagée** avec Visualisation et Modèles : ce que vous choisissez ici s'applique là-bas.
- **Cartes KPI** : durée, moyenne (hors zéros), maximum, minimum, cumul total, écart-type,
  nombre de mesures.
- **Vue par jour** : le cumul (ou la moyenne) de chaque journée ; cliquer un jour le
  sélectionne comme période.
- **Statistiques détaillées** : moyenne, écart-type, min, P10, médiane, P90, max pour
  chaque colonne du fichier (phases, cos φ, température…).
- **Détail des mesures** : la table brute, recherchable, paginée, exportable en CSV.
- **Rapport** : export PDF ou Word du résumé, des statistiques et de l'interprétation.

---

## 3. Visualisation — les courbes

Quatre vues, toutes sur la période partagée, toutes exportables en image (bouton
**Exporter en image**, PNG haute résolution) :

| Vue | Ce qu'elle montre | Quand l'utiliser |
|---|---|---|
| **Courbe** | Toutes les grandeurs du fichier superposées, chacune sur son axe si les unités diffèrent | Lire le détail, zoomer avec la réglette du bas |
| **Distribution** | Histogramme de la grandeur principale | Repérer un talon, un fonctionnement bimodal |
| **Profil journalier** | Grille heure × jour de semaine | Voir « à quelle heure ça consomme » |
| **Par période** | Barres jour / semaine / mois | Comparer des journées ; **cliquer une barre ouvre la journée** en vue Courbe |

Dans la vue jour, les boutons ‹ › passent à la veille / au lendemain.

---

## 4. Modèles — les questions d'audit

Chaque modèle répond à une question précise sur le relevé courant. Il est choisi d'après
la **nature des données** (puissance, énergie, pas de temps) et non d'après l'appareil :
le même modèle sert au Shelly, au C.A 8335, à l'onduleur ou à la station d'air. Un modèle
grisé indique pourquoi il ne s'applique pas (ex. « réservé aux puissances et énergies »).

### Profil type — *À quoi ressemble une journée typique ?*
- Pour chaque classe de jour (**ouvré / week-end / férié**), la courbe médiane par heure
  et l'enveloppe P10–P90 (la zone où tombent 80 % des journées).
- Cartes : médiane journalière de chaque classe et rapport **week-end / ouvré**
  (« le site s'éteint bien le week-end » ou pas).
- **Jours atypiques** : journées qui s'écartent de plus de 20 % de leur classe — à
  recouper avec ce qui s'est passé sur site (événement, panne, visite).

### Talon — *Qu'est-ce qui consomme quand rien ne devrait tourner ?*
- Talon retenu = médiane des minima de nuit (00h–05h) de chaque jour.
- **Part du talon dans le cumul** et **projection annuelle** (talon × 8 760 h) : ce que
  coûte ce fond de consommation sur un an.
- Talon ouvré vs week-end : identique ⇒ ce qui reste allumé la nuit reste allumé tout le
  week-end.
- Graphique : pointe et talon de chaque jour.

### Anomalies — *Que s'est-il passé d'anormal ?*
- **Complétude** de la collecte (mesures reçues / attendues).
- **Trous de collecte** (capteur muet), **valeurs figées** (capteur bloqué, ou arrêt réel
  si la valeur est 0), **pics et creux** bien au-dessus / en dessous de ce que fait
  habituellement le site à cette heure pour cette classe de jour.
- Chaque événement est daté, classé (Info / À vérifier / Critique) et expliqué en clair.
  Un filtre par type est disponible.

### Avant / Après — *L'action a-t-elle rapporté ?*
- Choisir la **date de l'action** (remplacement d'équipement, consigne, sensibilisation…).
- L'écart est calculé **à classe de jour égale** : un jour ouvré d'après contre un jour
  ouvré d'avant, jamais un dimanche contre un mardi.
- **Gain sur la période après** et **projection annuelle** ; la journée type avant/après
  montre *à quelles heures* l'action a joué.
- Un « ? » ou un avertissement signale un écart du même ordre que la variabilité d'un
  jour à l'autre : il peut n'être que du bruit. Prévoyez au moins 5 jours de chaque côté.

Le bouton **Exporter en image** capture le résultat du modèle affiché.

---

## 5. Comparaison — deux relevés face à face

### Deux modèles côte à côte
Cas typiques : un C.A 8335 et un Shelly posés sur le même départ (contrôle d'un compteur),
ou deux campagnes du même appareil.

1. Choisir le **relevé A** et le **relevé B** (et, pour chacun, la colonne à comparer :
   grandeur principale par défaut, ou une phase, une tension…).
2. Le **pas de temps** est choisi automatiquement (le plus grossier des deux, ex. 15 min
   pour un 10 min contre un 15 min) ; il peut être forcé. Les unités sont ramenées à une
   base commune (kW → W, etc.). Une puissance peut être comparée à une énergie : la
   puissance est intégrée.
3. La **période** se limite d'elle-même au recouvrement des deux relevés.
4. **Tolérance** (± % par défaut 5) : les pas hors tolérance sont surlignés en rouge.
5. **Horloge de B** : si l'un des appareils a une horloge décalée, **Détecter** cherche le
   décalage (en minutes) qui aligne le mieux les deux courbes ; il peut aussi être saisi.

Résultats :
- **Cartes** : points comparés, biais moyen, écart absolu moyen, écart max, écart des
  cumuls, corrélation, nombre de pas hors tolérance, **régression B = a·A + b** avec un
  diagnostic (« gain ≠ 1 : calibrage / rapport de TC ? », « offset constant : charge
  fantôme / zéro ? », « A et B concordent »).
- **Graphique** : A et B superposés, l'écart en dessous, zoom synchronisé.
- **Nuage A vs B** avec la droite y = x et la droite ajustée.
- **Indicateurs face à face** et **tableau des écarts** pas par pas (tri par écart).
- Exports : **image** du graphique, **CSV** du tableau, **Excel** (3 feuilles : résumé,
  indicateurs, écarts).

### Compteur général / sous-compteurs
Un compteur de référence est comparé à la **somme** des sous-compteurs censés l'expliquer
(ex. arrivée générale = clim + éclairage + prises). L'écart révèle ce qui n'est pas
sous-compté.

---

## 6. Organisation et invitations (page Mon compte)

Toutes les données de la plateforme (audits, factures, capteurs personnalisés, relevés
Shelly…) sont rattachées à une **organisation**. Un utilisateur ne voit que celles de
l'organisation dont il est membre.

### Inviter un collègue — par lien
Il n'y a pas d'envoi d'e-mail automatique : vous générez un lien et vous le transmettez
vous-même.

1. Ouvrir **Mon compte** (avatar en haut à droite) → bloc **Inviter dans <votre organisation>**.
2. Facultatif : saisir l'**e-mail de l'invité**. Si vous le renseignez, seul un compte
   connecté avec cette adresse pourra utiliser le lien (recommandé). Sinon le lien est
   « ouvert » : toute personne qui l'a peut rejoindre.
3. Cliquer **Générer un lien** : le lien `…/invite?code=XXXXXXXXXXXX` s'affiche et est
   **copié dans le presse-papiers**. Il est valable **7 jours**.
4. Envoyer le lien par le canal de votre choix (e-mail, WhatsApp…).
5. La liste **Invitations en attente** permet de **recopier** un lien ou de le
   **révoquer** (corbeille) tant qu'il n'a pas été utilisé. L'historique récent montre
   les invitations acceptées, expirées ou révoquées.

### Côté invité
1. Ouvrir le lien reçu. S'il n'a pas encore de compte, il clique **Créer un compte** ;
   sinon il se connecte. La page **Invitation** réapparaît ensuite avec le nom de
   l'organisation.
2. Cliquer **Accepter l'invitation** → il rejoint l'organisation comme **membre** et
   arrive sur le tableau de bord.
3. Messages possibles : *Invitation introuvable ou déjà utilisée* (lien révoqué ou déjà
   consommé), *Invitation expirée* (plus de 7 jours → demander un nouveau lien),
   *Cette invitation est destinée à …* (connecté avec un autre e-mail que celui invité).

### Rôles
- **Membre** : accès complet aux données de l'organisation.
- **Admin** : en plus, peut changer les rôles et retirer des membres. Le créateur de
  l'organisation est admin d'office. Un membre ne peut pas se promouvoir lui-même.

### Créer sa propre organisation
Un utilisateur sans organisation en crée une depuis **Mon compte → Organisation**
(nom + description) ; il en devient automatiquement admin.

---

## 7. Module IOT — Sources et rôles des appareils

Le module **IOT** (menu éclair) suit en continu les compteurs et capteurs Shelly des sites.
Pour que la plateforme sache **ce que mesure** chaque appareil (arrivée réseau, production
PV, groupe, départ…), on lui donne un **rôle**. Un rôle sur un site = une **source**.

### Vocabulaire des rôles

| Rôle | Ce que l'appareil mesure |
|---|---|
| **M1 — Arrivée réseau** | l'énergie soutirée au distributeur public (SENELEC, SONABEL… — le rôle ne nomme jamais le distributeur) |
| **M2 — Sélecteur / inverseur** | le point de bascule réseau ↔ production locale |
| **M3 — Charge totale** | tout ce que le site consomme, quelle que soit la source |
| **M4 — Groupe électrogène** | la production de secours |
| **M5 — Production PV** | la production photovoltaïque |
| **Batterie (BESS)** | charge / décharge du stockage |
| **Départ / sous-charge** | un circuit ou équipement individuel (clim, prise, éclairage…) |
| **Capteur d'ambiance** | température, humidité, CO₂, pression… |
| **Autre** | relais, contacts, boutons, détecteurs |

Les schémas de raccordement **A à F** (réseau seul, réseau + PV, PV + batterie, groupe seul,
réseau + groupe, PV + groupe) indiquent où se placent M1…M5 selon l'architecture du site ;
ils sont visibles dans la légende de l'onglet Sources (survoler une lettre pour agrandir).

### Rattacher les appareils — `IOT → Paramètres → Rôles des appareils`
1. **Propositions à confirmer** : rôles déduits automatiquement du nom de l'appareil
   (ex. « M4_Groupe électrogène »). Vérifier, puis **Confirmer** (ou **Tout confirmer**).
   Tant qu'un rôle n'est pas confirmé, il est affiché « à confirmer » et n'est pas utilisé
   par les raccourcis.
2. **Appareils sans rôle**, groupés par site : un rôle est **pré-rempli** d'après la famille
   du matériel (prise/lumière → Départ, capteur → Ambiance, relais → Autre). Le bouton
   **Rattacher les N déductibles** les valide d'un coup. Les compteurs triphasés/biphasés
   et les appareils de famille inconnue n'ont pas de proposition : c'est une vraie
   décision (arrivée générale ? tableau divisionnaire ? charge totale ?) à prendre avec
   la personne qui connaît le câblage.
3. **Rattachements confirmés** : modifiables à tout moment ; l'option **TC inversé** signale
   un transformateur de courant monté à l'envers (soutirage et injection permutés).

Les rôles sont enregistrés en base : ils sont partagés entre utilisateurs et postes.

### Lire les sources — `IOT → Sources`
- Une carte par **site**, et dans chaque site une ligne par rôle avec ses appareils.
  Les rôles « à confirmer » apparaissent en pointillés ; les appareils **Non classés**
  restent listés (ils ne sont jamais cachés).
- **Analyser** ouvre l'onglet Analyse avec les appareils de la source **pré-cochés** —
  la sélection reste modifiable et le chargement libre par site, famille, appareil et
  période fonctionne exactement comme avant. Une source est un raccourci, jamais un
  préalable : un appareil sans rôle s'extrait toujours.
- **Rattacher des appareils** / **Classer** renvoient vers l'écran des rôles.
- Les compteurs en tête (appareils, rattachés, à confirmer, non classés) donnent l'état
  d'avancement du rattachement.

### Bibliothèque de fichiers — `IOT → Fichiers`
- Les fichiers importés (originaux, nettoyés, factures) sont **enregistrés sur le
  serveur** au moment de l'import : ils sont retrouvés à la prochaine connexion, sur
  n'importe quel poste ou navigateur.
- Chacun ne voit que **ses propres fichiers** — ils ne sont pas partagés avec les autres
  membres de l'organisation.
- Le contenu d'un fichier n'est téléchargé qu'à sa première ouverture (Nettoyer, Analyse,
  Voir) ; l'aperçu de la carte et les 10 premières lignes sont disponibles tout de suite.
- Si un enregistrement échoue (connexion coupée), un message rouge le signale en bas à
  droite : le fichier reste utilisable dans la session mais ne sera pas retrouvé ensuite —
  réimportez-le.
- **Nettoyer** / **Analyse** depuis une carte ouvrent directement le fichier dans l'onglet
  visé, y compris après un rechargement de page.

---

## 8. Questions fréquentes

**Mon fichier est refusé.** Vérifiez le type d'appareil sur la ligne du fichier : un
export « demand » chargé comme « trend » (ou l'inverse) est la cause n° 1. Pour un format
inconnu, créez un capteur personnalisé.

**Mes relevés sont-ils conservés ?** Oui. Chaque relevé traité est enregistré sur le
serveur au moment de l'import et retrouvé à la prochaine connexion, sur n'importe quel
poste — la liste **Mes relevés** de l'onglet Upload les récapitule. Chacun ne voit que ses
propres relevés. La corbeille **supprime définitivement** le relevé (une confirmation
est demandée) ; le crayon le renomme. Si un enregistrement échoue (connexion coupée), un
message rouge le signale : le relevé reste utilisable dans la session mais ne sera pas
retrouvé ensuite — réimportez-le.

**Le cumul d'une puissance me paraît faux.** Vérifiez le *type de grandeur* du capteur :
une puissance déclarée comme énergie est sommée au lieu d'être intégrée.

**Le modèle Talon est grisé.** Il demande des mesures infra-journalières (au moins une
par heure) et une puissance ou une énergie ; il n'a pas de sens sur du CO₂ ou sur un
bilan journalier.

**L'écart Avant / Après est marqué « ? ».** Trop peu de jours ou trop de variabilité pour
conclure ; allongez la période de mesure d'un côté ou de l'autre.
