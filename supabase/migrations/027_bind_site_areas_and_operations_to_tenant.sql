-- supabase/migrations/027_bind_site_areas_and_operations_to_tenant.sql

-- 1. Add physical site multi-selection array support to site_areas and operation_types
-- Allows site areas and operation types to be bound to the tenant and applied across multiple sites
ALTER TABLE public.site_areas 
    ADD COLUMN IF NOT EXISTS site_ids TEXT[] DEFAULT '{}',
    ALTER COLUMN site_id DROP NOT NULL;

ALTER TABLE public.operation_types 
    ADD COLUMN IF NOT EXISTS site_ids TEXT[] DEFAULT '{}',
    ALTER COLUMN site_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_site_areas_site_ids ON public.site_areas USING GIN (site_ids);
CREATE INDEX IF NOT EXISTS idx_operation_types_site_ids ON public.operation_types USING GIN (site_ids);
