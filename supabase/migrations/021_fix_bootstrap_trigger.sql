-- supabase/migrations/021_fix_bootstrap_trigger.sql

-- Fix for Security Exception when bootstrapping tenant.
-- The hardening trigger was too strict, preventing the bootstrap process from setting the initial tenant_id.

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
        -- Allow setting tenant_id if it was previously NULL (bootstrap process)
        IF OLD.tenant_id IS NOT NULL AND NOT COALESCE(v_caller_is_platform_admin, FALSE) THEN
            RAISE EXCEPTION 'Security Exception: tenant_id cannot be modified.';
        END IF;
    END IF;

    -- C. Prevent self-modification of status (activation/suspension) or other restricted fields by normal/tenant users
    IF v_caller_id = OLD.id AND NOT COALESCE(v_caller_is_platform_admin, FALSE) THEN
        -- Prevent self-modification of status (activation/suspension)
        -- ALLOW modifying status if currently 'invited' and changing to 'active' (onboarding process)
        IF NEW.status IS DISTINCT FROM OLD.status THEN
            IF NOT (OLD.status = 'invited' AND NEW.status = 'active') THEN
                RAISE EXCEPTION 'Security Exception: Normal users cannot modify their own status.';
            END IF;
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
