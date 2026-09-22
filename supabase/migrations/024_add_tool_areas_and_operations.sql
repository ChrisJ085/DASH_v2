-- supabase/migrations/024_add_tool_areas_and_operations.sql

-- Add Site Areas and Operation Types configuration arrays to public.tools
ALTER TABLE public.tools 
    ADD COLUMN IF NOT EXISTS area_ids TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS operation_type_ids TEXT[] DEFAULT '{}';
