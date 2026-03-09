-- Organizations related tables migration
-- This migration creates tables related to organizations:
-- - organizations: Core organization table
-- - organization_users: Junction table linking users to organizations with roles
-- - annotation_dictionaries: Stores annotation configuration per organization
-- - annotation_settings: Stores display preferences per organization
-- - organization_invitations: Stores invitations for users to join organizations
-- - audits: Stores audit information per organization
-- - audit_sites: Stores site information for audits
-- - audit_buildings: Stores building information for audit sites
-- - audit_tasks: Stores task information for audits
-- - audit_measurements: Stores measurement data for audits
-- - audit_invoices: Stores invoice data for audits
-- - audit_activity: Stores activity logs for audits

-- Generic function for updating updated_at timestamp
-- This function is used by all tables with updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create organizations table
-- Core organization table
CREATE TABLE IF NOT EXISTS organizations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT,
    description TEXT,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Create organization_users table FIRST (before RLS policies that reference it)
-- Junction table linking users to organizations with roles
CREATE TABLE IF NOT EXISTS organization_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    
    -- One user can only be in an organization once
    UNIQUE(organization_id, user_id)
);

-- Now add RLS policies for organizations (which reference organization_users)
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Users can read organizations they belong to or created
CREATE POLICY "Users can read their organizations"
    ON organizations
    FOR SELECT
    USING (
        id IN (
            SELECT organization_id 
            FROM organization_users 
            WHERE user_id = auth.uid()
        )
        OR created_by = auth.uid()
    );

-- Users can insert organizations (create new ones)
CREATE POLICY "Users can create organizations"
    ON organizations
    FOR INSERT
    WITH CHECK (created_by = auth.uid());

-- Users can update organizations they created or belong to
CREATE POLICY "Users can update their organizations"
    ON organizations
    FOR UPDATE
    USING (
        id IN (
            SELECT organization_id 
            FROM organization_users 
            WHERE user_id = auth.uid()
        )
        OR created_by = auth.uid()
    );

-- Only organization creators can delete organizations
CREATE POLICY "Users can delete organizations they created"
    ON organizations
    FOR DELETE
    USING (created_by = auth.uid());

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_organizations_created_by 
    ON organizations(created_by);

CREATE INDEX IF NOT EXISTS idx_organizations_slug 
    ON organizations(slug);

-- Update trigger for updated_at
CREATE TRIGGER organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Function to automatically add organization creator to organization_users
CREATE OR REPLACE FUNCTION add_organization_creator_as_admin()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert the creator as admin in organization_users
    INSERT INTO organization_users (organization_id, user_id, role)
    VALUES (NEW.id, NEW.created_by, 'admin')
    ON CONFLICT (organization_id, user_id) DO NOTHING;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically add creator to organization_users when organization is created
CREATE TRIGGER organizations_add_creator
    AFTER INSERT ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION add_organization_creator_as_admin();

-- Add RLS policies for organization_users
ALTER TABLE organization_users ENABLE ROW LEVEL SECURITY;

-- Users can read their own organization memberships
CREATE POLICY "Users can read their organization memberships"
    ON organization_users
    FOR SELECT
    USING (user_id = auth.uid());

-- Users can read memberships for organizations they belong to
CREATE POLICY "Users can read organization members"
    ON organization_users
    FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id 
            FROM organization_users 
            WHERE user_id = auth.uid()
        )
    );

-- Users can insert themselves into organizations
-- This policy allows users to add themselves without checking if they're already members
-- to avoid infinite recursion. The trigger uses SECURITY DEFINER to bypass RLS.
CREATE POLICY "Users can insert their own memberships"
    ON organization_users
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Users can update their own membership
CREATE POLICY "Users can update their own membership"
    ON organization_users
    FOR UPDATE
    USING (user_id = auth.uid());

-- Users can delete their own memberships
CREATE POLICY "Users can delete their own memberships"
    ON organization_users
    FOR DELETE
    USING (user_id = auth.uid());

-- Organization creators can delete memberships for their organizations
-- This avoids recursion by checking organizations table instead of organization_users
CREATE POLICY "Organization creators can delete memberships"
    ON organization_users
    FOR DELETE
    USING (
        organization_id IN (
            SELECT id 
            FROM organizations 
            WHERE created_by = auth.uid()
        )
    );

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_organization_users_org 
    ON organization_users(organization_id);

CREATE INDEX IF NOT EXISTS idx_organization_users_user 
    ON organization_users(user_id);

CREATE INDEX IF NOT EXISTS idx_organization_users_role 
    ON organization_users(role);

-- Create annotation dictionaries table
-- Stores annotation configuration per organization (supports multiple dictionaries)

CREATE TABLE IF NOT EXISTS annotation_dictionaries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Dictionnaire par défaut',
    description TEXT,
    color TEXT DEFAULT '#10b981',
    fields JSONB NOT NULL DEFAULT '[]'::jsonb,
    table_templates JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create annotation settings table
-- Stores display preferences per organization
CREATE TABLE IF NOT EXISTS annotation_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    show_labels BOOLEAN DEFAULT true,
    selected_dictionary_id UUID REFERENCES annotation_dictionaries(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- One settings per organization
    UNIQUE(organization_id)
);

-- Add RLS policies for annotation_dictionaries
ALTER TABLE annotation_dictionaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read organization dictionaries"
    ON annotation_dictionaries
    FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id 
            FROM organization_users 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert organization dictionaries"
    ON annotation_dictionaries
    FOR INSERT
    WITH CHECK (
        organization_id IN (
            SELECT organization_id 
            FROM organization_users 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update organization dictionaries"
    ON annotation_dictionaries
    FOR UPDATE
    USING (
        organization_id IN (
            SELECT organization_id 
            FROM organization_users 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete organization dictionaries"
    ON annotation_dictionaries
    FOR DELETE
    USING (
        organization_id IN (
            SELECT organization_id 
            FROM organization_users 
            WHERE user_id = auth.uid()
        )
    );

-- Add RLS policies for annotation_settings
ALTER TABLE annotation_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read organization settings"
    ON annotation_settings
    FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id 
            FROM organization_users 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert organization settings"
    ON annotation_settings
    FOR INSERT
    WITH CHECK (
        organization_id IN (
            SELECT organization_id 
            FROM organization_users 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update organization settings"
    ON annotation_settings
    FOR UPDATE
    USING (
        organization_id IN (
            SELECT organization_id 
            FROM organization_users 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete organization settings"
    ON annotation_settings
    FOR DELETE
    USING (
        organization_id IN (
            SELECT organization_id 
            FROM organization_users 
            WHERE user_id = auth.uid()
        )
    );

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_annotation_dictionaries_org 
    ON annotation_dictionaries(organization_id);

CREATE INDEX IF NOT EXISTS idx_annotation_settings_org 
    ON annotation_settings(organization_id);

-- Update triggers for updated_at
CREATE TRIGGER annotation_dictionaries_updated_at
    BEFORE UPDATE ON annotation_dictionaries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER annotation_settings_updated_at
    BEFORE UPDATE ON annotation_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Create organization_invitations table
-- Stores invitations for users to join organizations
CREATE TABLE IF NOT EXISTS organization_invitations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    inviter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    invited_email TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITHOUT TIME ZONE,
    accepted_at TIMESTAMP WITHOUT TIME ZONE,
    accepted_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked'))
);

-- Add RLS policies for organization_invitations
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Users can read invitations for organizations they belong to
CREATE POLICY "Users can read organization invitations"
    ON organization_invitations
    FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id 
            FROM organization_users 
            WHERE user_id = auth.uid()
        )
    );

-- Users can read invitations by code (for accepting invitations)
CREATE POLICY "Users can read invitations by code"
    ON organization_invitations
    FOR SELECT
    USING (code IS NOT NULL);

-- Users can insert invitations for organizations they belong to
CREATE POLICY "Users can insert organization invitations"
    ON organization_invitations
    FOR INSERT
    WITH CHECK (
        organization_id IN (
            SELECT organization_id 
            FROM organization_users 
            WHERE user_id = auth.uid()
        )
        AND inviter_id = auth.uid()
    );

-- Users can update invitations for organizations they belong to
CREATE POLICY "Users can update organization invitations"
    ON organization_invitations
    FOR UPDATE
    USING (
        organization_id IN (
            SELECT organization_id 
            FROM organization_users 
            WHERE user_id = auth.uid()
        )
    );

-- Users can delete invitations for organizations they belong to
CREATE POLICY "Users can delete organization invitations"
    ON organization_invitations
    FOR DELETE
    USING (
        organization_id IN (
            SELECT organization_id 
            FROM organization_users 
            WHERE user_id = auth.uid()
        )
    );

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_organization_invitations_org 
    ON organization_invitations(organization_id);

CREATE INDEX IF NOT EXISTS idx_organization_invitations_code 
    ON organization_invitations(code);

CREATE INDEX IF NOT EXISTS idx_organization_invitations_inviter 
    ON organization_invitations(inviter_id);

CREATE INDEX IF NOT EXISTS idx_organization_invitations_status 
    ON organization_invitations(status);

-- Create audits table
-- Stores audit information per organization
CREATE TABLE IF NOT EXISTS audits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    color TEXT,
    status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed')),
    start_date TIMESTAMP WITHOUT TIME ZONE,
    end_date TIMESTAMP WITHOUT TIME ZONE,
    completion_percentage INTEGER DEFAULT 0,
    responsable TEXT,
    general_info JSONB DEFAULT '{}'::jsonb,
    personnel JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Add RLS policies for audits
ALTER TABLE audits ENABLE ROW LEVEL SECURITY;

-- Users can read audits for organizations they belong to
CREATE POLICY "Users can read organization audits"
    ON audits
    FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id 
            FROM organization_users 
            WHERE user_id = auth.uid()
        )
    );

-- Users can insert audits for organizations they belong to
CREATE POLICY "Users can insert organization audits"
    ON audits
    FOR INSERT
    WITH CHECK (
        organization_id IN (
            SELECT organization_id 
            FROM organization_users 
            WHERE user_id = auth.uid()
        )
        AND created_by = auth.uid()
    );

-- Users can update audits for organizations they belong to
CREATE POLICY "Users can update organization audits"
    ON audits
    FOR UPDATE
    USING (
        organization_id IN (
            SELECT organization_id 
            FROM organization_users 
            WHERE user_id = auth.uid()
        )
    );

-- Users can delete audits for organizations they belong to
CREATE POLICY "Users can delete organization audits"
    ON audits
    FOR DELETE
    USING (
        organization_id IN (
            SELECT organization_id 
            FROM organization_users 
            WHERE user_id = auth.uid()
        )
    );

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_audits_org 
    ON audits(organization_id);

CREATE INDEX IF NOT EXISTS idx_audits_created_by 
    ON audits(created_by);

CREATE INDEX IF NOT EXISTS idx_audits_status 
    ON audits(status);

CREATE INDEX IF NOT EXISTS idx_audits_created_at 
    ON audits(created_at);

-- Update trigger for updated_at
CREATE TRIGGER audits_updated_at
    BEFORE UPDATE ON audits
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Create audit_sites table
-- Stores site information for audits
CREATE TABLE IF NOT EXISTS audit_sites (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT,
    latitude NUMERIC,
    longitude NUMERIC,
    status TEXT NOT NULL DEFAULT 'planned' CHECK (status = ANY(ARRAY['planned'::text, 'in_progress'::text, 'completed'::text])),
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Add RLS policies for audit_sites
ALTER TABLE audit_sites ENABLE ROW LEVEL SECURITY;

-- Users can read sites for audits in organizations they belong to
CREATE POLICY "Users can read audit sites"
    ON audit_sites
    FOR SELECT
    USING (
        audit_id IN (
            SELECT a.id 
            FROM audits a
            INNER JOIN organization_users ou ON a.organization_id = ou.organization_id
            WHERE ou.user_id = auth.uid()
        )
    );

-- Users can insert sites for audits in organizations they belong to
CREATE POLICY "Users can insert audit sites"
    ON audit_sites
    FOR INSERT
    WITH CHECK (
        audit_id IN (
            SELECT a.id 
            FROM audits a
            INNER JOIN organization_users ou ON a.organization_id = ou.organization_id
            WHERE ou.user_id = auth.uid()
        )
    );

-- Users can update sites for audits in organizations they belong to
CREATE POLICY "Users can update audit sites"
    ON audit_sites
    FOR UPDATE
    USING (
        audit_id IN (
            SELECT a.id 
            FROM audits a
            INNER JOIN organization_users ou ON a.organization_id = ou.organization_id
            WHERE ou.user_id = auth.uid()
        )
    );

-- Users can delete sites for audits in organizations they belong to
CREATE POLICY "Users can delete audit sites"
    ON audit_sites
    FOR DELETE
    USING (
        audit_id IN (
            SELECT a.id 
            FROM audits a
            INNER JOIN organization_users ou ON a.organization_id = ou.organization_id
            WHERE ou.user_id = auth.uid()
        )
    );

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_audit_sites_audit 
    ON audit_sites(audit_id);

CREATE INDEX IF NOT EXISTS idx_audit_sites_status 
    ON audit_sites(status);

-- Update trigger for updated_at
CREATE TRIGGER audit_sites_updated_at
    BEFORE UPDATE ON audit_sites
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Create audit_buildings table
-- Stores building information for audit sites
CREATE TABLE IF NOT EXISTS audit_buildings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    site_id UUID NOT NULL REFERENCES audit_sites(id) ON DELETE CASCADE,
    audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
    building_name TEXT NOT NULL,
    building_type TEXT NOT NULL,
    surface_terrain NUMERIC,
    surface_batie NUMERIC,
    surface_toiture NUMERIC,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Add RLS policies for audit_buildings
ALTER TABLE audit_buildings ENABLE ROW LEVEL SECURITY;

-- Users can read buildings for audits in organizations they belong to
CREATE POLICY "Users can read audit buildings"
    ON audit_buildings
    FOR SELECT
    USING (
        audit_id IN (
            SELECT a.id 
            FROM audits a
            INNER JOIN organization_users ou ON a.organization_id = ou.organization_id
            WHERE ou.user_id = auth.uid()
        )
    );

-- Users can insert buildings for audits in organizations they belong to
CREATE POLICY "Users can insert audit buildings"
    ON audit_buildings
    FOR INSERT
    WITH CHECK (
        audit_id IN (
            SELECT a.id 
            FROM audits a
            INNER JOIN organization_users ou ON a.organization_id = ou.organization_id
            WHERE ou.user_id = auth.uid()
        )
    );

-- Users can update buildings for audits in organizations they belong to
CREATE POLICY "Users can update audit buildings"
    ON audit_buildings
    FOR UPDATE
    USING (
        audit_id IN (
            SELECT a.id 
            FROM audits a
            INNER JOIN organization_users ou ON a.organization_id = ou.organization_id
            WHERE ou.user_id = auth.uid()
        )
    );

-- Users can delete buildings for audits in organizations they belong to
CREATE POLICY "Users can delete audit buildings"
    ON audit_buildings
    FOR DELETE
    USING (
        audit_id IN (
            SELECT a.id 
            FROM audits a
            INNER JOIN organization_users ou ON a.organization_id = ou.organization_id
            WHERE ou.user_id = auth.uid()
        )
    );

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_audit_buildings_site 
    ON audit_buildings(site_id);

CREATE INDEX IF NOT EXISTS idx_audit_buildings_audit 
    ON audit_buildings(audit_id);

-- Update trigger for updated_at
CREATE TRIGGER audit_buildings_updated_at
    BEFORE UPDATE ON audit_buildings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Create audit_tasks table
-- Stores task information for audits
CREATE TABLE IF NOT EXISTS audit_tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'todo' CHECK (status = ANY(ARRAY['todo'::text, 'in_progress'::text, 'done'::text, 'cancelled'::text])),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority = ANY(ARRAY['low'::text, 'medium'::text, 'high'::text])),
    assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    due_date TIMESTAMP WITHOUT TIME ZONE,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITHOUT TIME ZONE
);

-- Add RLS policies for audit_tasks
ALTER TABLE audit_tasks ENABLE ROW LEVEL SECURITY;

-- Users can read tasks for audits in organizations they belong to
CREATE POLICY "Users can read audit tasks"
    ON audit_tasks
    FOR SELECT
    USING (
        audit_id IN (
            SELECT a.id 
            FROM audits a
            INNER JOIN organization_users ou ON a.organization_id = ou.organization_id
            WHERE ou.user_id = auth.uid()
        )
    );

-- Users can insert tasks for audits in organizations they belong to
CREATE POLICY "Users can insert audit tasks"
    ON audit_tasks
    FOR INSERT
    WITH CHECK (
        audit_id IN (
            SELECT a.id 
            FROM audits a
            INNER JOIN organization_users ou ON a.organization_id = ou.organization_id
            WHERE ou.user_id = auth.uid()
        )
        AND created_by = auth.uid()
    );

-- Users can update tasks for audits in organizations they belong to
CREATE POLICY "Users can update audit tasks"
    ON audit_tasks
    FOR UPDATE
    USING (
        audit_id IN (
            SELECT a.id 
            FROM audits a
            INNER JOIN organization_users ou ON a.organization_id = ou.organization_id
            WHERE ou.user_id = auth.uid()
        )
    );

-- Users can delete tasks for audits in organizations they belong to
CREATE POLICY "Users can delete audit tasks"
    ON audit_tasks
    FOR DELETE
    USING (
        audit_id IN (
            SELECT a.id 
            FROM audits a
            INNER JOIN organization_users ou ON a.organization_id = ou.organization_id
            WHERE ou.user_id = auth.uid()
        )
    );

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_audit_tasks_audit 
    ON audit_tasks(audit_id);

CREATE INDEX IF NOT EXISTS idx_audit_tasks_assigned_to 
    ON audit_tasks(assigned_to);

CREATE INDEX IF NOT EXISTS idx_audit_tasks_created_by 
    ON audit_tasks(created_by);

CREATE INDEX IF NOT EXISTS idx_audit_tasks_status 
    ON audit_tasks(status);

CREATE INDEX IF NOT EXISTS idx_audit_tasks_priority 
    ON audit_tasks(priority);

-- Update trigger for updated_at
CREATE TRIGGER audit_tasks_updated_at
    BEFORE UPDATE ON audit_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Create audit_measurements table
-- Stores measurement data for audits
CREATE TABLE IF NOT EXISTS audit_measurements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
    building_id UUID REFERENCES audit_buildings(id) ON DELETE SET NULL,
    sensor_name TEXT NOT NULL,
    sensor_type TEXT NOT NULL,
    measurement_value NUMERIC,
    unit TEXT,
    recorded_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Add RLS policies for audit_measurements
ALTER TABLE audit_measurements ENABLE ROW LEVEL SECURITY;

-- Users can read measurements for audits in organizations they belong to
CREATE POLICY "Users can read audit measurements"
    ON audit_measurements
    FOR SELECT
    USING (
        audit_id IN (
            SELECT a.id 
            FROM audits a
            INNER JOIN organization_users ou ON a.organization_id = ou.organization_id
            WHERE ou.user_id = auth.uid()
        )
    );

-- Users can insert measurements for audits in organizations they belong to
CREATE POLICY "Users can insert audit measurements"
    ON audit_measurements
    FOR INSERT
    WITH CHECK (
        audit_id IN (
            SELECT a.id 
            FROM audits a
            INNER JOIN organization_users ou ON a.organization_id = ou.organization_id
            WHERE ou.user_id = auth.uid()
        )
        AND (recorded_by IS NULL OR recorded_by = auth.uid())
    );

-- Users can update measurements for audits in organizations they belong to
CREATE POLICY "Users can update audit measurements"
    ON audit_measurements
    FOR UPDATE
    USING (
        audit_id IN (
            SELECT a.id 
            FROM audits a
            INNER JOIN organization_users ou ON a.organization_id = ou.organization_id
            WHERE ou.user_id = auth.uid()
        )
    );

-- Users can delete measurements for audits in organizations they belong to
CREATE POLICY "Users can delete audit measurements"
    ON audit_measurements
    FOR DELETE
    USING (
        audit_id IN (
            SELECT a.id 
            FROM audits a
            INNER JOIN organization_users ou ON a.organization_id = ou.organization_id
            WHERE ou.user_id = auth.uid()
        )
    );

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_audit_measurements_audit 
    ON audit_measurements(audit_id);

CREATE INDEX IF NOT EXISTS idx_audit_measurements_building 
    ON audit_measurements(building_id);

CREATE INDEX IF NOT EXISTS idx_audit_measurements_recorded_by 
    ON audit_measurements(recorded_by);

CREATE INDEX IF NOT EXISTS idx_audit_measurements_recorded_at 
    ON audit_measurements(recorded_at);

-- Update trigger for updated_at
CREATE TRIGGER audit_measurements_updated_at
    BEFORE UPDATE ON audit_measurements
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Create audit_invoices table
-- Stores invoice data for audits
CREATE TABLE IF NOT EXISTS audit_invoices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    audit_id UUID REFERENCES audits(id) ON DELETE CASCADE,
    building_id UUID REFERENCES audit_buildings(id) ON DELETE SET NULL,
    file_name TEXT NOT NULL,
    file_url TEXT,
    uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    invoice_date DATE,
    amount NUMERIC,
    supplier TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status = ANY(ARRAY['pending'::text, 'processing'::text, 'verified'::text, 'rejected'::text])),
    confidence_score INTEGER DEFAULT 0,
    ocr_data JSONB DEFAULT '{}'::jsonb,
    notes TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE
);


-- Add RLS policies for audit_invoices
ALTER TABLE audit_invoices ENABLE ROW LEVEL SECURITY;

-- Users can read invoices for audits in organizations they belong to
CREATE POLICY "Users can read audit invoices"
    ON audit_invoices
    FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id 
            FROM organization_users 
            WHERE user_id = auth.uid()
        )
    );

-- Users can insert invoices for audits in organizations they belong to
CREATE POLICY "Users can insert audit invoices"
    ON audit_invoices
    FOR INSERT
    WITH CHECK (
        organization_id IN (
            SELECT organization_id 
            FROM organization_users 
            WHERE user_id = auth.uid()
        )
        AND uploaded_by = auth.uid()
    );

-- Users can update invoices for audits in organizations they belong to
CREATE POLICY "Users can update audit invoices"
    ON audit_invoices
    FOR UPDATE
    USING (
        organization_id IN (
            SELECT organization_id 
            FROM organization_users 
            WHERE user_id = auth.uid()
        )
    );

-- Users can delete invoices for audits in organizations they belong to
CREATE POLICY "Users can delete audit invoices"
    ON audit_invoices
    FOR DELETE
    USING (
        organization_id IN (
            SELECT organization_id 
            FROM organization_users 
            WHERE user_id = auth.uid()
        )
    );

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_audit_invoices_audit 
    ON audit_invoices(audit_id);

CREATE INDEX IF NOT EXISTS idx_audit_invoices_building 
    ON audit_invoices(building_id);

CREATE INDEX IF NOT EXISTS idx_audit_invoices_organization 
    ON audit_invoices(organization_id);

CREATE INDEX IF NOT EXISTS idx_audit_invoices_uploaded_by 
    ON audit_invoices(uploaded_by);

CREATE INDEX IF NOT EXISTS idx_audit_invoices_status 
    ON audit_invoices(status);

-- Update trigger for updated_at
CREATE TRIGGER audit_invoices_updated_at
    BEFORE UPDATE ON audit_invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Create audit_activity table
-- Stores activity logs for audits
CREATE TABLE IF NOT EXISTS audit_activity (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    action_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Add RLS policies for audit_activity
ALTER TABLE audit_activity ENABLE ROW LEVEL SECURITY;

-- Users can read activity logs for audits in organizations they belong to
CREATE POLICY "Users can read audit activity"
    ON audit_activity
    FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id 
            FROM organization_users 
            WHERE user_id = auth.uid()
        )
    );

-- Users can insert activity logs for audits in organizations they belong to
CREATE POLICY "Users can insert audit activity"
    ON audit_activity
    FOR INSERT
    WITH CHECK (
        organization_id IN (
            SELECT organization_id 
            FROM organization_users 
            WHERE user_id = auth.uid()
        )
        AND user_id = auth.uid()
    );

-- Users cannot update or delete activity logs (immutable audit trail)
-- No UPDATE or DELETE policies - activity logs are append-only

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_audit_activity_organization 
    ON audit_activity(organization_id);

CREATE INDEX IF NOT EXISTS idx_audit_activity_audit 
    ON audit_activity(audit_id);

CREATE INDEX IF NOT EXISTS idx_audit_activity_user 
    ON audit_activity(user_id);

CREATE INDEX IF NOT EXISTS idx_audit_activity_created_at 
    ON audit_activity(created_at);

CREATE INDEX IF NOT EXISTS idx_audit_activity_action_type 
    ON audit_activity(action_type);

-- Comments
COMMENT ON TABLE organizations IS 'Core organization table. Stores organization information including name, slug, description, and creator.';
COMMENT ON TABLE organization_users IS 'Junction table linking users to organizations with roles. Each user can belong to multiple organizations with different roles.';
COMMENT ON TABLE annotation_dictionaries IS 'Stores annotation dictionary configurations (fields and table templates) per organization. Supports multiple dictionaries per organization.';
COMMENT ON TABLE annotation_settings IS 'Stores annotation display settings per organization (show labels, selected dictionary).';
COMMENT ON TABLE organization_invitations IS 'Stores invitations for users to join organizations. Includes invitation codes, expiration dates, and acceptance tracking.';
COMMENT ON TABLE audits IS 'Stores audit information per organization. Includes status, dates, completion percentage, and JSONB fields for general info and personnel.';
COMMENT ON TABLE audit_sites IS 'Stores site information for audits. Includes name, address, coordinates, and status.';
COMMENT ON TABLE audit_buildings IS 'Stores building information for audit sites. Includes building name, type, and surface measurements.';
COMMENT ON TABLE audit_tasks IS 'Stores task information for audits. Includes title, description, status, priority, assignments, and due dates.';
COMMENT ON TABLE audit_measurements IS 'Stores measurement data for audits. Includes sensor information, measurement values, units, and recording details.';
COMMENT ON TABLE audit_invoices IS 'Stores invoice data for audits. Includes file information, OCR data, amounts, suppliers, and processing status.';
COMMENT ON TABLE audit_activity IS 'Stores activity logs for audits. Includes action types, titles, descriptions, and metadata. Immutable audit trail.';

-- Create generic audit for each organization
-- This audit is used to store invoices that are not linked to specific audits
-- Creates one generic audit per organization
INSERT INTO audits (organization_id, created_by, name, color, status)
SELECT 
    o.id,
    o.created_by,
    'Audit Générique',
    '#808080',
    'in_progress'
FROM organizations o
WHERE NOT EXISTS (
    SELECT 1 
    FROM audits a 
    WHERE a.organization_id = o.id 
    AND a.name = 'Audit Générique'
);
