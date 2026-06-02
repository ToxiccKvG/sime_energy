/**
 * Shared number formatting utilities.
 * Always use these for any value displayed to the user — never raw .toFixed().
 *
 * Conventions:
 *  - Thousands separator: space (French standard)
 *  - Always one space between value and unit
 *  - Units are returned as part of the string
 */

/** Integer with thousands separator. Ex: 1 234 567 */
export function formatNumber(n: number, decimals = 0): string {
  return n.toLocaleString('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Power in W or kW depending on magnitude.
 * Ex: 450 W | 12,5 kW | 1,2 MW
 */
export function formatPower(w: number): string {
  if (w >= 1_000_000) return `${formatNumber(w / 1_000_000, 1)} MW`;
  if (w >= 10_000)    return `${formatNumber(w / 1_000, 0)} kW`;
  if (w >= 1_000)     return `${formatNumber(w / 1_000, 1)} kW`;
  return `${formatNumber(w, 0)} W`;
}

/**
 * Energy in kWh/an, MWh/an, GWh/an.
 * Ex: 0 kWh | 3 450 kWh | 12,3 MWh | 1,2 GWh
 */
export function formatEnergy(kwh: number): string {
  if (kwh === 0) return '0 kWh';
  if (kwh >= 1_000_000) return `${formatNumber(kwh / 1_000_000, 1)} GWh`;
  if (kwh >= 10_000)    return `${formatNumber(kwh / 1_000, 1)} MWh`;
  return `${formatNumber(kwh, 0)} kWh`;
}

/** Percentage with 1 decimal. Ex: 34,5 % */
export function formatPercent(p: number, decimals = 1): string {
  return `${formatNumber(p, decimals)} %`;
}
