-- supabase/migrations/013_seed_data.sql

-- =========================================================================
-- 1. Canonical Permissions Catalog Seeding
-- =========================================================================

INSERT INTO public.permissions (code, category, description) VALUES
    -- Tenancy & Structure
    ('tenant.manage_settings', 'Tenancy', 'Configure tenant name, branding, and global settings'),
    ('tenant.manage_contracts', 'Tenancy', 'Create, edit, and archive commercial contracts'),
    ('tenant.manage_sites', 'Tenancy', 'Create, edit, and decommission physical sites'),
    ('tenant.map_contract_sites', 'Tenancy', 'Bind or unbind sites to contracts'),
    
    -- Users & Scopes
    ('users.invite', 'Users', 'Invite new users into the tenant organisation'),
    ('users.manage_status', 'Users', 'Activate, suspend, or disable user profiles'),
    ('users.assign_roles', 'Users', 'Grant or revoke functional roles to users'),
    ('users.assign_scopes', 'Users', 'Grant or revoke contract and site scopes to users'),
    
    -- Tools & Versioning
    ('tools.create', 'Tools', 'Create draft data-gathering instruments'),
    ('tools.edit_draft', 'Tools', 'Modify sections, questions, and conditional rules of drafts'),
    ('tools.publish', 'Tools', 'Lock and publish an immutable tool version'),
    ('tools.archive', 'Tools', 'Archive an existing tool or version'),
    ('templates.export', 'Templates', 'Mark a tool version as an organisation or platform template'),
    ('templates.adopt', 'Templates', 'Instantiate a new independent tenant tool from a template'),
    
    -- Observations
    ('observations.create', 'Observations', 'Initiate and submit an observation within assigned scope'),
    ('observations.read_own', 'Observations', 'View observations submitted by oneself'),
    ('observations.read_scoped', 'Observations', 'View observations submitted by any user within assigned contracts/sites'),
    ('observations.read_all', 'Observations', 'View all observations across the entire tenant'),
    ('observations.edit_in_progress', 'Observations', 'Edit an unfinalized observation draft'),
    ('observations.flag', 'Observations', 'Flag an observation for safety review or escalation'),
    ('observations.delete', 'Observations', 'Soft delete an observation record (restricted to tenant admins)'),
    
    -- Analytics & Audit
    ('reports.view', 'Reporting', 'View aggregate metric dashboards'),
    ('reports.export', 'Reporting', 'Export raw observation data (CSV, PDF, Excel)'),
    ('audit.read', 'Reporting', 'Inspect immutable audit logs')
ON CONFLICT (code) DO NOTHING;


-- =========================================================================
-- 2. System Global Canonical Roles
-- =========================================================================

INSERT INTO public.roles (tenant_id, code, name, description, is_system) VALUES
    (NULL, 'tenant_admin', 'Tenant Administrator', 'Complete governance of a single tenant organisation', true),
    (NULL, 'contract_manager', 'Contract Manager', 'Oversees operations across designated commercial contracts', true),
    (NULL, 'site_manager', 'Site Manager', 'Oversees operations at designated physical sites', true),
    (NULL, 'observer', 'Observer', 'Completes and submits observations on the shopfloor', true),
    (NULL, 'viewer', 'Viewer / Auditor', 'Read-only compliance, audit, and reporting access', true)
ON CONFLICT (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), code) DO NOTHING;


-- =========================================================================
-- 3. System Global Role-Permission Bindings
-- =========================================================================

-- Helper block to bind default permissions to system roles
DO $$
DECLARE
    v_admin_role_id UUID;
    v_contract_mgr_role_id UUID;
    v_site_mgr_role_id UUID;
    v_observer_role_id UUID;
    v_viewer_role_id UUID;
    
    v_perm_rec RECORD;
BEGIN
    -- Retrieve role IDs
    SELECT id INTO v_admin_role_id FROM public.roles WHERE tenant_id IS NULL AND code = 'tenant_admin';
    SELECT id INTO v_contract_mgr_role_id FROM public.roles WHERE tenant_id IS NULL AND code = 'contract_manager';
    SELECT id INTO v_site_mgr_role_id FROM public.roles WHERE tenant_id IS NULL AND code = 'site_manager';
    SELECT id INTO v_observer_role_id FROM public.roles WHERE tenant_id IS NULL AND code = 'observer';
    SELECT id INTO v_viewer_role_id FROM public.roles WHERE tenant_id IS NULL AND code = 'viewer';

    -- A. Tenant Admin receives ALL permissions
    FOR v_perm_rec IN SELECT id FROM public.permissions LOOP
        INSERT INTO public.role_permissions (role_id, permission_id)
        VALUES (v_admin_role_id, v_perm_rec.id)
        ON CONFLICT (role_id, permission_id) DO NOTHING;
    END LOOP;

    -- B. Contract Manager Permissions
    FOR v_perm_rec IN SELECT id, code FROM public.permissions WHERE code IN (
        'observations.read_scoped',
        'observations.flag',
        'reports.view',
        'reports.export'
    ) LOOP
        INSERT INTO public.role_permissions (role_id, permission_id)
        VALUES (v_contract_mgr_role_id, v_perm_rec.id)
        ON CONFLICT (role_id, permission_id) DO NOTHING;
    END LOOP;

    -- C. Site Manager Permissions
    FOR v_perm_rec IN SELECT id, code FROM public.permissions WHERE code IN (
        'observations.read_scoped',
        'observations.flag',
        'reports.view'
    ) LOOP
        INSERT INTO public.role_permissions (role_id, permission_id)
        VALUES (v_site_mgr_role_id, v_perm_rec.id)
        ON CONFLICT (role_id, permission_id) DO NOTHING;
    END LOOP;

    -- D. Observer Permissions
    FOR v_perm_rec IN SELECT id, code FROM public.permissions WHERE code IN (
        'observations.create',
        'observations.read_own',
        'observations.edit_in_progress'
    ) LOOP
        INSERT INTO public.role_permissions (role_id, permission_id)
        VALUES (v_observer_role_id, v_perm_rec.id)
        ON CONFLICT (role_id, permission_id) DO NOTHING;
    END LOOP;

    -- E. Viewer / Auditor Permissions
    FOR v_perm_rec IN SELECT id, code FROM public.permissions WHERE code IN (
        'observations.read_scoped',
        'reports.view',
        'reports.export'
    ) LOOP
        INSERT INTO public.role_permissions (role_id, permission_id)
        VALUES (v_viewer_role_id, v_perm_rec.id)
        ON CONFLICT (role_id, permission_id) DO NOTHING;
    END LOOP;

END $$;
