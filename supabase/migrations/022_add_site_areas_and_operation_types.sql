-- supabase/migrations/022_add_site_areas_and_operation_types.sql

-- Helper function to automatically update updated_at timestamp if not present
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. Create Site Areas Table
CREATE TABLE IF NOT EXISTS public.site_areas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    description TEXT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ NULL,
    CONSTRAINT uq_site_areas_tenant_composite UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_site_areas_tenant ON public.site_areas(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_site_areas_site ON public.site_areas(site_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_site_areas_code ON public.site_areas(tenant_id, site_id, code) WHERE deleted_at IS NULL;

-- 2. Create Operation Types Table
CREATE TABLE IF NOT EXISTS public.operation_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    description TEXT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ NULL,
    CONSTRAINT uq_operation_types_tenant_composite UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_operation_types_tenant ON public.operation_types(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_operation_types_site ON public.operation_types(site_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_operation_types_code ON public.operation_types(tenant_id, site_id, code) WHERE deleted_at IS NULL;

-- 3. Add area_id & operation_type_id references to tool_questions & observations
ALTER TABLE public.tool_questions 
    ADD COLUMN IF NOT EXISTS area_id UUID NULL REFERENCES public.site_areas(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS operation_type_id UUID NULL REFERENCES public.operation_types(id) ON DELETE SET NULL;

ALTER TABLE public.observations 
    ADD COLUMN IF NOT EXISTS area_id UUID NULL REFERENCES public.site_areas(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS operation_type_id UUID NULL REFERENCES public.operation_types(id) ON DELETE SET NULL;

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.site_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operation_types ENABLE ROW LEVEL SECURITY;

-- RLS Policies for site_areas
CREATE POLICY "site_areas_select" ON public.site_areas
    FOR SELECT TO authenticated
    USING (
        deleted_at IS NULL AND (
            tenant_id = public.current_tenant_id() OR
            (SELECT is_platform_admin FROM public.profiles WHERE id = auth.uid()) IS TRUE
        )
    );

CREATE POLICY "site_areas_insert" ON public.site_areas
    FOR INSERT TO authenticated
    WITH CHECK (
        tenant_id = public.current_tenant_id() OR
        (SELECT is_platform_admin FROM public.profiles WHERE id = auth.uid()) IS TRUE
    );

CREATE POLICY "site_areas_update" ON public.site_areas
    FOR UPDATE TO authenticated
    USING (
        tenant_id = public.current_tenant_id() OR
        (SELECT is_platform_admin FROM public.profiles WHERE id = auth.uid()) IS TRUE
    );

CREATE POLICY "site_areas_delete" ON public.site_areas
    FOR DELETE TO authenticated
    USING (
        tenant_id = public.current_tenant_id() OR
        (SELECT is_platform_admin FROM public.profiles WHERE id = auth.uid()) IS TRUE
    );

-- RLS Policies for operation_types
CREATE POLICY "operation_types_select" ON public.operation_types
    FOR SELECT TO authenticated
    USING (
        deleted_at IS NULL AND (
            tenant_id = public.current_tenant_id() OR
            (SELECT is_platform_admin FROM public.profiles WHERE id = auth.uid()) IS TRUE
        )
    );

CREATE POLICY "operation_types_insert" ON public.operation_types
    FOR INSERT TO authenticated
    WITH CHECK (
        tenant_id = public.current_tenant_id() OR
        (SELECT is_platform_admin FROM public.profiles WHERE id = auth.uid()) IS TRUE
    );

CREATE POLICY "operation_types_update" ON public.operation_types
    FOR UPDATE TO authenticated
    USING (
        tenant_id = public.current_tenant_id() OR
        (SELECT is_platform_admin FROM public.profiles WHERE id = auth.uid()) IS TRUE
    );

CREATE POLICY "operation_types_delete" ON public.operation_types
    FOR DELETE TO authenticated
    USING (
        tenant_id = public.current_tenant_id() OR
        (SELECT is_platform_admin FROM public.profiles WHERE id = auth.uid()) IS TRUE
    );

-- 5. Automatic updated_at triggers
CREATE OR REPLACE TRIGGER set_site_areas_updated_at
    BEFORE UPDATE ON public.site_areas
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER set_operation_types_updated_at
    BEFORE UPDATE ON public.operation_types
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
