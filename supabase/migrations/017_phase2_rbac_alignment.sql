-- supabase/migrations/017_phase2_rbac_alignment.sql

-- =========================================================================
-- 1. ALIGN PROFILE UPDATE TRIGGER AUTHORIZATION TO PERMISSIONS (users.manage_status)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.harden_profile_update()
RETURNS TRIGGER AS $$
DECLARE
    v_caller_id UUID;
    v_caller_is_platform_admin BOOLEAN := FALSE;
    v_caller_has_manage_status BOOLEAN := FALSE;
    v_caller_tenant_id UUID;
BEGIN
    v_caller_id := auth.uid();
    
    -- If the update is performed by database system/service-role (no authenticated user session), allow it
    IF v_caller_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Look up if the active caller is a platform administrator and get their tenant
    SELECT is_platform_admin, tenant_id INTO v_caller_is_platform_admin, v_caller_tenant_id
    FROM public.profiles
    WHERE id = v_caller_id;

    -- Check if active caller possesses the "users.manage_status" permission (permission-driven lookup)
    v_caller_has_manage_status := public.has_permission('users.manage_status');

    -- A. Prevent unauthorised platform admin promotion/escalation (only platform admins can modify this flag)
    IF NEW.is_platform_admin IS DISTINCT FROM OLD.is_platform_admin THEN
        IF NOT COALESCE(v_caller_is_platform_admin, FALSE) THEN
            RAISE EXCEPTION 'Security Exception: Only Platform Administrators can modify platform admin privilege.';
        END IF;
    END IF;

    -- B. Prevent unauthorised movement of users between tenants (tenant_id is frozen for normal/tenant users)
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
        IF NOT COALESCE(v_caller_is_platform_admin, FALSE) THEN
            RAISE EXCEPTION 'Security Exception: tenant_id cannot be modified.';
        END IF;
    END IF;

    -- C. Prevent self-modification of status (activation/suspension) or other restricted fields by normal/tenant users
    IF v_caller_id = OLD.id AND NOT COALESCE(v_caller_is_platform_admin, FALSE) THEN
        -- Prevent self-modification of status (activation/suspension)
        IF NEW.status IS DISTINCT FROM OLD.status THEN
            RAISE EXCEPTION 'Security Exception: Normal users cannot modify their own status.';
        END IF;
        
        -- Prevent self-modification of invited_by/invited_at
        IF NEW.invited_by IS DISTINCT FROM OLD.invited_by OR NEW.invited_at IS DISTINCT FROM OLD.invited_at THEN
            RAISE EXCEPTION 'Security Exception: Normal users cannot modify invitation metadata.';
        END IF;

        -- Prevent self-modification of deleted_at
        IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
            RAISE EXCEPTION 'Security Exception: Normal users cannot modify deletion metadata.';
        END IF;
    END IF;

    -- D. For profile updates targeting OTHER users, require permission-driven checks instead of literal role name matching
    IF v_caller_id IS DISTINCT FROM OLD.id THEN
        IF NOT COALESCE(v_caller_is_platform_admin, FALSE) THEN
            -- Require users.manage_status AND that the caller belongs to the same tenant as the target profile
            IF NOT v_caller_has_manage_status OR v_caller_tenant_id IS DISTINCT FROM OLD.tenant_id THEN
                RAISE EXCEPTION 'Security Exception: You do not have permission to modify this profile.';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp;

-- Drop and recreate the trigger to ensure registration
DROP TRIGGER IF EXISTS tr_harden_profile_update ON public.profiles;
CREATE TRIGGER tr_harden_profile_update
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.harden_profile_update();


-- =========================================================================
-- 2. ALIGN USER_ROLES RLS POLICIES TO users.assign_roles PERMISSION
-- =========================================================================

DROP POLICY IF EXISTS insert_user_roles ON public.user_roles;
CREATE POLICY insert_user_roles ON public.user_roles
    FOR INSERT TO authenticated
    WITH CHECK (
        (tenant_id = public.current_tenant_id() AND public.has_permission('users.assign_roles')) OR
        public.has_permission('platform.manage')
    );

DROP POLICY IF EXISTS update_user_roles ON public.user_roles;
CREATE POLICY update_user_roles ON public.user_roles
    FOR UPDATE TO authenticated
    USING (tenant_id = public.current_tenant_id() OR public.has_permission('platform.manage'))
    WITH CHECK (
        (tenant_id = public.current_tenant_id() AND public.has_permission('users.assign_roles')) OR
        public.has_permission('platform.manage')
    );


-- =========================================================================
-- 3. ALIGN USER_CONTRACTS RLS POLICIES TO users.assign_scopes PERMISSION
-- =========================================================================

DROP POLICY IF EXISTS insert_user_contracts ON public.user_contracts;
CREATE POLICY insert_user_contracts ON public.user_contracts
    FOR INSERT TO authenticated
    WITH CHECK (
        (tenant_id = public.current_tenant_id() AND public.has_permission('users.assign_scopes')) OR
        public.has_permission('platform.manage')
    );

DROP POLICY IF EXISTS update_user_contracts ON public.user_contracts;
CREATE POLICY update_user_contracts ON public.user_contracts
    FOR UPDATE TO authenticated
    USING (tenant_id = public.current_tenant_id() OR public.has_permission('platform.manage'))
    WITH CHECK (
        (tenant_id = public.current_tenant_id() AND public.has_permission('users.assign_scopes')) OR
        public.has_permission('platform.manage')
    );


-- =========================================================================
-- 4. ALIGN USER_SITES RLS POLICIES TO users.assign_scopes PERMISSION
-- =========================================================================

DROP POLICY IF EXISTS insert_user_sites ON public.user_sites;
CREATE POLICY insert_user_sites ON public.user_sites
    FOR INSERT TO authenticated
    WITH CHECK (
        (tenant_id = public.current_tenant_id() AND public.has_permission('users.assign_scopes')) OR
        public.has_permission('platform.manage')
    );

DROP POLICY IF EXISTS update_user_sites ON public.user_sites;
CREATE POLICY update_user_sites ON public.user_sites
    FOR UPDATE TO authenticated
    USING (tenant_id = public.current_tenant_id() OR public.has_permission('platform.manage'))
    WITH CHECK (
        (tenant_id = public.current_tenant_id() AND public.has_permission('users.assign_scopes')) OR
        public.has_permission('platform.manage')
    );
