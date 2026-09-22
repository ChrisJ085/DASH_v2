-- supabase/migrations/020_phase5_observation_engine.sql

-- 1. Create Transactional Submit Observation Stored Procedure
CREATE OR REPLACE FUNCTION public.submit_observation(
    p_observation_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_tenant_id UUID;
    v_status TEXT;
    v_contract_id UUID;
    v_site_id UUID;
    v_user_id UUID;
    v_result JSONB;
BEGIN
    v_tenant_id := public.current_tenant_id();
    v_user_id := auth.uid();

    IF v_tenant_id IS NULL OR v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthenticated request';
    END IF;

    -- Retrieve observation header metadata and check existence & status
    SELECT status, contract_id, site_id
    INTO v_status, v_contract_id, v_site_id
    FROM public.observations
    WHERE id = p_observation_id AND tenant_id = v_tenant_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'Observation with ID % not found for current tenant', p_observation_id;
    END IF;

    IF v_status <> 'in_progress' THEN
        RAISE EXCEPTION 'Observation % is already finalized (status: %)', p_observation_id, v_status;
    END IF;

    -- Verify operational scope
    IF NOT public.has_operational_scope(v_contract_id, v_site_id) THEN
        RAISE EXCEPTION 'Forbidden: User does not have operational scope for contract % / site %', v_contract_id, v_site_id;
    END IF;

    -- Verify permissions
    IF NOT (public.has_permission('observations.create') OR public.has_permission('observations.edit_in_progress')) THEN
        RAISE EXCEPTION 'Forbidden: User lacks observation submission permissions';
    END IF;

    -- Update observation status to completed
    UPDATE public.observations
    SET 
        status = 'completed',
        completed_at = now(),
        updated_at = now()
    WHERE id = p_observation_id AND tenant_id = v_tenant_id;

    -- Record in Audit Log
    INSERT INTO public.audit_logs (
        tenant_id,
        user_id,
        action,
        target_type,
        target_id,
        payload_after
    ) VALUES (
        v_tenant_id,
        v_user_id,
        'observation.submit',
        'observations',
        p_observation_id,
        jsonb_build_object(
            'status', 'completed',
            'contract_id', v_contract_id,
            'site_id', v_site_id,
            'completed_at', now()
        )
    );

    SELECT jsonb_build_object(
        'id', id,
        'tenant_id', tenant_id,
        'status', status,
        'completed_at', completed_at
    )
    INTO v_result
    FROM public.observations
    WHERE id = p_observation_id;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.submit_observation(UUID) TO authenticated;

-- 2. Enhanced RLS Policies for Observation Responses (Inserting & Updating Drafts)
DROP POLICY IF EXISTS insert_observation_responses ON public.observation_responses;
CREATE POLICY insert_observation_responses ON public.observation_responses
    FOR INSERT WITH CHECK (
        tenant_id = public.current_tenant_id() AND 
        (public.has_permission('observations.create') OR public.has_permission('observations.edit_in_progress')) AND 
        EXISTS (
            SELECT 1 FROM public.observations o 
            WHERE o.id = observation_id AND o.tenant_id = public.current_tenant_id() AND o.status = 'in_progress'
        )
    );

DROP POLICY IF EXISTS update_observation_responses ON public.observation_responses;
CREATE POLICY update_observation_responses ON public.observation_responses
    FOR UPDATE USING (
        tenant_id = public.current_tenant_id() AND 
        (public.has_permission('observations.create') OR public.has_permission('observations.edit_in_progress')) AND 
        EXISTS (
            SELECT 1 FROM public.observations o 
            WHERE o.id = observation_id AND o.tenant_id = public.current_tenant_id() AND o.status = 'in_progress'
        )
    );

-- 3. Composite Performance Indexes
CREATE INDEX IF NOT EXISTS idx_obs_resp_composite ON public.observation_responses(tenant_id, observation_id);
CREATE INDEX IF NOT EXISTS idx_obs_photos_composite ON public.observation_photos(tenant_id, observation_id);
CREATE INDEX IF NOT EXISTS idx_obs_sigs_composite ON public.observation_signatures(tenant_id, observation_id);

-- 4. Supabase Storage Buckets & Policies (Tenant Isolated Evidence Storage)
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('observation-photos', 'observation-photos', false),
  ('observation-signatures', 'observation-signatures', false)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies for Photos Bucket
DROP POLICY IF EXISTS "Tenant Isolated Photo Select" ON storage.objects;
CREATE POLICY "Tenant Isolated Photo Select" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'observation-photos' AND 
        (storage.foldername(name))[1] = public.current_tenant_id()::text AND
        EXISTS (
            SELECT 1 FROM public.observations o
            WHERE o.id::text = (storage.foldername(name))[2]
              AND o.tenant_id = public.current_tenant_id()
        )
    );

DROP POLICY IF EXISTS "Tenant Isolated Photo Insert" ON storage.objects;
CREATE POLICY "Tenant Isolated Photo Insert" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'observation-photos' AND 
        (storage.foldername(name))[1] = public.current_tenant_id()::text AND
        (public.has_permission('observations.create') OR public.has_permission('observations.edit_in_progress')) AND
        EXISTS (
            SELECT 1 FROM public.observations o
            WHERE o.id::text = (storage.foldername(name))[2]
              AND o.tenant_id = public.current_tenant_id()
              AND o.status = 'in_progress'
        )
    );

-- Storage Policies for Signatures Bucket
DROP POLICY IF EXISTS "Tenant Isolated Signature Select" ON storage.objects;
CREATE POLICY "Tenant Isolated Signature Select" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'observation-signatures' AND 
        (storage.foldername(name))[1] = public.current_tenant_id()::text AND
        EXISTS (
            SELECT 1 FROM public.observations o
            WHERE o.id::text = (storage.foldername(name))[2]
              AND o.tenant_id = public.current_tenant_id()
        )
    );

DROP POLICY IF EXISTS "Tenant Isolated Signature Insert" ON storage.objects;
CREATE POLICY "Tenant Isolated Signature Insert" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'observation-signatures' AND 
        (storage.foldername(name))[1] = public.current_tenant_id()::text AND
        (public.has_permission('observations.create') OR public.has_permission('observations.edit_in_progress')) AND
        EXISTS (
            SELECT 1 FROM public.observations o
            WHERE o.id::text = (storage.foldername(name))[2]
              AND o.tenant_id = public.current_tenant_id()
              AND o.status = 'in_progress'
        )
    );
