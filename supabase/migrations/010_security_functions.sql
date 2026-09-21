-- supabase/migrations/010_security_functions.sql

-- 1. Helper to retrieve the current tenant ID associated with the active session user
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID AS $$
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid() AND deleted_at IS NULL;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 2. Helper to verify if the active session user possesses a specific functional permission code
CREATE OR REPLACE FUNCTION public.has_permission(p_code TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_is_platform_admin BOOLEAN;
    v_has_perm BOOLEAN;
BEGIN
    -- 1. Platform Admin bypass (fully system-wide)
    SELECT is_platform_admin INTO v_is_platform_admin 
    FROM public.profiles WHERE id = auth.uid() AND deleted_at IS NULL;
    IF v_is_platform_admin IS TRUE THEN
        RETURN TRUE;
    END IF;

    -- 2. Check if user is associated with any active roles carrying this permission
    SELECT EXISTS (
        SELECT 1 
        FROM public.user_roles ur
        JOIN public.role_permissions rp ON rp.role_id = ur.role_id
        JOIN public.permissions p ON p.id = rp.permission_id
        WHERE ur.user_id = auth.uid() AND p.code = p_code
    ) INTO v_has_perm;

    RETURN v_has_perm;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 3. Helper to resolve operational scope (Strict Intersection model for combined Contract and Site scopes)
CREATE OR REPLACE FUNCTION public.has_operational_scope(target_contract_id UUID, target_site_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_is_platform_admin BOOLEAN;
  v_is_tenant_admin BOOLEAN;
  v_has_any_contract_assignment BOOLEAN;
  v_has_any_site_assignment BOOLEAN;
  v_contract_matched BOOLEAN;
  v_site_matched BOOLEAN;
BEGIN
  -- 1. Platform Admin bypass
  SELECT is_platform_admin INTO v_is_platform_admin 
  FROM public.profiles WHERE id = auth.uid() AND deleted_at IS NULL;
  IF v_is_platform_admin IS TRUE THEN
    RETURN TRUE;
  END IF;

  -- 2. Tenant Admin bypass
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid() AND r.code = 'tenant_admin'
  ) INTO v_is_tenant_admin;
  IF v_is_tenant_admin IS TRUE THEN
    -- Verify the user actually belongs to the same tenant as the contract/site
    -- Let's check that the contract and site belong to the admin's tenant
    IF EXISTS (
        SELECT 1 FROM public.contract_sites cs
        WHERE cs.contract_id = target_contract_id 
          AND cs.site_id = target_site_id
          AND cs.tenant_id = public.current_tenant_id()
          AND cs.deleted_at IS NULL
    ) THEN
        RETURN TRUE;
    END IF;
    RETURN FALSE;
  END IF;

  -- 3. Verify valid contract-site relationship exists in tenant
  IF NOT EXISTS (
    SELECT 1 FROM public.contract_sites cs
    WHERE cs.contract_id = target_contract_id 
      AND cs.site_id = target_site_id
      AND cs.deleted_at IS NULL
  ) THEN
    RETURN FALSE;
  END IF;

  -- 4. Check user assignments
  SELECT EXISTS (SELECT 1 FROM public.user_contracts WHERE user_id = auth.uid()) INTO v_has_any_contract_assignment;
  SELECT EXISTS (SELECT 1 FROM public.user_sites WHERE user_id = auth.uid()) INTO v_has_any_site_assignment;

  -- If user has no scope assignments whatsoever -> DEFAULT RESTRICTED
  IF NOT v_has_any_contract_assignment AND NOT v_has_any_site_assignment THEN
    RETURN FALSE;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.user_contracts WHERE user_id = auth.uid() AND contract_id = target_contract_id) INTO v_contract_matched;
  SELECT EXISTS (SELECT 1 FROM public.user_sites WHERE user_id = auth.uid() AND site_id = target_site_id) INTO v_site_matched;

  -- Case A: User has BOTH Contract and Site restrictions -> INTERSECTION
  IF v_has_any_contract_assignment AND v_has_any_site_assignment THEN
    RETURN (v_contract_matched AND v_site_matched);
  END IF;

  -- Case B: User has Contract restrictions ONLY
  IF v_has_any_contract_assignment AND NOT v_has_any_site_assignment THEN
    RETURN v_contract_matched;
  END IF;

  -- Case C: User has Site restrictions ONLY
  IF NOT v_has_any_contract_assignment AND v_has_any_site_assignment THEN
    RETURN v_site_matched;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
