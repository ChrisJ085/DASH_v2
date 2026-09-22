// src/types/colleague.ts

/**
 * Operational Colleague Roles (e.g., Observer, MHE Operator, Machine Operator)
 * Used to specify which colleague types an instrument applies to,
 * and to identify the colleague being observed in the field.
 */
export interface ColleagueRole {
  id: string;
  code: string; // 'observer' | 'mhe_operator' | 'machine_operator' | string
  name: string; // 'Observer' | 'MHE Operator' | 'Machine Operator' | string
  description?: string;
  badge_color?: string;
  is_can_observe?: boolean; // Can conduct observations
  is_can_be_observed?: boolean; // Can be observed as operator/colleague
  is_system?: boolean;
}

export interface ColleagueProfile {
  id: string;
  tenant_id: string;
  user_id?: string | null; // Optional link to auth user profile
  full_name: string;
  employee_id: string; // Badge # / Operative ID (e.g. OP-1042)
  email?: string | null;
  phone?: string | null;
  site_id?: string | null;
  site_name?: string | null;
  area_id?: string | null;
  area_name?: string | null;
  department?: string | null;
  shift?: string | null; // 'Morning' | 'Afternoon' | 'Night' | 'Rotation'
  status: 'active' | 'inactive';
  role_ids: string[]; // List of assigned role codes or IDs (e.g. ['observer', 'mhe_operator'])
  is_observer: boolean; // Flag: can perform observations
  is_operator: boolean; // Flag: can be observed
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_COLLEAGUE_ROLES: ColleagueRole[] = [
  {
    id: 'role-observer',
    code: 'observer',
    name: 'Observer',
    description: 'Qualified to conduct and record workplace observations on the shopfloor',
    badge_color: 'bg-blue-50 text-blue-750 border-blue-200',
    is_can_observe: true,
    is_can_be_observed: true,
    is_system: true
  },
  {
    id: 'role-mhe-operator',
    code: 'mhe_operator',
    name: 'MHE Operator',
    description: 'Material Handling Equipment operator (Forklifts, Reach Trucks, VNA, LLOP, PPT)',
    badge_color: 'bg-amber-50 text-amber-800 border-amber-200',
    is_can_observe: false,
    is_can_be_observed: true,
    is_system: true
  },
  {
    id: 'role-machine-operator',
    code: 'machine_operator',
    name: 'Machine Operator',
    description: 'Machinery and production equipment operator (Conveyors, Packing lines, Palletizers)',
    badge_color: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    is_can_observe: false,
    is_can_be_observed: true,
    is_system: true
  },
  {
    id: 'role-warehouse-operative',
    code: 'warehouse_operative',
    name: 'Warehouse Operative',
    description: 'General warehouse, pick/pack, loading and stock staging operative',
    badge_color: 'bg-purple-50 text-purple-800 border-purple-200',
    is_can_observe: false,
    is_can_be_observed: true,
    is_system: true
  },
  {
    id: 'role-supervisor',
    code: 'supervisor',
    name: 'Supervisor / Team Leader',
    description: 'Shift supervisor, line lead, or department coordinator',
    badge_color: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    is_can_observe: true,
    is_can_be_observed: true,
    is_system: true
  }
];
