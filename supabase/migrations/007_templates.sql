-- supabase/migrations/007_templates.sql

-- 1. Tool Templates (Platform Global and Tenant Shared templates catalog)
CREATE TABLE public.tool_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    source_tool_version_id UUID NOT NULL REFERENCES public.tool_versions(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    description TEXT NULL,
    category TEXT NOT NULL DEFAULT 'safety',
    visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'tenant_shared', 'platform_public')),
    created_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tool_templates_visibility ON public.tool_templates(visibility);
CREATE INDEX idx_tool_templates_tenant ON public.tool_templates(tenant_id);
