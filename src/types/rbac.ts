/**
 * DASH V2 - RBAC & Operational Scope Types
 * Phase 0 Architecture Definition
 */

export interface Role {
  id: string;
  tenant_id: string | null; // Nullable for global system roles
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface Permission {
  id: string;
  code: string; // e.g. 'observations.create'
  category: string;
  description: string;
  created_at: string;
}

export interface RolePermission {
  id: string;
  role_id: string;
  permission_id: string;
  created_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role_id: string;
  tenant_id: string;
  created_at: string;
}

/**
 * Operational Scope Junctions:
 * Decouples WHAT a user can do (Permissions) from WHERE they can do it (Contracts & Sites).
 */
export interface UserContract {
  id: string;
  user_id: string;
  contract_id: string;
  tenant_id: string;
  created_at: string;
}

export interface UserSite {
  id: string;
  user_id: string;
  site_id: string;
  tenant_id: string;
  created_at: string;
}

export type StandardRoleCode =
  | 'platform_admin'
  | 'tenant_admin'
  | 'contract_manager'
  | 'site_manager'
  | 'observer'
  | 'viewer';
