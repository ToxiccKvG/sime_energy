import type { PVQuestionnaire } from '@/types/audit';
import {
  QUESTIONNAIRE_SCHEMA, WOYOFAL_CODE_LABELS, OBIS_BY_KEY, obisOptionLabel,
} from '@/constants/pv-questionnaire-schema';

// ─── Recap PDF ────────────────────────────────────────────────────────────────

// Toute valeur venant du questionnaire est échappée avant d'entrer dans le HTML :
// la page est écrite dans une fenêtre de même origine que l'application (XSS stockée sinon).
function esc(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const escLines = (value: unknown): string => esc(value).replace(/\n/g, '<br>');

export function buildRecapHTML(questionnaire: PVQuestionnaire): string {
  let body = '';

  QUESTIONNAIRE_SCHEMA.forEach((schema, i) => {
    const sec = questionnaire.sections[i];
    if (!sec) return;

    const filledFields = schema.fields?.filter((f) => sec.fields[f.id] && f.id !== 'localisation_lat' && f.id !== 'localisation_lng') ?? [];
    const hasCoords = sec.fields['localisation_lat'] && sec.fields['localisation_lng'];
    const filledRows = sec.tableRows?.filter((r) => {
      if (r.readings && r.readings.length > 0) return r.readings.some((rd) => rd.value);
      return !!r.value;
    }) ?? [];
    const checkedItems = sec.checkboxItems?.filter((c) => c.checked) ?? [];
    const checkedExtra = sec.extraCheckboxItems?.filter((c) => c.checked) ?? [];
    const sectionCf = (sec.customFields ?? []).filter((f) => f.key || f.value);
    const filledSessions = (sec.mesureSessions ?? []).filter((s) => s.readings.length > 0);

    if (!filledFields.length && !hasCoords && !filledRows.length && !checkedItems.length && !checkedExtra.length && !sec.freeText && !sectionCf.length && !filledSessions.length) return;

    body += `<h2>${i + 1}. ${esc(schema.title)}</h2>`;

    if (filledFields.length || hasCoords) {
      body += '<table><tbody>';
      filledFields.forEach((f) => {
        body += `<tr><td class="lbl">${esc(f.label)}</td><td>${escLines(sec.fields[f.id] ?? '')}</td></tr>`;
      });
      if (hasCoords) {
        body += `<tr><td class="lbl">Coordonnées GPS</td><td>${parseFloat(sec.fields['localisation_lat']).toFixed(6)}, ${parseFloat(sec.fields['localisation_lng']).toFixed(6)}</td></tr>`;
      }
      body += '</tbody></table>';
    }

    if (filledRows.length) {
      body += '<table><thead><tr><th>Paramètre</th><th>Date / Heure</th><th>Valeur</th></tr></thead><tbody>';
      filledRows.forEach((r) => {
        const readings = r.readings?.filter((rd) => rd.value)
          ?? (r.value ? [{ id: '', dateTime: r.dateTime, value: r.value }] : []);
        readings.forEach((rd, rdIdx) => {
          body += `<tr><td>${esc(rdIdx === 0 ? r.label : '')}</td><td>${esc(rd.dateTime || '—')}</td><td>${esc(rd.value)}</td></tr>`;
        });
      });
      body += '</tbody></table>';
    }

    filledSessions.forEach((session) => {
      const typeLabel = session.type === 'WOYOFAL' ? 'Woyofal' : 'Index manuel';
      body += `<p class="grp">${esc(session.label)} — ${typeLabel}${session.dateTime ? ` — ${esc(session.dateTime)}` : ''}</p>`;
      if (session.type === 'WOYOFAL') {
        body += '<table><thead><tr><th>Code Woyofal</th><th>Valeur relevée</th></tr></thead><tbody>';
        session.readings.forEach((r) => {
          if (r.kind !== 'woyofal') return;
          const lbl = WOYOFAL_CODE_LABELS[r.code] ? `${r.code} — ${WOYOFAL_CODE_LABELS[r.code]}` : r.code;
          body += `<tr><td>${esc(lbl)}</td><td>${esc(r.valeur)}</td></tr>`;
        });
      } else {
        body += '<table><thead><tr><th>Paramètre</th><th>Date et heure</th><th>Valeur</th></tr></thead><tbody>';
        session.readings.forEach((r) => {
          if (r.kind !== 'index') return;
          const date = r.date || '—';
          if (r.subValues && r.subValues.length > 0) {
            const valStr = r.subValues.map((sv) => {
              const e = OBIS_BY_KEY[sv.code];
              const name = e ? [obisOptionLabel(e), e.libelle].filter(Boolean).join(' · ') : sv.code;
              return `${esc(name)} = ${esc(sv.valeur || '—')}`;
            }).join('<br>');
            body += `<tr><td>${esc(r.key)}</td><td>${esc(date)}</td><td>${valStr}</td></tr>`;
          } else {
            body += `<tr><td>${esc(r.key)}</td><td>${esc(date)}</td><td>${esc(r.valeur || '—')}</td></tr>`;
          }
        });
      }
      body += '</tbody></table>';
    });

    if (checkedItems.length) {
      body += `<p class="grp">${esc(schema.checkboxLabel ?? 'Éléments cochés')}</p><ul>`;
      checkedItems.forEach((c) => {
        body += `<li>${esc(c.label)}${c.comment ? ` — <em>${esc(c.comment)}</em>` : ''}</li>`;
      });
      body += '</ul>';
    }

    if (checkedExtra.length) {
      body += `<p class="grp">${esc(schema.extraCheckboxLabel ?? 'Usages')}</p><ul>`;
      checkedExtra.forEach((c) => { body += `<li>${esc(c.label)}</li>`; });
      body += '</ul>';
    }

    if (sec.freeText) {
      body += `<p class="grp">${esc(schema.freeTextLabel ?? 'Remarques')}</p><p>${escLines(sec.freeText)}</p>`;
    }

    if (sectionCf.length) {
      body += '<table><tbody>';
      sectionCf.forEach((f) => { body += `<tr><td class="lbl">${esc(f.key)}</td><td>${esc(f.value)}</td></tr>`; });
      body += '</tbody></table>';
    }
  });

  const globalCf = questionnaire.customFields.filter((f) => f.key || f.value);
  if (globalCf.length) {
    body += '<h2>Champs personnalisés</h2><table><tbody>';
    globalCf.forEach((f) => { body += `<tr><td class="lbl">${esc(f.key)}</td><td>${esc(f.value)}</td></tr>`; });
    body += '</tbody></table>';
  }

  const date = new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>Questionnaire — ${esc(questionnaire.name)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;padding:18mm 15mm;font-size:11px}
  .hdr{border-bottom:2px solid #1e3a5f;padding-bottom:10px;margin-bottom:18px}
  .hdr h1{color:#1e3a5f;font-size:17px;margin-bottom:3px}
  .hdr p{color:#888;font-size:10px}
  h2{color:#1e3a5f;font-size:12px;margin-top:18px;margin-bottom:7px;background:#eef2f7;padding:5px 9px;border-left:3px solid #1e3a5f;page-break-after:avoid}
  table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:9px}
  th{background:#1e3a5f;color:#fff;text-align:left;padding:5px 7px;font-size:10px}
  td{border:1px solid #ddd;padding:4px 7px;vertical-align:top}
  tr:nth-child(even) td{background:#f8f8f8}
  .lbl{width:40%;color:#555;font-style:italic}
  p{margin:5px 0}
  p.grp{font-weight:bold;color:#1e3a5f;margin-top:8px}
  ul{list-style:none;padding:0 0 0 10px;margin-bottom:8px}
  ul li{padding:2px 0}
  ul li::before{content:"✓ ";color:#1e3a5f;font-weight:bold}
  @media print{body{padding:10mm}h2{page-break-inside:avoid}tr{page-break-inside:avoid}}
</style>
</head>
<body>
<div class="hdr">
  <h1>Questionnaire d'inspection — ${esc(questionnaire.name)}</h1>
  <p>Généré le ${date}</p>
</div>
${body}
</body>
</html>`;
}
