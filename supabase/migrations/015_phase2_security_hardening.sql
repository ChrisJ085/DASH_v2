-- supabase/migrations/015_phase2_security_hardening.sql

-- 1. HARDEN NEW USER SIGNUP / TRIGGER
-- Make sure handle_new_user NEVER trusts raw_user_meta_data or raw_app_meta_data for security boundaries (tenant_id, status, is_platform_admin).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_full_name TEXT;
BEGIN
    -- Extract full name safely from non-sensitive user metadata, or default to email prefix
    v_full_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        split_part(NEW.email, '@', 1)
    );

    -- Instantiates profiles with strict defaults:
    -- - tenant_id is strictly NULL (must be provisioned securely server-side or via bootstrap_tenant)
    -- - status is strictly 'invited' (cannot be set to active or suspended by client)
    -- - is_platform_admin is implicitly false (protected by triggers anyway)
    INSERT INTO public.profiles (
        id,
        tenant_id,
        email,
        full_name,
        status,
        is_platform_admin,
        created_at,
        updated_at
    ) VALUES (
        NEW.id,
        NULL, -- Crucial Fix: NEVER trust client-provided tenant_id
        NEW.email,
        v_full_name,
        'invited', -- Crucial Fix: New accounts must be invited or bootstrap to active
        FALSE,
        NEW.created_at,
        NEW.created_at
    )
    ON CONFLICT (id) DO UPDATE
    SET 
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        updated_at = now();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp;


-- 2. HARDEN BOOTSTRAP TENANT PROCEDURE WITH CONCURRENCY CONTROLS
CREATE OR REPLACE FUNCTION public.bootstrap_tenant(
    p_tenant_name TEXT,
    p_admin_name TEXT
)
RETURNS UUID AS $$
DECLARE
    v_user_id UUID;
    v_existing_tenant_id UUID;
    v_tenant_id UUID;
    v_role_id UUID;
    v_slug TEXT;
BEGIN
    -- A. Authentication & Authorisation Guard
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to bootstrap tenant';
    END IF;

    -- B. Concurrency Control & Existing Membership Guard
    -- Obtain a row-level lock on the calling user's profile to prevent concurrent bootstrap attempts by the same user.
    SELECT tenant_id INTO v_existing_tenant_id 
    FROM public.profiles 
    WHERE id = v_user_id 
    FOR UPDATE;

    IF v_existing_tenant_id IS NOT NULL THEN
        RAISE EXCEPTION 'User is already associated with a tenant';
    END IF;

    -- C. Input Validation
    IF p_tenant_name IS NULL OR trim(p_tenant_name) = '' THEN
        RAISE EXCEPTION 'Tenant name cannot be empty';
    END IF;

    -- Generate Slug and verify uniqueness
    v_slug := lower(regexp_replace(trim(p_tenant_name), '[^a-zA-Z0-9]+', '-', 'g'));
    
    IF EXISTS (
        SELECT 1 FROM public.tenants WHERE slug = v_slug AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'An organisation with a similar name already exists. Please choose a different name.';
    END IF;

    -- D. Tenant Creation with Concurrency Trap
    BEGIN
        INSERT INTO public.tenants (
            name,
            slug,
            status
        ) VALUES (
            trim(p_tenant_name),
            v_slug,
            'active'
        ) RETURNING id INTO v_tenant_id;
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'An organisation with a similar name already exists. Please choose a different name.';
    END;

    -- E. Safe Profile Association (Binds user to the newly created tenant context)
    UPDATE public.profiles
    SET 
        tenant_id = v_tenant_id,
        full_name = COALESCE(p_admin_name, full_name),
        status = 'active', -- Onboarding complete, set status to active
        updated_at = now()
    WHERE id = v_user_id;

    -- F. Retrieve tenant_admin system role ID
    SELECT id INTO v_role_id 
    FROM public.roles 
    WHERE tenant_id IS NULL AND code = 'tenant_admin';

    IF v_role_id IS NULL THEN
        RAISE EXCEPTION 'System role tenant_admin is missing from configuration';
    END IF;

    -- G. Grant tenant_admin privilege safely
    INSERT INTO public.user_roles (
        user_id,
        role_id,
        tenant_id
    ) VALUES (
        v_user_id,
        v_role_id,
        v_tenant_id
    ) ON CONFLICT (user_id, role_id) DO NOTHING;

    -- H. Write Audit Event
    INSERT INTO public.audit_logs (
        tenant_id,
        actor_id,
        action_type,
        entity_type,
        entity_id,
        new_state
    ) VALUES (
        v_tenant_id,
        v_user_id,
        'tenant.bootstrap',
        'tenant',
        v_tenant_id,
        jsonb_build_object('tenant_name', p_tenant_name, 'admin_name', p_admin_name)
    );

    RETURN v_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp;

-- Revoke execute on bootstrap_tenant from broad public or anonymous callers
REVOKE EXECUTE ON FUNCTION public.bootstrap_tenant(TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bootstrap_tenant(TEXT, TEXT) FROM anon;

-- Grant execute exclusively to authenticated sessions
GRANT EXECUTE ON FUNCTION public.bootstrap_tenant(TEXT, TEXT) TO authenticated;


-- 3. EXPLICIT RLS WORK WITH CHECK ENFORCEMENT
-- Ensure child tables carry with CHECK policy to prevent spoofing tenant_id.
-- Let's re-declare some child table RLS policies to make sure they are bulletproof on INSERT/UPDATE.

DROP POLICY IF EXISTS "Tenant users can insert contracts" ON public.contracts;
CREATE POLICY "Tenant users can insert contracts" ON public.contracts
    FOR INSERT TO authenticated
    WITH CHECK (
        tenant_id = public.current_tenant_id()
        AND public.has_permission('contracts.create')
    );

DROP POLICY IF EXISTS "Tenant users can update contracts" ON public.contracts;
CREATE POLICY "Tenant users can update contracts" ON public.contracts
    FOR UPDATE TO authenticated
    USING (tenant_id = public.current_tenant_id())
    WITH CHECK (
        tenant_id = public.current_tenant_id()
        AND public.has_permission('contracts.update')
    );

DROP POLICY IF EXISTS "Tenant users can insert sites" ON public.sites;
CREATE POLICY "Tenant users can insert sites" ON public.sites
    FOR INSERT TO authenticated
    WITH CHECK (
        tenant_id = public.current_tenant_id()
        AND public.has_permission('sites.create')
    );

DROP POLICY IF EXISTS "Tenant users can update sites" ON public.sites;
CREATE POLICY "Tenant users can update sites" ON public.sites
    FOR UPDATE TO authenticated
    USING (tenant_id = public.current_tenant_id())
    WITH CHECK (
        tenant_id = public.current_tenant_id()
        AND public.has_permission('sites.update')
    );
