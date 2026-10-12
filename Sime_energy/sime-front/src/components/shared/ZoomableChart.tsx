// ============================================================
// ResponsiveContainer avec bouton « Agrandir » intégré
//
// Remplace celui de Recharts dans les graphiques IOT et Mesures (même
// nom, mêmes props) : tout graphique en reçoit le bouton sans y penser,
// y compris ceux ajoutés plus tard (demande du manager, 12/10 :
// « accessible partout »). Exceptions : les mini-graphiques (< 160 px de
// haut) et ceux déjà sous un ChartZoom posé à la main.
// ============================================================

import type { ComponentProps } from 'react';
import { ResponsiveContainer as RechartsResponsiveContainer } from 'recharts';
import { ChartZoom, useInsideChartZoom } from '@/components/shared/ChartZoom';

const MIN_ZOOM_HEIGHT = 160;

type Props = ComponentProps<typeof RechartsResponsiveContainer> & {
  /** Titre de la vue agrandie ; par défaut, celui affiché au-dessus du graphique. */
  zoomTitle?: string;
};

export function ResponsiveContainer({ zoomTitle, ...props }: Props) {
  const inside = useInsideChartZoom();
  const container = <RechartsResponsiveContainer {...props} />;
  const small = typeof props.height === 'number' && props.height < MIN_ZOOM_HEIGHT;
  if (inside || small) return container;
  return <ChartZoom title={zoomTitle}>{container}</ChartZoom>;
}
