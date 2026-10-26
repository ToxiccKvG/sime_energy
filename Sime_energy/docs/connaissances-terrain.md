# Connaissances terrain — sites, appareils, pièges des données

> Ce qu'on a appris sur les sites et sur les données Shelly, et qu'on ne retrouve **pas dans le code**.
> Rédigé le 26/10/2026 à partir des notes de travail du 07/2026 au 22/10/2026.
> Chaque fait est daté : en cas de doute, **la base fait foi**. Vérifiez avant de vous appuyer sur une ligne ancienne.
>
> À lire avec : [`runbook-data.md`](./runbook-data.md) (exploitation de la collecte) et
> [`module-mesures.md`](./module-mesures.md) (documentation technique).
>
> **Règle d'entretien :** une découverte sur un site ou un appareil = une ligne ici, datée, dans le même commit.

---

## 1. Les sites

### Comptes Shelly Cloud

La collecte lit **5 sites** (une clé Shelly par site). La table `shelly_accounts` est la source de vérité (voir § 3.1).

| Site | Pays / distributeur | Compte | Serveur |
|---|---|---|---|
| Ma Maison | Sénégal / SENELEC | d.gassama@cer2e.com | shelly-88-eu |
| Académie CER2E | Sénégal / SENELEC | academy@cer2e.com (logement principal) | shelly-97-eu |
| Bureau CER2E Dakar | Sénégal / SENELEC | clé du logement Dakar, collecté depuis le 19/10 | shelly-299-eu |
| Bureau CER2E Thiès | Sénégal / SENELEC | clé du logement Thiès, collecté depuis le 19/10 | shelly-299-eu |
| Donsin | Burkina Faso / **SONABEL** | compte dédié Donsin | shelly-271-eu |

- Les mots de passe ne sont jamais écrits dans le dépôt. Ils sont gérés par le manager.
- Le compte « Prestation CER2E » est suspendu et retiré de la configuration.
- Le pays et le distributeur ne sont stockés nulle part en base (décision du 01/09 : à ajouter avec le moteur tarifaire). **Ne jamais écrire « SENELEC » dans un libellé générique** : c'est faux pour Donsin.

### Ma Maison (17/09)

- Le Shelly EM « EM-SENELEC » mesure deux choses : **canal 1 = arrivée SENELEC** (rôle `M1_RESEAU`) et canal 2 = éclairage.
- Les prises représentent environ 87 % de l'arrivée. Le reste apparaît comme « non mesuré » dans la courbe de charge, et c'est normal.
- Mode de calcul de la consommation : `arrivee` (table `site_bilan`).
- Absence déclarée : propriétaire en voyage à partir du 28/09 vers 15-16 h (`site_absences`).
- Piles à changer, constatées le 28/09 : Gen3_H&T (0 %), BLU H&T_Salon (4 %, valeur figée depuis le 17/09).
- **La « Clé station météo » (`b0b21cfaf1a0`) n'est pas à Ma Maison** (21/10). C'est la passerelle de la station de Donsin. Elle a été déclarée retirée.

### Donsin (Burkina Faso)

- Compte Shelly dédié depuis le 09/07. Il contient la station météo, le capteur d'ouverture de porte, le H&T « Base vie » et une Plug M.
- **Le PV est en aval de l'« Arrivée générale »** : ce compteur ne voit que le complément SONABEL. Il n'y a ni compteur de charge (M3) ni compteur PV (M5), donc **aucun bilan complet n'est possible**. Mode de calcul : `indeterminee`. On n'affiche que les « départs mesurés ».
- **L'Arrivée générale est déconnectée volontairement depuis le 30/08** (décision du 16/10). Ce n'est pas une panne. Le Shelly H&T et The Pill sont aussi déconnectés volontairement.
- **Appareils censés tourner au 26/10 : PC1 FOND_BUREAU et PC2 ENTREE** (prises Shelly), plus le capteur d'ouverture de porte, qui n'émet que lorsque la porte bouge.
- **Station météo** (`XB211299189491624`) — **débranchée volontairement le 26/10 à 10:55 UTC** (déclarée dans `shelly_device_retraits`). Ce qui suit vaut pour ses données jusqu'à cette date :
  - elle n'émet que de **07:20 à 17:56 UTC** (probablement une mise en veille faute de charge solaire, non confirmé). Ne jamais présenter de moyenne sur 24 h ni de minimum de nuit ;
  - `precipitation_mm` est un **compteur cumulé** depuis l'installation. Seul l'écart entre deux relevés compte, et il ne faut **jamais le filtrer** (ni bornes ni filtre anti-aberrant) ;
  - `battery_level` est bloqué à 67 % : utiliser `battery_voltage_v` à la place. L'UV suit exactement l'éclairement (corrélation de 1,00) ;
  - la collecte élimine les relevés en double pour cette station seulement (`DEDUP_MEASURE_IDS`, depuis le 05/10). Vues : `shelly_pluie_horaire` et `shelly_pluie_journaliere`.
- Un même appareil a pu remonter sous deux noms (une ancienne collecte écrivait encore). L'affichage prend le nom courant depuis le 16/10.

### Académie CER2E — un compte, trois arrivées distinctes (17/09)

1. **Building communal 50 kW** : chaîne M1 (réseau) → M2 (sélecteur PV/réseau) → M3 (charge), avec un PV en amont du sélecteur. Le surplus est injecté au réseau.
2. **TGBT_EPT Thiès** : compteur séparé, sans PV. **Le dispositif a été retiré**, les données s'arrêtent au 22/08 (rôle `AUTRE`).
3. **Bureau CER2E-Thiès** : sur un compteur prépayé Woyofal. Ses départs sont hors bilan.

À retenir :
- **Ne jamais faire un bilan M1…M5 en mélangeant ces trois arrivées.** Mode de calcul : `charge_M3`.
- **Capteurs désactivés volontairement** (ce ne sont pas des pannes) :
  - M4 groupe électrogène (2 canaux), Cafétéria_TD RDC, Charges_TD niveau 2 ;
  - FOUTA POIDS LOURDS (M1, M2, M4, depuis le 31/07-01/08) : ils seront réutilisés ailleurs. S'ils réapparaissent, vérifier d'abord sur quel site ils ont été réaffectés ;
  - au 16/10, 42 appareils de l'Académie sont déclarés « déconnecté volontairement » (`shelly_device_retraits`).
- **PV_BUILDING COMMUNAL** :
  - pince de courant (TC) montée à l'envers (`sens_inverse = true`) : la production apparaît en soutirage ;
  - **incident sur la centrale depuis le 20/08** : la production tombe à environ un tiers (≈ 45 kWh/j au lieu de ≈ 150). Le constat date du 19/10 et la fin de l'incident est inconnue. Ne jamais supprimer ces données : elles sont marquées « Incident ».
- **Anomalie ouverte** : M1 du Building communal ne remonte aucune injection, alors que M2/M3 voient jusqu'à −2,2 kW. Piste : la configuration du Pro 3EM ou le rapport du TC. Non résolu.
- **Panne du 25/09** : 22 appareils sur 25 hors ligne, piles pleines, PV en marche. **Le problème est physique, sur place** (passerelle ou point d'accès tombé probablement vers 08:51), pas dans la collecte. Une visite est nécessaire.
- **Logements du compte** (16/10) : le compte en a trois dans l'app (Académie principal, Bureau Dakar, Bureau Thiès). **Chaque logement a sa propre clé** : une clé ne voit que son logement. Les bureaux n'étaient plus collectés depuis juin/juillet. **Depuis le 19/10, ils sont collectés comme deux sites distincts**, « Bureau CER2E Dakar » et « Bureau CER2E Thiès », avec chacun sa ligne dans `shelly_accounts`. Les appareils de Dakar (Général SENELEC, Yacouba, Bakary, Samba…) sont ceux du Shelly EM corrigé le 19/10 (§ 2).

---

## 2. Les appareils Shelly : pièges connus

| Piège | Ce qu'il faut savoir |
|---|---|
| **Shelly EM (2 pinces)** | Jusqu'au 19/10, la collecte écrivait la somme des 2 pinces sur la ligne principale, et la pince 1 avait en plus sa propre ligne `<id>_1` : elle était comptée deux fois. C'est corrigé (ligne principale = pince 0 seule) et l'historique a été recalculé. Copies de l'ancien état : `backup.shem_20261019` et `backup.shem_horaire_20261019`. |
| **Thermostat « fantôme » `1720017229409`** | C'est un objet virtuel de l'app Shelly, pas un appareil réel. **Un identifiant de 13 chiffres seulement n'est jamais un appareil physique.** La collecte ignore ces objets depuis le 21/09. |
| **Tension 0 V sur une prise** | Elle veut dire **relais ouvert**, pas coupure de courant. |
| **Lampes Shelly** | Elles se taisent quand l'interrupteur est coupé (1 à 15 h par jour). Ne jamais s'en servir pour juger si les données sont complètes. |
| **Champ `online`** | Inutilisable (presque toujours vrai). |
| **Capteurs à pile** | Ils ne relèvent pas au même rythme que les appareils sur secteur. La liste pile/secteur est dans `shelly_device_types.alimentation`. L'ancien test sur le préfixe `SB*`/`S3SN*` se trompait sur 5 types. |
| **Mot de passe Shelly changé** | La clé d'autorisation cloud est **révoquée automatiquement** : la collecte du compte s'arrête. Il faut la régénérer dans control.shelly.cloud (Settings → Cloud → Auth Key) et la mettre à jour dans `shelly_accounts`. |
| **Appareil muet : hors ligne ou retiré ?** | `device/all_status` ne renvoie que les appareils **en ligne**. `interface/device/list` renvoie tous les appareils **déclarés**. Un appareil absent du premier mais présent dans le second est seulement hors ligne. |
| **API Shelly** | Elle limite le nombre d'appels (erreur HTTP 429) : espacer les appels de 15 à 20 s. |
| **La plateforme ne pilote rien** | Elle **lit** Shelly et n'écrit jamais dedans. Les appareils et les comptes se créent dans l'app Shelly. Le pilotage marche/arrêt a été envisagé pour après la mise en ligne (22/09), comme chantier séparé. |

---

## 3. Base de données et collecte : pièges

### 3.1 Comptes de collecte
- Dès que `shelly_accounts` contient au moins un compte actif, le secret `SHELLY_ACCOUNTS` est **entièrement ignoré** : il n'y a pas de fusion entre les deux. En modifiant la table, il faut donc **garder tous les comptes actifs**, sinon la collecte des autres s'arrête sans aucun message.

### 3.2 Lectures et performances
- **PostgREST plafonne à 1 000 lignes par requête**, même avec `.limit(50000)`. Toute somme calculée côté navigateur sur `shelly_cl` est donc fausse sans pagination. **Règle : agréger dans une fonction SQL** (`fn_energy_*`, `fn_profil_charge`, `fn_qualite`).
- Ne jamais reconstruire la liste des appareils en parcourant `shelly_cl` : lire `shelly_devices_catalog` (ou la vue `shelly_devices_catalog_visible`, filtrée par organisation). C'est une vue matérialisée avec environ 40 min de retard : `derniere_lecture` mesure depuis combien de temps un appareil est muet, elle ne dit pas s'il est en ligne.
- Index de `shelly_cl` : un index n'est utile que si `ts` vient en premier, ou juste après une colonne filtrée par égalité (`site`, `device_id`). L'index `idx_readings_dashboard` a été supprimé le 28/09 : la base est passée de 4,7 à 3,4 Go.
- Les requêtes passées par l'outil `supabase db query --linked` sont coupées au bout d'environ 100 s (HTTP 524) : découper par appareil × mois. Pour paginer `shelly_cl`, paginer par `ts` et non par `id`, qui provoque des expirations.
- Une fonction SQL `STABLE` qui a besoin d'un délai d'expiration le déclare avec `SET statement_timeout` dans sa définition (`SET LOCAL` dans le corps est refusé).

### 3.3 Interpréter les mesures
- **kWh = écart du compteur cumulé `wh_tot`** entre la première et la dernière lecture, appareil par appareil, en ignorant les lignes où `wh_tot` est vide.
- **Lignes vides** : d'avril à août, la collecte écrivait des lignes entièrement vides pour les appareils injoignables (57 % des heures en août). Depuis le 16/10, `nb_mesures_reelles` les distingue et une heure vide compte comme **absente**, pas comme 0 kWh.
- **Relectures** : le collecteur relit chaque minute la dernière valeur connue. Selon l'appareil, 44 à 61 % des lignes brutes ne sont pas des mesures nouvelles. La vraie clé d'une mesure est `measured_at`.
- **Agrégation dans le temps** : par heure, on additionne entre appareils ; par jour, on fait la moyenne des heures. Additionner 24 moyennes horaires donne une puissance 24 fois trop grande. L'énergie, elle, s'additionne aux deux niveaux.
- **TC monté à l'envers** (`sens_inverse`) : `fn_energy_by_device` ne le gère pas et compte 0. `fn_energy_profile` et `fn_energy_repartition` permutent soutirage et injection pour ces appareils.
- **Ne jamais additionner l'arrivée et les départs** : on compterait la même énergie deux fois (183 kWh au lieu de 97 à Ma Maison). La consommation se lit selon le mode du site (`site_bilan`). Les départs servent de répartition et l'écart est affiché comme « non mesuré ».
- **Non mesuré n'est pas 0** : un flux sans compteur, ou dont le compteur reste à 0, s'affiche « non mesuré », dans le rapport comme à l'écran (`etatDuFlux`).
- **Données jamais supprimées** : un appareil arrêté se déclare dans `shelly_device_retraits` (ce qui arrête les alertes sans toucher aux mesures). Une absence se déclare dans `site_absences`.

### 3.4 Coupures de courant (méthode validée le 24/09)
- La détection par tension à 0 V **ne marche pas** : sur l'arrivée, le Shelly perd son alimentation et **cesse d'émettre** avant d'afficher 0 V.
- Signature fiable : **tous les appareils sur secteur se taisent en même temps, pendant que les capteurs à pile continuent d'émettre**. Des trous séparés de moins de 5 min forment une seule coupure.
- Signe précurseur observé : la tension tombe vers 120 V juste avant l'arrêt.
- L'énergie non distribuée (END) se calcule à partir de la puissance habituelle au même créneau (moyenne sur 14 jours). Le calcul complet reste à faire avec le manager : il manque l'unité d'activité par site et la distinction entre perte d'activité et surcoût de carburant du groupe.

---

## 4. Fichiers importés : règles de lecture (19/10)

- **Une colonne par série.** Certains exports Shelly Cloud empilent plusieurs sections sous un même en-tête (Phase A/B/C, Total, Retour…). On les remet en colonnes **avant tout calcul**. C'est fait dans `lib/tableau-sections.ts` (front) et `_desempiler_sections` (backend `sensors.py`).
- **Ne jamais additionner phases et total.** S'il n'y a pas de total, total = A + B + C.
- L'en-tête est la ligne juste au-dessus des premières données. Une ligne d'unités ne contient **que** des unités.
- Une virgule à la fois décimale et séparateur (`01/05/2026 00:00, 165,700`) se recolle en 165,7.
- Tester chaque nouveau format sur un fichier réel dont on connaît les sous-totaux (somme des phases = total).

---

## 5. Accès et sécurité (rappels)

- **La plateforme est sur invitation seulement** depuis le 22/10 : un admin invite depuis « Mon compte », la personne choisit son mot de passe en ouvrant le lien. Les données IoT sont cloisonnées par organisation (`site_organisation`). Voir [`securite.md`](./securite.md).
- L'adresse de la plateforme doit être déclarée dans le secret `INVITE_ALLOWED_ORIGINS` de la fonction `inviter-membre`, sinon le lien d'invitation est refusé.
- Le `.env` de `SHELLY_GCP_00` contient en réalité la clé **anon** sous le nom `SUPABASE_SERVICE_ROLE_KEY`. Face à une erreur `42501` dans un script, décoder le jeton (champ `role`) avant de toucher aux droits.

---

## 6. Questions ouvertes

| Sujet | État |
|---|---|
| Panne Académie du 25/09 | Visite sur site nécessaire |
| Production PV Building communal ÷ 3 depuis le 20/08 | À vérifier sur site (onduleur, strings) |
| Injection absente sur M1 Building communal | Configuration Pro 3EM / rapport du TC à vérifier |
| Rôles des appareils des bureaux Dakar et Thiès | 5 appareils de Dakar sans rôle (constat du 26/10) |
| Station Donsin muette la nuit | Cause à confirmer (batterie, support Shelly) |
| Pays et distributeur par site | À ajouter avec le moteur tarifaire |
| Énergie non distribuée | À faire avec le manager |
