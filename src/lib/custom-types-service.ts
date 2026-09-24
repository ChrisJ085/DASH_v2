/**
 * Custom Scope Types Service
 * Manages tenant-level custom taxonomies and options mapped to sites.
 */

import { supabase } from './supabase';
import { CustomScopeType, CustomScopeOption } from '../types/custom-types';
import { enrichWithSites } from './site-area-utils';

const DEFAULT_INITIAL_CUSTOM_TYPES: CustomScopeType[] = [
  {
    id: 'cst_areas',
    title: 'Areas',
    code: 'AREAS',
    description: 'Physical zones, departments, and work areas across facility sites.',
    site_ids: [],
    applies_to_all_sites: true,
    is_system: true,
    options: [
      {
        id: 'cso_area_loading',
        name: 'Loading Bay',
        code: 'AR_LOADING',
        description: 'Trailer loading docks and bays',
        site_ids: [],
        applies_to_all_sites: true,
        status: 'active'
      },
      {
        id: 'cso_area_unload',
        name: 'Unloading Bay',
        code: 'AR_UNLOAD',
        description: 'Goods-in receipt and decant bays',
        site_ids: [],
        applies_to_all_sites: true,
        status: 'active'
      },
      {
        id: 'cso_area_storage',
        name: 'Main Storage / Racking',
        code: 'AR_STORE',
        description: 'Aisles, high-bay racking, and bulk storage',
        site_ids: [],
        applies_to_all_sites: true,
        status: 'active'
      }
    ]
  },
  {
    id: 'cst_operations',
    title: 'Operation Types',
    code: 'OPERATIONS',
    description: 'Standard operational workflows, task types, and handling procedures.',
    site_ids: [],
    applies_to_all_sites: true,
    is_system: true,
    options: [
      {
        id: 'cso_op_liveload',
        name: 'Live Load',
        code: 'AR_LIVEL',
        description: 'Active vehicle turnaround loading operations',
        site_ids: [],
        applies_to_all_sites: true,
        status: 'active'
      },
      {
        id: 'cso_op_standtrailer',
        name: 'Stand Trailer',
        code: 'AR_STANDT',
        description: 'Dropped trailer and yard handling operations',
        site_ids: [],
        applies_to_all_sites: true,
        status: 'active'
      },
      {
        id: 'cso_op_flt_inspection',
        name: 'Forklift Handling',
        code: 'OP_FLT',
        description: 'MHE transport and material handling equipment tasks',
        site_ids: [],
        applies_to_all_sites: true,
        status: 'active'
      }
    ]
  }
];

/**
 * Fetch all custom scope types for a tenant.
 * If not yet defined in tenant.settings, seeds from database site_areas/operation_types or standard defaults.
 */
export async function fetchTenantCustomTypes(tenantId: string): Promise<CustomScopeType[]> {
  if (!tenantId) return [];

  try {
    const { data: tenantData, error: tenantErr } = await supabase
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .maybeSingle();

    if (tenantErr) {
      console.warn('Error fetching tenant settings for custom types:', tenantErr);
    }

    const settings = (tenantData?.settings || {}) as Record<string, any>;
    if (Array.isArray(settings.custom_scope_types) && settings.custom_scope_types.length > 0) {
      return settings.custom_scope_types as CustomScopeType[];
    }

    // Attempt to seed from existing site_areas and operation_types tables
    const [areasRes, opsRes] = await Promise.all([
      supabase.from('site_areas').select('*').is('deleted_at', null).order('name'),
      supabase.from('operation_types').select('*').is('deleted_at', null).order('name')
    ]);

    const seededTypes: CustomScopeType[] = JSON.parse(JSON.stringify(DEFAULT_INITIAL_CUSTOM_TYPES));

    if (areasRes.data && areasRes.data.length > 0) {
      const enriched = areasRes.data.map(a => enrichWithSites(a));
      const areaGroup = seededTypes.find(t => t.code === 'AREAS');
      if (areaGroup) {
        areaGroup.options = enriched.map(a => ({
          id: a.id,
          name: a.name,
          code: a.code,
          description: a.description || undefined,
          site_ids: a.site_ids || (a.site_id ? [a.site_id] : []),
          applies_to_all_sites: a.applies_to_all_sites ?? (!a.site_ids || a.site_ids.length === 0),
          status: a.status || 'active'
        }));
      }
    }

    if (opsRes.data && opsRes.data.length > 0) {
      const enriched = opsRes.data.map(o => enrichWithSites(o));
      const opGroup = seededTypes.find(t => t.code === 'OPERATIONS');
      if (opGroup) {
        opGroup.options = enriched.map(o => ({
          id: o.id,
          name: o.name,
          code: o.code,
          description: o.description || undefined,
          site_ids: o.site_ids || (o.site_id ? [o.site_id] : []),
          applies_to_all_sites: o.applies_to_all_sites ?? (!o.site_ids || o.site_ids.length === 0),
          status: o.status || 'active'
        }));
      }
    }

    // Save initial custom types to tenant settings in background
    try {
      await supabase
        .from('tenants')
        .update({
          settings: {
            ...settings,
            custom_scope_types: seededTypes
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', tenantId);
    } catch (saveErr) {
      console.warn('Non-fatal: Failed to persist default custom scope types:', saveErr);
    }

    return seededTypes;
  } catch (err) {
    console.error('Failed to load custom scope types:', err);
    return DEFAULT_INITIAL_CUSTOM_TYPES;
  }
}

/**
 * Persist custom scope types to tenant settings.
 */
export async function saveTenantCustomTypes(
  tenantId: string,
  customTypes: CustomScopeType[]
): Promise<void> {
  if (!tenantId) throw new Error('Missing tenant ID');

  const { data: tenantData, error: fetchErr } = await supabase
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .single();

  if (fetchErr) throw fetchErr;

  const currentSettings = (tenantData?.settings || {}) as Record<string, any>;
  const updatedSettings = {
    ...currentSettings,
    custom_scope_types: customTypes,
    custom_types_updated_at: new Date().toISOString()
  };

  const { error: updateErr } = await supabase
    .from('tenants')
    .update({
      settings: updatedSettings,
      updated_at: new Date().toISOString()
    })
    .eq('id', tenantId);

  if (updateErr) throw updateErr;
}

/**
 * Filters options of a custom type based on targeted site IDs.
 * If targetSiteIds is empty, it means "Global / All sites in tenant", so all options are valid.
 */
export function filterOptionsForSites(
  options: CustomScopeOption[],
  targetSiteIds: string[]
): CustomScopeOption[] {
  if (!targetSiteIds || targetSiteIds.length === 0) {
    return options.filter(o => o.status === 'active');
  }

  return options.filter(o => {
    if (o.status === 'inactive') return false;
    if (o.applies_to_all_sites || !o.site_ids || o.site_ids.length === 0) return true;
    return o.site_ids.some(id => targetSiteIds.includes(id));
  });
}

/**
 * Filters custom types and their options for specific sites.
 */
export function getApplicableCustomTypesForSites(
  customTypes: CustomScopeType[],
  targetSiteIds: string[]
): { type: CustomScopeType; applicableOptions: CustomScopeOption[] }[] {
  return customTypes
    .filter(ct => {
      if (!targetSiteIds || targetSiteIds.length === 0) return true;
      if (ct.applies_to_all_sites || !ct.site_ids || ct.site_ids.length === 0) return true;
      return ct.site_ids.some(id => targetSiteIds.includes(id));
    })
    .map(ct => ({
      type: ct,
      applicableOptions: filterOptionsForSites(ct.options, targetSiteIds)
    }));
}
