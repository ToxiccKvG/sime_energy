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
CREATE OR REPLACE FUNCTION update_annotation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER annotation_dictionaries_updated_at
    BEFORE UPDATE ON annotation_dictionaries
    FOR EACH ROW
    EXECUTE FUNCTION update_annotation_updated_at();

CREATE TRIGGER annotation_settings_updated_at
    BEFORE UPDATE ON annotation_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_annotation_updated_at();

-- Comments
COMMENT ON TABLE annotation_dictionaries IS 'Stores annotation dictionary configurations (fields and table templates) per organization. Supports multiple dictionaries per organization.';
COMMENT ON TABLE annotation_settings IS 'Stores annotation display settings per organization (show labels, selected dictionary).';
