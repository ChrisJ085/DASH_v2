-- supabase/migrations/008_observations.sql

-- 1. Observations Table
CREATE TABLE public.observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    contract_id UUID NOT NULL,
    site_id UUID NOT NULL,
    tool_id UUID NOT NULL,
    tool_version_id UUID NOT NULL,
    observer_id UUID NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'flagged', 'archived')),
    score_percentage NUMERIC(5,2) NULL CHECK (score_percentage >= 0.00 AND score_percentage <= 100.00),
    has_flagged_items BOOLEAN NOT NULL DEFAULT false,
    summary_notes TEXT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    completed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ NULL,
    CONSTRAINT uq_observations_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_obs_contract_site FOREIGN KEY (tenant_id, contract_id, site_id) REFERENCES public.contract_sites(tenant_id, contract_id, site_id) ON DELETE RESTRICT,
    CONSTRAINT fk_obs_tool_version FOREIGN KEY (tenant_id, tool_version_id) REFERENCES public.tool_versions(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_obs_observer FOREIGN KEY (tenant_id, observer_id) REFERENCES public.profiles(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_observations_tenant_date ON public.observations(tenant_id, observed_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_observations_tenant_site ON public.observations(tenant_id, site_id, observed_at DESC);
CREATE INDEX idx_observations_tenant_contract ON public.observations(tenant_id, contract_id, observed_at DESC);
CREATE INDEX idx_observations_observer ON public.observations(observer_id, observed_at DESC);
CREATE INDEX idx_observations_tool_version ON public.observations(tool_version_id);
CREATE INDEX idx_observations_status ON public.observations(tenant_id, status);

-- 2. Observation Responses Table (One row per question)
CREATE TABLE public.observation_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    observation_id UUID NOT NULL,
    question_id UUID NOT NULL,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    selected_option_id UUID NULL,
    answer_text TEXT NULL,
    answer_numeric NUMERIC NULL,
    answer_boolean BOOLEAN NULL,
    answer_json JSONB NULL,
    is_flagged BOOLEAN NOT NULL DEFAULT false,
    comment TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_obs_responses_obs_q UNIQUE (observation_id, question_id),
    CONSTRAINT ck_resp_storage_validity CHECK (
        selected_option_id IS NOT NULL OR 
        answer_text IS NOT NULL OR 
        answer_numeric IS NOT NULL OR 
        answer_boolean IS NOT NULL OR 
        answer_json IS NOT NULL OR 
        comment IS NOT NULL
    ),
    CONSTRAINT fk_resp_observation FOREIGN KEY (tenant_id, observation_id) REFERENCES public.observations(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_resp_question FOREIGN KEY (tenant_id, question_id) REFERENCES public.tool_questions(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_resp_option FOREIGN KEY (tenant_id, selected_option_id) REFERENCES public.question_options(tenant_id, id) ON DELETE SET NULL
);

CREATE INDEX idx_observation_responses_question ON public.observation_responses(question_id);
CREATE INDEX idx_observation_responses_tenant ON public.observation_responses(tenant_id);

-- 3. Observation Photos Table
CREATE TABLE public.observation_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    observation_id UUID NOT NULL,
    question_id UUID NULL,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size_bytes INT NOT NULL,
    mime_type TEXT NOT NULL,
    caption TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_photo_obs FOREIGN KEY (tenant_id, observation_id) REFERENCES public.observations(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_observation_photos_obs ON public.observation_photos(observation_id);

-- 4. Observation Signatures Table
CREATE TABLE public.observation_signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    observation_id UUID NOT NULL,
    question_id UUID NULL,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    signer_name TEXT NOT NULL,
    signer_role TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_sig_obs FOREIGN KEY (tenant_id, observation_id) REFERENCES public.observations(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_observation_signatures_obs ON public.observation_signatures(observation_id);
