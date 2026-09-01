// ============================================================
// Dashboard IOT — Détail d'un capteur (popup)
//
// Répond à une demande métier : les tuiles de la carte capteurs
// doivent être cliquables et révéler le détail derrière la valeur.
//
// Ce que la carte ne peut pas montrer et que la popup apporte :
//  · l'HEURE RÉELLE du relevé (`measured_at`). Un H&T Gen3 ne se
//    réveille que toutes les 2 h ; la carte laisse croire que sa
//    valeur est instantanée.
//  · les extrêmes de l'heure et des 24 h, et la courbe horaire.
//  · l'état du capteur : batterie, signal, firmware, et le nombre de
//    relevés réellement distincts dans l'heure.
// ============================================================

import { useEffect, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Battery, BatteryLow, Signal, Clock, Cpu, WifiOff, Activity } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { ShellyClRow } from '@/lib/iot-dashboard-service';
import { fetchSensorHistory, type SensorHourPoint } from '@/lib/iot-sensor-detail-service';
import { metriquesDisponibles, formatValeur, type MetricKey, type SensorMetric } from './sensorMetrics';

interface Props {
  capteur: ShellyClRow | null;
  metriqueInitiale: MetricKey | null;
  onClose: () => void;
}

/** « il y a 12 min » — l'écart entre le relevé et maintenant est l'information clé. */
function depuis(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!isFinite(ms) || ms < 0) return null;
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h ${String(min % 60).padStart(2, '0')}`;
  return `il y a ${Math.floor(h / 24)} j`;
}

export function SensorDetailDialog({ capteur, metriqueInitiale, onClose }: Props) {
  const [histo, setHisto] = useState<SensorHourPoint[]>([]);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [metrique, setMetrique] = useState<MetricKey | null>(metriqueInitiale);

  useEffect(() => { setMetrique(metriqueInitiale); }, [metriqueInitiale]);

  useEffect(() => {
    if (!capteur) return;
    let annule = false;
    setChargement(true);
    setErreur(null);
    fetchSensorHistory(capteur.device_id)
      .then(pts => { if (!annule) setHisto(pts); })
      .catch(e => { if (!annule) setErreur(e instanceof Error ? e.message : 'Historique indisponible'); })
      .finally(() => { if (!annule) setChargement(false); });
    return () => { annule = true; };
  }, [capteur]);

  if (!capteur) return null;

  const metriques = metriquesDisponibles(capteur);
  const active: SensorMetric | undefined =
    metriques.find(m => m.key === metrique) ?? metriques[0];

  // ── Statistiques dérivées de l'historique horaire ────────────
  const serie = active
    ? histo
        .map(p => ({ heure: new Date(p.ts_heure).getHours(), valeur: active.moyenne(p) }))
        .filter((p): p is { heure: number; valeur: number } => p.valeur != null)
    : [];

  // Dernière heure qui porte RÉELLEMENT la grandeur : l'heure en cours existe
  // déjà en base (créée à H+05 par fn_aggregate_horaire) mais ses colonnes
  // capteur ne sont remplies qu'à H+07 par fn_aggregate_horaire_env. Prendre
  // aveuglément la dernière ligne affichait trois « — » en début d'heure.
  const derniereHeure = active
    ? [...histo].reverse().find(p => active.moyenne(p) != null) ?? null
    : null;
  const libelleHeure = derniereHeure
    ? `${new Date(derniereHeure.ts_heure).getHours()} h`
    : 'heure';
  const minHeure = active?.min && derniereHeure ? active.min(derniereHeure) : null;
  const maxHeure = active?.max && derniereHeure ? active.max(derniereHeure) : null;
  const moyHeure = active && derniereHeure ? active.moyenne(derniereHeure) : null;

  const valeurs24h = serie.map(p => p.valeur);
  const min24 = active?.min
    ? histo.map(p => active.min!(p)).filter((v): v is number => v != null)
    : valeurs24h;
  const max24 = active?.max
    ? histo.map(p => active.max!(p)).filter((v): v is number => v != null)
    : valeurs24h;

  // Depuis combien d'heures la grandeur ne bouge plus.
  //
  //  Un capteur peut se réveiller souvent tout en renvoyant toujours la même
  //  valeur : les Shelly Motion Gen1 n'émettent une nouvelle température qu'au
  //  delà d'un seuil de variation. Sans cette mention, une courbe plate laisse
  //  croire à une panne de collecte. On exige que l'heure soit aussi plate
  //  (min == max) pour ne pas confondre « constant » et « moyennes égales ».
  const heuresInchangees = ((): number | null => {
    if (!active || histo.length === 0) return null;
    const platDansLHeure = (p: SensorHourPoint) =>
      active.min && active.max ? active.min(p) === active.max(p) : true;
    let reference: number | null = null;
    let heures = 0;
    for (let i = histo.length - 1; i >= 0; i--) {
      const v = active.moyenne(histo[i]);
      if (v == null) continue;
      if (reference == null) reference = v;
      if (v !== reference || !platDansLHeure(histo[i])) break;
      heures += 1;
    }
    // En deçà de 3 h, une valeur stable n'a rien d'anormal : on se tait.
    return heures >= 3 ? heures : null;
  })();

  const bat  = typeof capteur.battery_level === 'number' ? capteur.battery_level : null;
  const batV = typeof capteur.battery_voltage_v === 'number' ? capteur.battery_voltage_v : null;
  const rssi = typeof capteur.signal_rssi === 'number' ? capteur.signal_rssi : null;
  const releves = derniereHeure?.nb_mesures_env ?? null;
  const horodatage = depuis(capteur.measured_at);

  const Stat = ({ label, valeur }: { label: string; valeur: string }) => (
    <div className="rounded-lg bg-white/5 border border-white/10 p-2 text-center">
      <p className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-white text-sm font-semibold mt-0.5">{valeur}</p>
    </div>
  );

  const fmt = (v: number | null) =>
    active && v != null ? `${formatValeur(active, v)} ${active.unite}`.trim() : '—';

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="bg-[#12141f] border-white/15 text-slate-200 max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-white text-base">{capteur.name}</DialogTitle>
          <p className="text-slate-400 text-xs">
            {capteur.room ? `${capteur.room} · ` : ''}{capteur.site}
            {capteur.device_type && ` · ${capteur.device_type}`}
          </p>
        </DialogHeader>

        {/* Fraîcheur du relevé — l'information que la carte ne montre pas */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs border-y border-white/10 py-2">
          <span className="flex items-center gap-1.5 text-slate-300">
            <Clock className="h-3.5 w-3.5 text-slate-500" />
            {horodatage
              ? <>Relevé {horodatage}
                  <span className="text-slate-500">
                    · {new Date(capteur.measured_at!).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </>
              : <span className="text-slate-500">Horodatage capteur non fourni</span>}
          </span>
          {capteur.online === false && (
            <span className="flex items-center gap-1 text-amber-400">
              <WifiOff className="h-3.5 w-3.5" /> hors ligne
            </span>
          )}
          {releves != null && (
            <span className="flex items-center gap-1 text-slate-400" title="Relevés distincts du capteur sur la dernière heure agrégée">
              <Activity className="h-3.5 w-3.5 text-slate-500" />
              {releves} relevé{releves > 1 ? 's' : ''} / h
            </span>
          )}
        </div>

        {/* Sélecteur de grandeur */}
        {metriques.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {metriques.map(m => (
              <button
                key={m.key}
                onClick={() => setMetrique(m.key)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  active?.key === m.key
                    ? 'text-white'
                    : 'text-slate-400 border-white/15 hover:bg-white/5 hover:text-white'
                }`}
                style={active?.key === m.key
                  ? { backgroundColor: m.couleur + '25', borderColor: m.couleur + '60', color: m.couleur }
                  : {}}
              >
                {m.labelCourt}
              </button>
            ))}
          </div>
        )}

        {active && (
          <>
            <div className="flex items-baseline flex-wrap gap-x-2">
              <span className="text-3xl font-bold" style={{ color: active.couleur }}>
                {formatValeur(active, active.valeur(capteur))}
              </span>
              <span className="text-slate-400 text-sm">{active.unite}</span>
              <span className="text-slate-500 text-xs ml-1">{active.label}</span>
              {heuresInchangees != null && (
                <span className="text-amber-500/80 text-xs ml-auto"
                  title="Le capteur émet toujours, mais la grandeur n'a pas varié — beaucoup de modèles n'émettent une nouvelle valeur qu'au delà d'un seuil de variation.">
                  valeur inchangée depuis {heuresInchangees >= histo.length ? '24 h' : `${heuresInchangees} h`}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label={`Min · ${libelleHeure}`} valeur={fmt(minHeure)} />
              <Stat label={`Moy. · ${libelleHeure}`} valeur={fmt(moyHeure)} />
              <Stat label={`Max · ${libelleHeure}`} valeur={fmt(maxHeure)} />
              <Stat
                label="Min–max · 24 h"
                valeur={min24.length > 0 && max24.length > 0
                  ? `${formatValeur(active, Math.min(...min24))} – ${formatValeur(active, Math.max(...max24))}`
                  : '—'}
              />
            </div>

            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2">
              {chargement ? (
                <p className="text-slate-500 text-xs text-center py-12">Chargement de l'historique…</p>
              ) : erreur ? (
                <p className="text-amber-400/90 text-xs text-center py-12">{erreur}</p>
              ) : serie.length === 0 ? (
                <p className="text-slate-500 text-xs text-center py-12">
                  Aucune moyenne horaire sur 24 h pour cette grandeur.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={serie} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="heure" tick={{ fill: '#94a3b8', fontSize: 10 }}
                      tickFormatter={h => `${h}h`} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} width={44}
                      domain={['auto', 'auto']} allowDecimals />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(148,163,184,0.35)', borderRadius: 10 }}
                      labelFormatter={h => `${h} h`}
                      formatter={(v: number) => [`${formatValeur(active, v)} ${active.unite}`.trim(), active.label]}
                    />
                    <Area type="monotone" dataKey="valeur" stroke={active.couleur}
                      fill={active.couleur + '25'} strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
              <p className="text-slate-600 text-[10px] text-center mt-1">Moyennes horaires · 24 dernières heures</p>
            </div>
          </>
        )}

        {/* Diagnostic capteur */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 border-t border-white/10 pt-2">
          {bat != null && (
            <span className={`flex items-center gap-1 ${bat < 20 ? 'text-amber-400' : ''}`}>
              {bat < 20 ? <BatteryLow className="h-3.5 w-3.5" /> : <Battery className="h-3.5 w-3.5" />}
              {bat}%{batV != null && ` · ${batV.toFixed(2).replace('.', ',')} V`}
              {capteur.battery_low === true && ' · faible'}
            </span>
          )}
          {rssi != null && (
            <span className={`flex items-center gap-1 ${rssi < -85 ? 'text-amber-400' : ''}`}>
              <Signal className="h-3.5 w-3.5" /> {rssi} dBm
            </span>
          )}
          {capteur.firmware_version && (
            <span className="flex items-center gap-1">
              <Cpu className="h-3.5 w-3.5" /> {capteur.firmware_version}
            </span>
          )}
          <span className="text-slate-600 ml-auto font-mono text-[10px]">{capteur.device_id}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
