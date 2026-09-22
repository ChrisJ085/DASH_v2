-- supabase/migrations/025_tenant_invitation_codes.sql
-- Restrict tenant registration and bootstrapping to Invitation Code only.

-- 1. Create table for tenant invitation codes
CREATE TABLE IF NOT EXISTS public.tenant_invitation_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    created_by_email TEXT NOT NULL DEFAULT 'chris.jeal@gxo.com',
    max_uses INTEGER NOT NULL DEFAULT 1,
    times_used INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    expires_at TIMESTAMPTZ NULL,
    notes TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    used_by_email TEXT NULL,
    used_at TIMESTAMPTZ NULL
);

-- Index for fast case-insensitive lookup
CREATE INDEX IF NOT EXISTS idx_tenant_invitation_codes_code ON public.tenant_invitation_codes (upper(code));

-- Enable RLS
ALTER TABLE public.tenant_invitation_codes ENABLE ROW LEVEL SECURITY;

-- Drop policies if they exist for idempotency
DROP POLICY IF EXISTS "Allow public/authenticated to read active codes" ON public.tenant_invitation_codes;
DROP POLICY IF EXISTS "Allow read active codes" ON public.tenant_invitation_codes;
DROP POLICY IF EXISTS "Allow admins or Chris Jeal to manage codes" ON public.tenant_invitation_codes;
DROP POLICY IF EXISTS "Allow admin manage codes" ON public.tenant_invitation_codes;

-- RLS Policy: Anyone (including authenticated users) can read invitation codes to validate them
CREATE POLICY "Allow public/authenticated to read active codes"
    ON public.tenant_invitation_codes
    FOR SELECT
    USING (true);

-- RLS Policy: Platform admins or chris.jeal@gxo.com can insert, update, delete invitation codes
CREATE POLICY "Allow admins or Chris Jeal to manage codes"
    ON public.tenant_invitation_codes
    FOR ALL
    TO authenticated
    USING (
        auth.uid() = 'a48717fd-4c63-43cb-a8f9-0a5de2c4fe0f' OR
        auth.jwt() ->> 'email' = 'chris.jeal@gxo.com' OR
        auth.jwt() ->> 'email' = 'cjeal85@gmail.com' OR
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() 
            AND (is_platform_admin = true OR email = 'chris.jeal@gxo.com')
        )
    );

-- Seed default master invitation code for Chris Jeal
INSERT INTO public.tenant_invitation_codes (code, created_by_email, max_uses, notes)
VALUES 
    ('D2-VIP-2026', 'chris.jeal@gxo.com', 10, 'Default D2 Invitation Code'),
    ('D2-CHRIS-JEAL', 'chris.jeal@gxo.com', 100, 'Master Invitation Code for Chris Jeal')
ON CONFLICT (code) DO NOTHING;

-- 2. Update bootstrap_tenant function to enforce invitation code check
CREATE OR REPLACE FUNCTION public.bootstrap_tenant(
    p_tenant_name TEXT,
    p_admin_name TEXT,
    p_invitation_code TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_user_id UUID;
    v_user_email TEXT;
    v_existing_tenant_id UUID;
    v_tenant_id UUID;
    v_role_id UUID;
    v_slug TEXT;
    v_code_record RECORD;
BEGIN
    -- A. Authentication & Authorisation Guard
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to bootstrap tenant.';
    END IF;

    -- Retrieve caller profile email
    SELECT email INTO v_user_email FROM public.profiles WHERE id = v_user_id;

    -- B. Invitation Code Guard (Bypassed if caller is chris.jeal@gxo.com)
    IF lower(COALESCE(v_user_email, '')) <> 'chris.jeal@gxo.com' THEN
        IF p_invitation_code IS NULL OR trim(p_invitation_code) = '' THEN
            RAISE EXCEPTION 'An invitation code is required to register a new tenant. Tenant registration is strictly restricted by invitation only from chris.jeal@gxo.com.';
        END IF;

        -- Validate invitation code
        SELECT * INTO v_code_record
        FROM public.tenant_invitation_codes
        WHERE upper(trim(code)) = upper(trim(p_invitation_code))
          AND is_active = true
          AND (expires_at IS NULL OR expires_at > now())
        FOR UPDATE;

        IF v_code_record.id IS NULL THEN
            RAISE EXCEPTION 'Invalid or deactivated invitation code. Please request a valid invitation code from chris.jeal@gxo.com.';
        END IF;

        IF v_code_record.times_used >= v_code_record.max_uses THEN
            RAISE EXCEPTION 'This invitation code limit has been reached. Please contact chris.jeal@gxo.com to request an increase in user invitations.';
        END IF;

        -- Increment code usage count and audit
        UPDATE public.tenant_invitation_codes
        SET times_used = times_used + 1,
            used_by_email = CASE 
                WHEN used_by_email IS NULL OR used_by_email = '' THEN v_user_email 
                ELSE used_by_email || ', ' || COALESCE(v_user_email, 'unknown') 
            END,
            used_at = now()
        WHERE id = v_code_record.id;
    END IF;

    -- C. Concurrency Control & Existing Membership Guard
    SELECT tenant_id INTO v_existing_tenant_id 
    FROM public.profiles 
    WHERE id = v_user_id 
    FOR UPDATE;

    IF v_existing_tenant_id IS NOT NULL THEN
        RAISE EXCEPTION 'User is already associated with a tenant.';
    END IF;

    -- D. Input Validation
    IF p_tenant_name IS NULL OR trim(p_tenant_name) = '' THEN
        RAISE EXCEPTION 'Tenant name cannot be empty.';
    END IF;

    -- Generate Slug and verify uniqueness
    v_slug := lower(regexp_replace(trim(p_tenant_name), '[^a-zA-Z0-9]+', '-', 'g'));
    
    IF EXISTS (
        SELECT 1 FROM public.tenants WHERE slug = v_slug AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'An organisation with a similar name already exists. Please choose a different name.';
    END IF;

    -- E. Tenant Creation
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

    -- F. Safe Profile Association
    UPDATE public.profiles
    SET 
        tenant_id = v_tenant_id,
        full_name = COALESCE(NULLIF(trim(p_admin_name), ''), full_name, 'Tenant Administrator'),
        status = 'active',
        updated_at = now()
    WHERE id = v_user_id;

    -- G. System Tenant Administrator Role Verification
    SELECT id INTO v_role_id 
    FROM public.roles 
    WHERE tenant_id = v_tenant_id 
      AND (code = 'tenant_admin' OR is_system = true)
    ORDER BY created_at ASC 
    LIMIT 1;

    IF v_role_id IS NULL THEN
        INSERT INTO public.roles (
            tenant_id,
            name,
            code,
            description,
            is_system
        ) VALUES (
            v_tenant_id,
            'Tenant Administrator',
            'tenant_admin',
            'Full administrative control over tenant resources, tools, and user scope.',
            true
        ) RETURNING id INTO v_role_id;
    END IF;

    -- H. Assign Administrator Role
    INSERT INTO public.user_roles (
        user_id,
        role_id,
        tenant_id
    ) VALUES (
        v_user_id,
        v_role_id,
        v_tenant_id
    ) ON CONFLICT (user_id, role_id) DO NOTHING;

    RETURN v_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp;

REVOKE EXECUTE ON FUNCTION public.bootstrap_tenant(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bootstrap_tenant(TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_tenant(TEXT, TEXT, TEXT) TO authenticated;

-- 3. Fix harden_roles_management to allow tenant initialisation (bootstrapping)
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

    -- ALLOW Bootstrapping Exception:
    -- If user has no assigned role yet and is creating the initial 'tenant_admin' role for their newly created tenant
    IF TG_OP = 'INSERT' THEN
        IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_caller_id) THEN
            IF NEW.tenant_id = v_caller_tenant_id AND NEW.code = 'tenant_admin' THEN
                RETURN NEW;
            END IF;
        END IF;
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
        
        -- Prevent turning a tenant role into a system role
        IF NEW.is_system IS TRUE THEN
            RAISE EXCEPTION 'Security Exception: Only platform administrators can define system roles.';
        END IF;

    ELSIF TG_OP = 'DELETE' THEN
        -- Ensure target role belongs to caller's tenant
        IF OLD.tenant_id IS DISTINCT FROM v_caller_tenant_id OR OLD.tenant_id IS NULL THEN
            RAISE EXCEPTION 'Security Exception: Cannot delete system or other tenant roles.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp;

