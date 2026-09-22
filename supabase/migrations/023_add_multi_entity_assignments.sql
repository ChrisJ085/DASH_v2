-- supabase/migrations/023_add_multi_entity_assignments.sql

-- Add multi-selection array support for Site Areas, Operation Types, and Instruments/Tools to tool_questions
ALTER TABLE public.tool_questions 
    ADD COLUMN IF NOT EXISTS area_ids TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS operation_type_ids TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS tool_ids TEXT[] DEFAULT '{}';
