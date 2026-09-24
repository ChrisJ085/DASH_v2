/**
 * Custom Scope Types & Taxonomies
 * Enables tenant admins to define custom categorisation types (e.g. Areas, Operation Types, Shifts, Departments)
 * and assign them across physical sites for instrument building and observation execution.
 */

export interface CustomScopeOption {
  id: string;
  name: string;
  code: string;
  description?: string;
  site_ids: string[]; // multi-selected site IDs
  applies_to_all_sites: boolean;
  status: 'active' | 'inactive';
  created_at?: string;
  updated_at?: string;
}

export interface CustomScopeType {
  id: string;
  title: string; // e.g. "Areas", "Operation Types", "Shifts", "Departments"
  code: string; // e.g. "AREAS", "OPERATIONS", "SHIFTS"
  description?: string;
  site_ids: string[]; // which sites this entire taxonomy applies to
  applies_to_all_sites: boolean;
  options: CustomScopeOption[];
  is_system?: boolean;
  created_at?: string;
  updated_at?: string;
}

export type CustomScopeSelections = Record<string, string[]>; // { [customTypeId]: [selectedOptionIds] }
