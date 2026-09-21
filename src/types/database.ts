/**
 * DASH V2 - Database Schema Type Contracts
 * Phase 0 Architecture Definition
 */

export type EntityStatus = 'active' | 'inactive' | 'suspended' | 'archived' | 'draft' | 'published';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended' | 'archived';
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Contract {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  description: string | null;
  status: 'active' | 'inactive' | 'closed';
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Site {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  address_line1: string | null;
  city: string | null;
  postal_code: string | null;
  status: 'active' | 'inactive' | 'decommissioned';
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/**
 * Many-to-many junction between Contracts and Sites within a Tenant.
 * A single site can belong to multiple contracts, and a contract to multiple sites.
 */
export interface ContractSite {
  id: string;
  tenant_id: string; // Denormalized for single-lookup RLS
  contract_id: string;
  site_id: string;
  created_at: string;
  deleted_at: string | null;
}

export interface Profile {
  id: string; // 1:1 with auth.users(id)
  tenant_id: string | null; // Nullable for system-wide platform admins
  email: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  status: 'invited' | 'active' | 'suspended';
  is_platform_admin: boolean;
  invited_by: string | null;
  invited_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AuditLog {
  id: string;
  tenant_id: string | null;
  actor_id: string | null;
  action_type: string;
  entity_type: string;
  entity_id: string;
  old_state: Record<string, unknown> | null;
  new_state: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}
