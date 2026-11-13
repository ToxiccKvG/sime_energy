import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import type { EquipmentCategory } from '@/types/inventory';
import { EqFormState } from './equipment-form';
import { ComputedField, Field } from './fields';

export function EquipmentFormFields({
  form,
  onChange,
  categories,
  formSubmitted,
}: {
  form: EqFormState;
  onChange: (updates: Partial<EqFormState>) => void;
  categories: EquipmentCategory[];
  formSubmitted?: boolean;
}) {
  const gNom = form.groupeNom.toUpperCase();
  const isEclairage = gNom.includes('CLAIRAGE');
  const isClim = gNom.includes('CLIM');
  const isAppareils = gNom.includes('DIVERS') || gNom.includes('APPAREILS');
  const isPedago = gNom.includes('DAGOGIQUE') || gNom.includes('PÉDAGO');
  const isForcemotrice = gNom.includes('FORCE') || gNom.includes('MOTRICE');
  const isVentil = gNom.includes('VENTIL');
  const isAlim = gNom.includes('ALIM');

  // Effective heuresAn — either direct input OR heuresJour × joursEffectifs
  const effectiveHeuresAn = (form.heuresJour && form.joursEffectifs)
    ? (parseFloat(form.heuresJour) || 0) * (parseFloat(form.joursEffectifs) || 0)
    : (parseFloat(form.heuresAn) || 0);

  const facteurUtil = Math.min(1, Math.max(0, parseFloat(form.facteurUtilisation) || 1));

  // Computed for ÉCLAIRAGE (1 lampe par luminaire par défaut)
  const nbLampesTotal = isEclairage
    ? (parseInt(form.nbLuminaires || '0') || 0)
    : 0;
  const eclTotalW = isEclairage
    ? (parseFloat(form.powerW || '0') || 0) * nbLampesTotal * facteurUtil
    : 0;
  const eclKwh = eclTotalW > 0 && effectiveHeuresAn > 0
    ? (eclTotalW / 1000) * effectiveHeuresAn
    : 0;

  // Computed for others
  const genericTotalW =
    (parseFloat(form.powerW || '0') || 0) * (parseFloat(form.quantity || '1') || 1) * facteurUtil;
  const genericKwh = genericTotalW > 0 && effectiveHeuresAn > 0
    ? (genericTotalW / 1000) * effectiveHeuresAn
    : 0;

  // FORCE MOTRICE specific
  const fmRendement = (parseFloat(form.rendementMoteur) || 100) / 100;
  const fmTauxCharge = (parseFloat(form.tauxCharge) || 100) / 100;
  const fmPowerKw = (parseFloat(form.powerW) || 0) / 1000;
  const fmTotalW = fmPowerKw * 1000 * fmTauxCharge * (parseFloat(form.quantity) || 1) * facteurUtil;
  const fmKwh = fmPowerKw > 0 && effectiveHeuresAn > 0
    ? fmPowerKw * fmTauxCharge * (1 / fmRendement) * effectiveHeuresAn * (parseFloat(form.quantity) || 1) * facteurUtil
    : 0;

  // CLIM auto-calculations
  const climQty = parseFloat(form.quantity) || 1;
  const climBtu = parseFloat(form.btu) || 0;
  const climElecW = parseFloat(form.powerW) || 0;
  const climPuissanceFrigoW = climBtu * climQty * 0.29307; // BTU/h → W
  const climElecTotaleW = climElecW * climQty * facteurUtil;
  const climCOP = climElecTotaleW > 0 ? climPuissanceFrigoW / (climElecW * climQty) : 0;
  const climKwh = climElecTotaleW > 0 && effectiveHeuresAn > 0
    ? (climElecTotaleW / 1000) * effectiveHeuresAn : 0;

  const inputCls = 'bg-slate-800/60 border-slate-600 text-slate-100 placeholder:text-slate-500';
  const f = (label: string, el: React.ReactNode, hint?: string) => (
    <Field label={label} hint={hint}>
      {el}
    </Field>
  );

  return (
    <div className="space-y-4">
      {/* Groupe — manager-defined, also drives which technical fields appear */}
      <Field
        label="Catégorie *"
        error={formSubmitted && !form.groupeNom.trim() ? 'La catégorie est requise' : undefined}
        hint={!formSubmitted && !form.categoryId
          ? (form.groupeNom.trim() ? 'Nouveau groupe — sera créé à la sauvegarde' : 'Choisissez un groupe existant ou tapez un nouveau nom')
          : undefined}
      >
        <Input
          value={form.groupeNom}
          onChange={e => {
            const nom = e.target.value;
            const existing = categories.find(c => c.name.toLowerCase() === nom.toLowerCase());
            onChange({ groupeNom: nom, categoryId: existing?.id ?? '' });
          }}
          list="groupes-datalist"
          placeholder="ex: CONFORT, ÉCLAIRAGE, BUREAUTIQUE…"
          className={`${inputCls} ${formSubmitted && !form.groupeNom.trim() ? 'border-red-500/60' : ''}`}
        />
        <datalist id="groupes-datalist">
          {categories.map(c => <option key={c.id} value={c.name} />)}
        </datalist>
      </Field>

      {/* Common fields */}
      <div className="grid grid-cols-2 gap-3">
        <Field
            label="Nom de l'équipement *"
            error={formSubmitted && !form.name.trim() ? 'Le nom est requis' : undefined}
          >
            <Input
              value={form.name}
              onChange={e => onChange({ name: e.target.value })}
              placeholder="ex: Luminaire LED bureau 201"
              className={`${inputCls} ${formSubmitted && !form.name.trim() ? 'border-red-500/60' : ''}`}
            />
          </Field>
        {f(
          'Marque',
          <Input
            value={form.brand}
            onChange={e => onChange({ brand: e.target.value })}
            placeholder="ex: Philips"
            className={inputCls}
          />
        )}
        {f(
          'Modèle / Référence',
          <Input
            value={form.model}
            onChange={e => onChange({ model: e.target.value })}
            placeholder="ex: TL5-28W"
            className={inputCls}
          />
        )}
        {f(
          'Année de fabrication',
          <Input
            type="number"
            value={form.anneeFab}
            onChange={e => onChange({ anneeFab: e.target.value })}
            placeholder="ex: 2018"
            className={inputCls}
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {f(
          'État',
          <Select
            value={form.status}
            onValueChange={v => onChange({ status: v as EqFormState['status'] })}
          >
            <SelectTrigger className={inputCls}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1d2e] border-slate-700">
              <SelectItem value="EN service" className="text-slate-100 focus:bg-slate-700/50">
                EN service
              </SelectItem>
              <SelectItem value="Hors Service" className="text-slate-100 focus:bg-slate-700/50">
                Hors Service
              </SelectItem>
            </SelectContent>
          </Select>
        )}
        {f(
          'Puissance unitaire (W)',
          <Input
            type="number"
            value={form.powerW}
            onChange={e => onChange({ powerW: e.target.value })}
            placeholder="0"
            className={inputCls}
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {f(
          'Facteur d\'utilisation (0–1)',
          <Input
            type="number"
            min="0" max="1" step="0.05"
            value={form.facteurUtilisation}
            onChange={e => onChange({ facteurUtilisation: e.target.value })}
            placeholder="1"
            className={inputCls}
          />,
          'Corrige la puissance nominale selon le profil d\'usage réel. Défaut: 1'
        )}
        {f(
          'Service / Local',
          <Input
            value={form.service}
            onChange={e => onChange({ service: e.target.value })}
            placeholder="ex: Bureau DG, Salle de cours…"
            className={inputCls}
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {f(
          'Occupant / Responsable',
          <Input
            value={form.nomOccupant}
            onChange={e => onChange({ nomOccupant: e.target.value })}
            placeholder="ex: M. Dupont"
            className={inputCls}
          />
        )}
      </div>

      <Separator className="bg-slate-700/50" />

      {/* ÉCLAIRAGE specific */}
      {isEclairage && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {f(
              'Type de luminaire',
              <Input
                value={form.typeLuminaire}
                onChange={e => onChange({ typeLuminaire: e.target.value })}
                placeholder="ex: Réglette, Downlight, Projecteur…"
                className={inputCls}
              />
            )}
            {f(
              'Type de réflecteur',
              <Input
                value={form.typeReflecteur}
                onChange={e => onChange({ typeReflecteur: e.target.value })}
                placeholder="ex: Spéculaire, Diffus…"
                className={inputCls}
              />
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {f(
              'Technologie',
              <Select value={form.technologie} onValueChange={v => onChange({ technologie: v })}>
                <SelectTrigger className={inputCls}>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1d2e] border-slate-700">
                  {['LED', 'Fluo', 'Économique', 'Halogène'].map(t => (
                    <SelectItem key={t} value={t} className="text-slate-100 focus:bg-slate-700/50">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {f(
              'Nb luminaires',
              <Input
                type="number"
                value={form.nbLuminaires}
                onChange={e => onChange({ nbLuminaires: e.target.value })}
                placeholder="0"
                className={inputCls}
              />
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {f(
              'Surface locale (m²)',
              <Input
                type="number"
                value={form.surfaceLocale}
                onChange={e => onChange({ surfaceLocale: e.target.value })}
                placeholder="0"
                className={inputCls}
              />
            )}
          </div>
          {/* Auto-computed */}
          <div className="space-y-2">
            <ComputedField label="Nb lampes total" value={nbLampesTotal} />
            <ComputedField label="Puissance totale" value={eclTotalW.toFixed(0)} unit="W" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {f(
              'Hauteur fixation (m)',
              <Input
                type="number"
                value={form.hauteurFixation}
                onChange={e => onChange({ hauteurFixation: e.target.value })}
                placeholder="0"
                className={inputCls}
              />
            )}
            {f(
              'Éclairement (lux)',
              <Input
                type="number"
                value={form.eclairement}
                onChange={e => onChange({ eclairement: e.target.value })}
                placeholder="0"
                className={inputCls}
              />
            )}
          </div>
          <div className="border border-slate-700/40 rounded-lg p-3 space-y-3 bg-slate-800/20">
            <p className="text-xs font-semibold text-slate-500 uppercase">Heures d'utilisation</p>
            <div className="grid grid-cols-3 gap-2">
              {f('Heures/jour', <Input type="number" value={form.heuresJour} onChange={e => onChange({ heuresJour: e.target.value })} placeholder="ex: 10" className={inputCls} />)}
              {f('Jours effectifs/an', <Input type="number" value={form.joursEffectifs} onChange={e => onChange({ joursEffectifs: e.target.value })} placeholder="ex: 260" className={inputCls} />)}
              {f('— ou direct —', <Input type="number" value={form.heuresAn} onChange={e => onChange({ heuresAn: e.target.value })} placeholder="ex: 2920 h/an" className={inputCls} />)}
            </div>
            {effectiveHeuresAn > 0 && (
              <ComputedField label="Heures/an utilisées" value={effectiveHeuresAn.toFixed(0)} unit="h" />
            )}
          </div>
          {eclKwh > 0 && (
            <ComputedField label="Consommation estimée" value={eclKwh.toFixed(1)} unit="kWh/an" />
          )}
        </>
      )}

      {/* APPAREILS DIVERS specific */}
      {isAppareils && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {f(
              'Sous-catégorie',
              <Select value={form.categorieMeta} onValueChange={v => onChange({ categorieMeta: v })}>
                <SelectTrigger className={inputCls}>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1d2e] border-slate-700">
                  {['Bureautique', 'Informatique', 'Réseau', 'Multimédia', 'Téléphonie', 'Électroménager', 'Autres'].map(c => (
                    <SelectItem key={c} value={c} className="text-slate-100 focus:bg-slate-700/50">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {f(
              'Quantité',
              <Input
                type="number"
                value={form.quantity}
                onChange={e => onChange({ quantity: e.target.value })}
                placeholder="1"
                className={inputCls}
              />
            )}
          </div>
          <ComputedField label="Puissance totale" value={genericTotalW.toFixed(0)} unit="W" />
          {f(
            'Caractéristiques techniques',
            <Input
              value={form.caracteristiquesTechniques}
              onChange={e => onChange({ caracteristiquesTechniques: e.target.value })}
              placeholder="ex: Mono/Triphasé, tension, marque…"
              className={inputCls}
            />
          )}
          <div className="grid grid-cols-2 gap-3">
            {f('Surface (m²)', <Input type="number" value={form.surfaceM2} onChange={e => onChange({ surfaceM2: e.target.value })} placeholder="0" className={inputCls} />)}
            {f('Volume (m³)', <Input type="number" value={form.volumeM3} onChange={e => onChange({ volumeM3: e.target.value })} placeholder="0" className={inputCls} />)}
          </div>
          <div className="border border-slate-700/40 rounded-lg p-3 space-y-3 bg-slate-800/20">
            <p className="text-xs font-semibold text-slate-500 uppercase">Heures d'utilisation</p>
            <div className="grid grid-cols-3 gap-2">
              {f('Heures/jour', <Input type="number" value={form.heuresJour} onChange={e => onChange({ heuresJour: e.target.value })} placeholder="ex: 8" className={inputCls} />)}
              {f('Jours/an', <Input type="number" value={form.joursEffectifs} onChange={e => onChange({ joursEffectifs: e.target.value })} placeholder="ex: 260" className={inputCls} />)}
              {f('— ou direct —', <Input type="number" value={form.heuresAn} onChange={e => onChange({ heuresAn: e.target.value })} placeholder="ex: 2080 h/an" className={inputCls} />)}
            </div>
            <div className="flex gap-4 text-xs text-slate-400">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={form.weekend} onChange={e => onChange({ weekend: e.target.checked })} className="rounded" />
                Fonctionnement weekend
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={form.feries} onChange={e => onChange({ feries: e.target.checked })} className="rounded" />
                Fonctionnement jours fériés
              </label>
            </div>
            {effectiveHeuresAn > 0 && (
              <ComputedField label="Heures/an" value={effectiveHeuresAn.toFixed(0)} unit="h" />
            )}
          </div>
          {genericKwh > 0 && (
            <ComputedField label="Consommation estimée" value={genericKwh.toFixed(1)} unit="kWh/an" />
          )}
        </>
      )}

      {/* CLIM specific */}
      {isClim && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {f(
              'Quantité',
              <Input
                type="number"
                value={form.quantity}
                onChange={e => onChange({ quantity: e.target.value })}
                placeholder="1"
                className={inputCls}
              />
            )}
            {f(
              'Technologie',
              <Select value={form.technologieClim} onValueChange={v => onChange({ technologieClim: v })}>
                <SelectTrigger className={inputCls}>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1d2e] border-slate-700">
                  {['Inverter', 'Classique'].map(t => (
                    <SelectItem key={t} value={t} className="text-slate-100 focus:bg-slate-700/50">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {f(
              'Capacité (BTU/h)',
              <Input
                type="number"
                value={form.btu}
                onChange={e => onChange({ btu: e.target.value })}
                placeholder="ex: 12000"
                className={inputCls}
              />
            )}
            {f(
              'Mode de pose',
              <Input
                value={form.modePose}
                onChange={e => onChange({ modePose: e.target.value })}
                placeholder="Mural, Cassette, Gainable…"
                className={inputCls}
              />
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {f('Réglage consigne (°C)', <Input type="number" value={form.reglageConsigne} onChange={e => onChange({ reglageConsigne: e.target.value })} placeholder="ex: 24" className={inputCls} />)}
            {f('Surface climatisée (m²)', <Input type="number" value={form.surfaceClim} onChange={e => onChange({ surfaceClim: e.target.value })} placeholder="0" className={inputCls} />)}
          </div>
          {f('Volume climatisé (m³)', <Input type="number" value={form.volumeM3Clim} onChange={e => onChange({ volumeM3Clim: e.target.value })} placeholder="0" className={inputCls} />)}
          {/* Auto-calculated values */}
          <div className="space-y-1.5">
            {climPuissanceFrigoW > 0 && (
              <ComputedField label="Puissance frigorifique" value={(climPuissanceFrigoW).toFixed(0)} unit="W" />
            )}
            <ComputedField label="Puissance élec. totale" value={climElecTotaleW.toFixed(0)} unit="W" />
            {climCOP > 0 && (
              <ComputedField label="COP/EER auto-calculé" value={climCOP.toFixed(2)} />
            )}
          </div>
          <div className="border border-slate-700/40 rounded-lg p-3 space-y-3 bg-slate-800/20">
            <p className="text-xs font-semibold text-slate-500 uppercase">Heures de fonctionnement</p>
            <div className="grid grid-cols-3 gap-2">
              {f('Heures/jour', <Input type="number" value={form.heuresJour} onChange={e => onChange({ heuresJour: e.target.value })} placeholder="ex: 10" className={inputCls} />)}
              {f('Jours/an', <Input type="number" value={form.joursEffectifs} onChange={e => onChange({ joursEffectifs: e.target.value })} placeholder="ex: 180" className={inputCls} />)}
              {f('— ou direct —', <Input type="number" value={form.heuresAn} onChange={e => onChange({ heuresAn: e.target.value })} placeholder="ex: 1800 h/an" className={inputCls} />)}
            </div>
          </div>
          {climKwh > 0 && <ComputedField label="Consommation électrique" value={climKwh.toFixed(1)} unit="kWh/an" />}
        </>
      )}

      {/* PÉDAGOGIQUE specific */}
      {isPedago && (
        <>
          {f('Quantité', <Input type="number" value={form.quantity} onChange={e => onChange({ quantity: e.target.value })} placeholder="1" className={inputCls} />)}
          {f('Heures / an', <Input type="number" value={form.heuresAn} onChange={e => onChange({ heuresAn: e.target.value })} placeholder="ex: 1000" className={inputCls} />)}
          <ComputedField label="Puissance totale" value={genericTotalW.toFixed(0)} unit="W" />
          {genericKwh > 0 && <ComputedField label="Consommation estimée" value={genericKwh.toFixed(1)} unit="kWh/an" />}
        </>
      )}

      {/* FORCE MOTRICE specific */}
      {isForcemotrice && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {f('Nb moteurs / unités', <Input type="number" value={form.quantity} onChange={e => onChange({ quantity: e.target.value })} placeholder="1" className={inputCls} />)}
            {f('Type de moteur', <Input value={form.typeMoteur} onChange={e => onChange({ typeMoteur: e.target.value })} placeholder="ex: Asynchrone triphasé" className={inputCls} />)}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {f('Rendement η (%)', <Input type="number" value={form.rendementMoteur} onChange={e => onChange({ rendementMoteur: e.target.value })} placeholder="ex: 90" className={inputCls} />, 'Rendement nominal du moteur')}
            {f('Taux de charge (%)', <Input type="number" value={form.tauxCharge} onChange={e => onChange({ tauxCharge: e.target.value })} placeholder="ex: 75" className={inputCls} />, '% de charge effective')}
            {f('Facteur puissance (cos φ)', <Input type="number" value={form.facteurPuissance} onChange={e => onChange({ facteurPuissance: e.target.value })} placeholder="ex: 0.85" className={inputCls} />)}
          </div>
          <div className="border border-slate-700/40 rounded-lg p-3 space-y-3 bg-slate-800/20">
            <p className="text-xs font-semibold text-slate-500 uppercase">Heures d'utilisation</p>
            <div className="grid grid-cols-3 gap-2">
              {f('Heures/jour', <Input type="number" value={form.heuresJour} onChange={e => onChange({ heuresJour: e.target.value })} placeholder="ex: 16" className={inputCls} />)}
              {f('Jours/an', <Input type="number" value={form.joursEffectifs} onChange={e => onChange({ joursEffectifs: e.target.value })} placeholder="ex: 300" className={inputCls} />)}
              {f('— ou direct —', <Input type="number" value={form.heuresAn} onChange={e => onChange({ heuresAn: e.target.value })} placeholder="ex: 4800 h/an" className={inputCls} />)}
            </div>
          </div>
          <ComputedField label="Puissance effective absorbée" value={fmTotalW.toFixed(0)} unit="W" />
          {fmKwh > 0 && <ComputedField label="Consommation réelle" value={fmKwh.toFixed(1)} unit="kWh/an" />}
        </>
      )}

      {/* VENTILATION specific */}
      {isVentil && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {f('Nb unités', <Input type="number" value={form.quantity} onChange={e => onChange({ quantity: e.target.value })} placeholder="1" className={inputCls} />)}
            {f('Type', <Input value={form.typeVentil} onChange={e => onChange({ typeVentil: e.target.value })} placeholder="ex: Axial, CTA, VMC" className={inputCls} />)}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {f('Débit d\'air (m³/h)', <Input type="number" value={form.debitAir} onChange={e => onChange({ debitAir: e.target.value })} placeholder="0" className={inputCls} />)}
            {f('Pression (Pa)', <Input type="number" value={form.pressionPa} onChange={e => onChange({ pressionPa: e.target.value })} placeholder="0" className={inputCls} />)}
          </div>
          <div className="border border-slate-700/40 rounded-lg p-3 space-y-2 bg-slate-800/20">
            <p className="text-xs font-semibold text-slate-500 uppercase">Heures</p>
            <div className="grid grid-cols-3 gap-2">
              {f('Heures/jour', <Input type="number" value={form.heuresJour} onChange={e => onChange({ heuresJour: e.target.value })} placeholder="ex: 24" className={inputCls} />)}
              {f('Jours/an', <Input type="number" value={form.joursEffectifs} onChange={e => onChange({ joursEffectifs: e.target.value })} placeholder="ex: 365" className={inputCls} />)}
              {f('— ou direct —', <Input type="number" value={form.heuresAn} onChange={e => onChange({ heuresAn: e.target.value })} placeholder="ex: 8760 h/an" className={inputCls} />)}
            </div>
          </div>
          <ComputedField label="Puissance totale" value={genericTotalW.toFixed(0)} unit="W" />
          {genericKwh > 0 && <ComputedField label="Consommation estimée" value={genericKwh.toFixed(1)} unit="kWh/an" />}
        </>
      )}

      {/* GENERIC — shown for custom categories (CONFORT, etc.) not covered above */}
      {!isEclairage && !isClim && !isAppareils && !isPedago && !isForcemotrice && !isVentil && !isAlim && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {f(
              'Quantité',
              <Input
                type="number"
                value={form.quantity}
                onChange={e => onChange({ quantity: e.target.value })}
                placeholder="1"
                className={inputCls}
              />
            )}
          </div>
          <div className="border border-slate-700/40 rounded-lg p-3 space-y-3 bg-slate-800/20">
            <p className="text-xs font-semibold text-slate-500 uppercase">Heures de fonctionnement</p>
            <div className="grid grid-cols-3 gap-2">
              {f('Heures/jour', <Input type="number" value={form.heuresJour} onChange={e => onChange({ heuresJour: e.target.value })} placeholder="ex: 8" className={inputCls} />)}
              {f('Jours/an',    <Input type="number" value={form.joursEffectifs} onChange={e => onChange({ joursEffectifs: e.target.value })} placeholder="ex: 260" className={inputCls} />)}
              {f('— ou direct —', <Input type="number" value={form.heuresAn} onChange={e => onChange({ heuresAn: e.target.value })} placeholder="ex: 2080 h/an" className={inputCls} />)}
            </div>
            {effectiveHeuresAn > 0 && (
              <ComputedField label="Heures/an" value={effectiveHeuresAn.toFixed(0)} unit="h" />
            )}
          </div>
          <ComputedField label="Puissance totale" value={genericTotalW.toFixed(0)} unit="W" />
          {genericKwh > 0 && <ComputedField label="Consommation estimée" value={genericKwh.toFixed(1)} unit="kWh/an" />}
        </>
      )}

      {/* ALIMENTATIONS specific (onduleurs, groupes électrogènes) */}
      {isAlim && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {f(
              'Type de source',
              <Select value={form.typeSource} onValueChange={v => onChange({ typeSource: v })}>
                <SelectTrigger className={inputCls}>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1d2e] border-slate-700">
                  {['Onduleur', 'Groupe électrogène', 'Convertisseur', 'Autre'].map(t => (
                    <SelectItem key={t} value={t} className="text-slate-100 focus:bg-slate-700/50">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {f(
              'Quantité',
              <Input
                type="number"
                value={form.quantity}
                onChange={e => onChange({ quantity: e.target.value })}
                placeholder="1"
                className={inputCls}
              />
            )}
          </div>
          {f('Tableau électrique rattaché', <Input value={form.tableauElectrique} onChange={e => onChange({ tableauElectrique: e.target.value })} placeholder="ex: TGBT, TD-01…" className={inputCls} />)}
          <ComputedField label="Puissance totale" value={genericTotalW.toFixed(0)} unit="W" />
          <div className="border border-slate-700/40 rounded-lg p-3 space-y-3 bg-slate-800/20">
            <p className="text-xs font-semibold text-slate-500 uppercase">Heures de fonctionnement</p>
            <div className="grid grid-cols-3 gap-2">
              {f('Heures/jour', <Input type="number" value={form.heuresJour} onChange={e => onChange({ heuresJour: e.target.value })} placeholder="ex: 24" className={inputCls} />)}
              {f('Jours/an', <Input type="number" value={form.joursEffectifs} onChange={e => onChange({ joursEffectifs: e.target.value })} placeholder="ex: 365" className={inputCls} />)}
              {f('— ou direct —', <Input type="number" value={form.heuresAn} onChange={e => onChange({ heuresAn: e.target.value })} placeholder="ex: 8760 h/an" className={inputCls} />)}
            </div>
            {effectiveHeuresAn > 0 && (
              <ComputedField label="Heures/an" value={effectiveHeuresAn.toFixed(0)} unit="h" />
            )}
          </div>
          {genericKwh > 0 && <ComputedField label="Consommation estimée" value={genericKwh.toFixed(1)} unit="kWh/an" />}
        </>
      )}
    </div>
  );
}
