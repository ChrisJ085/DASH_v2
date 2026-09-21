-- supabase/migrations/002_tenants_and_structure.sql

-- 1. Tenants
CREATE TABLE public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX idx_tenants_slug ON public.tenants(slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_tenants_status ON public.tenants(status);

-- 2. Contracts
CREATE TABLE public.contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    description TEXT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ NULL,
    CONSTRAINT uq_contracts_tenant_id UNIQUE (tenant_id, id)
);

CREATE UNIQUE INDEX idx_contracts_tenant_code ON public.contracts(tenant_id, code) WHERE deleted_at IS NULL;
CREATE INDEX idx_contracts_tenant_id ON public.contracts(tenant_id);

-- 3. Sites
CREATE TABLE public.sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    address_line1 TEXT NULL,
    city TEXT NULL,
    postal_code TEXT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'decommissioned')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ NULL,
    CONSTRAINT uq_sites_tenant_id UNIQUE (tenant_id, id)
);

CREATE UNIQUE INDEX idx_sites_tenant_code ON public.sites(tenant_id, code) WHERE deleted_at IS NULL;
CREATE INDEX idx_sites_tenant_id ON public.sites(tenant_id);

-- 4. Contract Sites Many-to-Many
CREATE TABLE public.contract_sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    contract_id UUID NOT NULL,
    site_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ NULL,
    CONSTRAINT uq_contract_sites_tenant_composite UNIQUE (tenant_id, contract_id, site_id),
    CONSTRAINT fk_cs_contract FOREIGN KEY (tenant_id, contract_id) REFERENCES public.contracts(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_cs_site FOREIGN KEY (tenant_id, site_id) REFERENCES public.sites(tenant_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_contract_sites_unique ON public.contract_sites(contract_id, site_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_contract_sites_site ON public.contract_sites(site_id);
