// Types de la base Supabase (projet amctayugahwhxwytqiqf), générés le 2026-10-21.
// Fichier généré : ne pas modifier à la main. À régénérer après chaque migration
// (outil generate_typescript_types du MCP Supabase, ou `supabase gen types typescript`).

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      analyse_recettes: {
        Row: {
          chargement: Json
          cree_le: string
          cree_par: string | null
          description: string | null
          exclusions: Json
          id: string
          modifie_le: string
          nom: string
          organization_id: string
          regles_au: string | null
          regles_exclues: string[]
        }
        Insert: {
          chargement: Json
          cree_le?: string
          cree_par?: string | null
          description?: string | null
          exclusions?: Json
          id?: string
          modifie_le?: string
          nom: string
          organization_id: string
          regles_au?: string | null
          regles_exclues?: string[]
        }
        Update: {
          chargement?: Json
          cree_le?: string
          cree_par?: string | null
          description?: string | null
          exclusions?: Json
          id?: string
          modifie_le?: string
          nom?: string
          organization_id?: string
          regles_au?: string | null
          regles_exclues?: string[]
        }
        Relationships: []
      }
      annotation_dictionaries: {
        Row: {
          color: string | null
          created_at: string | null
          description: string | null
          fields: Json
          id: string
          name: string
          organization_id: string | null
          table_templates: Json
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          fields?: Json
          id?: string
          name?: string
          organization_id?: string | null
          table_templates?: Json
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          fields?: Json
          id?: string
          name?: string
          organization_id?: string | null
          table_templates?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "annotation_dictionaries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      annotation_settings: {
        Row: {
          created_at: string | null
          id: string
          organization_id: string
          selected_dictionary_id: string | null
          show_labels: boolean | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          organization_id: string
          selected_dictionary_id?: string | null
          show_labels?: boolean | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          organization_id?: string
          selected_dictionary_id?: string | null
          show_labels?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "annotation_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "annotation_settings_selected_dictionary_id_fkey"
            columns: ["selected_dictionary_id"]
            isOneToOne: false
            referencedRelation: "annotation_dictionaries"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_activity: {
        Row: {
          action_type: string
          audit_id: string
          created_at: string | null
          description: string | null
          id: string
          metadata: Json | null
          organization_id: string
          title: string
          user_id: string
        }
        Insert: {
          action_type: string
          audit_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          organization_id: string
          title: string
          user_id: string
        }
        Update: {
          action_type?: string
          audit_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_activity_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_activity_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_billing_params: {
        Row: {
          audit_id: string
          categorie_tarifaire: string
          comptage_position: string | null
          cosphi_seuil: number | null
          created_at: string | null
          domaine_tension: string
          grille_annee: number
          has_transformateur: boolean | null
          id: string
          intervalle_mesure_min: number | null
          k2_seuil_pct: number | null
          numero_contrat: string | null
          organization_id: string
          periode_reference_jours: number | null
          ps_seuil_pct: number | null
          puissance_souscrite_kw: number | null
          puissance_transfo_kva: number | null
          reference_invoice_id: string | null
          reference_senelec_id: string | null
          site_id: string
          source_mesure: string | null
          tco_applicable: boolean | null
          tva_applicable: boolean | null
          updated_at: string | null
        }
        Insert: {
          audit_id: string
          categorie_tarifaire?: string
          comptage_position?: string | null
          cosphi_seuil?: number | null
          created_at?: string | null
          domaine_tension?: string
          grille_annee?: number
          has_transformateur?: boolean | null
          id?: string
          intervalle_mesure_min?: number | null
          k2_seuil_pct?: number | null
          numero_contrat?: string | null
          organization_id: string
          periode_reference_jours?: number | null
          ps_seuil_pct?: number | null
          puissance_souscrite_kw?: number | null
          puissance_transfo_kva?: number | null
          reference_invoice_id?: string | null
          reference_senelec_id?: string | null
          site_id: string
          source_mesure?: string | null
          tco_applicable?: boolean | null
          tva_applicable?: boolean | null
          updated_at?: string | null
        }
        Update: {
          audit_id?: string
          categorie_tarifaire?: string
          comptage_position?: string | null
          cosphi_seuil?: number | null
          created_at?: string | null
          domaine_tension?: string
          grille_annee?: number
          has_transformateur?: boolean | null
          id?: string
          intervalle_mesure_min?: number | null
          k2_seuil_pct?: number | null
          numero_contrat?: string | null
          organization_id?: string
          periode_reference_jours?: number | null
          ps_seuil_pct?: number | null
          puissance_souscrite_kw?: number | null
          puissance_transfo_kva?: number | null
          reference_invoice_id?: string | null
          reference_senelec_id?: string | null
          site_id?: string
          source_mesure?: string | null
          tco_applicable?: boolean | null
          tva_applicable?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_billing_params_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_billing_params_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_billing_params_reference_invoice_id_fkey"
            columns: ["reference_invoice_id"]
            isOneToOne: false
            referencedRelation: "audit_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_billing_params_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "audit_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_buildings: {
        Row: {
          audit_id: string
          building_name: string
          building_type: string
          created_at: string | null
          id: string
          site_id: string
          surface_batie: number | null
          surface_terrain: number | null
          surface_toiture: number | null
          updated_at: string | null
          zone_id: string | null
        }
        Insert: {
          audit_id: string
          building_name: string
          building_type: string
          created_at?: string | null
          id?: string
          site_id: string
          surface_batie?: number | null
          surface_terrain?: number | null
          surface_toiture?: number | null
          updated_at?: string | null
          zone_id?: string | null
        }
        Update: {
          audit_id?: string
          building_name?: string
          building_type?: string
          created_at?: string | null
          id?: string
          site_id?: string
          surface_batie?: number | null
          surface_terrain?: number | null
          surface_toiture?: number | null
          updated_at?: string | null
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_buildings_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_buildings_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "audit_sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_buildings_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "audit_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_equipment: {
        Row: {
          audit_id: string
          brand: string | null
          category_id: string | null
          created_at: string | null
          id: string
          metadata: Json | null
          name: string
          power_w: number | null
          quantity: number | null
          room_id: string
          status: string | null
          updated_at: string | null
          utilization_factor: number
        }
        Insert: {
          audit_id: string
          brand?: string | null
          category_id?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          name: string
          power_w?: number | null
          quantity?: number | null
          room_id: string
          status?: string | null
          updated_at?: string | null
          utilization_factor?: number
        }
        Update: {
          audit_id?: string
          brand?: string | null
          category_id?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          power_w?: number | null
          quantity?: number | null
          room_id?: string
          status?: string | null
          updated_at?: string | null
          utilization_factor?: number
        }
        Relationships: [
          {
            foreignKeyName: "audit_equipment_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_equipment_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "equipment_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_equipment_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "audit_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_invoices: {
        Row: {
          amount: number | null
          audit_id: string | null
          building_id: string | null
          classeur_building_id: string | null
          classeur_site_id: string | null
          classeur_zone_id: string | null
          confidence_score: number | null
          created_at: string | null
          file_name: string
          file_url: string | null
          id: string
          invoice_date: string | null
          is_quarantined: boolean | null
          notes: string | null
          ocr_data: Json | null
          ocr_data_verified: Json | null
          organization_id: string
          quarantine_action_plan: string | null
          quarantine_comment: string | null
          quarantine_delta_pct: number | null
          quarantine_reason: string | null
          status: string
          supplier: string | null
          updated_at: string | null
          uploaded_by: string
        }
        Insert: {
          amount?: number | null
          audit_id?: string | null
          building_id?: string | null
          classeur_building_id?: string | null
          classeur_site_id?: string | null
          classeur_zone_id?: string | null
          confidence_score?: number | null
          created_at?: string | null
          file_name: string
          file_url?: string | null
          id?: string
          invoice_date?: string | null
          is_quarantined?: boolean | null
          notes?: string | null
          ocr_data?: Json | null
          ocr_data_verified?: Json | null
          organization_id: string
          quarantine_action_plan?: string | null
          quarantine_comment?: string | null
          quarantine_delta_pct?: number | null
          quarantine_reason?: string | null
          status?: string
          supplier?: string | null
          updated_at?: string | null
          uploaded_by: string
        }
        Update: {
          amount?: number | null
          audit_id?: string | null
          building_id?: string | null
          classeur_building_id?: string | null
          classeur_site_id?: string | null
          classeur_zone_id?: string | null
          confidence_score?: number | null
          created_at?: string | null
          file_name?: string
          file_url?: string | null
          id?: string
          invoice_date?: string | null
          is_quarantined?: boolean | null
          notes?: string | null
          ocr_data?: Json | null
          ocr_data_verified?: Json | null
          organization_id?: string
          quarantine_action_plan?: string | null
          quarantine_comment?: string | null
          quarantine_delta_pct?: number | null
          quarantine_reason?: string | null
          status?: string
          supplier?: string | null
          updated_at?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_invoices_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_invoices_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "audit_buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_invoices_classeur_building_id_fkey"
            columns: ["classeur_building_id"]
            isOneToOne: false
            referencedRelation: "audit_buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_invoices_classeur_site_id_fkey"
            columns: ["classeur_site_id"]
            isOneToOne: false
            referencedRelation: "audit_sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_invoices_classeur_zone_id_fkey"
            columns: ["classeur_zone_id"]
            isOneToOne: false
            referencedRelation: "audit_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_levels: {
        Row: {
          audit_id: string
          building_id: string
          created_at: string | null
          id: string
          name: string
          order_index: number | null
          updated_at: string | null
        }
        Insert: {
          audit_id: string
          building_id: string
          created_at?: string | null
          id?: string
          name: string
          order_index?: number | null
          updated_at?: string | null
        }
        Update: {
          audit_id?: string
          building_id?: string
          created_at?: string | null
          id?: string
          name?: string
          order_index?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_levels_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_levels_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "audit_buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_measurements: {
        Row: {
          audit_id: string
          building_id: string | null
          created_at: string | null
          id: string
          measurement_value: number | null
          notes: string | null
          recorded_at: string
          recorded_by: string | null
          sensor_name: string
          sensor_type: string
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          audit_id: string
          building_id?: string | null
          created_at?: string | null
          id?: string
          measurement_value?: number | null
          notes?: string | null
          recorded_at: string
          recorded_by?: string | null
          sensor_name: string
          sensor_type: string
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          audit_id?: string
          building_id?: string | null
          created_at?: string | null
          id?: string
          measurement_value?: number | null
          notes?: string | null
          recorded_at?: string
          recorded_by?: string | null
          sensor_name?: string
          sensor_type?: string
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_measurements_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_measurements_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "audit_buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_rooms: {
        Row: {
          audit_id: string
          code: string
          created_at: string | null
          id: string
          level_id: string
          service: string | null
          surface_m2: number | null
          type_fonctionnel: string | null
          updated_at: string | null
        }
        Insert: {
          audit_id: string
          code: string
          created_at?: string | null
          id?: string
          level_id: string
          service?: string | null
          surface_m2?: number | null
          type_fonctionnel?: string | null
          updated_at?: string | null
        }
        Update: {
          audit_id?: string
          code?: string
          created_at?: string | null
          id?: string
          level_id?: string
          service?: string | null
          surface_m2?: number | null
          type_fonctionnel?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_rooms_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_rooms_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "audit_levels"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_sites: {
        Row: {
          address: string | null
          amenagement: Json | null
          audit_id: string
          created_at: string | null
          enveloppe: Json | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          status: string
          structure_bati: Json | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          amenagement?: Json | null
          audit_id: string
          created_at?: string | null
          enveloppe?: Json | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          status?: string
          structure_bati?: Json | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          amenagement?: Json | null
          audit_id?: string
          created_at?: string | null
          enveloppe?: Json | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          status?: string
          structure_bati?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_sites_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_tasks: {
        Row: {
          assigned_to: string | null
          audit_id: string
          completed_at: string | null
          created_at: string | null
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          priority: string
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          audit_id: string
          completed_at?: string | null
          created_at?: string | null
          created_by: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          audit_id?: string
          completed_at?: string | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_tasks_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_zones: {
        Row: {
          audit_id: string
          created_at: string | null
          description: string | null
          id: string
          name: string
          order_index: number | null
          site_id: string
          updated_at: string | null
        }
        Insert: {
          audit_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          order_index?: number | null
          site_id: string
          updated_at?: string | null
        }
        Update: {
          audit_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          order_index?: number | null
          site_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_zones_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_zones_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "audit_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      audits: {
        Row: {
          client_type: string | null
          color: string | null
          completion_percentage: number | null
          created_at: string | null
          created_by: string
          end_date: string | null
          general_info: Json | null
          id: string
          inventory_notes: string | null
          name: string
          organization_id: string
          personnel: Json | null
          project_context: Json | null
          project_context_at: string | null
          responsable: string | null
          start_date: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          client_type?: string | null
          color?: string | null
          completion_percentage?: number | null
          created_at?: string | null
          created_by: string
          end_date?: string | null
          general_info?: Json | null
          id?: string
          inventory_notes?: string | null
          name: string
          organization_id: string
          personnel?: Json | null
          project_context?: Json | null
          project_context_at?: string | null
          responsable?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          client_type?: string | null
          color?: string | null
          completion_percentage?: number | null
          created_at?: string | null
          created_by?: string
          end_date?: string | null
          general_info?: Json | null
          id?: string
          inventory_notes?: string | null
          name?: string
          organization_id?: string
          personnel?: Json | null
          project_context?: Json | null
          project_context_at?: string | null
          responsable?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_events: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
        }
        Relationships: []
      }
      billing_quarantine_manual: {
        Row: {
          audit_id: string | null
          created_at: string | null
          delta_fcfa: number
          delta_pct: number
          id: string
          is_resolved: boolean | null
          label: string
          montant_calcule: number
          montant_senelec: number
          organization_id: string
          quarantine_action_plan: string | null
          quarantine_comment: string | null
          quarantine_reason: string | null
          quarantined_at: string | null
          quarantined_by: string | null
          resolution_note: string | null
          resolved_at: string | null
          sim_input: Json | null
        }
        Insert: {
          audit_id?: string | null
          created_at?: string | null
          delta_fcfa: number
          delta_pct: number
          id?: string
          is_resolved?: boolean | null
          label: string
          montant_calcule: number
          montant_senelec: number
          organization_id: string
          quarantine_action_plan?: string | null
          quarantine_comment?: string | null
          quarantine_reason?: string | null
          quarantined_at?: string | null
          quarantined_by?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          sim_input?: Json | null
        }
        Update: {
          audit_id?: string | null
          created_at?: string | null
          delta_fcfa?: number
          delta_pct?: number
          id?: string
          is_resolved?: boolean | null
          label?: string
          montant_calcule?: number
          montant_senelec?: number
          organization_id?: string
          quarantine_action_plan?: string | null
          quarantine_comment?: string | null
          quarantine_reason?: string | null
          quarantined_at?: string | null
          quarantined_by?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          sim_input?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_quarantine_manual_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_quarantine_manual_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      building_type_params: {
        Row: {
          audit_id: string
          building_id: string
          correction_ferie: number
          correction_fraicheur: number
          correction_ouvres: number
          correction_weekend: number
          created_at: string
          id: string
          jours_feries: number
          jours_fraicheur: number
          jours_non_travailles: number
          tps_clim: number
          tps_ecl: number
          tps_electrom: number
          tps_inform: number
          tps_serveur: number
          type_fonctionnel: string
          updated_at: string
        }
        Insert: {
          audit_id: string
          building_id: string
          correction_ferie?: number
          correction_fraicheur?: number
          correction_ouvres?: number
          correction_weekend?: number
          created_at?: string
          id?: string
          jours_feries?: number
          jours_fraicheur?: number
          jours_non_travailles?: number
          tps_clim?: number
          tps_ecl?: number
          tps_electrom?: number
          tps_inform?: number
          tps_serveur?: number
          type_fonctionnel: string
          updated_at?: string
        }
        Update: {
          audit_id?: string
          building_id?: string
          correction_ferie?: number
          correction_fraicheur?: number
          correction_ouvres?: number
          correction_weekend?: number
          created_at?: string
          id?: string
          jours_feries?: number
          jours_fraicheur?: number
          jours_non_travailles?: number
          tps_clim?: number
          tps_ecl?: number
          tps_electrom?: number
          tps_inform?: number
          tps_serveur?: number
          type_fonctionnel?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "building_type_params_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "audit_buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      coupure_causes: {
        Row: {
          actif: boolean
          code: string
          libelle: string
          ordre: number
          origine: string
        }
        Insert: {
          actif?: boolean
          code: string
          libelle: string
          ordre?: number
          origine: string
        }
        Update: {
          actif?: boolean
          code?: string
          libelle?: string
          ordre?: number
          origine?: string
        }
        Relationships: []
      }
      coupures: {
        Row: {
          cause_aggravante: string | null
          cause_declencheur: string
          cause_indice: string | null
          commentaire: string | null
          confirme_at: string | null
          confirme_par: string | null
          debut_at: string
          detecte_at: string
          duree_min: number | null
          end_kwh: number | null
          fin_at: string
          id: string
          methode: string
          site: string
          statut_cause: string
          updated_at: string
        }
        Insert: {
          cause_aggravante?: string | null
          cause_declencheur?: string
          cause_indice?: string | null
          commentaire?: string | null
          confirme_at?: string | null
          confirme_par?: string | null
          debut_at: string
          detecte_at?: string
          duree_min?: number | null
          end_kwh?: number | null
          fin_at: string
          id?: string
          methode?: string
          site: string
          statut_cause?: string
          updated_at?: string
        }
        Update: {
          cause_aggravante?: string | null
          cause_declencheur?: string
          cause_indice?: string | null
          commentaire?: string | null
          confirme_at?: string | null
          confirme_par?: string | null
          debut_at?: string
          detecte_at?: string
          duree_min?: number | null
          end_kwh?: number | null
          fin_at?: string
          id?: string
          methode?: string
          site?: string
          statut_cause?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupures_cause_aggravante_fkey"
            columns: ["cause_aggravante"]
            isOneToOne: false
            referencedRelation: "coupure_causes"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "coupures_cause_declencheur_fkey"
            columns: ["cause_declencheur"]
            isOneToOne: false
            referencedRelation: "coupure_causes"
            referencedColumns: ["code"]
          },
        ]
      }
      custom_sensors: {
        Row: {
          columns_signature: string | null
          created_at: string
          extra_cols: Json
          id: string
          keep_negative: boolean
          metric_label: string
          name: string
          organization_id: string
          quantity_kind: string
          time_col: string | null
          timestamp_col: string
          timestamp_format: string | null
          unit: string
          value_col: string
        }
        Insert: {
          columns_signature?: string | null
          created_at?: string
          extra_cols?: Json
          id?: string
          keep_negative?: boolean
          metric_label: string
          name: string
          organization_id: string
          quantity_kind?: string
          time_col?: string | null
          timestamp_col: string
          timestamp_format?: string | null
          unit: string
          value_col: string
        }
        Update: {
          columns_signature?: string | null
          created_at?: string
          extra_cols?: Json
          id?: string
          keep_negative?: boolean
          metric_label?: string
          name?: string
          organization_id?: string
          quantity_kind?: string
          time_col?: string | null
          timestamp_col?: string
          timestamp_format?: string | null
          unit?: string
          value_col?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_sensors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_categories: {
        Row: {
          color: string | null
          created_at: string | null
          icon: string | null
          id: string
          name: string
          organization_id: string | null
          parent_id: string | null
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          name: string
          organization_id?: string | null
          parent_id?: string | null
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          name?: string
          organization_id?: string | null
          parent_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "equipment_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      factures_senelec: {
        Row: {
          agence: string | null
          ai_cg: number | null
          anc_cote: number | null
          ancien_index_h1: number | null
          ancien_index_k1: number | null
          ancien_index_k2: number | null
          ancien_index_reactif: number | null
          annee_facturation: number | null
          appartenance: string | null
          arrondissement: string | null
          audit_id: string | null
          categorie_tarifaire: string | null
          ccg: string | null
          classeur_building_id: string | null
          classeur_site_id: string | null
          classeur_zone_id: string | null
          cons_k1: number | null
          cons_k2: number | null
          cons_t: number | null
          cons_wr: number | null
          consommation_facturee: number | null
          created_at: string
          date_comptable_facture: string | null
          date_debut_periode: string | null
          date_fin_periode: string | null
          heure_h1: number | null
          heure_h2: number | null
          id: string
          is_quarantined: boolean | null
          localite: string | null
          majo_reactif: number | null
          majoration_k1: number | null
          majoration_k2: number | null
          mois_facturation: string | null
          montant_cosinus_phi: number | null
          montant_energie_k1: number | null
          montant_energie_k2: number | null
          montant_facture_ttc: number | null
          montant_hors_tva: number | null
          montant_prime_fixe: number | null
          montant_redevance: number | null
          montant_tco: number | null
          montant_total_energie: number | null
          montant_tva: number | null
          nb_jour_facturation: number | null
          ni_cg: number | null
          nouvel_index_h1: number | null
          nouvel_index_k1: number | null
          nouvel_index_k2: number | null
          nouvel_index_reactif: number | null
          numero_compte_contrat: string
          numero_compteur: string | null
          numero_facture: number
          organization_id: string
          partenaire: string | null
          penalites_depassement: number | null
          puissance_max_kw: number | null
          puissance_max_relevee: number | null
          puissance_souscrite: number | null
          puissance_souscrite_kw: number | null
          puissance_transfo: number | null
          quarantine_action_plan: string | null
          quarantine_comment: string | null
          quarantine_delta_pct: number | null
          quarantine_reason: string | null
          quarantine_sim_result: Json | null
          quarantine_ttc_calcule: number | null
          quarantined_at: string | null
          quarantined_by: string | null
          rappel_et_majoration: number | null
          rappel_k1: number | null
          rappel_k2: number | null
          rue: string | null
          type_client_texte: string | null
          type_compte_contrat: string | null
          type_tarif_numero: string | null
          type_tarif_texte: string | null
          unite_releve: string | null
          valeur_cosinus_phi: number | null
        }
        Insert: {
          agence?: string | null
          ai_cg?: number | null
          anc_cote?: number | null
          ancien_index_h1?: number | null
          ancien_index_k1?: number | null
          ancien_index_k2?: number | null
          ancien_index_reactif?: number | null
          annee_facturation?: number | null
          appartenance?: string | null
          arrondissement?: string | null
          audit_id?: string | null
          categorie_tarifaire?: string | null
          ccg?: string | null
          classeur_building_id?: string | null
          classeur_site_id?: string | null
          classeur_zone_id?: string | null
          cons_k1?: number | null
          cons_k2?: number | null
          cons_t?: number | null
          cons_wr?: number | null
          consommation_facturee?: number | null
          created_at?: string
          date_comptable_facture?: string | null
          date_debut_periode?: string | null
          date_fin_periode?: string | null
          heure_h1?: number | null
          heure_h2?: number | null
          id?: string
          is_quarantined?: boolean | null
          localite?: string | null
          majo_reactif?: number | null
          majoration_k1?: number | null
          majoration_k2?: number | null
          mois_facturation?: string | null
          montant_cosinus_phi?: number | null
          montant_energie_k1?: number | null
          montant_energie_k2?: number | null
          montant_facture_ttc?: number | null
          montant_hors_tva?: number | null
          montant_prime_fixe?: number | null
          montant_redevance?: number | null
          montant_tco?: number | null
          montant_total_energie?: number | null
          montant_tva?: number | null
          nb_jour_facturation?: number | null
          ni_cg?: number | null
          nouvel_index_h1?: number | null
          nouvel_index_k1?: number | null
          nouvel_index_k2?: number | null
          nouvel_index_reactif?: number | null
          numero_compte_contrat: string
          numero_compteur?: string | null
          numero_facture: number
          organization_id: string
          partenaire?: string | null
          penalites_depassement?: number | null
          puissance_max_kw?: number | null
          puissance_max_relevee?: number | null
          puissance_souscrite?: number | null
          puissance_souscrite_kw?: number | null
          puissance_transfo?: number | null
          quarantine_action_plan?: string | null
          quarantine_comment?: string | null
          quarantine_delta_pct?: number | null
          quarantine_reason?: string | null
          quarantine_sim_result?: Json | null
          quarantine_ttc_calcule?: number | null
          quarantined_at?: string | null
          quarantined_by?: string | null
          rappel_et_majoration?: number | null
          rappel_k1?: number | null
          rappel_k2?: number | null
          rue?: string | null
          type_client_texte?: string | null
          type_compte_contrat?: string | null
          type_tarif_numero?: string | null
          type_tarif_texte?: string | null
          unite_releve?: string | null
          valeur_cosinus_phi?: number | null
        }
        Update: {
          agence?: string | null
          ai_cg?: number | null
          anc_cote?: number | null
          ancien_index_h1?: number | null
          ancien_index_k1?: number | null
          ancien_index_k2?: number | null
          ancien_index_reactif?: number | null
          annee_facturation?: number | null
          appartenance?: string | null
          arrondissement?: string | null
          audit_id?: string | null
          categorie_tarifaire?: string | null
          ccg?: string | null
          classeur_building_id?: string | null
          classeur_site_id?: string | null
          classeur_zone_id?: string | null
          cons_k1?: number | null
          cons_k2?: number | null
          cons_t?: number | null
          cons_wr?: number | null
          consommation_facturee?: number | null
          created_at?: string
          date_comptable_facture?: string | null
          date_debut_periode?: string | null
          date_fin_periode?: string | null
          heure_h1?: number | null
          heure_h2?: number | null
          id?: string
          is_quarantined?: boolean | null
          localite?: string | null
          majo_reactif?: number | null
          majoration_k1?: number | null
          majoration_k2?: number | null
          mois_facturation?: string | null
          montant_cosinus_phi?: number | null
          montant_energie_k1?: number | null
          montant_energie_k2?: number | null
          montant_facture_ttc?: number | null
          montant_hors_tva?: number | null
          montant_prime_fixe?: number | null
          montant_redevance?: number | null
          montant_tco?: number | null
          montant_total_energie?: number | null
          montant_tva?: number | null
          nb_jour_facturation?: number | null
          ni_cg?: number | null
          nouvel_index_h1?: number | null
          nouvel_index_k1?: number | null
          nouvel_index_k2?: number | null
          nouvel_index_reactif?: number | null
          numero_compte_contrat?: string
          numero_compteur?: string | null
          numero_facture?: number
          organization_id?: string
          partenaire?: string | null
          penalites_depassement?: number | null
          puissance_max_kw?: number | null
          puissance_max_relevee?: number | null
          puissance_souscrite?: number | null
          puissance_souscrite_kw?: number | null
          puissance_transfo?: number | null
          quarantine_action_plan?: string | null
          quarantine_comment?: string | null
          quarantine_delta_pct?: number | null
          quarantine_reason?: string | null
          quarantine_sim_result?: Json | null
          quarantine_ttc_calcule?: number | null
          quarantined_at?: string | null
          quarantined_by?: string | null
          rappel_et_majoration?: number | null
          rappel_k1?: number | null
          rappel_k2?: number | null
          rue?: string | null
          type_client_texte?: string | null
          type_compte_contrat?: string | null
          type_tarif_numero?: string | null
          type_tarif_texte?: string | null
          unite_releve?: string | null
          valeur_cosinus_phi?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "factures_senelec_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factures_senelec_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      iot_editeurs_regles: {
        Row: {
          ajoute_le: string
          note: string | null
          user_id: string
        }
        Insert: {
          ajoute_le?: string
          note?: string | null
          user_id: string
        }
        Update: {
          ajoute_le?: string
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      iot_files: {
        Row: {
          columns: Json
          content_encoding: string
          created_at: string
          created_by: string
          device_location: string | null
          device_room: string | null
          id: string
          lecture: Json | null
          name: string
          organization_id: string | null
          parent_id: string | null
          preview: Json
          row_count: number
          statut: string
          storage_path: string | null
          taille: number | null
          type: string
          updated_at: string
          uploaded_at: string
        }
        Insert: {
          columns?: Json
          content_encoding?: string
          created_at?: string
          created_by: string
          device_location?: string | null
          device_room?: string | null
          id: string
          lecture?: Json | null
          name: string
          organization_id?: string | null
          parent_id?: string | null
          preview?: Json
          row_count?: number
          statut?: string
          storage_path?: string | null
          taille?: number | null
          type: string
          updated_at?: string
          uploaded_at?: string
        }
        Update: {
          columns?: Json
          content_encoding?: string
          created_at?: string
          created_by?: string
          device_location?: string | null
          device_room?: string | null
          id?: string
          lecture?: Json | null
          name?: string
          organization_id?: string | null
          parent_id?: string | null
          preview?: Json
          row_count?: number
          statut?: string
          storage_path?: string | null
          taille?: number | null
          type?: string
          updated_at?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iot_files_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iot_files_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "iot_files"
            referencedColumns: ["id"]
          },
        ]
      }
      join_requests: {
        Row: {
          created_at: string | null
          id: string
          message: string | null
          organization_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message?: string | null
          organization_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string | null
          organization_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "join_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      measurement_files: {
        Row: {
          alias: string | null
          content_encoding: string
          created_at: string
          created_by: string
          file_name: string
          id: string
          measurement_count: number
          metric_label: string | null
          organization_id: string | null
          period_end: string | null
          period_start: string | null
          quantity_kind: string | null
          sensor_label: string | null
          sensor_type: string
          storage_path: string | null
          unit: string | null
          updated_at: string
          uploaded_at: string
        }
        Insert: {
          alias?: string | null
          content_encoding?: string
          created_at?: string
          created_by: string
          file_name: string
          id: string
          measurement_count?: number
          metric_label?: string | null
          organization_id?: string | null
          period_end?: string | null
          period_start?: string | null
          quantity_kind?: string | null
          sensor_label?: string | null
          sensor_type: string
          storage_path?: string | null
          unit?: string | null
          updated_at?: string
          uploaded_at?: string
        }
        Update: {
          alias?: string | null
          content_encoding?: string
          created_at?: string
          created_by?: string
          file_name?: string
          id?: string
          measurement_count?: number
          metric_label?: string | null
          organization_id?: string | null
          period_end?: string | null
          period_start?: string | null
          quantity_kind?: string | null
          sensor_label?: string | null
          sensor_type?: string
          storage_path?: string | null
          unit?: string | null
          updated_at?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "measurement_files_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_calendar_events: {
        Row: {
          all_day: boolean | null
          color: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          end_date: string | null
          event_date: string
          id: string
          organization_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          all_day?: boolean | null
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          event_date: string
          id?: string
          organization_id: string
          title: string
          updated_at?: string | null
        }
        Update: {
          all_day?: boolean | null
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          event_date?: string
          id?: string
          organization_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_calendar_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by_user_id: string | null
          code: string
          created_at: string | null
          expires_at: string | null
          id: string
          invited_email: string | null
          inviter_id: string
          organization_id: string
          status: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          code: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          invited_email?: string | null
          inviter_id: string
          organization_id: string
          status?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          code?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          invited_email?: string | null
          inviter_id?: string
          organization_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_users: {
        Row: {
          created_at: string | null
          id: string
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          organization_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string | null
          created_by: string
          description: string | null
          id: string
          name: string
          settings: Json
          slug: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          description?: string | null
          id?: string
          name: string
          settings?: Json
          slug?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          settings?: Json
          slug?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      qualite_regles: {
        Row: {
          actif: boolean
          action: string
          code: string
          explication: string
          familles: string[] | null
          libelle: string
          modifie_le: string
          modifie_par: string | null
          ordre: number
          parametres: Json
          roles: string[] | null
          sites: string[] | null
        }
        Insert: {
          actif?: boolean
          action: string
          code: string
          explication: string
          familles?: string[] | null
          libelle: string
          modifie_le?: string
          modifie_par?: string | null
          ordre?: number
          parametres?: Json
          roles?: string[] | null
          sites?: string[] | null
        }
        Update: {
          actif?: boolean
          action?: string
          code?: string
          explication?: string
          familles?: string[] | null
          libelle?: string
          modifie_le?: string
          modifie_par?: string | null
          ordre?: number
          parametres?: Json
          roles?: string[] | null
          sites?: string[] | null
        }
        Relationships: []
      }
      qualite_regles_historique: {
        Row: {
          apres: Json | null
          avant: Json | null
          code: string
          id: number
          le: string
          operation: string
          par: string | null
        }
        Insert: {
          apres?: Json | null
          avant?: Json | null
          code: string
          id?: number
          le?: string
          operation: string
          par?: string | null
        }
        Update: {
          apres?: Json | null
          avant?: Json | null
          code?: string
          id?: number
          le?: string
          operation?: string
          par?: string | null
        }
        Relationships: []
      }
      shelly_accounts: {
        Row: {
          actif: boolean | null
          auth_key: string
          auth_key_last6: string | null
          created_at: string | null
          id: string
          label: string | null
          last_error_msg: string | null
          last_poll_at: string | null
          last_poll_status: string | null
          server_url: string
          site: string
          updated_at: string | null
        }
        Insert: {
          actif?: boolean | null
          auth_key: string
          auth_key_last6?: string | null
          created_at?: string | null
          id?: string
          label?: string | null
          last_error_msg?: string | null
          last_poll_at?: string | null
          last_poll_status?: string | null
          server_url: string
          site: string
          updated_at?: string | null
        }
        Update: {
          actif?: boolean | null
          auth_key?: string
          auth_key_last6?: string | null
          created_at?: string | null
          id?: string
          label?: string | null
          last_error_msg?: string | null
          last_poll_at?: string | null
          last_poll_status?: string | null
          server_url?: string
          site?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      shelly_alert_state: {
        Row: {
          first_seen: string
          last_sent: string | null
          site: string
        }
        Insert: {
          first_seen?: string
          last_sent?: string | null
          site: string
        }
        Update: {
          first_seen?: string
          last_sent?: string | null
          site?: string
        }
        Relationships: []
      }
      shelly_cl: {
        Row: {
          battery_level: number | null
          battery_low: boolean | null
          battery_pct: number | null
          battery_voltage_v: number | null
          brightness: number | null
          concentration_ppm: number | null
          current_a: number | null
          device_family: string | null
          device_id: string
          device_temp_c: number | null
          device_type: string | null
          dewpoint_c: number | null
          feels_like_c: number | null
          firmware_version: string | null
          frequency_hz: number | null
          humidity: number | null
          i_a: number | null
          i_b: number | null
          i_c: number | null
          id: number
          illuminance_lux: number | null
          illumination: string | null
          last_event_at: string | null
          measured_at: string | null
          moisture_alarm: boolean | null
          name: string
          online: boolean | null
          p_a: number | null
          p_b: number | null
          p_c: number | null
          pluie_mm: number | null
          power_w: number | null
          precipitation_mm: number | null
          pressure_hpa: number | null
          pressure_slope: string | null
          room: string | null
          signal_rssi: number | null
          site: string
          state: string | null
          temperature: number | null
          tilt_angle: number | null
          ts: string
          uv_index: number | null
          v_a: number | null
          v_b: number | null
          v_c: number | null
          vibration: boolean | null
          voltage_v: number | null
          wh_a: number | null
          wh_b: number | null
          wh_c: number | null
          wh_ra: number | null
          wh_rb: number | null
          wh_rc: number | null
          wh_rtot: number | null
          wh_tot: number | null
          wind_direction_deg: number | null
          wind_gust_ms: number | null
          wind_speed_ms: number | null
        }
        Insert: {
          battery_level?: number | null
          battery_low?: boolean | null
          battery_pct?: number | null
          battery_voltage_v?: number | null
          brightness?: number | null
          concentration_ppm?: number | null
          current_a?: number | null
          device_family?: string | null
          device_id: string
          device_temp_c?: number | null
          device_type?: string | null
          dewpoint_c?: number | null
          feels_like_c?: number | null
          firmware_version?: string | null
          frequency_hz?: number | null
          humidity?: number | null
          i_a?: number | null
          i_b?: number | null
          i_c?: number | null
          id?: never
          illuminance_lux?: number | null
          illumination?: string | null
          last_event_at?: string | null
          measured_at?: string | null
          moisture_alarm?: boolean | null
          name: string
          online?: boolean | null
          p_a?: number | null
          p_b?: number | null
          p_c?: number | null
          pluie_mm?: number | null
          power_w?: number | null
          precipitation_mm?: number | null
          pressure_hpa?: number | null
          pressure_slope?: string | null
          room?: string | null
          signal_rssi?: number | null
          site: string
          state?: string | null
          temperature?: number | null
          tilt_angle?: number | null
          ts?: string
          uv_index?: number | null
          v_a?: number | null
          v_b?: number | null
          v_c?: number | null
          vibration?: boolean | null
          voltage_v?: number | null
          wh_a?: number | null
          wh_b?: number | null
          wh_c?: number | null
          wh_ra?: number | null
          wh_rb?: number | null
          wh_rc?: number | null
          wh_rtot?: number | null
          wh_tot?: number | null
          wind_direction_deg?: number | null
          wind_gust_ms?: number | null
          wind_speed_ms?: number | null
        }
        Update: {
          battery_level?: number | null
          battery_low?: boolean | null
          battery_pct?: number | null
          battery_voltage_v?: number | null
          brightness?: number | null
          concentration_ppm?: number | null
          current_a?: number | null
          device_family?: string | null
          device_id?: string
          device_temp_c?: number | null
          device_type?: string | null
          dewpoint_c?: number | null
          feels_like_c?: number | null
          firmware_version?: string | null
          frequency_hz?: number | null
          humidity?: number | null
          i_a?: number | null
          i_b?: number | null
          i_c?: number | null
          id?: never
          illuminance_lux?: number | null
          illumination?: string | null
          last_event_at?: string | null
          measured_at?: string | null
          moisture_alarm?: boolean | null
          name?: string
          online?: boolean | null
          p_a?: number | null
          p_b?: number | null
          p_c?: number | null
          pluie_mm?: number | null
          power_w?: number | null
          precipitation_mm?: number | null
          pressure_hpa?: number | null
          pressure_slope?: string | null
          room?: string | null
          signal_rssi?: number | null
          site?: string
          state?: string | null
          temperature?: number | null
          tilt_angle?: number | null
          ts?: string
          uv_index?: number | null
          v_a?: number | null
          v_b?: number | null
          v_c?: number | null
          vibration?: boolean | null
          voltage_v?: number | null
          wh_a?: number | null
          wh_b?: number | null
          wh_c?: number | null
          wh_ra?: number | null
          wh_rb?: number | null
          wh_rc?: number | null
          wh_rtot?: number | null
          wh_tot?: number | null
          wind_direction_deg?: number | null
          wind_gust_ms?: number | null
          wind_speed_ms?: number | null
        }
        Relationships: []
      }
      shelly_cl_horaire: {
        Row: {
          battery_level_min: number | null
          battery_voltage_v_moy: number | null
          concentration_ppm_moy: number | null
          device_family: string | null
          device_id: string
          device_temp_c_moy: number | null
          device_type: string | null
          dewpoint_c_moy: number | null
          feels_like_c_moy: number | null
          humidity_moy: number | null
          id: number
          illuminance_lux_max: number | null
          illuminance_lux_moy: number | null
          moisture_alarm: boolean | null
          name: string | null
          nb_mesures: number | null
          nb_mesures_env: number | null
          nb_mesures_reelles: number | null
          p_a_moy: number | null
          p_b_moy: number | null
          p_c_moy: number | null
          pluie_mm: number | null
          power_w_max: number | null
          power_w_moy: number | null
          precipitation_mm: number | null
          pressure_hpa_moy: number | null
          pressure_slope_dernier: string | null
          signal_rssi_moy: number | null
          site: string | null
          state_dernier: string | null
          temperature_max: number | null
          temperature_min: number | null
          temperature_moy: number | null
          tilt_angle_moy: number | null
          ts_heure: string
          uv_index_max: number | null
          uv_index_moy: number | null
          v_a_moy: number | null
          v_b_moy: number | null
          v_c_moy: number | null
          voltage_v_moy: number | null
          wh_conso: number | null
          wh_inj: number | null
          wind_direction_deg_moy: number | null
          wind_gust_ms_max: number | null
          wind_speed_ms_moy: number | null
        }
        Insert: {
          battery_level_min?: number | null
          battery_voltage_v_moy?: number | null
          concentration_ppm_moy?: number | null
          device_family?: string | null
          device_id: string
          device_temp_c_moy?: number | null
          device_type?: string | null
          dewpoint_c_moy?: number | null
          feels_like_c_moy?: number | null
          humidity_moy?: number | null
          id?: number
          illuminance_lux_max?: number | null
          illuminance_lux_moy?: number | null
          moisture_alarm?: boolean | null
          name?: string | null
          nb_mesures?: number | null
          nb_mesures_env?: number | null
          nb_mesures_reelles?: number | null
          p_a_moy?: number | null
          p_b_moy?: number | null
          p_c_moy?: number | null
          pluie_mm?: number | null
          power_w_max?: number | null
          power_w_moy?: number | null
          precipitation_mm?: number | null
          pressure_hpa_moy?: number | null
          pressure_slope_dernier?: string | null
          signal_rssi_moy?: number | null
          site?: string | null
          state_dernier?: string | null
          temperature_max?: number | null
          temperature_min?: number | null
          temperature_moy?: number | null
          tilt_angle_moy?: number | null
          ts_heure: string
          uv_index_max?: number | null
          uv_index_moy?: number | null
          v_a_moy?: number | null
          v_b_moy?: number | null
          v_c_moy?: number | null
          voltage_v_moy?: number | null
          wh_conso?: number | null
          wh_inj?: number | null
          wind_direction_deg_moy?: number | null
          wind_gust_ms_max?: number | null
          wind_speed_ms_moy?: number | null
        }
        Update: {
          battery_level_min?: number | null
          battery_voltage_v_moy?: number | null
          concentration_ppm_moy?: number | null
          device_family?: string | null
          device_id?: string
          device_temp_c_moy?: number | null
          device_type?: string | null
          dewpoint_c_moy?: number | null
          feels_like_c_moy?: number | null
          humidity_moy?: number | null
          id?: number
          illuminance_lux_max?: number | null
          illuminance_lux_moy?: number | null
          moisture_alarm?: boolean | null
          name?: string | null
          nb_mesures?: number | null
          nb_mesures_env?: number | null
          nb_mesures_reelles?: number | null
          p_a_moy?: number | null
          p_b_moy?: number | null
          p_c_moy?: number | null
          pluie_mm?: number | null
          power_w_max?: number | null
          power_w_moy?: number | null
          precipitation_mm?: number | null
          pressure_hpa_moy?: number | null
          pressure_slope_dernier?: string | null
          signal_rssi_moy?: number | null
          site?: string | null
          state_dernier?: string | null
          temperature_max?: number | null
          temperature_min?: number | null
          temperature_moy?: number | null
          tilt_angle_moy?: number | null
          ts_heure?: string
          uv_index_max?: number | null
          uv_index_moy?: number | null
          v_a_moy?: number | null
          v_b_moy?: number | null
          v_c_moy?: number | null
          voltage_v_moy?: number | null
          wh_conso?: number | null
          wh_inj?: number | null
          wind_direction_deg_moy?: number | null
          wind_gust_ms_max?: number | null
          wind_speed_ms_moy?: number | null
        }
        Relationships: []
      }
      shelly_device_channels: {
        Row: {
          channel_name: string
          channel_number: number
          created_at: string | null
          id: string
          parent_device_id: string
          site: string
          updated_at: string | null
        }
        Insert: {
          channel_name: string
          channel_number: number
          created_at?: string | null
          id?: string
          parent_device_id: string
          site: string
          updated_at?: string | null
        }
        Update: {
          channel_name?: string
          channel_number?: number
          created_at?: string | null
          id?: string
          parent_device_id?: string
          site?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      shelly_device_periodes: {
        Row: {
          au: string | null
          created_at: string
          device_id: string
          du: string
          id: string
          libelle: string
          notes: string | null
          site: string
          statut: string
          updated_at: string
        }
        Insert: {
          au?: string | null
          created_at?: string
          device_id: string
          du: string
          id?: string
          libelle: string
          notes?: string | null
          site: string
          statut?: string
          updated_at?: string
        }
        Update: {
          au?: string | null
          created_at?: string
          device_id?: string
          du?: string
          id?: string
          libelle?: string
          notes?: string | null
          site?: string
          statut?: string
          updated_at?: string
        }
        Relationships: []
      }
      shelly_device_retraits: {
        Row: {
          cree_le: string
          cree_par: string | null
          depuis: string
          device_id: string
          id: string
          jusqu_a: string | null
          motif: string
          note: string | null
        }
        Insert: {
          cree_le?: string
          cree_par?: string | null
          depuis: string
          device_id: string
          id?: string
          jusqu_a?: string | null
          motif: string
          note?: string | null
        }
        Update: {
          cree_le?: string
          cree_par?: string | null
          depuis?: string
          device_id?: string
          id?: string
          jusqu_a?: string | null
          motif?: string
          note?: string | null
        }
        Relationships: []
      }
      shelly_device_roles: {
        Row: {
          confirme_at: string | null
          confirme_par: string | null
          created_at: string
          device_id: string
          libelle: string | null
          notes: string | null
          origine: string
          role: string
          sens_inverse: boolean
          updated_at: string
        }
        Insert: {
          confirme_at?: string | null
          confirme_par?: string | null
          created_at?: string
          device_id: string
          libelle?: string | null
          notes?: string | null
          origine?: string
          role: string
          sens_inverse?: boolean
          updated_at?: string
        }
        Update: {
          confirme_at?: string | null
          confirme_par?: string | null
          created_at?: string
          device_id?: string
          libelle?: string | null
          notes?: string | null
          origine?: string
          role?: string
          sens_inverse?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      shelly_device_types: {
        Row: {
          alimentation: string
          created_at: string | null
          device_family: string
          device_type: string
          id: string
          label: string | null
          match_prefix: boolean | null
          updated_at: string | null
        }
        Insert: {
          alimentation?: string
          created_at?: string | null
          device_family: string
          device_type: string
          id?: string
          label?: string | null
          match_prefix?: boolean | null
          updated_at?: string | null
        }
        Update: {
          alimentation?: string
          created_at?: string | null
          device_family?: string
          device_type?: string
          id?: string
          label?: string | null
          match_prefix?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shelly_device_types_famille_fk"
            columns: ["device_family"]
            isOneToOne: false
            referencedRelation: "shelly_familles"
            referencedColumns: ["code"]
          },
        ]
      }
      shelly_familles: {
        Row: {
          code: string
          emission_continue: boolean
          libelle: string
          mesure_energie: boolean
          mesure_env: boolean
          nb_phases: number | null
          ordre: number
          updated_at: string
        }
        Insert: {
          code: string
          emission_continue: boolean
          libelle: string
          mesure_energie: boolean
          mesure_env: boolean
          nb_phases?: number | null
          ordre?: number
          updated_at?: string
        }
        Update: {
          code?: string
          emission_continue?: boolean
          libelle?: string
          mesure_energie?: boolean
          mesure_env?: boolean
          nb_phases?: number | null
          ordre?: number
          updated_at?: string
        }
        Relationships: []
      }
      site_absences: {
        Row: {
          created_at: string
          created_by: string | null
          end_at: string | null
          id: string
          note: string | null
          site: string
          start_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_at?: string | null
          id?: string
          note?: string | null
          site: string
          start_at: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_at?: string | null
          id?: string
          note?: string | null
          site?: string
          start_at?: string
        }
        Relationships: []
      }
      site_bilan: {
        Row: {
          explication: string
          methode: string
          modifie_le: string
          modifie_par: string | null
          site: string
        }
        Insert: {
          explication: string
          methode: string
          modifie_le?: string
          modifie_par?: string | null
          site: string
        }
        Update: {
          explication?: string
          methode?: string
          modifie_le?: string
          modifie_par?: string | null
          site?: string
        }
        Relationships: []
      }
    }
    Views: {
      coupures_par_cause: {
        Row: {
          cause: string | null
          duree_h: number | null
          end_kwh: number | null
          libelle: string | null
          nb_coupures: number | null
          origine: string | null
          site: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupures_cause_declencheur_fkey"
            columns: ["cause"]
            isOneToOne: false
            referencedRelation: "coupure_causes"
            referencedColumns: ["code"]
          },
        ]
      }
      shelly_cl_journalier: {
        Row: {
          batterie_min_pct: number | null
          device_family: string | null
          device_id: string | null
          device_type: string | null
          hum_max: number | null
          hum_min: number | null
          hum_moy: number | null
          jour: string | null
          lux_max: number | null
          lux_min: number | null
          name: string | null
          nb_lectures: number | null
          nb_offline: number | null
          pluie_max_mm: number | null
          pluie_mm: number | null
          power_max_w: number | null
          power_min_w: number | null
          power_moy_w: number | null
          pression_max: number | null
          pression_min: number | null
          rafale_max_ms: number | null
          ressenti_max: number | null
          ressenti_min: number | null
          room: string | null
          rosee_max: number | null
          rosee_min: number | null
          signal_max_dbm: number | null
          signal_min_dbm: number | null
          site: string | null
          temp_max: number | null
          temp_min: number | null
          temp_moy: number | null
          uv_max: number | null
          uv_min: number | null
          vent_max_ms: number | null
          vent_min_ms: number | null
          voltage_max_v: number | null
          voltage_min_v: number | null
        }
        Relationships: []
      }
      shelly_devices_catalog: {
        Row: {
          derniere_lecture: string | null
          device_family: string | null
          device_id: string | null
          device_type: string | null
          name: string | null
          room: string | null
          site: string | null
        }
        Relationships: []
      }
      shelly_pluie_horaire: {
        Row: {
          apres_silence_h: number | null
          cumul_mm: number | null
          device_id: string | null
          name: string | null
          pluie_mm: number | null
          remise_a_zero: boolean | null
          site: string | null
          ts_heure: string | null
        }
        Relationships: []
      }
      shelly_pluie_journaliere: {
        Row: {
          cumul_fin_jour_mm: number | null
          device_id: string | null
          jour: string | null
          name: string | null
          nb_heures_pluie: number | null
          pluie_mm: number | null
          remise_a_zero: boolean | null
          site: string | null
        }
        Relationships: []
      }
      v_factures_senelec_projet: {
        Row: {
          ancien_index_h1: number | null
          ancien_index_k1: number | null
          ancien_index_k2: number | null
          ancien_index_reactif: number | null
          annee_facturation: number | null
          audit_id: string | null
          batiment_id: string | null
          batiment_nom: string | null
          categorie_tarifaire: string | null
          cons_wr: number | null
          conso_facturee_kwh: number | null
          conso_k1_kwh: number | null
          conso_k2_kwh: number | null
          conso_t_kwh: number | null
          cos_phi: number | null
          created_at: string | null
          date_debut_periode: string | null
          date_fin_periode: string | null
          en_quarantaine: boolean | null
          heure_h1: number | null
          heure_h2: number | null
          id: string | null
          mois_facturation: string | null
          mois_periode: string | null
          montant_cosinus_phi: number | null
          montant_energie_k1: number | null
          montant_energie_k2: number | null
          montant_facture_ttc: number | null
          montant_hors_tva: number | null
          montant_prime_fixe: number | null
          montant_redevance: number | null
          montant_tco: number | null
          montant_total_energie: number | null
          montant_tva: number | null
          motif_quarantaine: string | null
          nb_jour_facturation: number | null
          nouvel_index_h1: number | null
          nouvel_index_k1: number | null
          nouvel_index_k2: number | null
          nouvel_index_reactif: number | null
          numero_compte_contrat: string | null
          numero_compteur: string | null
          numero_facture: number | null
          organization_id: string | null
          penalites_depassement: number | null
          projet_nom: string | null
          puissance_max_kw: number | null
          puissance_max_relevee: number | null
          puissance_souscrite_kw: number | null
          puissance_transfo: number | null
          rappel_et_majoration: number | null
          site_id: string | null
          site_nom: string | null
          type_client_texte: string | null
          type_tarif_texte: string | null
        }
        Relationships: [
          {
            foreignKeyName: "factures_senelec_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factures_senelec_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_invitation: { Args: { p_code: string }; Returns: string }
      aggregate_shelly_hourly: { Args: never; Returns: undefined }
      est_editeur_regles: { Args: never; Returns: boolean }
      fn_aggregate_horaire: {
        Args: { p_since?: string; p_until?: string }
        Returns: number
      }
      fn_aggregate_horaire_env: {
        Args: { p_since?: string; p_until?: string }
        Returns: number
      }
      fn_energy_by_day: {
        Args: {
          p_device_ids?: string[]
          p_families?: string[]
          p_since: string
          p_sites?: string[]
          p_until: string
        }
        Returns: {
          jour: string
          kwh: number
        }[]
      }
      fn_energy_by_device: {
        Args: {
          p_device_ids?: string[]
          p_families?: string[]
          p_since: string
          p_sites?: string[]
          p_until: string
        }
        Returns: {
          device_family: string
          device_id: string
          kwh: number
          name: string
          site: string
        }[]
      }
      fn_energy_profile: {
        Args: {
          p_bucket?: string
          p_device_ids: string[]
          p_inverses?: string[]
          p_since: string
          p_until: string
        }
        Returns: {
          bucket: string
          kwh: number
          kwh_inj: number
          nb_devices: number
          nb_mesures: number
          p_a: number
          p_b: number
          p_c: number
          p_max_w: number
          p_moy_w: number
          v_a: number
          v_b: number
          v_c: number
          v_mono: number
        }[]
      }
      fn_energy_repartition: {
        Args: {
          p_device_ids: string[]
          p_inverses?: string[]
          p_since: string
          p_until: string
        }
        Returns: {
          device_id: string
          kwh: number
          kwh_inj: number
          name: string
          nb_heures: number
          p_moy_w: number
          site: string
        }[]
      }
      fn_ligne_reelle: {
        Args: {
          p_battery_level: number
          p_battery_v: number
          p_current_a: number
          p_humidity: number
          p_illuminance: number
          p_measured_at: string
          p_p_a: number
          p_p_b: number
          p_p_c: number
          p_power_w: number
          p_ppm: number
          p_precipitation: number
          p_pressure: number
          p_state: string
          p_temperature: number
          p_tilt: number
          p_voltage_v: number
          p_wh_rtot: number
          p_wh_tot: number
          p_wind: number
        }
        Returns: boolean
      }
      fn_profil_charge: {
        Args: {
          p_date_debut: string
          p_date_fin: string
          p_device_ids?: string[]
          p_heure_debut?: number
          p_heure_fin?: number
          p_sites?: string[]
        }
        Returns: {
          device_family: string
          device_id: string
          jour: string
          name: string
          nb_h_exclues: number
          nb_heures: number
          nb_mesures: number
          regles_exclues: string[]
          role: string
          sens_inverse: boolean
          site: string
          wh_a: number
          wh_a_exclu: number
          wh_b: number
          wh_b_exclu: number
          wh_c: number
          wh_c_exclu: number
          wh_conso: number
          wh_conso_exclu: number
          wh_inj: number
          wh_inj_exclu: number
        }[]
      }
      fn_qualite: {
        Args: {
          p_date_debut: string
          p_date_fin: string
          p_device_ids?: string[]
          p_heure_debut?: number
          p_heure_fin?: number
          p_sites?: string[]
        }
        Returns: {
          action: string
          debut: string
          detail: Json
          device_id: string
          fin: string
          kwh: number
          nb_heures: number
          niveau: string
          nom: string
          regle: string
          site: string
          valeur: number
        }[]
      }
      fn_qualite_resume: {
        Args: {
          p_date_debut: string
          p_date_fin: string
          p_device_ids?: string[]
          p_heure_debut?: number
          p_heure_fin?: number
          p_sites?: string[]
        }
        Returns: {
          action: string
          device_id: string
          kwh: number
          libelle: string
          nb_heures: number
          nb_plages: number
          nom: string
          regle: string
          site: string
        }[]
      }
      fn_reprise_mesures_reelles: {
        Args: { p_since: string; p_until: string }
        Returns: number
      }
      get_invitation_by_code: {
        Args: { p_code: string }
        Returns: {
          expires_at: string
          id: string
          invited_email: string
          organization_id: string
          organization_name: string
          status: string
        }[]
      }
      is_org_creator: { Args: { p_org: string }; Returns: boolean }
      user_admin_org_ids: { Args: never; Returns: string[] }
      user_org_ids: { Args: never; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
