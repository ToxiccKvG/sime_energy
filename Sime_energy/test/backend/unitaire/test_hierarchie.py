"""Propagation des consommations dans la hiérarchie (/process-hierarchy).

Règles : parent manquant = somme des enfants ; un seul enfant manquant = parent − autres enfants.
"""
import json

from app.api.V1.processing.processing import process_hierarchy


def traiter(noeuds):
    reponse = process_hierarchy({"hierarchy": {"hierarchy": noeuds}})
    return json.loads(reponse.body)["hierarchy"]["hierarchy"]


def test_parent_deduit_des_enfants():
    [racine] = traiter([{"name": "Site", "children": [
        {"name": "A", "averageConsumption": 10},
        {"name": "B", "averageConsumption": 20},
    ]}])
    assert racine["averageConsumption"] == 30
    assert racine["totalChildrenConsumption"] == 30


def test_enfant_unique_manquant_deduit_du_parent():
    [racine] = traiter([{"name": "Site", "averageConsumption": 100, "children": [
        {"name": "A", "averageConsumption": 60},
        {"name": "B"},
    ]}])
    assert racine["children"][1]["averageConsumption"] == 40


def test_deux_enfants_manquants_non_deduits():
    [racine] = traiter([{"name": "Site", "averageConsumption": 100, "children": [
        {"name": "A"}, {"name": "B"}, {"name": "C", "averageConsumption": 10},
    ]}])
    assert "averageConsumption" not in racine["children"][0]
    assert "averageConsumption" not in racine["children"][1]


def test_valeurs_avec_unites_et_virgules():
    [racine] = traiter([{"name": "Site", "children": [
        {"name": "A", "averageConsumption": "12,5 kWh"},
        {"name": "B", "averageConsumption": "7,5 kWh"},
    ]}])
    assert racine["averageConsumption"] == 20


def test_propagation_sur_trois_niveaux():
    [racine] = traiter([{"name": "Site", "children": [
        {"name": "Bâtiment", "children": [
            {"name": "Étage 1", "averageConsumption": 5},
            {"name": "Étage 2", "averageConsumption": 7},
        ]},
        {"name": "Parking", "averageConsumption": 3},
    ]}])
    assert racine["children"][0]["averageConsumption"] == 12
    assert racine["averageConsumption"] == 15


def test_hierarchie_vide():
    assert traiter([]) == []
