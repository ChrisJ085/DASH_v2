/**
 * Site Area & Operation Type Utilities
 * Manages tenant-level binding and multi-site assignment.
 */

import { SiteArea, OperationType } from '../types/tool-engine';

export interface ParsedAreaMetadata {
  cleanDescription: string;
  siteIds: string[];
  appliesToAllSites: boolean;
}

const SITE_METADATA_REGEX = /<!--dash_sites:(.*?)-->/;

/**
 * Extracts human description and assigned site IDs from an area or operation type.
 */
export function parseAreaSites(
  item: {
    description?: string | null;
    site_id?: string;
    site_ids?: string[];
    applies_to_all_sites?: boolean;
  }
): ParsedAreaMetadata {
  const rawDesc = item.description || '';
  let cleanDesc = rawDesc;
  let siteIds: string[] = [];
  let appliesToAllSites = false;

  // 1. Check if site_ids array is already directly on the object (from DB column)
  if (Array.isArray(item.site_ids) && item.site_ids.length > 0) {
    siteIds = item.site_ids;
  }

  // 2. Check for embedded metadata marker in description
  const match = rawDesc.match(SITE_METADATA_REGEX);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      if (Array.isArray(parsed)) {
        siteIds = parsed;
        appliesToAllSites = parsed.length === 0;
      } else if (parsed && typeof parsed === 'object') {
        siteIds = Array.isArray(parsed.site_ids) ? parsed.site_ids : [];
        appliesToAllSites = !!parsed.all_sites || siteIds.length === 0;
      }
    } catch {
      // ignore parse error
    }
    cleanDesc = rawDesc.replace(SITE_METADATA_REGEX, '').trim();
  } else if (siteIds.length === 0) {
    // 3. If no multi-site metadata was found:
    // If it has a specific site_id, treat it as bound to that specific legacy site
    if (item.site_id) {
      siteIds = [item.site_id];
      appliesToAllSites = false;
    } else {
      // No site_id means applies to all sites in tenant
      appliesToAllSites = true;
    }
  }

  return {
    cleanDescription: cleanDesc,
    siteIds,
    appliesToAllSites
  };
}

/**
 * Formats description text with embedded site assignment metadata.
 */
export function formatAreaDescription(
  userDescription: string,
  siteIds: string[],
  appliesToAllSites: boolean
): string {
  const clean = userDescription.trim();
  const metaPayload = appliesToAllSites ? [] : siteIds;
  const metaString = `<!--dash_sites:${JSON.stringify(metaPayload)}-->`;

  if (!clean) {
    return metaString;
  }
  return `${clean}\n${metaString}`;
}

/**
 * Enriches a SiteArea or OperationType record with parsed multi-site properties.
 */
export function enrichWithSites<T extends SiteArea | OperationType>(item: T): T {
  const { cleanDescription, siteIds, appliesToAllSites } = parseAreaSites(item);
  return {
    ...item,
    description: cleanDescription || null,
    site_ids: siteIds,
    applies_to_all_sites: appliesToAllSites
  };
}

/**
 * Checks whether an Area or Operation Type applies to a given site ID.
 */
export function doesApplyToSite(
  item: {
    site_id?: string;
    site_ids?: string[];
    applies_to_all_sites?: boolean;
    description?: string | null;
  },
  targetSiteId: string
): boolean {
  if (!targetSiteId) return true;

  const { siteIds, appliesToAllSites } = parseAreaSites(item);

  if (appliesToAllSites) {
    return true;
  }

  if (siteIds.length > 0) {
    return siteIds.includes(targetSiteId);
  }

  // Fallback to legacy single site_id
  return item.site_id === targetSiteId;
}
