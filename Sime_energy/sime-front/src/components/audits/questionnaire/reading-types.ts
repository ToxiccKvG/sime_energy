import type { MesureReading } from '@/types/audit';

// ─── Woyofal readings table (inside a WOYOFAL session) ──────────────────────

export type WoyofalReading = Extract<MesureReading, { kind: 'woyofal' }>;

export type IndexReading   = Extract<MesureReading, { kind: 'index' }>;
