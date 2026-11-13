import { useState } from 'react';
import { ChevronDown, ChevronUp, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { PVSectionData } from '@/types/audit';
import { type PVSectionSchema } from '@/constants/pv-questionnaire-schema';
import { CheckboxGroupEditor } from './CheckboxGroupEditor';
import { MapViewDialog } from './MapViewDialog';
import { MesureSessionsEditor } from './MesureSessionsEditor';
import { SectionCustomFieldsBuilder } from './SectionCustomFieldsBuilder';
import { SystemTableEditor } from './SystemTableEditor';
import { SECTION_COLORS } from './section-colors';

export function SectionCard({ idx, schema, data, onChange }: {
  idx: number;
  schema: PVSectionSchema;
  data: PVSectionData;
  onChange: (data: PVSectionData) => void;
}) {
  const [open, setOpen] = useState(idx === 0);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [mapViewOpen, setMapViewOpen] = useState(false);
  const color = SECTION_COLORS[idx % SECTION_COLORS.length];

  const updateField = (id: string, val: string) =>
    onChange({ ...data, fields: { ...data.fields, [id]: val } });

  const hasLocalisationField = schema.fields?.some((f) => f.id === 'localisation');

  const handleGeolocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Géolocalisation non supportée par ce navigateur.');
      return;
    }
    setGeoLoading(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        let address = data.fields['localisation'] || '';
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=fr`,
          );
          if (res.ok) {
            const json = await res.json();
            address = json.display_name ?? address;
          }
        } catch {
          // keep existing address
        }
        onChange({
          ...data,
          fields: {
            ...data.fields,
            localisation: address,
            localisation_lat: String(lat),
            localisation_lng: String(lng),
          },
        });
        setGeoLoading(false);
      },
      (err) => {
        const msgs: Record<number, string> = {
          1: "Accès à la position refusé. Autorisez la localisation dans les paramètres du navigateur.",
          2: "Position indisponible. Réessayez.",
          3: "Délai dépassé. Réessayez.",
        };
        setGeoError(msgs[err.code] ?? "Erreur de géolocalisation.");
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  };

  return (
    <div className="rounded-xl border border-slate-700/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'w-full flex items-center justify-between px-4 py-3 bg-slate-800/60 hover:bg-slate-800/80 transition-colors text-left',
          open && 'border-b border-slate-700/50',
        )}
      >
        <div className="flex items-center gap-3">
          <span className={cn('flex items-center justify-center h-6 w-6 rounded-md text-xs font-bold bg-slate-700/80', color)}>
            {idx + 1}
          </span>
          <span className="text-sm font-medium text-slate-200">{schema.title}</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
      </button>

      {hasLocalisationField && data.fields['localisation_lat'] && data.fields['localisation_lng'] && (
        <MapViewDialog
          open={mapViewOpen}
          onOpenChange={setMapViewOpen}
          lat={parseFloat(data.fields['localisation_lat'])}
          lng={parseFloat(data.fields['localisation_lng'])}
          label={data.fields['localisation']}
        />
      )}

      {open && (
        <div className="p-4 bg-slate-800/30 space-y-4">
          {/* Regular text/textarea fields */}
          {schema.fields && schema.fields.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {schema.fields.map((f) => {
                if (f.id === 'localisation') {
                  const lat = data.fields['localisation_lat'] ? parseFloat(data.fields['localisation_lat']) : undefined;
                  const lng = data.fields['localisation_lng'] ? parseFloat(data.fields['localisation_lng']) : undefined;
                  return (
                    <div key={f.id} className="sm:col-span-2 space-y-1.5">
                      <Label className="text-slate-400 text-xs">{f.label}</Label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={data.fields[f.id] || ''}
                          onChange={(e) => updateField(f.id, e.target.value)}
                          placeholder="Adresse ou description du site"
                          className="flex-1 rounded-md border border-slate-600/60 bg-slate-700/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500/60"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={geoLoading}
                          onClick={handleGeolocation}
                          className="shrink-0 border-slate-600 bg-slate-700/40 text-slate-300 hover:bg-slate-700/80 hover:text-blue-300 transition-colors"
                        >
                          <MapPin className={cn('h-4 w-4 mr-1.5', geoLoading && 'animate-pulse')} />
                          {geoLoading ? 'Localisation…' : 'Ma position'}
                        </Button>
                        {lat && lng && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setMapViewOpen(true)}
                            className="shrink-0 border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 transition-colors"
                          >
                            Voir
                          </Button>
                        )}
                      </div>
                      {geoError && (
                        <p className="text-xs text-red-400">{geoError}</p>
                      )}
                      {lat && lng && !geoError && (
                        <p className="text-xs text-blue-400/70">
                          GPS : {lat.toFixed(5)}, {lng.toFixed(5)}
                        </p>
                      )}
                    </div>
                  );
                }
                return (
                  <div key={f.id} className={cn('space-y-1.5', f.type === 'textarea' && 'sm:col-span-2')}>
                    <Label className="text-slate-400 text-xs">{f.label}</Label>
                    {f.type === 'textarea' ? (
                      <textarea
                        rows={3}
                        value={data.fields[f.id] || ''}
                        onChange={(e) => updateField(f.id, e.target.value)}
                        className="w-full rounded-md border border-slate-600/60 bg-slate-700/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500/60 resize-none"
                      />
                    ) : (
                      <input
                        type="text"
                        value={data.fields[f.id] || ''}
                        onChange={(e) => updateField(f.id, e.target.value)}
                        className="w-full rounded-md border border-slate-600/60 bg-slate-700/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500/60"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Table (Section 8 — System) */}
          {schema.tableRows && data.tableRows && schema.tableMode === 'system' && (
            <SystemTableEditor
              rows={data.tableRows}
              onChange={(rows) => onChange({ ...data, tableRows: rows })}
            />
          )}

          {/* Mesure sessions (Section 2 — relevés compteurs) */}
          {schema.hasWoyofal && (
            <MesureSessionsEditor
              sessions={data.mesureSessions ?? []}
              onChange={(sessions) => onChange({ ...data, mesureSessions: sessions })}
            />
          )}

          {/* Checkbox group */}
          {schema.checkboxItems && data.checkboxItems && (
            <div className="space-y-2">
              {schema.checkboxLabel && (
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">{schema.checkboxLabel}</p>
              )}
              <CheckboxGroupEditor
                items={data.checkboxItems}
                onChange={(items) => onChange({ ...data, checkboxItems: items })}
                withComment={schema.id === 's11'}
              />
            </div>
          )}

          {/* Extra checkbox group (Section 11 — Usages extérieurs) */}
          {schema.extraCheckboxItems && data.extraCheckboxItems && (
            <div className="space-y-2">
              {schema.extraCheckboxLabel && (
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">{schema.extraCheckboxLabel}</p>
              )}
              <CheckboxGroupEditor
                items={data.extraCheckboxItems}
                onChange={(items) => onChange({ ...data, extraCheckboxItems: items })}
              />
            </div>
          )}

          {/* Free text (Section 11 — Remarques) */}
          {schema.hasFreeText && (
            <div className="space-y-1.5">
              {schema.freeTextLabel && (
                <Label className="text-slate-400 text-xs">{schema.freeTextLabel}</Label>
              )}
              <textarea
                rows={4}
                value={data.freeText || ''}
                onChange={(e) => onChange({ ...data, freeText: e.target.value })}
                placeholder="Saisissez vos remarques et recommandations..."
                className="w-full rounded-md border border-slate-600/60 bg-slate-700/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500/60 resize-none"
              />
            </div>
          )}

          {/* Per-section custom key-value fields */}
          <SectionCustomFieldsBuilder
            fields={data.customFields ?? []}
            onChange={(cf) => onChange({ ...data, customFields: cf })}
          />
        </div>
      )}
    </div>
  );
}
