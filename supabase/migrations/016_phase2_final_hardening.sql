-- supabase/migrations/016_phase2_final_hardening.sql

-- =========================================================================
-- 1. HARDEN PROFILE SELF-UPDATE VIA BEFORE UPDATE TRIGGER
-- =========================================================================

CREATE OR REPLACE FUNCTION public.harden_profile_update()
RETURNS TRIGGER AS $$
DECLARE
    v_caller_id UUID;
    v_caller_is_platform_admin BOOLEAN := FALSE;
    v_caller_is_tenant_admin BOOLEAN := FALSE;
BEGIN
    v_caller_id := auth.uid();
    
    -- If the update is performed by database system/service-role (no authenticated user session), allow it
    IF v_caller_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Look up if the active caller is a platform administrator
    SELECT is_platform_admin INTO v_caller_is_platform_admin
    FROM public.profiles
    WHERE id = v_caller_id;

    -- Check if active caller is a tenant administrator in the same tenant
    IF EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = v_caller_id 
          AND r.code = 'tenant_admin' 
          AND ur.tenant_id = OLD.tenant_id
    ) THEN
        v_caller_is_tenant_admin := TRUE;
    END IF;

    -- A. Prevent unauthorised platform admin promotion/escalation
    IF NEW.is_platform_admin IS DISTINCT FROM OLD.is_platform_admin THEN
        IF NOT COALESCE(v_caller_is_platform_admin, FALSE) THEN
            RAISE EXCEPTION 'Security Exception: Only Platform Administrators can modify platform admin privilege.';
        END IF;
    END IF;

    -- B. Prevent unauthorised movement of users between tenants (tenant_id is frozen)
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
        IF NOT COALESCE(v_caller_is_platform_admin, FALSE) THEN
            RAISE EXCEPTION 'Security Exception: tenant_id cannot be modified.';
        END IF;
    END IF;

    -- C. Prevent normal users from updating their own status, invitation, or deletion fields
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

    -- D. For any profile updates targeting OTHER users, require tenant_admin or platform_admin rights
    IF v_caller_id IS DISTINCT FROM OLD.id THEN
        IF NOT COALESCE(v_caller_is_platform_admin, FALSE) AND NOT COALESCE(v_caller_is_tenant_admin, FALSE) THEN
            RAISE EXCEPTION 'Security Exception: You do not have permission to modify this profile.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp;

DROP TRIGGER IF EXISTS tr_harden_profile_update ON public.profiles;
CREATE TRIGGER tr_harden_profile_update
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.harden_profile_update();


-- =========================================================================
-- 2. HARDEN USER ROLE TENANT INTEGRITY VIA BEFORE INSERT OR UPDATE TRIGGER
-- =========================================================================

CREATE OR REPLACE FUNCTION public.harden_user_role_integrity()
RETURNS TRIGGER AS $$
DECLARE
    v_role_tenant_id UUID;
BEGIN
    -- Look up the tenant ID of the assigned role
    SELECT tenant_id INTO v_role_tenant_id
    FROM public.roles
    WHERE id = NEW.role_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Security Exception: Assigned role does not exist.';
    END IF;

    -- INVARIANT: Tenant-specific roles can ONLY be assigned within their own tenant
    IF v_role_tenant_id IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM v_role_tenant_id THEN
        RAISE EXCEPTION 'Security Exception: Tenant-specific role belongs to organisation %, cannot be assigned to user in organisation %.', v_role_tenant_id, NEW.tenant_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp;

DROP TRIGGER IF EXISTS tr_harden_user_role_integrity ON public.user_roles;
CREATE TRIGGER tr_harden_user_role_integrity
    BEFORE INSERT OR UPDATE ON public.user_roles
    FOR EACH ROW
    EXECUTE FUNCTION public.harden_user_role_integrity();


-- =========================================================================
-- 3. HARDEN AUDIT LOG INSERTS (DISABLE CLIENT DIRECT INSERTS)
-- =========================================================================

-- Dropping client-side insertion policy completely forces audit logging to occur
-- only via server-side edge functions (with service role privileges) or triggers.
DROP POLICY IF EXISTS insert_audit_logs ON public.audit_logs;


-- =========================================================================
-- 4. HARDEN RELATIVE CHILD TABLE RLS WITH CHECK ENFORCEMENTS
-- =========================================================================

-- profiles
DROP POLICY IF EXISTS insert_profiles ON public.profiles;
CREATE POLICY insert_profiles ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (
        id = auth.uid() OR 
        public.has_permission('users.invite') OR 
        public.has_permission('platform.manage')
    );

DROP POLICY IF EXISTS update_profiles ON public.profiles;
CREATE POLICY update_profiles ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid() OR (tenant_id = public.current_tenant_id() AND public.has_permission('users.manage_status')) OR public.has_permission('platform.manage'))
    WITH CHECK (id = auth.uid() OR (tenant_id = public.current_tenant_id() AND public.has_permission('users.manage_status')) OR public.has_permission('platform.manage'));

-- user_roles
DROP POLICY IF EXISTS select_user_roles ON public.user_roles;
CREATE POLICY select_user_roles ON public.user_roles
    FOR SELECT TO authenticated
    USING (tenant_id = public.current_tenant_id() OR public.has_permission('platform.manage'));

DROP POLICY IF EXISTS insert_user_roles ON public.user_roles;
CREATE POLICY insert_user_roles ON public.user_roles
    FOR INSERT TO authenticated
    WITH CHECK (
        (tenant_id = public.current_tenant_id() AND public.has_permission('users.manage_status')) OR
        public.has_permission('platform.manage')
    );

DROP POLICY IF EXISTS update_user_roles ON public.user_roles;
CREATE POLICY update_user_roles ON public.user_roles
    FOR UPDATE TO authenticated
    USING (tenant_id = public.current_tenant_id() OR public.has_permission('platform.manage'))
    WITH CHECK (
        (tenant_id = public.current_tenant_id() AND public.has_permission('users.manage_status')) OR
        public.has_permission('platform.manage')
    );

-- user_contracts
DROP POLICY IF EXISTS select_user_contracts ON public.user_contracts;
CREATE POLICY select_user_contracts ON public.user_contracts
    FOR SELECT TO authenticated
    USING (tenant_id = public.current_tenant_id() OR public.has_permission('platform.manage'));

DROP POLICY IF EXISTS insert_user_contracts ON public.user_contracts;
CREATE POLICY insert_user_contracts ON public.user_contracts
    FOR INSERT TO authenticated
    WITH CHECK (
        (tenant_id = public.current_tenant_id() AND public.has_permission('users.manage_status')) OR
        public.has_permission('platform.manage')
    );

DROP POLICY IF EXISTS update_user_contracts ON public.user_contracts;
CREATE POLICY update_user_contracts ON public.user_contracts
    FOR UPDATE TO authenticated
    USING (tenant_id = public.current_tenant_id() OR public.has_permission('platform.manage'))
    WITH CHECK (
        (tenant_id = public.current_tenant_id() AND public.has_permission('users.manage_status')) OR
        public.has_permission('platform.manage')
    );

-- user_sites
DROP POLICY IF EXISTS select_user_sites ON public.user_sites;
CREATE POLICY select_user_sites ON public.user_sites
    FOR SELECT TO authenticated
    USING (tenant_id = public.current_tenant_id() OR public.has_permission('platform.manage'));

DROP POLICY IF EXISTS insert_user_sites ON public.user_sites;
CREATE POLICY insert_user_sites ON public.user_sites
    FOR INSERT TO authenticated
    WITH CHECK (
        (tenant_id = public.current_tenant_id() AND public.has_permission('users.manage_status')) OR
        public.has_permission('platform.manage')
    );

DROP POLICY IF EXISTS update_user_sites ON public.user_sites;
CREATE POLICY update_user_sites ON public.user_sites
    FOR UPDATE TO authenticated
    USING (tenant_id = public.current_tenant_id() OR public.has_permission('platform.manage'))
    WITH CHECK (
        (tenant_id = public.current_tenant_id() AND public.has_permission('users.manage_status')) OR
        public.has_permission('platform.manage')
    );

-- contract_sites
DROP POLICY IF EXISTS select_contract_sites ON public.contract_sites;
CREATE POLICY select_contract_sites ON public.contract_sites
    FOR SELECT TO authenticated
    USING (tenant_id = public.current_tenant_id() OR public.has_permission('platform.manage'));

DROP POLICY IF EXISTS insert_contract_sites ON public.contract_sites;
CREATE POLICY insert_contract_sites ON public.contract_sites
    FOR INSERT TO authenticated
    WITH CHECK (
        (tenant_id = public.current_tenant_id() AND public.has_permission('contracts.update')) OR
        public.has_permission('platform.manage')
    );

DROP POLICY IF EXISTS update_contract_sites ON public.contract_sites;
CREATE POLICY update_contract_sites ON public.contract_sites
    FOR UPDATE TO authenticated
    USING (tenant_id = public.current_tenant_id() OR public.has_permission('platform.manage'))
    WITH CHECK (
        (tenant_id = public.current_tenant_id() AND public.has_permission('contracts.update')) OR
        public.has_permission('platform.manage')
    );
