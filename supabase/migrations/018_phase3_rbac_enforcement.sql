-- supabase/migrations/018_phase3_rbac_enforcement.sql

-- =========================================================================
-- 1. HARDEN ROLES MANAGEMENT: TRIGGER FOR public.roles
-- =========================================================================

CREATE OR REPLACE FUNCTION public.harden_roles_management()
RETURNS TRIGGER AS $$
DECLARE
    v_caller_id UUID;
    v_caller_is_platform_admin BOOLEAN := FALSE;
    v_caller_tenant_id UUID;
BEGIN
    v_caller_id := auth.uid();
    
    -- If no authenticated session (internal DB seed/service-role), allow
    IF v_caller_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Look up caller details
    SELECT is_platform_admin, tenant_id INTO v_caller_is_platform_admin, v_caller_tenant_id
    FROM public.profiles
    WHERE id = v_caller_id;

    -- If caller is a platform admin, allow all operations
    IF COALESCE(v_caller_is_platform_admin, FALSE) THEN
        RETURN NEW;
    END IF;

    -- Check permission
    IF NOT public.has_permission('users.assign_roles') AND NOT public.has_permission('tenant.manage_settings') THEN
        RAISE EXCEPTION 'Security Exception: Insufficient permissions to modify roles.';
    END IF;

    -- Otherwise, normal tenant users are restricted:
    IF TG_OP = 'INSERT' THEN
        -- Force the tenant_id to be the user's tenant
        IF NEW.tenant_id IS DISTINCT FROM v_caller_tenant_id THEN
            RAISE EXCEPTION 'Security Exception: Cannot create roles for another tenant.';
        END IF;
        
        -- Cannot create a system role (tenant_id cannot be null, is_system must be false)
        IF NEW.tenant_id IS NULL THEN
            RAISE EXCEPTION 'Security Exception: Cannot create system roles.';
        END IF;
        
        IF NEW.is_system IS TRUE THEN
            RAISE EXCEPTION 'Security Exception: Only platform administrators can define system roles.';
        END IF;

    ELSIF TG_OP = 'UPDATE' THEN
        -- Prevent modifying the tenant_id
        IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
            RAISE EXCEPTION 'Security Exception: Cannot modify tenant association of a role.';
        END IF;
        
        -- Ensure target role belongs to caller's tenant
        IF OLD.tenant_id IS DISTINCT FROM v_caller_tenant_id OR OLD.tenant_id IS NULL THEN
            RAISE EXCEPTION 'Security Exception: Cannot modify system or other tenant roles.';
        END IF;
        
        -- Prevent elevating role to system
        IF NEW.is_system IS TRUE AND OLD.is_system IS FALSE THEN
            RAISE EXCEPTION 'Security Exception: Only platform administrators can define system roles.';
        END IF;

    ELSIF TG_OP = 'DELETE' THEN
        -- Ensure target role belongs to caller's tenant and is not system
        IF OLD.tenant_id IS DISTINCT FROM v_caller_tenant_id OR OLD.tenant_id IS NULL OR OLD.is_system IS TRUE THEN
            RAISE EXCEPTION 'Security Exception: Cannot delete system or other tenant roles.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp;

DROP TRIGGER IF EXISTS tr_harden_roles_management ON public.roles;
CREATE TRIGGER tr_harden_roles_management
    BEFORE INSERT OR UPDATE OR DELETE ON public.roles
    FOR EACH ROW
    EXECUTE FUNCTION public.harden_roles_management();


-- =========================================================================
-- 2. HARDEN ROLE PERMISSIONS ASSIGNMENT: TRIGGER FOR public.role_permissions
-- =========================================================================

CREATE OR REPLACE FUNCTION public.harden_role_permissions_management()
RETURNS TRIGGER AS $$
DECLARE
    v_caller_id UUID;
    v_caller_is_platform_admin BOOLEAN := FALSE;
    v_caller_tenant_id UUID;
    v_target_role_tenant_id UUID;
    v_target_role_is_system BOOLEAN;
BEGIN
    v_caller_id := auth.uid();
    
    -- If no authenticated session (internal DB seed/service-role), allow
    IF v_caller_id IS NULL THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        ELSE
            RETURN NEW;
        END IF;
    END IF;

    -- Look up caller details
    SELECT is_platform_admin, tenant_id INTO v_caller_is_platform_admin, v_caller_tenant_id
    FROM public.profiles
    WHERE id = v_caller_id;

    -- If caller is a platform admin, allow all operations
    IF COALESCE(v_caller_is_platform_admin, FALSE) THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        ELSE
            RETURN NEW;
        END IF;
    END IF;

    -- Otherwise, normal tenant users require tenant.manage_settings permission
    IF NOT public.has_permission('tenant.manage_settings') AND NOT public.has_permission('users.assign_roles') THEN
        RAISE EXCEPTION 'Security Exception: Insufficient permissions to modify role permissions.';
    END IF;

    -- Determine the target role's tenant_id and system status
    SELECT tenant_id, is_system INTO v_target_role_tenant_id, v_target_role_is_system
    FROM public.roles
    WHERE id = COALESCE(NEW.role_id, OLD.role_id);

    -- Ensure we don't manipulate system roles or roles belonging to other tenants
    IF v_target_role_tenant_id IS NULL OR v_target_role_is_system IS TRUE THEN
        RAISE EXCEPTION 'Security Exception: Cannot modify permissions of system roles.';
    END IF;

    IF v_target_role_tenant_id IS DISTINCT FROM v_caller_tenant_id THEN
        RAISE EXCEPTION 'Security Exception: Cannot modify roles belonging to another tenant.';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp;

DROP TRIGGER IF EXISTS tr_harden_role_permissions_management ON public.role_permissions;
CREATE TRIGGER tr_harden_role_permissions_management
    BEFORE INSERT OR UPDATE OR DELETE ON public.role_permissions
    FOR EACH ROW
    EXECUTE FUNCTION public.harden_role_permissions_management();


-- =========================================================================
-- 3. HARDEN USER ROLE ASSIGNMENT: TRIGGER FOR public.user_roles
-- =========================================================================

CREATE OR REPLACE FUNCTION public.harden_user_roles_assignment()
RETURNS TRIGGER AS $$
DECLARE
    v_caller_id UUID;
    v_caller_is_platform_admin BOOLEAN := FALSE;
    v_caller_tenant_id UUID;
    v_role_tenant_id UUID;
    v_user_tenant_id UUID;
BEGIN
    v_caller_id := auth.uid();
    
    -- If no authenticated session, allow
    IF v_caller_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Look up caller details
    SELECT is_platform_admin, tenant_id INTO v_caller_is_platform_admin, v_caller_tenant_id
    FROM public.profiles
    WHERE id = v_caller_id;

    -- If platform admin, bypass checks
    IF COALESCE(v_caller_is_platform_admin, FALSE) THEN
        RETURN NEW;
    END IF;

    -- ALLOW bootstrapping: if user has no roles, they can be assigned the 'tenant_admin' role
    -- Check if user has no roles assigned
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_caller_id) THEN
        -- Verify it is the tenant_admin role
        IF EXISTS (SELECT 1 FROM public.roles WHERE id = NEW.role_id AND code = 'tenant_admin') THEN
            RETURN NEW;
        END IF;
    END IF;

    -- Ensure caller has users.assign_roles permission
    IF NOT public.has_permission('users.assign_roles') THEN
        RAISE EXCEPTION 'Security Exception: Insufficient permissions to assign user roles.';
    END IF;

    -- Ensure the user_roles assignment is bound to the caller's tenant
    IF NEW.tenant_id IS DISTINCT FROM v_caller_tenant_id THEN
        RAISE EXCEPTION 'Security Exception: Cannot assign roles under another tenant context.';
    END IF;

    -- Ensure the target user belongs to the same tenant (failsafe alongside FK)
    SELECT tenant_id INTO v_user_tenant_id FROM public.profiles WHERE id = NEW.user_id;
    IF v_user_tenant_id IS DISTINCT FROM v_caller_tenant_id THEN
        RAISE EXCEPTION 'Security Exception: Target user must belong to your tenant.';
    END IF;

    -- Prevent self-role-assignment / self-elevation
    IF NEW.user_id = v_caller_id THEN
        RAISE EXCEPTION 'Security Exception: Self-role assignment or self-elevation is forbidden.';
    END IF;

    -- Verify that the role exists and belongs to either the same tenant or is a global system role (tenant_id is null)
    SELECT tenant_id INTO v_role_tenant_id FROM public.roles WHERE id = NEW.role_id;
    IF v_role_tenant_id IS NOT NULL AND v_role_tenant_id IS DISTINCT FROM v_caller_tenant_id THEN
        RAISE EXCEPTION 'Security Exception: Target role does not belong to your tenant.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp;

DROP TRIGGER IF EXISTS tr_harden_user_roles_assignment ON public.user_roles;
CREATE TRIGGER tr_harden_user_roles_assignment
    BEFORE INSERT OR UPDATE ON public.user_roles
    FOR EACH ROW
    EXECUTE FUNCTION public.harden_user_roles_assignment();


-- =========================================================================
-- 4. HARDEN USER CONTRACTS AND SITES SCOPE ASSIGNMENTS
-- =========================================================================

-- Contracts Scope TRIGGER
CREATE OR REPLACE FUNCTION public.harden_user_contracts_assignment()
RETURNS TRIGGER AS $$
DECLARE
    v_caller_id UUID;
    v_caller_is_platform_admin BOOLEAN := FALSE;
    v_caller_tenant_id UUID;
    v_contract_tenant_id UUID;
    v_user_tenant_id UUID;
BEGIN
    v_caller_id := auth.uid();
    
    -- If no authenticated session, allow
    IF v_caller_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Look up caller details
    SELECT is_platform_admin, tenant_id INTO v_caller_is_platform_admin, v_caller_tenant_id
    FROM public.profiles
    WHERE id = v_caller_id;

    -- If platform admin, bypass checks
    IF COALESCE(v_caller_is_platform_admin, FALSE) THEN
        RETURN NEW;
    END IF;

    -- Ensure caller has users.assign_scopes permission
    IF NOT public.has_permission('users.assign_scopes') THEN
        RAISE EXCEPTION 'Security Exception: Insufficient permissions to assign contract scope.';
    END IF;

    -- Ensure the scope assignment is bound to the caller's tenant
    IF NEW.tenant_id IS DISTINCT FROM v_caller_tenant_id THEN
        RAISE EXCEPTION 'Security Exception: Cannot assign scopes under another tenant context.';
    END IF;

    -- Ensure target user belongs to caller's tenant
    SELECT tenant_id INTO v_user_tenant_id FROM public.profiles WHERE id = NEW.user_id;
    IF v_user_tenant_id IS DISTINCT FROM v_caller_tenant_id THEN
        RAISE EXCEPTION 'Security Exception: Target user must belong to your tenant.';
    END IF;

    -- Verify that the contract belongs to the same tenant
    SELECT tenant_id INTO v_contract_tenant_id FROM public.contracts WHERE id = NEW.contract_id;
    IF v_contract_tenant_id IS DISTINCT FROM v_caller_tenant_id THEN
        RAISE EXCEPTION 'Security Exception: Target contract must belong to your tenant.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp;

DROP TRIGGER IF EXISTS tr_harden_user_contracts_assignment ON public.user_contracts;
CREATE TRIGGER tr_harden_user_contracts_assignment
    BEFORE INSERT OR UPDATE ON public.user_contracts
    FOR EACH ROW
    EXECUTE FUNCTION public.harden_user_contracts_assignment();


-- Sites Scope TRIGGER
CREATE OR REPLACE FUNCTION public.harden_user_sites_assignment()
RETURNS TRIGGER AS $$
DECLARE
    v_caller_id UUID;
    v_caller_is_platform_admin BOOLEAN := FALSE;
    v_caller_tenant_id UUID;
    v_site_tenant_id UUID;
    v_user_tenant_id UUID;
BEGIN
    v_caller_id := auth.uid();
    
    -- If no authenticated session, allow
    IF v_caller_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Look up caller details
    SELECT is_platform_admin, tenant_id INTO v_caller_is_platform_admin, v_caller_tenant_id
    FROM public.profiles
    WHERE id = v_caller_id;

    -- If platform admin, bypass checks
    IF COALESCE(v_caller_is_platform_admin, FALSE) THEN
        RETURN NEW;
    END IF;

    -- Ensure caller has users.assign_scopes permission
    IF NOT public.has_permission('users.assign_scopes') THEN
        RAISE EXCEPTION 'Security Exception: Insufficient permissions to assign site scope.';
    END IF;

    -- Ensure the scope assignment is bound to the caller's tenant
    IF NEW.tenant_id IS DISTINCT FROM v_caller_tenant_id THEN
        RAISE EXCEPTION 'Security Exception: Cannot assign scopes under another tenant context.';
    END IF;

    -- Ensure target user belongs to caller's tenant
    SELECT tenant_id INTO v_user_tenant_id FROM public.profiles WHERE id = NEW.user_id;
    IF v_user_tenant_id IS DISTINCT FROM v_caller_tenant_id THEN
        RAISE EXCEPTION 'Security Exception: Target user must belong to your tenant.';
    END IF;

    -- Verify that the site belongs to the same tenant
    SELECT tenant_id INTO v_site_tenant_id FROM public.sites WHERE id = NEW.site_id;
    IF v_site_tenant_id IS DISTINCT FROM v_caller_tenant_id THEN
        RAISE EXCEPTION 'Security Exception: Target site must belong to your tenant.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp;

DROP TRIGGER IF EXISTS tr_harden_user_sites_assignment ON public.user_sites;
CREATE TRIGGER tr_harden_user_sites_assignment
    BEFORE INSERT OR UPDATE ON public.user_sites
    FOR EACH ROW
    EXECUTE FUNCTION public.harden_user_sites_assignment();


-- =========================================================================
-- 5. REUSABLE USER AUTHORIZATION STATE ENDPOINT
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_user_authorization_state()
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_is_platform_admin BOOLEAN := FALSE;
    v_roles JSONB := '[]'::jsonb;
    v_permissions JSONB := '[]'::jsonb;
    v_contracts JSONB := '[]'::jsonb;
    v_sites JSONB := '[]'::jsonb;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'is_platform_admin', false,
            'roles', '[]'::jsonb,
            'permissions', '[]'::jsonb,
            'contracts', '[]'::jsonb,
            'sites', '[]'::jsonb
        );
    END IF;

    -- 1. Check platform admin status
    SELECT is_platform_admin INTO v_is_platform_admin FROM public.profiles WHERE id = v_user_id AND deleted_at IS NULL;

    -- 2. Get roles (including role codes and names)
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', r.id, 'code', r.code, 'name', r.name)), '[]'::jsonb)
    INTO v_roles
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = v_user_id;

    -- 3. Get distinct effective permissions (or ALL permissions for platform admins)
    IF v_is_platform_admin IS TRUE THEN
        SELECT COALESCE(jsonb_agg(code), '[]'::jsonb) INTO v_permissions FROM public.permissions;
    ELSE
        SELECT COALESCE(jsonb_agg(DISTINCT p.code), '[]'::jsonb)
        INTO v_permissions
        FROM public.user_roles ur
        JOIN public.role_permissions rp ON rp.role_id = ur.role_id
        JOIN public.permissions p ON p.id = rp.permission_id
        WHERE ur.user_id = v_user_id;
    END IF;

    -- 4. Get assigned contracts (UUID strings)
    SELECT COALESCE(jsonb_agg(contract_id), '[]'::jsonb) INTO v_contracts FROM public.user_contracts WHERE user_id = v_user_id;

    -- 5. Get assigned sites (UUID strings)
    SELECT COALESCE(jsonb_agg(site_id), '[]'::jsonb) INTO v_sites FROM public.user_sites WHERE user_id = v_user_id;

    RETURN jsonb_build_object(
        'is_platform_admin', COALESCE(v_is_platform_admin, FALSE),
        'roles', v_roles,
        'permissions', v_permissions,
        'contracts', v_contracts,
        'sites', v_sites
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp;


-- =========================================================================
-- 6. AUTOMATED RBAC AND SCOPE AUDIT LOGGING TRIGGERS
-- =========================================================================

CREATE OR REPLACE FUNCTION public.audit_rbac_changes()
RETURNS TRIGGER AS $$
DECLARE
    v_tenant_id UUID;
    v_user_id UUID;
    v_action TEXT;
    v_target_type TEXT;
    v_target_id UUID;
    v_payload_before JSONB := NULL;
    v_payload_after JSONB := NULL;
BEGIN
    v_user_id := auth.uid();
    v_target_type := TG_TABLE_NAME;

    IF TG_OP = 'INSERT' THEN
        v_tenant_id := NEW.tenant_id;
        v_target_id := NEW.id;
        v_action := 'CREATE';
        v_payload_after := to_jsonb(NEW);
    ELSIF TG_OP = 'UPDATE' THEN
        v_tenant_id := NEW.tenant_id;
        v_target_id := NEW.id;
        v_action := 'UPDATE';
        v_payload_before := to_jsonb(OLD);
        v_payload_after := to_jsonb(NEW);
    ELSIF TG_OP = 'DELETE' THEN
        v_tenant_id := OLD.tenant_id;
        v_target_id := OLD.id;
        v_action := 'DELETE';
        v_payload_before := to_jsonb(OLD);
    END IF;

    -- Special handling for profiles status modifications
    IF TG_TABLE_NAME = 'profiles' THEN
        IF TG_OP = 'UPDATE' THEN
            IF NEW.status IS DISTINCT FROM OLD.status THEN
                v_action := 'STATUS_CHANGE';
                v_target_id := NEW.id;
                v_tenant_id := NEW.tenant_id;
            ELSE
                -- Ignore regular name/phone/avatar edits
                RETURN NEW;
            END IF;
        ELSE
            RETURN NEW;
        END IF;
    END IF;

    -- Fallback for tenant_id lookup
    IF v_tenant_id IS NULL THEN
        v_tenant_id := public.current_tenant_id();
    END IF;

    -- Avoid writing audit logs without a valid tenant boundary
    IF v_tenant_id IS NOT NULL THEN
        INSERT INTO public.audit_logs (
            tenant_id,
            user_id,
            action,
            target_type,
            target_id,
            payload_before,
            payload_after
        ) VALUES (
            v_tenant_id,
            v_user_id,
            v_action || '_' || upper(TG_TABLE_NAME),
            v_target_type,
            v_target_id,
            v_payload_before,
            v_payload_after
        );
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp;

-- Bind audit trigger to RBAC tables
DROP TRIGGER IF EXISTS tr_audit_roles ON public.roles;
CREATE TRIGGER tr_audit_roles AFTER INSERT OR UPDATE OR DELETE ON public.roles
    FOR EACH ROW EXECUTE FUNCTION public.audit_rbac_changes();

DROP TRIGGER IF EXISTS tr_audit_role_permissions ON public.role_permissions;
CREATE TRIGGER tr_audit_role_permissions AFTER INSERT OR UPDATE OR DELETE ON public.role_permissions
    FOR EACH ROW EXECUTE FUNCTION public.audit_rbac_changes();

DROP TRIGGER IF EXISTS tr_audit_user_roles ON public.user_roles;
CREATE TRIGGER tr_audit_user_roles AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
    FOR EACH ROW EXECUTE FUNCTION public.audit_rbac_changes();

DROP TRIGGER IF EXISTS tr_audit_user_contracts ON public.user_contracts;
CREATE TRIGGER tr_audit_user_contracts AFTER INSERT OR UPDATE OR DELETE ON public.user_contracts
    FOR EACH ROW EXECUTE FUNCTION public.audit_rbac_changes();

DROP TRIGGER IF EXISTS tr_audit_user_sites ON public.user_sites;
CREATE TRIGGER tr_audit_user_sites AFTER INSERT OR UPDATE OR DELETE ON public.user_sites
    FOR EACH ROW EXECUTE FUNCTION public.audit_rbac_changes();

DROP TRIGGER IF EXISTS tr_audit_profiles_status ON public.profiles;
CREATE TRIGGER tr_audit_profiles_status AFTER UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.audit_rbac_changes();


