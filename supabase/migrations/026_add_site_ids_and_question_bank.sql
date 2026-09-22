-- supabase/migrations/026_add_site_ids_and_question_bank.sql

-- 1. Add physical site multi-selection array support to tool_questions and tools
ALTER TABLE public.tool_questions 
    ADD COLUMN IF NOT EXISTS site_ids TEXT[] DEFAULT '{}';

ALTER TABLE public.tools 
    ADD COLUMN IF NOT EXISTS site_ids TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_tool_questions_site_ids ON public.tool_questions USING GIN (site_ids);
CREATE INDEX IF NOT EXISTS idx_tools_site_ids ON public.tools USING GIN (site_ids);
