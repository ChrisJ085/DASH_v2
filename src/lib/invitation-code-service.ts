// src/lib/invitation-code-service.ts

import { supabase } from './supabase';
import { TenantInvitationCode } from '../types/database';

export interface CodeValidationResult {
  valid: boolean;
  message: string;
  codeRecord?: TenantInvitationCode;
}

/**
  Checks if an invitation code is active, not expired, and has remaining usage capacity.
 */
export async function validateInvitationCode(code: string): Promise<CodeValidationResult> {
  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode) {
    return { valid: false, message: 'Please enter an invitation code.' };
  }

  try {
    const { data, error } = await supabase
      .from('tenant_invitation_codes')
      .select('*')
      .ilike('code', cleanCode)
      .maybeSingle();

    if (error) {
      // Table may not exist yet or connection error
      return {
        valid: false,
        message: `Validation error: ${error.message}`
      };
    }

    if (!data) {
      return {
        valid: false,
        message: 'Invalid invitation code. Registration is strictly restricted.'
      };
    }

    const record = data as TenantInvitationCode;

    if (!record.is_active) {
      return {
        valid: false,
        message: 'This invitation code has been deactivated.'
      };
    }

    if (record.expires_at && new Date(record.expires_at) < new Date()) {
      return {
        valid: false,
        message: 'This invitation code has expired.'
      };
    }

    if (record.times_used >= record.max_uses) {
      return {
        valid: false,
        message: 'This invitation code limit has been reached. Please contact chris.jeal@gxo.com to request an increase in user invitations.'
      };
    }

    return {
      valid: true,
      message: 'Invitation code verified successfully!',
      codeRecord: record
    };
  } catch (err: any) {
    return {
      valid: false,
      message: err.message || 'Error validating invitation code.'
    };
  }
}

/**
  Fetches all tenant invitation codes for management (Chris Jeal / Admins).
 */
export async function fetchInvitationCodes(): Promise<TenantInvitationCode[]> {
  try {
    const { data, error } = await supabase
      .from('tenant_invitation_codes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as TenantInvitationCode[];
  } catch (err) {
    console.error('Error fetching invitation codes:', err);
    return [];
  }
}

/**
  Generates or inserts a new tenant invitation code.
 */
export async function createInvitationCode(params: {
  code?: string;
  maxUses?: number;
  notes?: string;
  expiresAt?: string;
  createdByEmail?: string;
  creatorId?: string;
}): Promise<TenantInvitationCode> {
  const isAuthorized =
    params.creatorId === 'a48717fd-4c63-43cb-a8f9-0a5de2c4fe0f' ||
    params.createdByEmail?.toLowerCase() === 'chris.jeal@gxo.com' ||
    params.createdByEmail?.toLowerCase() === 'cjeal85@gmail.com';

  if (!isAuthorized) {
    throw new Error('Unauthorized: Only chris.jeal@gxo.com (Authority ID: a48717fd-4c63-43cb-a8f9-0a5de2c4fe0f) has permission to create tenant invitation codes.');
  }

  // Generate a code if none provided
  const generatedCode = params.code?.trim().toUpperCase() ||
    `D2-INVITE-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

  const { data, error } = await supabase
    .from('tenant_invitation_codes')
    .insert({
      code: generatedCode,
      created_by_email: params.createdByEmail || 'chris.jeal@gxo.com',
      max_uses: params.maxUses || 1,
      notes: params.notes || null,
      expires_at: params.expiresAt || null,
      is_active: true
    })
    .select('*')
    .single();

  if (error) throw new Error(`Failed to create invitation code: ${error.message}`);
  return data as TenantInvitationCode;
}

/**
  Toggles activation status of an invitation code.
 */
export async function toggleInvitationCode(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from('tenant_invitation_codes')
    .update({ is_active: isActive })
    .eq('id', id);

  if (error) throw new Error(error.message);
}

/**
  Deletes an invitation code.
 */
export async function deleteInvitationCode(id: string): Promise<void> {
  const { error } = await supabase
    .from('tenant_invitation_codes')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}

/**
  Updates the maximum allowed uses for an invitation code.
 */
export async function updateInvitationCodeMaxUses(id: string, newMaxUses: number): Promise<void> {
  if (newMaxUses < 1) {
    throw new Error('Maximum allowed uses must be at least 1.');
  }

  const { error } = await supabase
    .from('tenant_invitation_codes')
    .update({ max_uses: newMaxUses })
    .eq('id', id);

  if (error) throw new Error(error.message);
}

export interface ClaimDetail {
  email: string;
  full_name: string;
  status: string;
  created_at: string;
  tenant: {
    id: string;
    name: string;
    slug: string;
    status: string;
    created_at: string;
  } | null;
}

/**
  Fetches profile and associated tenant details for a set of claimer emails.
 */
export async function fetchClaimDetails(emails: string[]): Promise<ClaimDetail[]> {
  if (!emails || emails.length === 0) return [];
  
  const cleanEmails = emails.map(e => e.trim().toLowerCase());

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, status, created_at, tenant_id')
    .in('email', cleanEmails);

  if (error) {
    console.error('Error fetching claim profiles:', error);
    return [];
  }

  if (!data || data.length === 0) return [];

  const tenantIds = data.map(p => p.tenant_id).filter(id => !!id) as string[];
  const tenantsMap: Record<string, any> = {};

  if (tenantIds.length > 0) {
    const { data: tenantsData, error: tenantsError } = await supabase
      .from('tenants')
      .select('id, name, slug, status, created_at')
      .in('id', tenantIds);

    if (!tenantsError && tenantsData) {
      tenantsData.forEach(t => {
        tenantsMap[t.id] = t;
      });
    }
  }

  return data.map(p => ({
    email: p.email,
    full_name: p.full_name,
    status: p.status,
    created_at: p.created_at,
    tenant: p.tenant_id ? tenantsMap[p.tenant_id] || null : null
  }));
}
