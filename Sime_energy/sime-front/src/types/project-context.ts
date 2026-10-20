/**
 * Contexte projet — snapshot JSON stocké dans audits.project_context.
 * Contrat consommé par d'autres modules / plateformes : toute évolution
 * incompatible doit incrémenter schema_version.
 * Doc : sime-front/docs/project-context-json.md
 */

import type { GeoLocation } from '@/services/meteo-service';

export const PROJECT_CONTEXT_SCHEMA_VERSION = 1;

export type JourSemaine = 'lundi' | 'mardi' | 'mercredi' | 'jeudi' | 'vendredi' | 'samedi' | 'dimanche';

export interface HoraireJour {
  travaille: boolean;
  debut: string | null;   // HH:mm
  fin: string | null;     // HH:mm
  heures: number;         // 0 si non travaillé
}

export interface BilanCalendrierAnnuel {
  annee: number;
  jours_calendaires: number;
  jours_non_travailles_hebdo: number;  // jours non travaillés selon l'horaire hebdo (week-end…)
  jours_feries_ouvres: number;         // fériés tombant sur un jour normalement travaillé
  jours_ouvres_effectifs: number;
  heures_ouvrees_estimees: number;
}

export interface Personne {
  nom: string | null;
  position: string | null;
  telephone: string | null;
  email: string | null;
}

export interface BatimentContext {
  id: string;
  nom: string;
  type: string | null;
  zone_id: string | null;
  surfaces_m2: { terrain: number | null; batie: number | null; toiture: number | null };
  parametres_usage: Record<string, any>[];   // building_type_params (calendrier + heures par usage)
  niveaux: {
    id: string;
    nom: string;
    ordre: number | null;
    pieces: { id: string; code: string; service: string | null; type_fonctionnel: string | null; surface_m2: number | null }[];
  }[];
}

export interface SiteContext {
  id: string;
  nom: string;
  adresse: string | null;
  coordonnees: { lat: number | null; lng: number | null };
  statut: string | null;
  structure_bati: Record<string, any> | null;
  enveloppe: Record<string, any> | null;
  amenagement: Record<string, any> | null;
  facturation: (Record<string, any> & { grille_tarifaire_resolue: Record<string, any> | null }) | null;
  zones: { id: string; nom: string; description: string | null; ordre: number | null; batiments: BatimentContext[] }[];
  batiments_sans_zone: BatimentContext[];
}

// ─── Questionnaire d'inspection (PV de visite) ────────────────────────────────

export interface ValeurReleve {
  valeur_brute: string;
  valeur: number | null;          // null si la saisie n'est pas un nombre
  valeur_invalide?: true;         // présent si une saisie non vide n'a pas pu être lue comme nombre
}

export interface ReleveIndex extends Partial<ValeurReleve> {
  parametre: string;              // « Index départ », « Puissance souscrite »…
  date: string | null;
  sous_valeurs: ({ code_obis: string; signification: string | null; libelle: string | null } & ValeurReleve)[];
}

export interface ReleveWoyofal extends ValeurReleve {
  code: string;                   // code court Woyofal (800, 803…)
  libelle: string | null;
  groupe: string | null;
}

export interface SessionReleveCompteur {
  questionnaire_id: string;
  questionnaire: string;
  session_id: string;
  session: string;
  type: 'INDEX' | 'WOYOFAL';
  date: string | null;            // tel que saisi (JJ/MM/AAAA HH:mm)
  releves: (ReleveIndex | ReleveWoyofal)[];
}

export interface SectionInspection {
  id: string;
  titre: string;
  champs: { cle: string; libelle: string; valeur: string }[];
  coordonnees_gps: { lat: number; lng: number } | null;
  tableau: { cle: string; libelle: string; sous_groupe: string | null; releves: { date: string | null; valeur: string }[] }[];
  cases_cochees: { groupe: string; cle: string; libelle: string; commentaire: string | null }[];
  texte_libre: { libelle: string; valeur: string } | null;
  champs_personnalises: { cle: string; valeur: string }[];
  sessions_releves: SessionReleveCompteur[];
}

export interface QuestionnaireInspection {
  id: string;
  nom: string;
  cree_le: string | null;
  champs_personnalises: { cle: string; valeur: string }[];
  sections: SectionInspection[];   // seulement les sections contenant au moins une donnée
}

// ─── Facturation ──────────────────────────────────────────────────────────────

export interface AgregatFactures {
  nb_factures: number;
  nb_en_quarantaine: number;
  conso_kwh: number;
  conso_k1_kwh: number;
  conso_k2_kwh: number;
  montant_ttc_fcfa: number;
  puissance_max_kw: number | null;
  cos_phi_moyen: number | null;
}

export interface ProjectContextV1 {
  schema_version: 1;
  generated_at: string;
  generated_by: string | null;

  projet: {
    id: string;
    nom: string;
    couleur: string | null;
    statut: string | null;
    date_debut: string | null;
    date_fin: string | null;
    avancement_pct: number | null;
    responsable: string | null;
    type_client: 'INDUSTRIE' | 'SERVICES' | 'AUTRE' | null;
    type_client_autre: string | null;
    sous_type: string | null;
    organisation: { id: string; nom: string | null };
    cree_par: string | null;
    cree_le: string | null;
    maj_le: string | null;
  };

  informations_generales: {
    identification: Record<string, any>;
    finances: Record<string, any>;
    energie: {
      contrats_fournisseurs: string | null;
      consommations: { type: string; unite: string | null; annees: { annee: number; quantite: number | null; cout_fcfa: number | null }[] }[];
      problemes_efficacite: { designation: string; frequence: string | null; duree: string | null }[];
      diagnostic_precedent: any;
      programme_extension: any;
    };
    specifique: Record<string, any>;
    synthese_ia: Record<string, any> | null;
  };

  personnel: {
    directeur_general: string | null;
    responsable_technique: string | null;
    responsable_energie: string | null;
    responsable_achat: string | null;
    responsables_energie: Personne[];
    points_focaux: Personne[];
    employes: { categorie: string; hommes: number; femmes: number; cadres: number; total: number }[];
    effectif_total_declare: number | null;
    effectif_total_calcule: number;
    systeme_management_energie: any;
  };

  calendrier: {
    source_horaires: 'projet' | 'defaut' | 'texte_libre';
    horaires_texte_libre: string | null;
    horaires_hebdo: Record<JourSemaine, HoraireJour>;
    heures_semaine: number;
    jours_ouvres_semaine: number;
    quarts: { par_jour: number | null; heures_par_quart: number | null };
    activite_saisonniere: boolean;
    saisons_activite: string | null;
    maintenance: { active: boolean; frequence: string | null; duree: string | null };
    source_jours_feries: 'liste_senegal';
    jours_feries: { date: string; titre: string; type: 'fixed' | 'islamic' }[];
    evenements_organisation: { id: string; titre: string; description: string | null; date_debut: string; date_fin: string | null; journee_entiere: boolean }[];
    bilan_annuel: BilanCalendrierAnnuel[];
    heures_supplementaires: { date: string; heures: number; motif: string | null }[];  // réservé — pas encore saisi dans l'app
  };

  reglages: {
    origine: 'organisation' | 'defaut';
    maj_le: string | null;
    meteo: {
      localisation: GeoLocation;
      temperatures_mensuelles_c: number[];   // 12 valeurs [Jan..Déc]
      t_ref_chauffage_c: number;
      t_ref_climatisation_c: number;
      seuil_confort_c: number | null;
      donnees_recuperees_le: string | null;
    };
    btu: { coef_c: number; coef_g: number };
  };

  sites: SiteContext[];

  inspection: {
    questionnaires: QuestionnaireInspection[];
    releves_compteur_senelec: SessionReleveCompteur[];   // toutes les sessions, tous questionnaires confondus
    defauts_reseau_constates: { questionnaire: string; cle: string; libelle: string; commentaire: string | null }[];
  };

  facturation: {
    sources: { senelec_export: number; ocr: number };
    senelec: {
      periode: { debut: string | null; fin: string | null };
      total: AgregatFactures;
      par_contrat: ({
        numero_compte_contrat: string;
        numero_compteur: string | null;
        categorie_tarifaire: string | null;
        puissance_souscrite_kw: number | null;
        site_id: string | null;
        site_nom: string | null;
        periode: { debut: string | null; fin: string | null };
      } & AgregatFactures)[];
      serie_mensuelle: ({ mois: string } & AgregatFactures)[];   // mois = AAAA-MM du début de période
      detail: { vue: 'v_factures_senelec_projet'; filtre: string };
    };
    factures_ocr: {
      id: string;
      fichier: string | null;
      date_facture: string | null;
      fournisseur: string | null;
      statut: string | null;
      en_quarantaine: boolean;
      motif_quarantaine: string | null;
      site_id: string | null;
      montant_ttc_fcfa: number | null;
      donnees: Record<string, any>;   // champs extraits (conso K1/K2, Pmax, cos φ, montants, période…)
    }[];
  };

  brut: { general_info: Record<string, any>; personnel: Record<string, any> };
}
