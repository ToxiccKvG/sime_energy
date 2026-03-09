import * as XLSX from 'xlsx';
import { AuditInvoice } from './invoice-service';

/**
 * Extrait les champs depuis un AuditInvoice
 * Priorité: ocr_data_verified.unifiedData > ocr_data (fallback)
 */
function extractOCRFields(invoice: AuditInvoice): Record<string, string> {
  const fields: Record<string, string> = {};

  //  PRIORITÉ 1: Utiliser ocr_data_verified.unifiedData si disponible
  // C'est la fusion des forms OCR + tableaux transformés
  if (invoice.ocr_data_verified && typeof invoice.ocr_data_verified === 'object') {
    const verified = invoice.ocr_data_verified as any;

    if (verified.unifiedData && typeof verified.unifiedData === 'object') {
      console.log(` Export: Utilisation de ocr_data_verified.unifiedData pour ${invoice.file_name}`);

      // Convertir toutes les valeurs en string
      Object.entries(verified.unifiedData).forEach(([key, value]) => {
        if (key && value !== undefined && value !== null) {
          fields[key] = String(value);
        }
      });

      return fields;
    }
  }

  //  FALLBACK: Utiliser ocr_data si ocr_data_verified n'existe pas
  console.log(` Export: Fallback sur ocr_data pour ${invoice.file_name} (ocr_data_verified absent)`);

  if (!invoice.ocr_data) return fields;

  const ocr_data = invoice.ocr_data;

  // Cas 1: Structure avec pages
  if (ocr_data.pages && Array.isArray(ocr_data.pages) && ocr_data.pages.length > 0) {
    const firstPage = ocr_data.pages[0];
    if (firstPage.forms && Array.isArray(firstPage.forms)) {
      firstPage.forms.forEach((form: any) => {
        if (form.Key && form.Value !== undefined) {
          fields[form.Key] = String(form.Value);
        }
      });
    }
  }
  // Cas 2: Array direct
  else if (Array.isArray(ocr_data)) {
    ocr_data.forEach((form: any) => {
      if (form.Key && form.Value !== undefined) {
        fields[form.Key] = String(form.Value);
      }
    });
  }
  // Cas 3: Structure avec forms direct
  else if (ocr_data.forms && Array.isArray(ocr_data.forms)) {
    ocr_data.forms.forEach((form: any) => {
      if (form.Key && form.Value !== undefined) {
        fields[form.Key] = String(form.Value);
      }
    });
  }

  return fields;
}

/**
 * Détermine l'ordre standard des colonnes
 * Place d'abord les champs critiques, puis les autres alphabétiquement
 */
function getColumnOrder(allFields: Set<string>): string[] {
  // Champs critiques dans l'ordre souhaité (forms + tableaux)
  const priorityFields = [
    // Numéros et références
    'NUMERO_FACTURE',
    'FACTURE N°',
    'FACTURE_N',
    'N_FACTURE',

    // Dates
    'DATE_COMPTABLE_FACTURE',
    'DATE_FACTURE',
    'DATE',
    'PERIODE_DU',
    'PERIODE_AU',

    // Type et catégorie
    'TYPE_DE_FACTURE',
    'TYPE DE FACTURE',

    // Identifiants contrat/compte
    'NUMERO_COMPTE_CONTRAT',
    'NUMERO_COMPTEUR',
    'POLICE',
    'CONTRAT',

    // Informations client
    'NOM_OU_RAISON_SOCIALE',
    'NOM',
    'RAISON_SOCIALE',
    'RUE',
    'ADRESSE',

    // Fournisseur
    'SUPPLIER',
    'FOURNISSEUR',

    // Montants et consommation
    'MONTANT_TTC',
    'MONTANT',
    'CONSOMMATION',
    'TOTAL',
  ];

  const ordered: string[] = [];
  const remaining = new Set(allFields);

  // Ajouter les champs prioritaires dans l'ordre
  for (const field of priorityFields) {
    if (allFields.has(field)) {
      ordered.push(field);
      remaining.delete(field);
    }
  }

  // Ajouter les champs restants triés alphabétiquement
  const sorted = Array.from(remaining).sort();
  ordered.push(...sorted);

  return ordered;
}

/**
 * Extrait la date de facture depuis les données vérifiées ou utilise invoice_date
 */
function getInvoiceDate(invoice: AuditInvoice): Date {
  // Chercher dans les champs extraits (utilise déjà ocr_data_verified en priorité)
  const fields = extractOCRFields(invoice);

  // Essayer plusieurs champs de date possibles
  const dateString =
    fields['DATE_COMPTABLE_FACTURE'] ||
    fields['PERIODE_DU'] ||
    fields['DATE'] ||
    fields['DATE_FACTURE'];

  if (dateString) {
    try {
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        return date;
      }
    } catch (e) {
      // Continuer
    }
  }

  // Utiliser invoice_date si disponible
  if (invoice.invoice_date) {
    try {
      const date = new Date(invoice.invoice_date);
      if (!isNaN(date.getTime())) {
        return date;
      }
    } catch (e) {
      // Continuer
    }
  }

  // Utiliser created_at en dernier recours
  return new Date(invoice.created_at);
}

/**
 * Exporte les factures vérifiées en Excel
 * Si selectedIds est fourni, n'exporte que les factures sélectionnées ET vérifiées
 */
export async function exportVerifiedInvoicesToExcel(
  invoices: AuditInvoice[],
  selectedIds?: Set<string>
): Promise<void> {
  // Filtrer les factures vérifiées
  let verifiedInvoices = invoices.filter(inv => inv.status === 'verified');

  // Si des IDs sont sélectionnés, filtrer seulement ceux-là
  if (selectedIds && selectedIds.size > 0) {
    verifiedInvoices = verifiedInvoices.filter(inv => selectedIds.has(inv.id));
  }

  if (verifiedInvoices.length === 0) {
    throw new Error('Aucune facture vérifiée à exporter');
  }

  // Trier par date croissante (la plus ancienne d'abord)
  const sortedInvoices = verifiedInvoices.sort((a, b) => {
    return getInvoiceDate(a).getTime() - getInvoiceDate(b).getTime();
  });

  // Collecter tous les champs uniques
  const allFields = new Set<string>();
  allFields.add('FILE_NAME'); // Ajouter le nom du fichier comme colonne
  allFields.add('DATE');       // Ajouter la date comme colonne

  // Compter combien utilisent ocr_data_verified vs ocr_data
  let verifiedDataCount = 0;
  let fallbackDataCount = 0;

  sortedInvoices.forEach(invoice => {
    const fields = extractOCRFields(invoice);
    Object.keys(fields).forEach(key => allFields.add(key));

    // Compter la source des données
    if (invoice.ocr_data_verified?.unifiedData) {
      verifiedDataCount++;
    } else {
      fallbackDataCount++;
    }
  });

  console.log(`Export Excel - Sources de données:`);
  console.log(`  ${verifiedDataCount} facture(s) avec ocr_data_verified.unifiedData`);
  console.log(`  ${fallbackDataCount} facture(s) en fallback sur ocr_data`);
  console.log(`  ${allFields.size - 2} champs uniques détectés`);

  // Déterminer l'ordre des colonnes
  const columnOrder = getColumnOrder(allFields);
  // Mettre le nom du fichier et la date en début
  const finalColumns = ['FILE_NAME', 'DATE', ...columnOrder.filter(c => c !== 'FILE_NAME' && c !== 'DATE')];

  // Créer les données pour le tableau
  const rows: Record<string, string>[] = sortedInvoices.map(invoice => {
    const row: Record<string, string> = {};

    // Ajouter le nom du fichier
    row['FILE_NAME'] = invoice.file_name;

    // Ajouter la date formatée
    const date = getInvoiceDate(invoice);
    row['DATE'] = date.toLocaleDateString('fr-FR');

    // Ajouter tous les champs OCR
    const ocrFields = extractOCRFields(invoice);
    Object.entries(ocrFields).forEach(([key, value]) => {
      row[key] = value;
    });

    return row;
  });

  // Créer le classeur
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: finalColumns,
  });

  // Ajouter le worksheet au classeur
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Factures');

  // Générer le nom du fichier avec la date actuelle
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const fileName = `Factures-verifiees-${dateStr}.xlsx`;

  // Télécharger le fichier
  XLSX.writeFile(workbook, fileName);
}
