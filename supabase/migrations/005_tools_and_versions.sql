-- supabase/migrations/005_tools_and_versions.sql

-- 1. Tools Container
CREATE TABLE public.tools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT NULL,
    category TEXT NOT NULL DEFAULT 'safety',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_by UUID NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ NULL,
    CONSTRAINT uq_tools_tenant_id UNIQUE (tenant_id, id)
);

CREATE INDEX idx_tools_tenant ON public.tools(tenant_id) WHERE deleted_at IS NULL;

-- 2. Tool Versions
CREATE TABLE public.tool_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tool_id UUID NOT NULL,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    version_number INT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    instructions TEXT NULL,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    published_at TIMESTAMPTZ NULL,
    published_by UUID NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_tool_versions_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_tool_versions_number UNIQUE (tool_id, version_number),
    CONSTRAINT fk_tv_tool FOREIGN KEY (tenant_id, tool_id) REFERENCES public.tools(tenant_id, id) ON DELETE CASCADE
);

-- Note: We add profiles FK in a separate alter table because profiles references tools and vice versa
ALTER TABLE public.tools 
    ADD CONSTRAINT fk_tools_creator FOREIGN KEY (tenant_id, created_by) REFERENCES public.profiles(tenant_id, id) ON DELETE SET NULL;

ALTER TABLE public.tool_versions 
    ADD CONSTRAINT fk_tv_publisher FOREIGN KEY (tenant_id, published_by) REFERENCES public.profiles(tenant_id, id) ON DELETE SET NULL;

-- 3. Tool Sections
CREATE TABLE public.tool_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tool_version_id UUID NOT NULL,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NULL,
    order_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_tool_sections_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_tool_sections_version_id UNIQUE (tool_version_id, id),
    CONSTRAINT fk_ts_version FOREIGN KEY (tenant_id, tool_version_id) REFERENCES public.tool_versions(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_tool_sections_version_order ON public.tool_sections(tool_version_id, order_index);

-- 4. Tool Questions
CREATE TABLE public.tool_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID NOT NULL,
    tool_version_id UUID NOT NULL,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    question_code TEXT NOT NULL,
    question_text TEXT NOT NULL,
    hint_text TEXT NULL,
    answer_type TEXT NOT NULL CHECK (answer_type IN ('single_choice', 'multiple_choice', 'boolean', 'text', 'number', 'date', 'time', 'photo', 'signature', 'rating')),
    is_required BOOLEAN NOT NULL DEFAULT true,
    order_index INT NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_tool_questions_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_tool_questions_version_id UNIQUE (tool_version_id, id),
    CONSTRAINT fk_tq_version FOREIGN KEY (tenant_id, tool_version_id) REFERENCES public.tool_versions(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_tq_section FOREIGN KEY (tool_version_id, section_id) REFERENCES public.tool_sections(tool_version_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_tool_questions_section_order ON public.tool_questions(section_id, order_index);
CREATE INDEX idx_tool_questions_version ON public.tool_questions(tool_version_id);

-- 5. Question Options
CREATE TABLE public.question_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    value TEXT NOT NULL,
    score NUMERIC NULL,
    is_flagged BOOLEAN NOT NULL DEFAULT false,
    order_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_question_options_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_qo_question FOREIGN KEY (tenant_id, question_id) REFERENCES public.tool_questions(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_question_options_lookup ON public.question_options(question_id, order_index);
