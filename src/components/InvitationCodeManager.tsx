// src/components/InvitationCodeManager.tsx

import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth-context';
import { TenantInvitationCode } from '../types/database';
import {
  fetchInvitationCodes,
  createInvitationCode,
  toggleInvitationCode,
  deleteInvitationCode,
  updateInvitationCodeMaxUses,
  fetchClaimDetails,
  ClaimDetail
} from '../lib/invitation-code-service';
import {
  KeyRound,
  Plus,
  Copy,
  Check,
  Shield,
  Clock,
  Users,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Power,
  FileCode,
  X,
  Edit3,
  Save,
  Lock
} from 'lucide-react';

export default function InvitationCodeManager() {
  const { user, profile } = useAuth();
  const [codes, setCodes] = useState<TenantInvitationCode[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Editing Max Uses State
  const [editingCodeId, setEditingCodeId] = useState<string | null>(null);
  const [editingMaxUsesVal, setEditingMaxUsesVal] = useState<number>(1);
  const [updatingUses, setUpdatingUses] = useState<boolean>(false);

  // New Code Form States
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [customCode, setCustomCode] = useState<string>('');
  const [maxUses, setMaxUses] = useState<number>(1);
  const [notes, setNotes] = useState<string>('');
  const [creating, setCreating] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  // SQL Script Viewer Modal State
  const [showSqlModal, setShowSqlModal] = useState<boolean>(false);
  const [sqlCopied, setSqlCopied] = useState<boolean>(false);

  // Claims details state
  const [selectedCodeClaims, setSelectedCodeClaims] = useState<ClaimDetail[]>([]);
  const [loadingClaims, setLoadingClaims] = useState<boolean>(false);
  const [showClaimsModal, setShowClaimsModal] = useState<boolean>(false);
  const [selectedCodeForClaims, setSelectedCodeForClaims] = useState<string>('');

  const handleViewClaims = async (code: TenantInvitationCode) => {
    if (!code.used_by_email) return;
    setSelectedCodeForClaims(code.code);
    setLoadingClaims(true);
    setShowClaimsModal(true);
    try {
      const emails = code.used_by_email.split(',').map(e => e.trim());
      const details = await fetchClaimDetails(emails);
      setSelectedCodeClaims(details);
    } catch (err: any) {
      alert(`Failed to load registration details: ${err.message}`);
    } finally {
      setLoadingClaims(false);
    }
  };

  // Strict check for Chris Jeal (User ID: a48717fd-4c63-43cb-a8f9-0a5de2c4fe0f or chris.jeal@gxo.com)
  const isChrisJeal =
    user?.id === 'a48717fd-4c63-43cb-a8f9-0a5de2c4fe0f' ||
    profile?.id === 'a48717fd-4c63-43cb-a8f9-0a5de2c4fe0f' ||
    user?.email?.toLowerCase() === 'chris.jeal@gxo.com' ||
    profile?.email?.toLowerCase() === 'chris.jeal@gxo.com' ||
    profile?.email?.toLowerCase() === 'cjeal85@gmail.com';

  useEffect(() => {
    loadCodes();
  }, []);

  const loadCodes = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchInvitationCodes();
      setCodes(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load invitation codes.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleStartEditMaxUses = (code: TenantInvitationCode) => {
    setEditingCodeId(code.id);
    setEditingMaxUsesVal(code.max_uses);
  };

  const handleSaveMaxUses = async (id: string) => {
    setUpdatingUses(true);
    try {
      await updateInvitationCodeMaxUses(id, editingMaxUsesVal);
      setEditingCodeId(null);
      await loadCodes();
    } catch (err: any) {
      alert(`Failed to update maximum allowed uses: ${err.message}`);
    } finally {
      setUpdatingUses(false);
    }
  };

  const handleCreateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    setCreateSuccess(null);

    try {
      const newCode = await createInvitationCode({
        code: customCode.trim() || undefined,
        maxUses: maxUses,
        notes: notes.trim() || undefined,
        createdByEmail: profile?.email || user?.email || 'chris.jeal@gxo.com',
        creatorId: user?.id
      });

      setCreateSuccess(`Invitation code "${newCode.code}" generated successfully!`);
      setCustomCode('');
      setNotes('');
      setMaxUses(1);
      await loadCodes();
      setTimeout(() => {
        setShowCreateModal(false);
        setCreateSuccess(null);
      }, 1500);
    } catch (err: any) {
      setCreateError(err.message || 'Error creating invitation code.');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      await toggleInvitationCode(id, !currentStatus);
      await loadCodes();
    } catch (err: any) {
      alert(`Status update failed: ${err.message}`);
    }
  };

  const handleDeleteCode = async (id: string) => {
    if (!confirm('Are you sure you want to permanently delete this invitation code?')) return;
    try {
      await deleteInvitationCode(id);
      await loadCodes();
    } catch (err: any) {
      alert(`Deletion failed: ${err.message}`);
    }
  };

  const rawSqlText = `-- Supabase SQL: Invitation Code Requirement for DASH V2
-- Execute this SQL in your Supabase SQL Editor

-- 1. Create invitation codes table
CREATE TABLE IF NOT EXISTS public.tenant_invitation_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    created_by_email TEXT NOT NULL DEFAULT 'chris.jeal@gxo.com',
    max_uses INTEGER NOT NULL DEFAULT 1,
    times_used INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    expires_at TIMESTAMPTZ NULL,
    notes TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    used_by_email TEXT NULL,
    used_at TIMESTAMPTZ NULL
);

-- Index for case-insensitive code search
CREATE INDEX IF NOT EXISTS idx_tenant_invitation_codes_code ON public.tenant_invitation_codes (upper(code));

-- Enable Row Level Security
ALTER TABLE public.tenant_invitation_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public/authenticated to read active codes" ON public.tenant_invitation_codes;
DROP POLICY IF EXISTS "Allow read active codes" ON public.tenant_invitation_codes;
DROP POLICY IF EXISTS "Allow admins or Chris Jeal to manage codes" ON public.tenant_invitation_codes;
DROP POLICY IF EXISTS "Allow admin manage codes" ON public.tenant_invitation_codes;

-- Allow reading codes for validation
CREATE POLICY "Allow public/authenticated to read active codes" ON public.tenant_invitation_codes FOR SELECT USING (true);

-- Allow admins or Chris Jeal to manage codes
CREATE POLICY "Allow admins or Chris Jeal to manage codes" ON public.tenant_invitation_codes FOR ALL TO authenticated
USING (
    auth.uid() = 'a48717fd-4c63-43cb-a8f9-0a5de2c4fe0f' OR
    auth.jwt() ->> 'email' = 'chris.jeal@gxo.com' OR
    auth.jwt() ->> 'email' = 'cjeal85@gmail.com' OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (is_platform_admin = true OR email = 'chris.jeal@gxo.com'))
);

-- Insert Master Seed Code
INSERT INTO public.tenant_invitation_codes (code, created_by_email, max_uses, notes)
VALUES 
    ('D2-VIP-2026', 'chris.jeal@gxo.com', 10, 'Default D2 Invitation Code'),
    ('D2-CHRIS-JEAL', 'chris.jeal@gxo.com', 100, 'Master Invitation Code for Chris Jeal')
ON CONFLICT (code) DO NOTHING;

-- 2. Update bootstrap_tenant function to enforce invitation code check
CREATE OR REPLACE FUNCTION public.bootstrap_tenant(
    p_tenant_name TEXT,
    p_admin_name TEXT,
    p_invitation_code TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_user_id UUID;
    v_user_email TEXT;
    v_existing_tenant_id UUID;
    v_tenant_id UUID;
    v_role_id UUID;
    v_slug TEXT;
    v_code_record RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to bootstrap tenant.';
    END IF;

    SELECT email INTO v_user_email FROM public.profiles WHERE id = v_user_id;

    -- Bypassed for chris.jeal@gxo.com
    IF lower(COALESCE(v_user_email, '')) <> 'chris.jeal@gxo.com' THEN
        IF p_invitation_code IS NULL OR trim(p_invitation_code) = '' THEN
            RAISE EXCEPTION 'An invitation code is required to register a new tenant. Tenant registration is strictly restricted by invitation only from chris.jeal@gxo.com.';
        END IF;

        SELECT * INTO v_code_record
        FROM public.tenant_invitation_codes
        WHERE upper(trim(code)) = upper(trim(p_invitation_code))
          AND is_active = true
          AND (expires_at IS NULL OR expires_at > now())
        FOR UPDATE;

        IF v_code_record.id IS NULL THEN
            RAISE EXCEPTION 'Invalid or deactivated invitation code. Please request a valid invitation code from chris.jeal@gxo.com.';
        END IF;

        IF v_code_record.times_used >= v_code_record.max_uses THEN
            RAISE EXCEPTION 'This invitation code limit has been reached. Please contact chris.jeal@gxo.com to request an increase in user invitations.';
        END IF;

        UPDATE public.tenant_invitation_codes
        SET times_used = times_used + 1,
            used_by_email = CASE 
                WHEN used_by_email IS NULL OR used_by_email = '' THEN v_user_email 
                ELSE used_by_email || ', ' || COALESCE(v_user_email, 'unknown') 
            END,
            used_at = now()
        WHERE id = v_code_record.id;
    END IF;

    SELECT tenant_id INTO v_existing_tenant_id FROM public.profiles WHERE id = v_user_id FOR UPDATE;
    IF v_existing_tenant_id IS NOT NULL THEN
        RAISE EXCEPTION 'User is already associated with a tenant.';
    END IF;

    IF p_tenant_name IS NULL OR trim(p_tenant_name) = '' THEN
        RAISE EXCEPTION 'Tenant name cannot be empty.';
    END IF;

    v_slug := lower(regexp_replace(trim(p_tenant_name), '[^a-zA-Z0-9]+', '-', 'g'));

    INSERT INTO public.tenants (name, slug, status)
    VALUES (trim(p_tenant_name), v_slug, 'active')
    RETURNING id INTO v_tenant_id;

    UPDATE public.profiles
    SET tenant_id = v_tenant_id,
        full_name = COALESCE(NULLIF(trim(p_admin_name), ''), full_name, 'Tenant Administrator'),
        status = 'active',
        updated_at = now()
    WHERE id = v_user_id;

    SELECT id INTO v_role_id FROM public.roles WHERE tenant_id = v_tenant_id AND (code = 'tenant_admin' OR is_system = true) ORDER BY created_at ASC LIMIT 1;

    IF v_role_id IS NULL THEN
        INSERT INTO public.roles (tenant_id, name, code, description, is_system)
        VALUES (v_tenant_id, 'Tenant Administrator', 'tenant_admin', 'Full administrative control.', true)
        RETURNING id INTO v_role_id;
    END IF;

    INSERT INTO public.user_roles (user_id, role_id, tenant_id)
    VALUES (v_user_id, v_role_id, v_tenant_id) ON CONFLICT DO NOTHING;

    RETURN v_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp;

GRANT EXECUTE ON FUNCTION public.bootstrap_tenant(TEXT, TEXT, TEXT) TO authenticated;

-- 3. Fix harden_roles_management trigger function for tenant bootstrapping
CREATE OR REPLACE FUNCTION public.harden_roles_management()
RETURNS TRIGGER AS $$
DECLARE
    v_caller_id UUID;
    v_caller_is_platform_admin BOOLEAN := FALSE;
    v_caller_tenant_id UUID;
BEGIN
    v_caller_id := auth.uid();
    
    IF v_caller_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT is_platform_admin, tenant_id INTO v_caller_is_platform_admin, v_caller_tenant_id
    FROM public.profiles
    WHERE id = v_caller_id;

    IF COALESCE(v_caller_is_platform_admin, FALSE) THEN
        RETURN NEW;
    END IF;

    -- ALLOW Bootstrapping Exception:
    IF TG_OP = 'INSERT' THEN
        IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_caller_id) THEN
            IF NEW.tenant_id = v_caller_tenant_id AND NEW.code = 'tenant_admin' THEN
                RETURN NEW;
            END IF;
        END IF;
    END IF;

    IF NOT public.has_permission('users.assign_roles') AND NOT public.has_permission('tenant.manage_settings') THEN
        RAISE EXCEPTION 'Security Exception: Insufficient permissions to modify roles.';
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.tenant_id IS DISTINCT FROM v_caller_tenant_id THEN
            RAISE EXCEPTION 'Security Exception: Cannot create roles for another tenant.';
        END IF;
        IF NEW.tenant_id IS NULL THEN
            RAISE EXCEPTION 'Security Exception: Cannot create system roles.';
        END IF;
        IF NEW.is_system IS TRUE THEN
            RAISE EXCEPTION 'Security Exception: Only platform administrators can define system roles.';
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
            RAISE EXCEPTION 'Security Exception: Cannot modify tenant association of a role.';
        END IF;
        IF OLD.tenant_id IS DISTINCT FROM v_caller_tenant_id OR OLD.tenant_id IS NULL THEN
            RAISE EXCEPTION 'Security Exception: Cannot modify system or other tenant roles.';
        END IF;
        IF NEW.is_system IS TRUE THEN
            RAISE EXCEPTION 'Security Exception: Only platform administrators can define system roles.';
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.tenant_id IS DISTINCT FROM v_caller_tenant_id OR OLD.tenant_id IS NULL THEN
            RAISE EXCEPTION 'Security Exception: Cannot delete system or other tenant roles.';
        END IF;
    END IF;

    RETURN NEW;
END;
$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp;`;

  if (!isChrisJeal) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-8 text-center space-y-4 max-w-lg mx-auto my-12">
        <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto border border-red-200">
          <Lock className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-bold text-slate-900">Restricted Access</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            The Invitation Code Authority page is strictly restricted and only accessible to <strong>chris.jeal@gxo.com</strong>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-6 space-y-6 font-sans">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div className="flex items-start space-x-3">
          <div className="p-3 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl shadow-xs shrink-0">
            <KeyRound className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">Tenant Registration Invitation Codes</h2>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-100 text-amber-900 border border-amber-300">
                Invitation Only Mode
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              New tenant account registration is strictly restricted. Only users possessing a valid invitation code generated by <strong>chris.jeal@gxo.com</strong> can register a new organisation.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={() => setShowSqlModal(true)}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl transition-colors flex items-center space-x-1.5 cursor-pointer border border-slate-200"
          >
            <FileCode className="w-4 h-4 text-slate-600" />
            <span>View Required SQL</span>
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center space-x-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Generate Invitation Code</span>
          </button>
        </div>
      </div>

      {/* Access info alert */}
      <div className="p-3.5 bg-indigo-50/60 border border-indigo-100 rounded-xl flex items-start space-x-3 text-xs text-indigo-950">
        <Shield className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="font-bold">Managed by Chris Jeal (chris.jeal@gxo.com)</p>
          <p className="text-[11px] text-indigo-800">
            Codes can be configured for single-use or multi-use. Once an invitation code reaches its max usage limit, registration attempts using it will be blocked both on the client and in database security rules.
          </p>
        </div>
      </div>

      {/* Code List Table */}
      {loading ? (
        <div className="py-12 text-center text-xs font-semibold text-slate-400">Loading invitation codes...</div>
      ) : error ? (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : codes.length === 0 ? (
        <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-2xl p-6 space-y-3">
          <KeyRound className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-xs font-semibold text-slate-600">No invitation codes created yet.</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-amber-600 text-white text-xs font-bold rounded-xl cursor-pointer"
          >
            Create Master Code
          </button>
        </div>
      ) : (
        <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 shadow-2xs">
          {codes.map(c => {
            const isExhausted = c.times_used >= c.max_uses;
            const isExpired = c.expires_at ? new Date(c.expires_at) < new Date() : false;
            const isCopied = copiedCode === c.code;

            return (
              <div key={c.id} className="p-4 hover:bg-slate-50/80 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-black tracking-wider text-slate-900 bg-amber-50 px-3 py-1 rounded-lg border border-amber-200 inline-flex items-center">
                      <KeyRound className="w-3.5 h-3.5 mr-1.5 text-amber-600" />
                      {c.code}
                    </span>

                    <button
                      onClick={() => handleCopyCode(c.code)}
                      className="px-2.5 py-1 text-[11px] font-semibold bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-slate-700 transition-colors flex items-center space-x-1 cursor-pointer shadow-3xs"
                      title="Copy code to clipboard"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span className="text-emerald-700 font-bold">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-slate-400" />
                          <span>Copy Code</span>
                        </>
                      )}
                    </button>

                    {/* Status badges */}
                    {!c.is_active ? (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                        Deactivated
                      </span>
                    ) : isExhausted ? (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200">
                        Limit Reached
                      </span>
                    ) : isExpired ? (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                        Expired
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />
                        Active & Ready
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
                    <div className="flex items-center space-x-1">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      <span>Uses:</span>
                      {editingCodeId === c.id ? (
                        <div className="flex items-center space-x-1 ml-1">
                          <input
                            type="number"
                            min="1"
                            max="1000"
                            value={editingMaxUsesVal}
                            onChange={(e) => setEditingMaxUsesVal(parseInt(e.target.value) || 1)}
                            className="w-16 px-2 py-0.5 border border-amber-400 rounded text-xs font-bold text-slate-900 bg-white focus:outline-none"
                          />
                          <button
                            onClick={() => handleSaveMaxUses(c.id)}
                            disabled={updatingUses}
                            className="p-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors cursor-pointer"
                            title="Save Max Uses"
                          >
                            <Save className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => setEditingCodeId(null)}
                            className="p-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded transition-colors cursor-pointer"
                            title="Cancel"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-1 ml-1">
                          <strong className="text-slate-800 font-bold">{c.times_used} / {c.max_uses}</strong>
                          {isChrisJeal && (
                            <button
                              onClick={() => handleStartEditMaxUses(c)}
                              className="ml-1.5 p-1 text-slate-400 hover:text-amber-700 hover:bg-amber-50 rounded transition-colors cursor-pointer"
                              title="Edit Allowed Uses"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <span className="flex items-center">
                      <Clock className="w-3.5 h-3.5 mr-1 text-slate-400" />
                      Created: {new Date(c.created_at).toLocaleDateString()}
                    </span>
                    {c.created_by_email && (
                      <span className="text-slate-400">By: {c.created_by_email}</span>
                    )}
                  </div>

                  {isExhausted && (
                    <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-900 flex items-start space-x-2 mt-2">
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <p className="leading-relaxed">
                        This invitation code limit has been reached. Please contact <strong>chris.jeal@gxo.com</strong> to request an increase in user invitations.
                      </p>
                    </div>
                  )}

                  {c.max_uses < c.times_used && (
                    <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-900 flex items-start space-x-2 mt-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <p className="leading-relaxed">
                        Notice: The configured limit ({c.max_uses}) is lower than the registered tenant users count ({c.times_used}). The tenant needs to contact <strong>chris.jeal@gxo.com</strong> to request an increase.
                      </p>
                    </div>
                  )}

                  {c.notes && (
                    <p className="text-xs text-slate-600 bg-slate-100/70 px-2.5 py-1 rounded-md inline-block">
                      Note: {c.notes}
                    </p>
                  )}

                  {c.used_by_email && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] text-emerald-800 bg-emerald-50/60 border border-emerald-100 px-2.5 py-1 rounded-lg font-semibold inline-flex items-center">
                        Claimed by: <span className="font-mono font-bold text-emerald-900 ml-1.5">{c.used_by_email}</span>
                      </span>
                      <button
                        onClick={() => handleViewClaims(c)}
                        className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100/80 text-indigo-800 border border-indigo-100 rounded-lg text-[11px] font-bold transition-colors cursor-pointer inline-flex items-center space-x-1 shadow-3xs"
                        title="View registered tenant, company name, and admin details"
                      >
                        <Users className="w-3.5 h-3.5 text-indigo-600 mr-1" />
                        <span>View Registered Details</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    onClick={() => handleToggleActive(c.id, c.is_active)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-colors cursor-pointer border flex items-center space-x-1 ${
                      c.is_active
                        ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200'
                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                    }`}
                  >
                    <Power className="w-3.5 h-3.5" />
                    <span>{c.is_active ? 'Deactivate' : 'Activate'}</span>
                  </button>

                  <button
                    onClick={() => handleDeleteCode(c.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                    title="Delete Code"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE INVITATION CODE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-amber-100 text-amber-800 rounded-lg">
                  <KeyRound className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-base">Generate Invitation Code</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {createError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            {createSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{createSuccess}</span>
              </div>
            )}

            <form onSubmit={handleCreateCode} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 block">
                  Custom Code (Optional, leave blank to auto-generate)
                </label>
                <input
                  type="text"
                  placeholder="e.g. D2-TRANSPORT-2026"
                  value={customCode}
                  onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-xs font-mono font-bold tracking-wider uppercase focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 block">Max Allowed Uses</label>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={maxUses}
                  onChange={(e) => setMaxUses(parseInt(e.target.value) || 1)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
                  required
                />
                <p className="text-[10px] text-slate-400">1 = Single-use invitation code. Set higher for team invitations.</p>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 block">Notes / Purpose (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. For North Region Transport Manager"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {creating ? 'Generating...' : 'Create Invitation Code'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW SQL SCRIPT MODAL */}
      {showSqlModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center space-x-2">
                <FileCode className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-base">Required Supabase SQL Schema</h3>
              </div>
              <button
                onClick={() => setShowSqlModal(false)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              If running in a separate cloud Supabase project, execute this SQL script in your <strong>Supabase Dashboard &gt; SQL Editor</strong> to apply the invitation codes table and updated database triggers:
            </p>

            <div className="relative">
              <pre className="bg-slate-900 text-slate-200 font-mono text-[11px] p-4 rounded-xl overflow-x-auto max-h-80 leading-relaxed">
                {rawSqlText}
              </pre>

              <button
                onClick={() => {
                  navigator.clipboard.writeText(rawSqlText);
                  setSqlCopied(true);
                  setTimeout(() => setSqlCopied(false), 2000);
                }}
                className="absolute top-3 right-3 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center space-x-1 shadow-md cursor-pointer"
              >
                {sqlCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{sqlCopied ? 'SQL Copied!' : 'Copy SQL'}</span>
              </button>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowSqlModal(false)}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REGISTERED ORGANIZATION DETAILS MODAL */}
      {showClaimsModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 space-y-5 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b pb-3 shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="p-2.5 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-100">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Registered Company & Profile</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Details for registration using code: <span className="font-mono font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{selectedCodeForClaims}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowClaimsModal(false);
                  setSelectedCodeClaims([]);
                }}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto space-y-4 pr-1 text-xs">
              {loadingClaims ? (
                <div className="py-12 text-center space-y-2">
                  <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-slate-500 font-medium">Fetching registered database records...</p>
                </div>
              ) : selectedCodeClaims.length === 0 ? (
                <div className="py-8 text-center text-slate-500 space-y-1 bg-slate-50 rounded-xl p-4 border border-dashed border-slate-200">
                  <Users className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="font-semibold text-slate-700">No profile details found yet.</p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    The registration code might have been claimed but the setup process for the organization is still pending.
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  {selectedCodeClaims.map((claim, idx) => (
                    <div key={idx} className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden shadow-xs">
                      {/* Organization section */}
                      <div className="p-4 bg-slate-50/70 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-slate-900 text-xs tracking-tight uppercase flex items-center">
                            <span className="w-1.5 h-3 bg-indigo-600 rounded-full mr-2" />
                            Registered Company Details
                          </h4>
                          {claim.tenant ? (
                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                              claim.tenant.status === 'active'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}>
                              {claim.tenant.status.toUpperCase()}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                              PENDING SETUP
                            </span>
                          )}
                        </div>

                        {claim.tenant ? (
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-0.5">
                              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Company Name</span>
                              <p className="font-bold text-slate-800 text-sm leading-tight">{claim.tenant.name}</p>
                            </div>
                            <div className="space-y-0.5">
                              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Environment Slug</span>
                              <p className="font-mono text-xs font-semibold text-slate-700">/{claim.tenant.slug}</p>
                            </div>
                            <div className="space-y-0.5 col-span-2">
                              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Organization ID (Database UUID)</span>
                              <p className="font-mono text-[11px] text-slate-500 break-all">{claim.tenant.id}</p>
                            </div>
                            <div className="space-y-0.5 col-span-2">
                              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Registration Timestamp</span>
                              <p className="font-medium text-slate-700">{new Date(claim.tenant.created_at).toLocaleString()}</p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-500 italic">
                            Company/Tenant creation is not yet completed for this user.
                          </p>
                        )}
                      </div>

                      {/* Profile details */}
                      <div className="p-4 bg-white space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-slate-900 text-xs tracking-tight uppercase flex items-center">
                            <span className="w-1.5 h-3 bg-emerald-600 rounded-full mr-2" />
                            Primary Administrator Profile
                          </h4>
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-50 text-emerald-800 border border-emerald-100">
                            Tenant Admin
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-0.5">
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Full Name</span>
                            <p className="font-bold text-slate-800">{claim.full_name || 'Not Provided'}</p>
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Admin Email</span>
                            <p className="font-mono font-medium text-slate-700">{claim.email}</p>
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Profile Status</span>
                            <p className="font-semibold text-slate-700 capitalize">{claim.status}</p>
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Account Created At</span>
                            <p className="font-medium text-slate-700">{new Date(claim.created_at).toLocaleDateString()}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-3 border-t flex justify-end shrink-0">
              <button
                onClick={() => {
                  setShowClaimsModal(false);
                  setSelectedCodeClaims([]);
                }}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-sm"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
