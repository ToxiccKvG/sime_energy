import { MapPin, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

// ─── Map View (static image + external links) ────────────────────────────────

export function MapViewDialog({ open, onOpenChange, lat, lng, label }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lat: number;
  lng: number;
  label?: string;
}) {
  const googleUrl = `https://www.google.com/maps?q=${lat},${lng}`;
  const osmUrl    = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}`;
  const wazeUrl   = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-slate-100">Localisation enregistrée</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Coordinates card */}
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-blue-400 shrink-0" />
              <span className="text-sm font-medium text-blue-300">Position GPS</span>
            </div>
            {label && (
              <p className="text-sm text-slate-300 leading-snug pl-7">{label}</p>
            )}
            <div className="pl-7 space-y-1">
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 w-20">Latitude</span>
                <span className="text-sm font-mono text-slate-200">{lat.toFixed(6)}°</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 w-20">Longitude</span>
                <span className="text-sm font-mono text-slate-200">{lng.toFixed(6)}°</span>
              </div>
            </div>
          </div>

          {/* Open in map app */}
          <div className="space-y-1.5">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Ouvrir dans</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Google Maps', url: googleUrl },
                { label: 'OpenStreetMap', url: osmUrl },
                { label: 'Waze', url: wazeUrl },
              ].map(({ label: lbl, url }) => (
                <a key={lbl} href={url} target="_blank" rel="noreferrer" className="contents">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-center gap-1.5 border-slate-600 bg-slate-700/30 text-slate-300 hover:bg-slate-700 hover:text-white text-xs"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {lbl}
                  </Button>
                </a>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} className="bg-slate-700 hover:bg-slate-600 text-slate-100">
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
