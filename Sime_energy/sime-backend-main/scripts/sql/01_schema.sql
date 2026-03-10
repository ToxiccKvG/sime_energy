-- =====================================================
-- SIME PLATFORM - CONSOLIDATED POSTGRESQL SCHEMA
-- Front + Backend merged; canonical tables use richer frontend schema
-- Compatibility views provided for current backend expectations
-- =====================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;

-- =============================
-- Reference tables
-- =============================

CREATE TABLE IF NOT EXISTS roles (
    role_id SERIAL PRIMARY KEY,
    label VARCHAR(50) NOT NULL,
    description TEXT,
    permissions JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS buildings_types (
    build_tp_id SERIAL PRIMARY KEY,
    label VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS equipments_types (
    equip_tp_id SERIAL PRIMARY KEY,
    label VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS files_types (
    file_tp_id SERIAL PRIMARY KEY,
    label VARCHAR(50) UNIQUE NOT NULL,
    mime_type VARCHAR(100),
    max_size_mb INTEGER DEFAULT 10,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- =============================
-- Core entities
-- =============================

CREATE TABLE IF NOT EXISTS organisations (
    org_id SERIAL PRIMARY KEY,
    organisation_name VARCHAR(50) UNIQUE NOT NULL,
    location VARCHAR(50),
    contact_info VARCHAR(50),
    address TEXT,
    phone VARCHAR(20),
    email VARCHAR(255),
    website VARCHAR(255),
    siret VARCHAR(14),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    organisation_id INTEGER NOT NULL REFERENCES organisations(org_id) ON DELETE CASCADE,
    role_id INTEGER NOT NULL REFERENCES roles(role_id) ON DELETE RESTRICT,
    name VARCHAR(50) NOT NULL,
    login VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    lost_login DATE,
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS buildings (
    building_id SERIAL PRIMARY KEY,
    org_id INTEGER NOT NULL REFERENCES organisations(org_id) ON DELETE CASCADE,
    build_tp_id INTEGER NOT NULL REFERENCES buildings_types(build_tp_id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    address VARCHAR(255),
    latitude NUMERIC(10,8),
    longitude NUMERIC(11,8),
    construction_year INTEGER NOT NULL,
    description VARCHAR(200),
    surface_area NUMERIC(10,2),
    estimated_consumption NUMERIC(15,3),
    status VARCHAR(20) DEFAULT 'active',
    priority VARCHAR(20) DEFAULT 'moyenne',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS equipments (
    equipment_id SERIAL PRIMARY KEY,
    building_id INTEGER NOT NULL REFERENCES buildings(building_id) ON DELETE CASCADE,
    equipment_tp_id INTEGER NOT NULL REFERENCES equipments_types(equip_tp_id) ON DELETE RESTRICT,
    name VARCHAR(255),
    status VARCHAR(20) DEFAULT 'active',
    date_installed DATE,
    description VARCHAR(100),
    power_rating NUMERIC(10,2),
    efficiency_rating NUMERIC(5,2),
    maintenance_date DATE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Audits and related (present in frontend; add for completeness)
CREATE TABLE IF NOT EXISTS audits (
    audit_id SERIAL PRIMARY KEY,
    building_id INTEGER NOT NULL REFERENCES buildings(building_id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    client VARCHAR(255),
    status VARCHAR(20) DEFAULT 'brouillon',
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    region VARCHAR(100),
    budget_estimated NUMERIC(12,2),
    total_potential_savings NUMERIC(12,2),
    estimated_duration_days INTEGER,
    audit_norm VARCHAR(50),
    technician_responsible VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoices (
    invoice_id SERIAL PRIMARY KEY,
    building_id INTEGER NOT NULL REFERENCES buildings(building_id) ON DELETE CASCADE,
    audit_id INTEGER REFERENCES audits(audit_id) ON DELETE SET NULL,
    invoice_date DATE NOT NULL,
    invoice_number VARCHAR(100),
    energy_month_kwh NUMERIC(15,3),
    amount NUMERIC(12,2),
    details VARCHAR(200),
    period_from DATE,
    period_to DATE,
    number_of_days INTEGER,
    ttc_amount NUMERIC(12,2),
    subscribed_power NUMERIC(10,2),
    redevance_amount NUMERIC(12,2),
    municipal_tax NUMERIC(12,2),
    vat_amount NUMERIC(12,2),
    tariff_type VARCHAR(50),
    tariff_text VARCHAR(100),
    cos_phi NUMERIC(5,2),
    counting_type VARCHAR(50),
    meter_number VARCHAR(100),
    ai_cg NUMERIC(15,3),
    ni_cg NUMERIC(15,3),
    consumption_kwh NUMERIC(15,3),
    total_energy_amount NUMERIC(12,2),
    loss_active_k1 NUMERIC(15,3),
    loss_active_k2 NUMERIC(15,3),
    loss_active_total NUMERIC(15,3),
    loss_reactive NUMERIC(15,3),
    surcharge_k1 NUMERIC(12,2),
    surcharge_k2 NUMERIC(12,2),
    total_surcharge NUMERIC(12,2),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS measurements (
    id_measurement SERIAL PRIMARY KEY,
    building_id INTEGER NOT NULL REFERENCES buildings(building_id) ON DELETE CASCADE,
    audit_id INTEGER REFERENCES audits(audit_id) ON DELETE SET NULL,
    equipment_id INTEGER REFERENCES equipments(equipment_id) ON DELETE SET NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    value NUMERIC(15,3) NOT NULL,
    measure_type VARCHAR(50) NOT NULL,
    unit VARCHAR(20) DEFAULT 'kWh',
    comment VARCHAR(100),
    sensor_id VARCHAR(100),
    quality_score NUMERIC(3,2) CHECK (quality_score >= 0 AND quality_score <= 1),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS files (
    file_id SERIAL PRIMARY KEY,
    org_id INTEGER NOT NULL REFERENCES organisations(org_id) ON DELETE CASCADE,
    file_tp_id INTEGER REFERENCES files_types(file_tp_id) ON DELETE SET NULL,
    created_by INTEGER NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    audit_id INTEGER REFERENCES audits(audit_id) ON DELETE SET NULL,
    filename VARCHAR(255) UNIQUE NOT NULL,
    original_filename VARCHAR(255),
    file_path VARCHAR(500),
    size NUMERIC(5,2),
    version INTEGER DEFAULT 1,
    status VARCHAR(20) DEFAULT 'uploaded',
    mime_type VARCHAR(100),
    file_hash VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Single, unified logs table (merging backend + frontend needs)
CREATE TABLE IF NOT EXISTS logs (
    log_id SERIAL PRIMARY KEY,
    file_id INTEGER REFERENCES files(file_id) ON DELETE SET NULL,
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    audit_id INTEGER REFERENCES audits(audit_id) ON DELETE SET NULL,
    action VARCHAR(50),
    message VARCHAR(100),
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Invoice extraction tables (canonical names)
CREATE TABLE IF NOT EXISTS invoice_extractions_raw (
    inv_ext_raw_id SERIAL PRIMARY KEY,
    file_id INTEGER NOT NULL REFERENCES files(file_id) ON DELETE CASCADE,
    field_name VARCHAR(255) NOT NULL,
    extracted_value VARCHAR(50),
    confidence_score NUMERIC(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
    status VARCHAR(50) DEFAULT 'pending',
    coordinates JSONB,
    page_number INTEGER,
    original_text TEXT,
    corrected_value VARCHAR(50),
    correction_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoice_extractions_temp (
    inv_ext_tmp_id SERIAL PRIMARY KEY,
    file_id INTEGER NOT NULL REFERENCES files(file_id) ON DELETE CASCADE,
    invoice_date DATE,
    energy NUMERIC(8,2),
    total_amount NUMERIC(12,2),
    confidence_global NUMERIC(3,2) CHECK (confidence_global >= 0 AND confidence_global <= 1),
    extraction_status VARCHAR(50) DEFAULT 'processing',
    validation_status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- KPIs and electrical schema components
CREATE TABLE IF NOT EXISTS kpis (
    kpi_id SERIAL PRIMARY KEY,
    audit_id INTEGER NOT NULL REFERENCES audits(audit_id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    value NUMERIC(15,3),
    unit VARCHAR(20),
    target_value NUMERIC(15,3),
    category VARCHAR(50),
    calculation_method TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS electrical_schema_components (
    component_id SERIAL PRIMARY KEY,
    audit_id INTEGER NOT NULL REFERENCES audits(audit_id) ON DELETE CASCADE,
    component_type VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    position_x NUMERIC(10,2),
    position_y NUMERIC(10,2),
    properties JSONB DEFAULT '{}'::jsonb,
    connections JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_reports (
    report_id SERIAL PRIMARY KEY,
    audit_id INTEGER NOT NULL REFERENCES audits(audit_id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    report_type VARCHAR(50) DEFAULT 'final',
    status VARCHAR(20) DEFAULT 'draft',
    file_path VARCHAR(500),
    generated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- =============================
-- Indexes (FK and frequent columns)
-- =============================

CREATE INDEX IF NOT EXISTS idx_users_organisation_id ON users(organisation_id);
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_buildings_org_id ON buildings(org_id);
CREATE INDEX IF NOT EXISTS idx_buildings_type_id ON buildings(build_tp_id);
CREATE INDEX IF NOT EXISTS idx_equipments_building_id ON equipments(building_id);
CREATE INDEX IF NOT EXISTS idx_equipments_type_id ON equipments(equipment_tp_id);
CREATE INDEX IF NOT EXISTS idx_audits_building_id ON audits(building_id);
CREATE INDEX IF NOT EXISTS idx_audits_user_id ON audits(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_building_id ON invoices(building_id);
CREATE INDEX IF NOT EXISTS idx_invoices_audit_id ON invoices(audit_id);
CREATE INDEX IF NOT EXISTS idx_measurements_building_id ON measurements(building_id);
CREATE INDEX IF NOT EXISTS idx_measurements_audit_id ON measurements(audit_id);
CREATE INDEX IF NOT EXISTS idx_measurements_equipment_id ON measurements(equipment_id);
CREATE INDEX IF NOT EXISTS idx_files_org_id ON files(org_id);
CREATE INDEX IF NOT EXISTS idx_files_created_by ON files(created_by);
CREATE INDEX IF NOT EXISTS idx_files_audit_id ON files(audit_id);
CREATE INDEX IF NOT EXISTS idx_invoice_extractions_raw_file_id ON invoice_extractions_raw(file_id);
CREATE INDEX IF NOT EXISTS idx_invoice_extractions_temp_file_id ON invoice_extractions_temp(file_id);
CREATE INDEX IF NOT EXISTS idx_logs_user_id ON logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_file_id ON logs(file_id);
CREATE INDEX IF NOT EXISTS idx_logs_audit_id ON logs(audit_id);
CREATE INDEX IF NOT EXISTS idx_kpis_audit_id ON kpis(audit_id);
CREATE INDEX IF NOT EXISTS idx_electrical_schema_components_audit_id ON electrical_schema_components(audit_id);
CREATE INDEX IF NOT EXISTS idx_audit_reports_audit_id ON audit_reports(audit_id);
CREATE INDEX IF NOT EXISTS idx_audit_reports_user_id ON audit_reports(user_id);

CREATE INDEX IF NOT EXISTS idx_audits_status ON audits(status);
CREATE INDEX IF NOT EXISTS idx_audits_created_at ON audits(created_at);
CREATE INDEX IF NOT EXISTS idx_buildings_status ON buildings(status);
CREATE INDEX IF NOT EXISTS idx_measurements_timestamp ON measurements(timestamp);
CREATE INDEX IF NOT EXISTS idx_measurements_measure_type ON measurements(measure_type);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_date ON invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_files_status ON files(status);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_logs_action ON logs(action);

-- Geospatial index (functional)
CREATE INDEX IF NOT EXISTS idx_buildings_location ON buildings USING GIST (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326));

-- =============================
-- Triggers for updated_at
-- =============================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_roles_updated_at') THEN
        CREATE TRIGGER trg_roles_updated_at BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_organisations_updated_at') THEN
        CREATE TRIGGER trg_organisations_updated_at BEFORE UPDATE ON organisations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_users_updated_at') THEN
        CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_buildings_updated_at') THEN
        CREATE TRIGGER trg_buildings_updated_at BEFORE UPDATE ON buildings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_equipments_updated_at') THEN
        CREATE TRIGGER trg_equipments_updated_at BEFORE UPDATE ON equipments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audits_updated_at') THEN
        CREATE TRIGGER trg_audits_updated_at BEFORE UPDATE ON audits FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_invoices_updated_at') THEN
        CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_files_updated_at') THEN
        CREATE TRIGGER trg_files_updated_at BEFORE UPDATE ON files FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_invoice_extractions_raw_updated_at') THEN
        CREATE TRIGGER trg_invoice_extractions_raw_updated_at BEFORE UPDATE ON invoice_extractions_raw FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_invoice_extractions_temp_updated_at') THEN
        CREATE TRIGGER trg_invoice_extractions_temp_updated_at BEFORE UPDATE ON invoice_extractions_temp FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_kpis_updated_at') THEN
        CREATE TRIGGER trg_kpis_updated_at BEFORE UPDATE ON kpis FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_electrical_schema_components_updated_at') THEN
        CREATE TRIGGER trg_electrical_schema_components_updated_at BEFORE UPDATE ON electrical_schema_components FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_reports_updated_at') THEN
        CREATE TRIGGER trg_audit_reports_updated_at BEFORE UPDATE ON audit_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- =============================
-- Compatibility views for current backend code
-- =============================

CREATE OR REPLACE VIEW equipements_types AS
SELECT equip_tp_id, label, category, description, created_at
FROM equipments_types;

CREATE OR REPLACE VIEW invcoice_extractions_raw AS
SELECT * FROM invoice_extractions_raw;

CREATE OR REPLACE VIEW invcoice_extractions_temp AS
SELECT * FROM invoice_extractions_temp;

CREATE OR REPLACE VIEW buildings_backend_compat AS
SELECT 
    building_id,
    org_id,
    build_tp_id,
    address AS adress,
    latitude,
    longitude,
    name,
    construction_year,
    description,
    surface_area,
    estimated_consumption,
    status,
    priority,
    created_at,
    updated_at
FROM buildings;

CREATE OR REPLACE VIEW invoices_backend_compat AS
SELECT 
    invoice_id,
    building_id,
    audit_id,
    invoice_date,
    invoice_number,
    energy_month_kwh AS energy_month_khw,
    amount,
    details,
    period_from,
    period_to,
    number_of_days,
    ttc_amount,
    subscribed_power,
    redevance_amount,
    municipal_tax,
    vat_amount,
    tariff_type,
    tariff_text,
    cos_phi,
    counting_type,
    meter_number,
    ai_cg,
    ni_cg,
    consumption_kwh,
    total_energy_amount,
    loss_active_k1,
    loss_active_k2,
    loss_active_total,
    loss_reactive,
    surcharge_k1,
    surcharge_k2,
    total_surcharge,
    created_at,
    updated_at
FROM invoices;

CREATE OR REPLACE VIEW measurements_time_only AS
SELECT 
    id_measurement,
    building_id,
    audit_id,
    equipment_id,
    (timestamp::time) AS timestamp,
    value,
    measure_type,
    unit,
    comment,
    sensor_id,
    quality_score,
    created_at
FROM measurements;

CREATE OR REPLACE VIEW files_backend_compat AS
SELECT 
    file_id,
    org_id,
    file_tp_id,
    created_by,
    audit_id,
    filename,
    original_filename,
    file_path,
    size,
    version,
    status,
    mime_type,
    file_hash,
    (created_at::time) AS created_at,
    updated_at
FROM files;

COMMENT ON TABLE logs IS 'Unified logs table for system/user actions (frontend+backend)';


