import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import { AuditSite } from "@/types/audit";
import "leaflet/dist/leaflet.css";

interface AuditsMapProps {
  sites: AuditSite[];
}

// Component to set view bounds based on sites
function MapBounds({ sites }: { sites: AuditSite[] }) {
  const map = useMap();

  useEffect(() => {
    if (sites.length > 0) {
      const bounds = sites.map(site => [site.coordinates.lat, site.coordinates.lng] as [number, number]);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [sites, map]);

  return null;
}

const statusLabels = {
  planned: "Planifié",
  in_progress: "En cours",
  completed: "Terminé"
};

const statusColors = {
  planned: "bg-muted",
  in_progress: "bg-primary/10",
  completed: "bg-success/10"
};

export function AuditsMap({ sites }: AuditsMapProps) {
  // Centre par défaut sur Dakar
  const defaultCenter: [number, number] = [14.6928, -17.4467];

  return (
    <div className="col-span-full rounded-lg border bg-card text-card-foreground shadow-sm">
      <div className="flex flex-col space-y-1.5 p-6">
        <h3 className="text-2xl font-semibold leading-none tracking-tight">
          Carte des sites d'audit
        </h3>
      </div>
      <div className="p-6 pt-0">
        <div className="h-[500px] rounded-lg overflow-hidden border">
          <MapContainer
            center={defaultCenter}
            zoom={12}
            style={{ height: "100%", width: "100%" }}
            className="z-0"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            
            {sites.length > 0 && <MapBounds sites={sites} />}
            
            {sites.map((site) => (
              <CircleMarker
                key={site.id}
                center={[site.coordinates.lat, site.coordinates.lng]}
                radius={10}
                pathOptions={{
                  fillColor: site.auditColor,
                  fillOpacity: 0.7,
                  color: site.auditColor,
                  weight: 2
                }}
              >
                <Popup>
                  <div style={{ minWidth: '200px' }}>
                    <div style={{ marginBottom: '8px' }}>
                      <div style={{ fontWeight: 600, fontSize: '14px' }}>{site.name}</div>
                      <div style={{ fontSize: '12px', color: '#666' }}>{site.address}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div 
                        style={{ 
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 500,
                          backgroundColor: `${site.auditColor}20`,
                          border: `1px solid ${site.auditColor}`,
                          color: site.auditColor
                        }}
                      >
                        {site.auditName}
                      </div>
                      <div 
                        style={{ 
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 500,
                          backgroundColor: '#f3f4f6',
                          color: '#374151'
                        }}
                      >
                        {statusLabels[site.status]}
                      </div>
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
      </div>
    </div>
  );
}
