-- supabase/migrations/001_extensions.sql

-- Enable standard UUID and cryptography extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Conditionally create the auth schema and auth.users table 
-- to support local test runs where GoTrue is not running.
-- In a real Supabase environment, these already exist and are protected.
DO $$
BEGIN
    -- Check if auth schema and users table already exist before executing DDL
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_namespace n
        JOIN pg_class c ON c.relnamespace = n.oid
        WHERE n.nspname = 'auth' AND c.relname = 'users'
    ) THEN
        BEGIN
            CREATE SCHEMA IF NOT EXISTS auth;
            EXECUTE 'CREATE TABLE auth.users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email TEXT UNIQUE,
                raw_app_meta_data JSONB DEFAULT ''{}''::jsonb,
                raw_user_meta_data JSONB DEFAULT ''{}''::jsonb,
                created_at TIMESTAMPTZ DEFAULT now()
            )';
        EXCEPTION
            WHEN OTHERS THEN
                -- Catch any permission denied errors when trying to modify the auth schema in Supabase
                NULL;
        END;
    END IF;
END $$;
