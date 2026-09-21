-- supabase/migrations/004_rbac_and_scopes.sql

-- 1. Roles
CREATE TABLE public.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NULL,
    is_system BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_roles_tenant_id UNIQUE (tenant_id, id)
);

CREATE UNIQUE INDEX idx_roles_tenant_code ON public.roles (
    COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), 
    code
);

-- 2. Permissions
CREATE TABLE public.permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Role Permissions (Many-to-Many junction)
CREATE TABLE public.role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_role_permissions_unique ON public.role_permissions(role_id, permission_id);

-- 4. User Roles
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_ur_user FOREIGN KEY (tenant_id, user_id) REFERENCES public.profiles(tenant_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_user_roles_unique ON public.user_roles(user_id, role_id);
CREATE INDEX idx_user_roles_tenant ON public.user_roles(tenant_id);

-- 5. User Contracts Scope Restriction
CREATE TABLE public.user_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    contract_id UUID NOT NULL,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_uc_user FOREIGN KEY (tenant_id, user_id) REFERENCES public.profiles(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_uc_contract FOREIGN KEY (tenant_id, contract_id) REFERENCES public.contracts(tenant_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_user_contracts_unique ON public.user_contracts(user_id, contract_id);
CREATE INDEX idx_user_contracts_lookup ON public.user_contracts(user_id);

-- 6. User Sites Scope Restriction
CREATE TABLE public.user_sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    site_id UUID NOT NULL,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_us_user FOREIGN KEY (tenant_id, user_id) REFERENCES public.profiles(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_us_site FOREIGN KEY (tenant_id, site_id) REFERENCES public.sites(tenant_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_user_sites_unique ON public.user_sites(user_id, site_id);
CREATE INDEX idx_user_sites_lookup ON public.user_sites(user_id);
