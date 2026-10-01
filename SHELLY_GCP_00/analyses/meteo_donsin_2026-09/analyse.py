"""Nettoyage + analyse de la station météo Donsin, septembre 2026.
Entrée : raw.pkl (extraction brute shelly_cl). Sorties : clean.pkl, tables.pkl, figs/*.png
"""
import numpy as np, pandas as pd, pickle, os
import matplotlib, matplotlib.dates; matplotlib.use("Agg")
import matplotlib.pyplot as plt

os.makedirs("figs", exist_ok=True)
raw = pd.read_pickle("raw.pkl"); raw.columns = ["ts"] + list(raw.columns[1:])
V = ['temperature','humidity','uv_index','illuminance_lux','wind_speed_ms','wind_gust_ms',
     'wind_direction_deg','pressure_hpa','precipitation_mm','dewpoint_c','feels_like_c',
     'battery_voltage_v','signal_rssi']
log = []   # journal des anomalies

# ---------- 1. Intégrité / dédoublonnage ----------
n_raw = len(raw)
u = raw.sort_values("ts").groupby("measured_at", as_index=False).first().sort_values("measured_at")
n_unique = len(u)
before = u[u.measured_at < "2026-09-01"]
u = u[u.measured_at >= "2026-09-01"].set_index("measured_at")
log.append(("Dédoublonnage", "Lignes brutes (1 par minute de collecte)", n_raw))
log.append(("Dédoublonnage", "Mesures distinctes (measured_at unique)", n_unique))
log.append(("Dédoublonnage", "Mesure antérieure au 01/09 écartée", len(before)))
lag = (raw.ts - raw.measured_at).dt.total_seconds() / 60
log.append(("Dédoublonnage", "Retard médian collecte→mesure (min)", round(lag.median(), 1)))
log.append(("Dédoublonnage", "Retard max collecte→mesure (h)", round(lag.max() / 60, 1)))

# ---------- 2. Trous de transmission ----------
dm = u.index.to_series().diff().dt.total_seconds() / 60
gaps = dm[dm > 10]
gap_tbl = pd.DataFrame({"debut": (gaps.index - pd.to_timedelta(gaps, unit="m")), "fin": gaps.index,
                        "duree_h": (gaps / 60).round(2)}).reset_index(drop=True)
expected = 30 * 1440
coverage = len(u) / expected
log.append(("Couverture", "Mesures valides / théoriques (1/min)", f"{len(u)} / {expected} ({coverage:.1%})"))
log.append(("Couverture", "Trous > 10 min", len(gap_tbl)))
log.append(("Couverture", "Durée cumulée des trous (h)", round(gap_tbl.duree_h.sum(), 1)))

# ---------- 3. Règles de plausibilité ----------
bounds = {'temperature': (10, 50), 'humidity': (0, 100), 'uv_index': (0, 16),
          'illuminance_lux': (0, 200000), 'wind_speed_ms': (0, 40), 'wind_gust_ms': (0, 60),
          'wind_direction_deg': (0, 360), 'pressure_hpa': (940, 1040)}
c = u[V].copy()
flags = pd.DataFrame(index=u.index)
for k, (lo, hi) in bounds.items():
    bad = (c[k] < lo) | (c[k] > hi)
    flags[k + "_bornes"] = bad
    log.append(("Bornes physiques", f"{k} hors [{lo};{hi}]", int(bad.sum())))
    c.loc[bad, k] = np.nan

# Hampel : écart à la médiane glissante (centrée, 11 points)
hampel = {'temperature': 3.0, 'humidity': 15.0, 'pressure_hpa': 2.0, 'wind_speed_ms': 4.0}
for k, thr in hampel.items():
    med = c[k].rolling(11, center=True, min_periods=5).median()
    bad = (c[k] - med).abs() > thr
    flags[k + "_pic"] = bad
    log.append(("Pics isolés (Hampel)", f"{k} écart > {thr} vs médiane 11 pts", int(bad.sum())))
    c.loc[bad, k] = np.nan

incoh = (c.wind_gust_ms < c.wind_speed_ms) | (c.dewpoint_c > c.temperature + 0.1)
log.append(("Cohérence", "Rafale < vent moyen ou rosée > température", int(incoh.sum())))

# Séquences figées (même valeur ≥ 120 min pour des variables normalement vivantes)
for k in ['temperature', 'pressure_hpa', 'humidity']:
    run = (c[k] != c[k].shift()).cumsum()
    sz = c.groupby(run)[k].transform("size")
    frozen = sz >= 120
    flags[k + "_fige"] = frozen
    log.append(("Valeurs figées", f"{k} constant ≥ 120 mesures", int(frozen.sum())))
    c.loc[frozen, k] = np.nan

# Jours dégradés (panne station) : < 200 mesures sur 1440
per_day = u.groupby(u.index.date).size()
bad_days = per_day[per_day < 200]
log.append(("Jours dégradés", "Jours < 200 mesures (panne/hors-ligne)", ", ".join(map(str, bad_days.index))))
# Alarme d'humidité du boîtier : capteur noyé ?
alarm_days = u.groupby(u.index.date).moisture_alarm.mean()
log.append(("Alarme humidité boîtier", "Jours avec alarme > 50 % du temps", ", ".join(str(d) for d in alarm_days[alarm_days > .5].index)))

clean = c.copy()
clean["moisture_alarm"] = u.moisture_alarm
clean["flag_anomalie"] = flags.any(axis=1)
clean["jour_degrade"] = pd.Series(clean.index.date, index=clean.index).isin(bad_days.index)
log.append(("Bilan", "Mesures marquées anomalie (au moins une règle)", int(clean.flag_anomalie.sum())))

# ---------- 4. Pluie (cumul → incréments) ----------
p = u.precipitation_mm
inc = p.diff().clip(lower=0).fillna(0)
rain_events = inc[inc > 0].to_frame("mm")
rain_total = float(p.iloc[-1] - p.iloc[0])
log.append(("Pluie", "Cumul compteur 01/09 → 30/09 (mm)", round(rain_total, 1)))
log.append(("Pluie", "Remises à zéro du compteur", int((p.diff() < 0).sum())))
daily_rain = inc.resample("D").sum().round(1)

# fenêtre de transmission
hrs = pd.Series(u.index.hour, index=u.index)
night_pts = int(((hrs >= 20) | (hrs <= 4)).sum())
log.append(("Fenêtre de transmission", "Mesures entre 20 h et 04 h UTC", night_pts))
first = pd.Series(u.index, index=u.index).groupby(u.index.date).min(); last = pd.Series(u.index, index=u.index).groupby(u.index.date).max()
fm = first[per_day[per_day >= 200].index].map(lambda t: t.hour * 60 + t.minute); lm = last[per_day[per_day >= 200].index].map(lambda t: t.hour * 60 + t.minute)
win = (int(fm.median()), int(lm.median()))
log.append(("Fenêtre de transmission", "Reprise médiane le matin / arrêt médian le soir (UTC)", f"{win[0]//60:02d}:{win[0]%60:02d} / {win[1]//60:02d}:{win[1]%60:02d}"))
# pluie : "au réveil" (1ère mesure après un trou > 6 h) vs observée en direct
after_gap = dm.reindex(inc.index) > 360
rain_wake = float(inc[after_gap & (inc > 0)].sum()); rain_live = float(inc[~after_gap].sum())
log.append(("Pluie", "Tombée pendant les nuits muettes (vue au réveil de la station, mm)", round(rain_wake, 1)))
log.append(("Pluie", "Observée en direct pendant la fenêtre diurne (mm)", round(rain_live, 1)))

# ---------- 5. Agrégats ----------
num = ['temperature','humidity','uv_index','illuminance_lux','wind_speed_ms','wind_gust_ms',
       'pressure_hpa','dewpoint_c','feels_like_c','battery_voltage_v','signal_rssi']
cnt = clean[num].resample("h").count()
H = clean[num].resample("h").mean()
H["n_mesures"] = clean.temperature.resample("h").count()
H["wind_gust_max"] = clean.wind_gust_ms.resample("h").max()
H["pluie_mm"] = inc.resample("h").sum().round(2)
# direction : moyenne vectorielle pondérée vitesse
th = np.deg2rad(clean.wind_direction_deg)
sx = (clean.wind_speed_ms * np.sin(th)).resample("h").sum(); sy = (clean.wind_speed_ms * np.cos(th)).resample("h").sum()
H["wind_dir_deg"] = (np.rad2deg(np.arctan2(sx, sy)) % 360).round(0)
valid_h = H.n_mesures >= 30
H = H.reindex(pd.date_range("2026-09-01", "2026-09-30 23:00", freq="h"))
H["heure_valide"] = (H.n_mesures >= 30)
Hv = H[H.heure_valide]
log.append(("Agrégat horaire", "Heures valides (≥ 30 mesures/60)", f"{int(H.heure_valide.sum())} / 720 ({H.heure_valide.mean():.1%}) — fenêtre diurne seulement"))

D = pd.DataFrame({
    "heures_valides": H.heure_valide.resample("D").sum(),
    "mesures": clean.temperature.resample("D").count(),
})
D["T_min"] = clean.temperature.resample("D").min(); D["T_max"] = clean.temperature.resample("D").max()
D["T_moy"] = clean.temperature.resample("D").mean(); D["HR_moy"] = clean.humidity.resample("D").mean()
D["P_moy_hPa"] = clean.pressure_hpa.resample("D").mean()
D["vent_moy_ms"] = clean.wind_speed_ms.resample("D").mean(); D["rafale_max_ms"] = clean.wind_gust_ms.resample("D").max()
D["UV_max"] = clean.uv_index.resample("D").max()
D["lux_moy_jour"] = clean.illuminance_lux[clean.illuminance_lux > 1000].resample("D").mean()
D["rosee_moy"] = clean.dewpoint_c.resample("D").mean()
D["ressenti_max"] = clean.feels_like_c.resample("D").max()
D["pluie_mm"] = daily_rain
fl = clean.temperature.dropna().index.to_series().groupby(clean.temperature.dropna().index.date)
D["premiere_mesure"] = fl.min().dt.strftime("%H:%M").reindex(D.index.date).values
D["derniere_mesure"] = fl.max().dt.strftime("%H:%M").reindex(D.index.date).values
D["V_batt_min"] = clean.battery_voltage_v.resample("D").min()
D["jour_complet"] = D.heures_valides >= 8   # la station ne transmet que ~10 h/jour : 8 h = fenêtre diurne quasi complète
D = D.round(2)
nfull = int(D.jour_complet.sum())
log.append(("Agrégat journalier", "Jours exploitables (≥ 8 h valides sur la fenêtre diurne)", f"{nfull} / 30"))
Df = D[D.jour_complet]

# ---------- 6. Statistiques ----------
labels = {'temperature': ("Température", "°C"), 'humidity': ("Humidité relative", "%"), 'dewpoint_c': ("Point de rosée", "°C"),
          'feels_like_c': ("Température ressentie", "°C"), 'pressure_hpa': ("Pression", "hPa"),
          'wind_speed_ms': ("Vent moyen", "m/s"), 'wind_gust_ms': ("Rafale", "m/s"), 'uv_index': ("Indice UV", ""),
          'illuminance_lux': ("Éclairement", "lux"), 'battery_voltage_v': ("Tension batterie", "V"), 'signal_rssi': ("Signal Wi-Fi", "dBm")}
rows = []
for k, (n, un) in labels.items():
    s = clean[k].dropna()
    rows.append([n, un, len(s), s.min(), s.quantile(.05), s.median(), s.mean(), s.quantile(.95), s.max(), s.std()])
S = pd.DataFrame(rows, columns=["Variable", "Unité", "N", "Min", "P5", "Médiane", "Moyenne", "P95", "Max", "Écart-type"]).round(2)

# Profil horaire (par heure du jour, moyennes sur heures valides)
prof = Hv.groupby(Hv.index.hour)[['temperature','humidity','illuminance_lux','uv_index','wind_speed_ms','pressure_hpa','dewpoint_c','battery_voltage_v']].mean().round(2)
prof_q = Hv.groupby(Hv.index.hour).temperature.quantile([.1, .9]).unstack()

# Indicateurs métier
ind = {
    "Heures valides ≥ 35 °C": int((Hv.temperature >= 35).sum()),
    "Heures valides ≥ 33 °C": int((Hv.temperature >= 33).sum()),
    "Heures valides entre 06 h et 19 h UTC (seules heures observées)": int(Hv.index.hour.isin(range(6, 20)).sum()),
    "Température max (mesure)": clean.temperature.max(),
    "Ressenti max (mesure)": clean.feels_like_c.max(),
    "Heures valides UV ≥ 8": int((Hv.uv_index >= 8).sum()),
    "UV max": clean.uv_index.max(),
    "Rafale max (m/s)": clean.wind_gust_ms.max(),
    "Rafale max (km/h)": round(clean.wind_gust_ms.max() * 3.6, 1),
    "Pourcentage de calme (vent = 0)": round(float((clean.wind_speed_ms == 0).mean() * 100), 1),
    "Pluie enregistrée sur le mois (mm)": round(rain_total, 1),
    "Jours avec pluie enregistrée": int((daily_rain > 0).sum()),
    "Pluie max en un jour (mm)": float(daily_rain.max()),
    "Pression moyenne (hPa)": round(clean.pressure_hpa.mean(), 1),
}
# Rose des vents
w = clean[['wind_speed_ms', 'wind_direction_deg']].dropna()
w = w[w.wind_speed_ms >= 0.5]
sectors = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSO","SO","OSO","O","ONO","NO","NNO"]
idx = (((w.wind_direction_deg + 11.25) % 360) // 22.5).astype(int)
bins = [0.5, 1.5, 3, 5, 99]; blab = ["0,5–1,5", "1,5–3", "3–5", "> 5"]
cls = pd.cut(w.wind_speed_ms, bins, labels=blab, right=False)
rose = pd.crosstab(idx, cls).reindex(range(16), fill_value=0)
rose.index = sectors
rose_pct = (rose / rose.values.sum() * 100).round(2)
dom = rose.sum(axis=1).sort_values(ascending=False)
ind["Pluie tombée pendant les nuits muettes (mm)"] = round(rain_wake, 1)
ind["Pluie observée en direct (mm)"] = round(rain_live, 1)
ind["Fenêtre de transmission médiane (UTC)"] = f"{win[0]//60:02d}:{win[0]%60:02d} → {win[1]//60:02d}:{win[1]%60:02d}"
ind["Secteur dominant"] = f"{dom.index[0]} ({dom.iloc[0]/dom.sum():.0%})"
ind["Part secteurs N+NNE"] = f"{(rose.loc[['N','NNE']].values.sum()/dom.sum()):.0%}"
# Corrélations horaires
corr = Hv[['temperature','humidity','dewpoint_c','illuminance_lux','uv_index','wind_speed_ms','pressure_hpa','feels_like_c']].corr().round(2)
# Tension batterie vs éclairement
ind["Tension batterie min (V)"] = clean.battery_voltage_v.min()
ind["Part du temps tension = 5,3 V (pleine)"] = round(float((clean.battery_voltage_v >= 5.3).mean() * 100), 1)

# ---------- 7. Graphiques ----------
Hm = H.where(H.heure_valide)
Dm = D.where(D.jour_complet)
NAVY, ORANGE, BLUE, GREY, RED, GREEN = "#1f3a5f", "#e07b00", "#2e86c1", "#8a8f98", "#c0392b", "#2e8b57"
plt.rcParams.update({"font.size": 9, "axes.spines.top": False, "axes.spines.right": False, "axes.grid": True,
                     "grid.alpha": .25, "figure.dpi": 150, "axes.titleweight": "bold", "axes.titlesize": 10})
def save(fig, name): fig.tight_layout(); fig.savefig(f"figs/{name}.png"); plt.close(fig)

# a. disponibilité
fig, ax = plt.subplots(2, 1, figsize=(9, 5), sharex=False, gridspec_kw={"height_ratios": [2, 1]})
ax[0].bar(per_day.index.astype("datetime64[ns]"), per_day.values, color=[RED if v < 200 else BLUE for v in per_day.values])
ax[0].axhline(1440, color=GREY, ls="--", lw=.8); ax[0].set_title("Mesures reçues par jour (max théorique 1 440)")
ax[0].set_ylabel("mesures"); ax[0].set_xlim(pd.Timestamp("2026-08-31 12:00"), pd.Timestamp("2026-09-30 12:00")); ax[0].xaxis.set_major_formatter(matplotlib.dates.DateFormatter("%d/%m"))
hm = H.n_mesures.fillna(0).values.reshape(30, 24).T
im = ax[1].imshow(hm, aspect="auto", cmap="Blues", vmin=0, vmax=60, extent=[0.5, 30.5, 24, 0])
ax[1].set_title("Mesures par heure (UTC) — blanc = station muette"); ax[1].set_xlabel("jour de septembre"); ax[1].set_ylabel("heure")
ax[1].grid(False); plt.colorbar(im, ax=ax[1], label="mesures/h", pad=.01)
save(fig, "01_disponibilite")

# b. température
fig, ax = plt.subplots(figsize=(9, 3.6))
ax.xaxis.set_major_formatter(matplotlib.dates.DateFormatter("%d/%m"))
ax.plot(Hm.index, Hm.temperature, color=ORANGE, lw=.7, label="Moyenne horaire")
ax.fill_between(D.index + pd.Timedelta(hours=12), Dm.T_min, Dm.T_max, color=ORANGE, alpha=.15, label="Min–max journalier")
ax.set_title("Température sous abri — septembre 2026"); ax.set_ylabel("°C"); ax.legend(loc="lower left", ncol=2)
for dd in bad_days.index: ax.axvspan(pd.Timestamp(dd), pd.Timestamp(dd) + pd.Timedelta(days=1), color=RED, alpha=.08)
save(fig, "02_temperature")

# c. profil horaire température + humidité
fig, ax = plt.subplots(1, 2, figsize=(9, 3.4))
ax[0].plot(prof.index, prof.temperature, color=ORANGE, lw=2); ax[0].fill_between(prof_q.index, prof_q[.1], prof_q[.9], color=ORANGE, alpha=.2)
ax[0].set_title("Cycle journalier — température (moy., P10–P90)"); ax[0].set_xlabel("heure UTC"); ax[0].set_ylabel("°C")
ax[1].plot(prof.index, prof.humidity, color=BLUE, lw=2); ax[1].set_title("Cycle journalier — humidité relative"); ax[1].set_xlabel("heure UTC"); ax[1].set_ylabel("%")
save(fig, "03_cycle_journalier")

# d. rayonnement
fig, ax = plt.subplots(1, 2, figsize=(9, 3.4))
ax[0].plot(prof.index, prof.illuminance_lux / 1000, color="#d4ac0d", lw=2); ax[0].set_title("Éclairement moyen par heure (klux)"); ax[0].set_xlabel("heure UTC")
ax[1].plot(prof.index, prof.uv_index, color="#8e44ad", lw=2); ax[1].set_title("Indice UV moyen par heure"); ax[1].set_xlabel("heure UTC")
save(fig, "04_rayonnement")

# e. rose des vents
fig = plt.figure(figsize=(5.2, 5)); ax = fig.add_subplot(111, projection="polar")
ax.set_theta_zero_location("N"); ax.set_theta_direction(-1)
ang = np.deg2rad(np.arange(16) * 22.5); bottom = np.zeros(16)
cols = ["#aed6f1", "#5dade2", "#2e86c1", "#1b4f72"]
for lab, col in zip(blab, cols):
    ax.bar(ang, rose_pct[lab].values, width=np.deg2rad(20), bottom=bottom, color=col, label=lab + " m/s", edgecolor="white", lw=.3)
    bottom += rose_pct[lab].values
ax.set_xticks(ang); ax.set_xticklabels(sectors, fontsize=8); ax.set_title("Rose des vents (fréquence %, vent ≥ 0,5 m/s)", pad=14)
ax.legend(loc="lower left", bbox_to_anchor=(1, 0), fontsize=7)
save(fig, "05_rose_vents")

# f. vent
fig, ax = plt.subplots(figsize=(9, 3.2))
ax.xaxis.set_major_formatter(matplotlib.dates.DateFormatter("%d/%m"))
ax.plot(Hm.index, Hm.wind_speed_ms, color=BLUE, lw=.8, label="Vent moyen horaire"); ax.plot(Hm.index, Hm.wind_gust_max, color=GREY, lw=.5, alpha=.8, label="Rafale max horaire")
ax.set_ylabel("m/s"); ax.set_title("Vent"); ax.legend(ncol=2)
save(fig, "06_vent")

# g. pluie
fig, ax = plt.subplots(figsize=(9, 3.4))
ax.bar(daily_rain.index, daily_rain.values, color=BLUE, label="Pluie journalière (mm)")
ax2 = ax.twinx(); ax2.plot(p.resample("D").last().index, p.resample("D").last() - p.iloc[0], color=NAVY, lw=2, label="Cumul depuis le 01/09")
ax2.grid(False); ax2.spines["right"].set_visible(True)
ax.xaxis.set_major_formatter(matplotlib.dates.DateFormatter("%d/%m")); ax.set_title("Pluie enregistrée (compteur cumulatif)"); ax.set_ylabel("mm/jour"); ax2.set_ylabel("cumul mm")
h1, l1 = ax.get_legend_handles_labels(); h2, l2 = ax2.get_legend_handles_labels(); ax.legend(h1 + h2, l1 + l2, loc="upper left")
save(fig, "07_pluie")

# h. pression + rosée
fig, ax = plt.subplots(1, 2, figsize=(9, 3.2))
ax[0].plot(Hm.index, Hm.pressure_hpa, color=NAVY, lw=.8); ax[0].set_title("Pression (hPa)"); ax[0].tick_params(axis="x", rotation=30)
ax[1].plot(Hm.index, Hm.dewpoint_c, color=GREEN, lw=.8); ax[1].set_title("Point de rosée (°C)"); ax[1].tick_params(axis="x", rotation=30)
save(fig, "08_pression_rosee")

# i. corrélations
fig, ax = plt.subplots(figsize=(5.6, 4.6))
im = ax.imshow(corr.values, cmap="RdBu_r", vmin=-1, vmax=1); ax.grid(False)
nm = ["Temp.", "Hum.", "Rosée", "Lux", "UV", "Vent", "Pression", "Ressenti"]
ax.set_xticks(range(8)); ax.set_xticklabels(nm, rotation=45, ha="right"); ax.set_yticks(range(8)); ax.set_yticklabels(nm)
for i in range(8):
    for j in range(8): ax.text(j, i, f"{corr.values[i, j]:.2f}", ha="center", va="center", fontsize=7, color="white" if abs(corr.values[i, j]) > .6 else "black")
ax.set_title("Corrélations (moyennes horaires)"); plt.colorbar(im, ax=ax, shrink=.8)
save(fig, "09_correlations")

# j. batterie
fig, ax = plt.subplots(1, 2, figsize=(9, 3.2))
ax[0].plot(prof.index, prof.battery_voltage_v, color=GREEN, lw=2); ax[0].set_title("Tension batterie moyenne par heure (V)"); ax[0].set_xlabel("heure UTC")
ax[1].plot(Hm.index, Hm.signal_rssi, color=GREY, lw=.7); ax[1].set_title("Signal Wi-Fi (dBm)"); ax[1].tick_params(axis="x", rotation=30)
save(fig, "10_batterie_signal")

# ---------- 8. Sauvegardes ----------
pickle.dump(dict(win=win, rain_wake=rain_wake, rain_live=rain_live, log=log, gap_tbl=gap_tbl, S=S, prof=prof, ind=ind, rose_pct=rose_pct, corr=corr, D=D, H=H, rain_events=rain_events,
                 per_day=per_day, bad_days=list(bad_days.index), nfull=nfull, coverage=coverage), open("tables.pkl", "wb"))
clean.to_pickle("clean.pkl")
flags.to_pickle("flags.pkl")
print("OK", len(clean), "mesures nettoyées")
for l in log: print(l)
print(S.to_string()); print(ind); print(prof.round(1).to_string()); print(corr.to_string()); print(D.to_string()); print(rain_events.round(1).to_string()); print(gap_tbl.to_string())
