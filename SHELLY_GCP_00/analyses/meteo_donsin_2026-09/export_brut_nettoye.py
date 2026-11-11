"""Classeur Excel unique : données brutes + données nettoyées, station météo Donsin, septembre 2026.
Entrée : raw.pkl (43 200 lignes shelly_cl). Sortie : out/Meteo_Donsin_2026-09_brut_vs_nettoye.xlsx

Principes :
  * Le BRUT est conservé tel quel (aucune ligne retirée), chaque ligne reçoit un statut.
  * Les CUMULS (precipitation_mm = compteur depuis l'installation) ne sont JAMAIS filtrés ni modifiés ;
    on ajoute seulement l'incrément entre deux mesures pour obtenir la pluie réelle.
  * Les valeurs « figées » = relectures de la dernière mesure par le poller pendant le silence de la station
    (measured_at n'avance plus) : retirées. Un gel de capteur réel (valeurs identiques alors que measured_at avance) est
    recherché séparément.
"""
import numpy as np, pandas as pd, os

raw = pd.read_pickle("raw.pkl"); raw.columns = ["ts"] + list(raw.columns[1:])
raw = raw.sort_values(["ts"]).reset_index(drop=True)
raw["ecart_collecte_mesure_min"] = ((raw.ts - raw.measured_at).dt.total_seconds() / 60).round(1)
n_raw = len(raw)

# ---------- R1 : relectures figées (même measured_at déjà collecté) ----------
raw["statut"] = np.where(raw.duplicated("measured_at", keep="first"), "Figée (relecture)", "Mesure réelle")
n_stale = int((raw.statut != "Mesure réelle").sum())
# nuit/silence : durée de chaque séquence figée
u = raw[raw.statut == "Mesure réelle"].set_index("measured_at").sort_index()
base = u[u.index < "2026-09-01"]                       # dernière mesure d'août = base de calcul des incréments
u = u[u.index >= "2026-09-01"].copy()
n_u = len(u)

V = ['temperature', 'humidity', 'uv_index', 'illuminance_lux', 'wind_speed_ms', 'wind_gust_ms',
     'wind_direction_deg', 'pressure_hpa', 'dewpoint_c', 'feels_like_c', 'battery_voltage_v', 'signal_rssi']
CUMUL = ['precipitation_mm']
log = []; cell_log = []   # (rule, measured_at, variable, value)
c = u[V].copy()

def exclude(mask, var, rule):
    for t, v in c.loc[mask, var].items():
        cell_log.append((rule, t, var, v))
    log.append((rule, var, int(mask.sum())))
    c.loc[mask, var] = np.nan

# ---------- R2 : bornes physiques (cumuls exclus) ----------
bounds = {'temperature': (10, 50), 'humidity': (0, 100), 'uv_index': (0, 16), 'illuminance_lux': (0, 200000),
          'wind_speed_ms': (0, 40), 'wind_gust_ms': (0, 60), 'wind_direction_deg': (0, 360), 'pressure_hpa': (940, 1040)}
for k, (lo, hi) in bounds.items():
    exclude((c[k] < lo) | (c[k] > hi), k, f"R2 Hors bornes physiques [{lo} ; {hi}]")

# ---------- R3 : pics isolés (Hampel, médiane glissante 11 mesures) ----------
for k, thr in {'temperature': 3.0, 'humidity': 15.0, 'pressure_hpa': 2.0, 'wind_speed_ms': 4.0}.items():
    med = c[k].rolling(11, center=True, min_periods=5).median()
    exclude((c[k] - med).abs() > thr, k, f"R3 Pic isolé (écart > {thr} vs médiane glissante)")

# ---------- R4 : gel réel du capteur (measured_at avance mais toutes les valeurs vives identiques) ----------
live = ['temperature', 'humidity', 'pressure_hpa', 'wind_speed_ms', 'wind_gust_ms', 'wind_direction_deg', 'dewpoint_c', 'feels_like_c']
key = u[live].astype(str).agg("|".join, axis=1)
run = (key != key.shift()).cumsum()
sz = key.groupby(run).transform("size")
frozen = sz >= 10
n_frozen = int(frozen.sum())
for k in live:
    if n_frozen:
        exclude(frozen, k, "R4 Gel réel du capteur (≥ 10 mesures identiques)")
log.append(("R4 Gel réel du capteur (≥ 10 mesures identiques sur toutes les variables vives)", "toutes", n_frozen))

# ---------- R5 : incohérences (signalées, non supprimées) ----------
incoh = (c.wind_gust_ms < c.wind_speed_ms) | (c.dewpoint_c > c.temperature + 0.1)
log.append(("R5 Incohérence rafale < vent moyen ou rosée > température (signalée seulement)", "", int(incoh.sum())))

# ---------- Cumul de pluie : jamais filtré ----------
cum = u["precipitation_mm"]
prev = pd.concat([base.precipitation_mm.tail(1), cum]).shift(1).iloc[1:]
prev.index = cum.index
inc = (cum - prev).round(2)
resets = int((inc < 0).sum())
inc = inc.clip(lower=0)
gap_min = (u.index.to_series().diff().dt.total_seconds() / 60).round(1)
gap_min.iloc[0] = round((u.index[0] - base.index[-1]).total_seconds() / 60, 1)

clean = c.copy()
clean.insert(8, "pluie_cumul_mm", cum)
clean.insert(9, "pluie_increment_mm", inc)
clean["ecart_mesure_precedente_min"] = gap_min
excl = pd.DataFrame(cell_log, columns=["regle", "measured_at", "variable", "valeur_exclue"])
clean["valeurs_exclues"] = excl.groupby("measured_at").variable.agg(", ".join).reindex(clean.index).fillna("")
clean["alarme_humidite_boitier"] = u.moisture_alarm
clean["signalement_incoherence"] = np.where(incoh, "rafale<vent ou rosée>T", "")

# ---------- Agrégats ----------
per_day = pd.DataFrame({
    "lignes_brutes": raw.groupby(raw.ts.dt.date).size(),
    "lignes_figees_retirees": raw[raw.statut != "Mesure réelle"].groupby(raw.ts.dt.date).size(),
})
per_day.index = pd.to_datetime(per_day.index)
per_day["mesures_reelles"] = per_day.lignes_brutes - per_day.lignes_figees_retirees
D = pd.DataFrame(index=pd.date_range("2026-09-01", "2026-09-30"))
D = D.join(per_day)
D["part_figee_%"] = (D.lignes_figees_retirees / D.lignes_brutes * 100).round(1)
fl = u.index.to_series().groupby(u.index.date)
D["premiere_mesure"] = pd.Series(fl.min().dt.strftime("%H:%M").values, index=pd.to_datetime(list(fl.min().index)))
D["derniere_mesure"] = pd.Series(fl.max().dt.strftime("%H:%M").values, index=pd.to_datetime(list(fl.max().index)))
dd = clean.groupby(clean.index.date)
for k, nm in [("temperature", "T"), ]:
    pass
D["T_min_C"] = clean.temperature.resample("D").min(); D["T_moy_C"] = clean.temperature.resample("D").mean().round(2)
D["T_max_C"] = clean.temperature.resample("D").max(); D["HR_moy_%"] = clean.humidity.resample("D").mean().round(1)
D["pression_moy_hPa"] = clean.pressure_hpa.resample("D").mean().round(1)
D["vent_moy_ms"] = clean.wind_speed_ms.resample("D").mean().round(2); D["rafale_max_ms"] = clean.wind_gust_ms.resample("D").max()
D["UV_max"] = clean.uv_index.resample("D").max()
D["pluie_cumul_fin_jour_mm"] = clean.pluie_cumul_mm.resample("D").last()
D["pluie_jour_mm"] = clean.pluie_increment_mm.resample("D").sum().round(1)
D.index.name = "date"

rain_total = round(float(cum.iloc[-1] - base.precipitation_mm.iloc[-1]), 1)
rain_ev = clean.loc[clean.pluie_increment_mm > 0, ["pluie_cumul_mm", "pluie_increment_mm", "ecart_mesure_precedente_min"]].copy()
rain_ev["tombee_pendant_silence"] = np.where(rain_ev.ecart_mesure_precedente_min > 360, "oui (vue au réveil)", "non")
rain_wake = round(float(rain_ev.loc[rain_ev.tombee_pendant_silence != "non", "pluie_increment_mm"].sum()), 1)

# trous de transmission
dm = u.index.to_series().diff().dt.total_seconds() / 60
g = dm[dm > 10]
gaps = pd.DataFrame({"debut_silence": g.index - pd.to_timedelta(g, unit="m"), "reprise": g.index, "duree_h": (g / 60).round(2)}).reset_index(drop=True)

# ---------- Mise en forme des feuilles ----------
fr = {"temperature": "Température (°C)", "humidity": "Humidité (%)", "uv_index": "Indice UV", "illuminance_lux": "Éclairement (lux)",
      "wind_speed_ms": "Vent moyen (m/s)", "wind_gust_ms": "Rafale (m/s)", "wind_direction_deg": "Direction vent (°)",
      "pressure_hpa": "Pression (hPa)", "dewpoint_c": "Point de rosée (°C)", "feels_like_c": "Ressenti (°C)",
      "battery_voltage_v": "Tension batterie (V)", "signal_rssi": "Signal Wi-Fi (dBm)",
      "pluie_cumul_mm": "Pluie CUMUL depuis installation (mm) — non filtré", "pluie_increment_mm": "Pluie depuis mesure précédente (mm)",
      "ecart_mesure_precedente_min": "Écart avec mesure précédente (min)", "valeurs_exclues": "Valeurs exclues (nettoyage)",
      "alarme_humidite_boitier": "Alarme humidité boîtier", "signalement_incoherence": "Signalement cohérence"}
clean_x = clean.reset_index().rename(columns={"measured_at": "Horodatage mesure (UTC)", **fr})
raw_cols = ["ts", "measured_at", "statut", "ecart_collecte_mesure_min", "temperature", "humidity", "uv_index", "illuminance_lux", "wind_speed_ms",
            "wind_gust_ms", "wind_direction_deg", "pressure_hpa", "precipitation_mm", "dewpoint_c", "feels_like_c", "battery_level",
            "battery_voltage_v", "signal_rssi", "moisture_alarm", "online", "site", "room", "name", "device_id", "device_type", "device_family"]
raw_x = raw[raw_cols].rename(columns={"ts": "Collecté le (UTC)", "measured_at": "Horodatage mesure (UTC)", "statut": "Statut nettoyage",
                                      "ecart_collecte_mesure_min": "Âge de la mesure à la collecte (min)", "precipitation_mm": "Pluie CUMUL depuis installation (mm)",
                                      **{k: v for k, v in fr.items() if k in raw_cols}})

readme = [
    ("STATION MÉTÉO DONSIN — SEPTEMBRE 2026 : DONNÉES BRUTES vs NETTOYÉES", None),
    ("Appareil", "Shelly SBWS-90CM, device_id XB211299189491624 — site Donsin. Horodatages UTC (= heure locale).  Source : table shelly_cl (Supabase)."),
    ("", ""),
    ("ONGLETS", ""),
    ("Brut", f"{n_raw:,} lignes, telles que collectées (1/minute). La colonne « Statut nettoyage » indique ce qui est retiré (grisé)."),
    ("Nettoyé", f"{n_u:,} mesures réelles, 1 ligne par mesure distincte, valeurs aberrantes vidées. Le cumul de pluie est conservé intact."),
    ("Journal nettoyage", "Nombre de lignes/valeurs retirées par règle, et détail cellule par cellule des valeurs exclues."),
    ("Pluie", "Cumul compteur (depuis l'installation) → pluie réelle par jour et par événement."),
    ("Journalier", "Par jour : lignes brutes, part figée retirée, fenêtre de transmission, T/HR/vent/pression, pluie."),
    ("Silences", "Périodes où la station ne transmet pas (valeurs figées dans le brut)."),
    ("", ""),
    ("PRINCIPAUX CONSTATS", ""),
    ("Données figées", f"{n_stale:,} lignes brutes sur {n_raw:,} ({n_stale / n_raw:.1%}) ne sont que la relecture de la dernière mesure connue : la station ne transmet que de ~07 h 20 à ~18 h UTC ; le reste du temps le poller relit la même valeur chaque minute. Elles sont retirées."),
    ("Gel réel du capteur", "Recherche de séquences où measured_at avance mais toutes les valeurs restent identiques (≥ 10 mesures) : " + ("aucune détectée." if n_frozen == 0 else f"{n_frozen} mesures détectées et exclues.")),
    ("Précipitations", f"precipitation_mm est un COMPTEUR CUMULATIF depuis l'installation de la station (de {base.precipitation_mm.iloc[-1]} mm le 31/08 à {cum.iloc[-1]} mm le 30/09). Il n'est ni filtré ni modifié. Pluie réelle de septembre = différence = {rain_total} mm (dont {rain_wake} mm tombés pendant un silence de la station et vus au réveil). Remises à zéro du compteur : {resets}."),
    ("Batterie", "Le champ battery_level est figé à 67 % toute la période (inexploitable, présent dans le Brut seulement) ; utiliser la tension batterie."),
    ("", ""),
    ("RÈGLES DE NETTOYAGE (dans l'ordre)", ""),
    ("R1", "Retrait des relectures figées : lignes dont measured_at a déjà été collecté (on garde la première collecte). Une mesure antérieure au 01/09 est écartée du Nettoyé (elle sert seulement de base au calcul de pluie du 01/09)."),
    ("R2", "Bornes physiques : T 10–50 °C, HR 0–100 %, UV 0–16, éclairement 0–200 000 lux, vent 0–40 m/s, rafale 0–60 m/s, direction 0–360°, pression 940–1040 hPa → valeur vidée."),
    ("R3", "Pics isolés (filtre de Hampel, médiane glissante de 11 mesures) : T > 3 °C, HR > 15 pts, pression > 2 hPa, vent > 4 m/s d'écart → valeur vidée."),
    ("R4", "Gel réel du capteur : ≥ 10 mesures consécutives identiques sur toutes les variables vives → exclues."),
    ("R5", "Incohérences (rafale < vent moyen, rosée > température) : signalées, non supprimées."),
    ("Cumuls", "Aucune règle ne s'applique à precipitation_mm (cumul) : une valeur constante est normale quand il ne pleut pas."),
    ("", ""),
    ("LIMITES", "La station ne transmettant pas la nuit, il n'y a aucune mesure nocturne : pas de Tmin nocturne ni de moyenne sur 24 h valides. Cause probable (non confirmée) : veille faute de charge solaire."),
]

path = "out/Meteo_Donsin_2026-09_brut_vs_nettoye.xlsx"
os.makedirs("out", exist_ok=True)
with pd.ExcelWriter(path, engine="xlsxwriter", datetime_format="yyyy-mm-dd hh:mm:ss") as xw:
    wb = xw.book
    H = wb.add_format({"bold": True, "font_color": "white", "bg_color": "#1F3A5F", "text_wrap": True, "valign": "vcenter", "border": 1})
    T = wb.add_format({"bold": True, "font_size": 14, "font_color": "#1F3A5F"})
    B = wb.add_format({"bold": True, "valign": "top"}); W = wb.add_format({"text_wrap": True, "valign": "top"})
    S = wb.add_format({"bold": True, "bg_color": "#DCE6F1", "valign": "top"})
    GREY = wb.add_format({"font_color": "#999999", "bg_color": "#F2F2F2"})
    CUM = wb.add_format({"bg_color": "#FFF2CC"})

    # Lisez-moi
    ws = wb.add_worksheet("Lisez-moi"); xw.sheets["Lisez-moi"] = ws
    ws.set_column(0, 0, 26); ws.set_column(1, 1, 130)
    for i, (a, b) in enumerate(readme):
        if b is None: ws.write(i, 0, a, T)
        elif b == "" and a: ws.write(i, 0, a, S); ws.write(i, 1, "", S)
        else: ws.write(i, 0, a, B); ws.write(i, 1, b, W)

    def sheet(df, name, widths=None, freeze=(1, 1), index=False):
        df.to_excel(xw, sheet_name=name, index=index, startrow=0)
        s = xw.sheets[name]
        for j, col in enumerate((([df.index.name or ""] if index else []) + list(df.columns))):
            s.write(0, j, col, H)
        s.set_row(0, 48); s.freeze_panes(*freeze); s.autofilter(0, 0, len(df), len(df.columns) - 1 + (1 if index else 0))
        s.set_column(0, len(df.columns) + 1, 16)
        return s

    s = sheet(raw_x, "Brut"); s.set_column(0, 1, 20); s.set_column(2, 2, 18); s.set_column(8, 8, 24)
    s.conditional_format(1, 0, len(raw_x), len(raw_x.columns) - 1, {"type": "formula", "criteria": '=$C2<>"Mesure réelle"', "format": GREY})
    s = sheet(clean_x, "Nettoyé"); s.set_column(0, 0, 20); s.set_column(9, 9, 24); s.set_column(14, 14, 26)
    s.conditional_format(1, 9, len(clean_x), 9, {"type": "no_blanks", "format": CUM})

    # Journal
    jl = pd.DataFrame(log, columns=["Règle", "Variable", "Valeurs exclues"]).groupby(["Règle", "Variable"], as_index=False, sort=False).sum()
    head = pd.DataFrame([("R1 Relectures figées retirées (lignes brutes)", "toutes", n_stale),
                         ("Lignes brutes", "", n_raw), ("Mesures réelles distinctes (dont 1 d'août écartée du Nettoyé)", "", n_u + len(base)),
                         ("Mesures dans le Nettoyé (septembre)", "", n_u)], columns=jl.columns)
    jl = pd.concat([head, jl], ignore_index=True)
    s = sheet(jl, "Journal nettoyage"); s.set_column(0, 0, 70); s.set_column(1, 1, 20); s.set_column(2, 2, 16)
    if len(excl):
        ex = excl.sort_values("measured_at").rename(columns={"regle": "Règle", "measured_at": "Horodatage mesure (UTC)", "variable": "Variable", "valeur_exclue": "Valeur exclue"})
        ex.to_excel(xw, sheet_name="Journal nettoyage", index=False, startrow=0, startcol=4)
        for j, col in enumerate(ex.columns): s.write(0, 4 + j, col, H)
        s.set_column(4, 4, 60); s.set_column(5, 5, 20)

    # Pluie
    pj = D[["pluie_cumul_fin_jour_mm", "pluie_jour_mm"]].rename(columns={"pluie_cumul_fin_jour_mm": "Cumul compteur en fin de jour (mm)", "pluie_jour_mm": "Pluie du jour (mm)"})
    s = sheet(pj, "Pluie", index=True); s.set_column(0, 0, 14); s.set_column(1, 2, 22)
    s.write(0, 4, "Événements (incrément > 0)", H)
    ev = rain_ev.reset_index().rename(columns={"measured_at": "Horodatage mesure (UTC)", "pluie_cumul_mm": "Cumul (mm)", "pluie_increment_mm": "Incrément (mm)",
                                               "ecart_mesure_precedente_min": "Écart mesure précédente (min)", "tombee_pendant_silence": "Tombée pendant un silence ?"})
    ev.to_excel(xw, sheet_name="Pluie", index=False, startrow=1, startcol=4)
    for j, col in enumerate(ev.columns): s.write(1, 4 + j, col, H)
    s.set_column(4, 4, 24); s.set_column(5, 9, 20)
    n = len(pj) + 3
    s.write(n, 0, "TOTAL septembre (mm)", B); s.write(n, 2, rain_total, B)
    s.write(n + 1, 0, "Compteur 31/08 → 30/09 (mm)", B); s.write(n + 1, 2, f"{base.precipitation_mm.iloc[-1]} → {cum.iloc[-1]}", B)

    Dx = D.copy(); Dx.index = Dx.index.strftime("%Y-%m-%d")
    Dx = Dx.rename(columns={"lignes_brutes": "Lignes brutes", "lignes_figees_retirees": "Lignes figées retirées", "mesures_reelles": "Mesures réelles",
                            "part_figee_%": "Part figée (%)", "premiere_mesure": "Première mesure (UTC)", "derniere_mesure": "Dernière mesure (UTC)",
                            "T_min_C": "T min (°C)", "T_moy_C": "T moy (°C)", "T_max_C": "T max (°C)", "HR_moy_%": "HR moy (%)", "pression_moy_hPa": "Pression moy (hPa)",
                            "vent_moy_ms": "Vent moy (m/s)", "rafale_max_ms": "Rafale max (m/s)", "UV_max": "UV max",
                            "pluie_cumul_fin_jour_mm": "Cumul pluie fin de jour (mm)", "pluie_jour_mm": "Pluie du jour (mm)"})
    s = sheet(Dx, "Journalier", index=True); s.set_column(0, 0, 12)
    g2 = gaps.copy(); g2.columns = ["Début du silence (UTC)", "Reprise (UTC)", "Durée (h)"]
    s = sheet(g2, "Silences"); s.set_column(0, 1, 22)
print(path, "|", n_raw, "brutes ->", n_stale, "figées ->", n_u, "propres | pluie", rain_total, "dont réveil", rain_wake, "| gel réel", n_frozen, "| resets", resets)
print(pd.DataFrame(log, columns=["r", "v", "n"]).groupby("r").n.sum().to_string())
print(D.head(3).T.to_string())
