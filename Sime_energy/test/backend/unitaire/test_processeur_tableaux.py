"""UnifiedInvoiceProcessor : reconnaissance et aplatissement des tableaux de facture."""
from app.core.unified_invoice_processor import UnifiedInvoiceProcessor


def table(*lignes):
    return [[{"text": c} for c in ligne] for ligne in lignes]


TRANCHES = table(
    ["TRANCHES", "CONS (KWH)", "TARIF (FCFA/KWH)", "MONTANT (FCFA)"],
    ["1ère tranche", "150", "91,17", "13 676"],
    ["2ème tranche", "100", "136,49", "13 649"],
)


class TestNormalisation:
    def test_texte(self):
        p = UnifiedInvoiceProcessor()
        assert p.normalize_text("  Électricité : 12,5  kWh ") == "electricite 125 kwh"
        assert p.normalize_text("") == ""

    def test_nombres(self):
        p = UnifiedInvoiceProcessor()
        assert p._safe_to_number("1 234,5") == 1234.5
        assert p._safe_to_number("12\xa0000") == 12000.0
        assert p._safe_to_number(7) == 7.0
        assert p._safe_to_number("abc") is None
        assert p._safe_to_number(None) is None


class TestAplatissement:
    def test_cle_valeur(self):
        p = UnifiedInvoiceProcessor()
        r = p.flatten_key_value_table(table(["Puissance souscrite", "36 kW"], ["Vide", ""]))
        assert r == {"PUISSANCE_SOUSCRITE": "36 kW"}

    def test_cle_avec_deux_points(self):
        """Une clé OCR « N° Facture : » ne doit pas produire de « _ » final."""
        p = UnifiedInvoiceProcessor()
        assert p.flatten_key_value_table(table(["N° Facture :", "123"])) == {"N°_FACTURE": "123"}

    def test_tableau_de_tranches_reconnu(self):
        p = UnifiedInvoiceProcessor()
        signature, score = p.recognize_table(TRANCHES)
        assert signature is not None and signature.name == "Tarification par Tranches"
        assert score >= 0.5

    def test_tableau_de_tranches_aplati(self):
        r = UnifiedInvoiceProcessor().process_invoice_tables([{"rows": TRANCHES}])
        assert r["1_TRANCHE_CONSOMMATION_KWH"] == "150"
        assert r["2_TRANCHE_MONTANT_FCFA"] == "13 649"

    def test_tableau_vide_ignore(self):
        assert UnifiedInvoiceProcessor().process_invoice_tables([{"rows": []}]) == {}


class TestTotaux:
    def test_consommation_et_montant(self):
        t = UnifiedInvoiceProcessor().compute_totals({
            "CONSOMMATION_KWH": "1 200",
            "MONTANT_TTC": "150 000",
            "CLIENT": "MAIRIE",
        })
        assert t["total_consumption"] == 1200.0
        assert t["total_amount"] == 150000.0

    def test_aucune_valeur(self):
        t = UnifiedInvoiceProcessor().compute_totals({"CLIENT": "X"})
        assert t["total_consumption"] is None and t["total_amount"] is None


class TestSansTemplate:
    def test_repli_cle_valeur(self):
        r = UnifiedInvoiceProcessor().process_invoice_tables_with_templates(
            [{"rows": table(["Client", "Mairie"]), "table_name": "inconnu"}], {},
        )
        assert r["unified_data"] == {"CLIENT": "Mairie"}
        assert r["tables"][0]["rows"] == [{"COL_1": "Client", "COL_2": "Mairie"}]


class TestAutresTableaux:
    def test_tableau_de_puissance(self):
        r = UnifiedInvoiceProcessor().flatten_power_table(table(
            ["Puissance souscrite", "Puissance max relevée", "Cosinus phi"],
            ["36", "40", "0,87"],
        ))
        assert r == {"PUISSANCE_SOUSCRITE": "36", "PUISSANCE_MAX_RELEVÉE": "40", "COSINUS_PHI": "0,87"}

    def test_tarification_detaillee(self):
        r = UnifiedInvoiceProcessor().flatten_detailed_pricing_table(table(
            ["DESIGNATION", "QUANTITE", "TARIF", "MONTANT"],
            ["Energie K1", "20 000", "111,91", "2 238 200"],
        ))
        assert r["ENERGIE_K1_QUANTITE"] == "20 000"
        assert r["ENERGIE_K1_MONTANT"] == "2 238 200"

    def test_tarification_detaillee_ligne_vide(self):
        """Textract renvoie parfois une ligne sans cellule : le tableau doit rester exploitable."""
        donnees = table(["DESIGNATION", "QUANTITE", "TARIF", "MONTANT"], ["Redevance", "", "", "16 378"])
        donnees.insert(1, [])
        r = UnifiedInvoiceProcessor().flatten_detailed_pricing_table(donnees)
        assert r["REDEVANCE_MONTANT"] == "16 378"

    def test_tableau_croise(self):
        r = UnifiedInvoiceProcessor().flatten_cross_table(table(
            ["", "K1", "K2"],
            ["Nouvel index", "191 996", "113 447"],
            ["Ancien index", "140 446", "11 162"],
        ))
        assert r["Nouvel index/K2"] == "113 447"
        assert r["Ancien index/K1"] == "140 446"


ENERGIE = table(
    ["Désignation", "Quantité", "Montant"],
    ["Energie K1", "20 000 kWh", "2 238 200 FCFA"],
    ["Energie K2", "4 000 kWh", "738 600 FCFA"],
    ["Date relevé", "05/03/2024", ""],
)
TEMPLATE = {"name": "energie", "columnHeaders": ["Désignation", "Quantité", "Montant"], "headerLayout": "both"}


class TestTemplates:
    def test_aplatissement_avec_template(self):
        r = UnifiedInvoiceProcessor().flatten_table_with_template(ENERGIE, TEMPLATE)
        assert r["rows"][1] == {"Désignation": "Energie K1", "Quantité": "20 000 kWh", "Montant": "2 238 200 FCFA"}
        assert r["flat_fields"]["ENERGIE.MONTANT.3"] == "738 600 FCFA"
        assert r["missing_headers"] == []

    def resoudre(self, *mappings):
        return UnifiedInvoiceProcessor()._resolve_excel_mappings(ENERGIE, {**TEMPLATE, "excelMappings": list(mappings)})

    def test_intersection_colonne_ligne(self):
        r = self.resoudre({"target": "Montant K2", "source": {"column": "Montant", "rowHeader": "Energie K2"}})
        assert r == {"Montant K2": "738 600 FCFA"}

    def test_index_de_ligne(self):
        r = self.resoudre({"target": "Quantité 1re ligne", "source": {"column": "Quantité", "rowIndex": 0}})
        assert r == {"Quantité 1re ligne": "20 000 kWh"}

    def test_valeur_par_defaut(self):
        r = self.resoudre({"target": "Rappel", "source": {"column": "Montant", "rowHeader": "Rappel"}, "default": 0})
        assert r == {"Rappel": 0}

    def test_transformation_nombre_avec_unite(self):
        """Les cellules SENELEC portent leur unité (« kWh », « FCFA ») : le nombre doit être conservé."""
        r = self.resoudre(
            {"target": "K1 (kWh)", "source": {"column": "Quantité", "rowHeader": "Energie K1"}, "transform": "number"},
            {"target": "Montant K1", "source": {"column": "Montant", "rowHeader": "Energie K1"}, "transform": "number"},
        )
        assert r == {"K1 (kWh)": 20000.0, "Montant K1": 2238200.0}

    def test_transformation_date_francaise(self):
        """05/03/2024 = 5 mars (format JJ/MM/AAAA des factures SENELEC)."""
        r = self.resoudre({"target": "Relevé", "source": {"column": "Quantité", "rowHeader": "Date relevé"}, "transform": "date"})
        assert r == {"Relevé": "2024-03-05"}

    def test_traitement_complet_avec_template(self):
        p = UnifiedInvoiceProcessor()
        r = p.process_invoice_tables_with_templates(
            [{"rows": ENERGIE, "table_name": "Energie"}],
            {"energie": {**TEMPLATE, "id": "t1", "excelMappings": [
                {"target": "Montant K1", "source": {"column": "Montant", "rowHeader": "Energie K1"}, "transform": "number"},
            ]}},
        )
        assert r["unified_data"] == {"Montant K1": 2238200.0}
        assert r["tables"][0]["templateId"] == "t1" and r["tables"][0]["excelMappingsUsed"] is True
