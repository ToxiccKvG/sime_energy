-- Seed data for reference tables

INSERT INTO roles (label, description, permissions) VALUES
('admin', 'Administrateur système', '{"all": true}')
ON CONFLICT DO NOTHING;

INSERT INTO roles (label, description, permissions) VALUES
('auditor', 'Auditeur énergétique', '{"audit": true, "reports": true, "files": true}')
ON CONFLICT DO NOTHING;

INSERT INTO roles (label, description, permissions) VALUES
('technician', 'Technicien de terrain', '{"measurements": true, "equipment": true}')
ON CONFLICT DO NOTHING;

INSERT INTO roles (label, description, permissions) VALUES
('client', 'Client/Organisation', '{"view": true, "reports": true}')
ON CONFLICT DO NOTHING;

INSERT INTO roles (label, description, permissions) VALUES
('viewer', 'Lecteur seul', '{"view": true}')
ON CONFLICT DO NOTHING;

INSERT INTO buildings_types (label, description) VALUES
('Industrie', 'Bâtiments industriels et manufacturiers')
ON CONFLICT DO NOTHING;

INSERT INTO buildings_types (label, description) VALUES
('Commercial', 'Centres commerciaux, magasins, restaurants')
ON CONFLICT DO NOTHING;

INSERT INTO buildings_types (label, description) VALUES
('Bureaux', 'Bâtiments de bureaux et administratifs')
ON CONFLICT DO NOTHING;

INSERT INTO buildings_types (label, description) VALUES
('Santé', 'Hôpitaux, cliniques, centres de santé')
ON CONFLICT DO NOTHING;

INSERT INTO buildings_types (label, description) VALUES
('Éducation', 'Écoles, universités, centres de formation')
ON CONFLICT DO NOTHING;

INSERT INTO buildings_types (label, description) VALUES
('Infrastructure', 'Ports, aéroports, gares, infrastructures publiques')
ON CONFLICT DO NOTHING;

INSERT INTO buildings_types (label, description) VALUES
('Résidentiel', 'Logements collectifs et individuels')
ON CONFLICT DO NOTHING;

INSERT INTO equipments_types (label, category, description) VALUES
('Compteur électrique', 'Mesure', 'Compteur de consommation électrique')
ON CONFLICT DO NOTHING;

INSERT INTO equipments_types (label, category, description) VALUES
('Capteur de température', 'Capteur', 'Capteur de température ambiante')
ON CONFLICT DO NOTHING;

INSERT INTO equipments_types (label, category, description) VALUES
('Capteur d''humidité', 'Capteur', 'Capteur d''humidité relative')
ON CONFLICT DO NOTHING;

INSERT INTO equipments_types (label, category, description) VALUES
('Capteur de pression', 'Capteur', 'Capteur de pression atmosphérique')
ON CONFLICT DO NOTHING;

INSERT INTO equipments_types (label, category, description) VALUES
('Transformateur', 'Équipement', 'Transformateur électrique')
ON CONFLICT DO NOTHING;

INSERT INTO equipments_types (label, category, description) VALUES
('Générateur', 'Équipement', 'Groupe électrogène')
ON CONFLICT DO NOTHING;

INSERT INTO equipments_types (label, category, description) VALUES
('Climatiseur', 'Équipement', 'Système de climatisation')
ON CONFLICT DO NOTHING;

INSERT INTO equipments_types (label, category, description) VALUES
('Éclairage LED', 'Équipement', 'Système d''éclairage LED')
ON CONFLICT DO NOTHING;

INSERT INTO equipments_types (label, category, description) VALUES
('Pompe', 'Équipement', 'Pompe hydraulique')
ON CONFLICT DO NOTHING;

INSERT INTO equipments_types (label, category, description) VALUES
('Ventilateur', 'Équipement', 'Système de ventilation')
ON CONFLICT DO NOTHING;

INSERT INTO files_types (label, mime_type, max_size_mb, description) VALUES
('Facture PDF', 'application/pdf', 10, 'Factures d''électricité au format PDF')
ON CONFLICT DO NOTHING;

INSERT INTO files_types (label, mime_type, max_size_mb, description) VALUES
('Image', 'image/jpeg,image/png', 5, 'Images et photos')
ON CONFLICT DO NOTHING;

INSERT INTO files_types (label, mime_type, max_size_mb, description) VALUES
('Document Excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 20, 'Fichiers Excel avec données de mesure')
ON CONFLICT DO NOTHING;

INSERT INTO files_types (label, mime_type, max_size_mb, description) VALUES
('Document Word', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 10, 'Documents Word')
ON CONFLICT DO NOTHING;

INSERT INTO files_types (label, mime_type, max_size_mb, description) VALUES
('Archive', 'application/zip,application/x-rar-compressed', 50, 'Archives compressées')
ON CONFLICT DO NOTHING;

INSERT INTO files_types (label, mime_type, max_size_mb, description) VALUES
('Rapport PDF', 'application/pdf', 25, 'Rapports d''audit au format PDF')
ON CONFLICT DO NOTHING;


