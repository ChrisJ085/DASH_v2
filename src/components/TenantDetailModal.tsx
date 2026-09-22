// src/components/TenantDetailModal.tsx

import React, { useState } from 'react';
import { Tenant } from '../types/database';
import { supabase } from '../lib/supabase';
import {
  Building2,
  X,
  Shield,
  MapPin,
  Mail,
  Phone,
  Calendar,
  Layers,
  Briefcase,
  Users,
  CheckCircle2,
  Edit2,
  Save,
  Globe,
  Hash,
  Database
} from 'lucide-react';

interface TenantDetailModalProps {
  tenant: Tenant | null;
  contractsCount: number;
  sitesCount: number;
  colleaguesCount?: number;
  toolsCount?: number;
  recordsCount?: number;
  canEdit?: boolean;
  onClose: () => void;
  onTenantUpdated?: (updatedTenant: Tenant) => void;
}

export const TenantDetailModal: React.FC<TenantDetailModalProps> = ({
  tenant,
  contractsCount,
  sitesCount,
  colleaguesCount = 0,
  toolsCount = 0,
  recordsCount = 0,
  canEdit = true,
  onClose,
  onTenantUpdated
}) => {
  if (!tenant) return null;

  const tenantSettings = (tenant.settings || {}) as Record<string, any>;

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Editable Form Fields
  const [companyName, setCompanyName] = useState<string>(
    (tenantSettings.legal_company_name as string) || (tenantSettings.company_name as string) || tenant.name || ''
  );
  const [displayName, setDisplayName] = useState<string>(tenant.name || '');
  const [companyNumber, setCompanyNumber] = useState<string>(
    (tenantSettings.company_number as string) || ''
  );
  const [vatNumber, setVatNumber] = useState<string>(
    (tenantSettings.vat_number as string) || ''
  );
  const [industry, setIndustry] = useState<string>(
    (tenantSettings.industry as string) || 'Contract Logistics & Supply Chain (3PL)'
  );
  const [addressLine1, setAddressLine1] = useState<string>(
    (tenantSettings.address_line1 as string) || ''
  );
  const [city, setCity] = useState<string>(
    (tenantSettings.city as string) || ''
  );
  const [postalCode, setPostalCode] = useState<string>(
    (tenantSettings.postal_code as string) || ''
  );
  const [country, setCountry] = useState<string>(
    (tenantSettings.country as string) || 'United Kingdom'
  );
  const [contactName, setContactName] = useState<string>(
    (tenantSettings.contact_name as string) || ''
  );
  const [contactEmail, setContactEmail] = useState<string>(
    (tenantSettings.contact_email as string) || ''
  );
  const [contactPhone, setContactPhone] = useState<string>(
    (tenantSettings.contact_phone as string) || ''
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      const updatedSettings = {
        ...tenantSettings,
        legal_company_name: companyName.trim(),
        company_name: companyName.trim(),
        company_number: companyNumber.trim(),
        vat_number: vatNumber.trim(),
        industry: industry.trim(),
        address_line1: addressLine1.trim(),
        city: city.trim(),
        postal_code: postalCode.trim(),
        country: country.trim(),
        contact_name: contactName.trim(),
        contact_email: contactEmail.trim(),
        contact_phone: contactPhone.trim(),
        last_updated_by: 'tenant_admin'
      };

      const { data, error } = await supabase
        .from('tenants')
        .update({
          name: displayName.trim() || companyName.trim() || tenant.name,
          settings: updatedSettings,
          updated_at: new Date().toISOString()
        })
        .eq('id', tenant.id)
        .select()
        .single();

      if (error) throw error;

      setSaveSuccess('Tenant and Company details updated successfully.');
      setIsEditing(false);
      if (onTenantUpdated && data) {
        onTenantUpdated(data as Tenant);
      }
    } catch (err: any) {
      console.error('Error saving tenant details:', err);
      setSaveError(err.message || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-3xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-8 animate-in fade-in zoom-in duration-150">
        
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/30 border border-indigo-400/30 flex items-center justify-center text-indigo-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-white tracking-tight">Organisation & Company Profile</h2>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase">
                  {tenant.status}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Tenant ID: <span className="font-mono text-slate-300">{tenant.id}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {canEdit && !isEditing && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 flex items-center space-x-1.5 cursor-pointer transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5 text-indigo-400" />
                <span>Edit Profile</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto max-h-[calc(85vh-140px)] space-y-6 text-xs text-slate-700">
          
          {saveError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 font-medium">
              {saveError}
            </div>
          )}

          {saveSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 font-medium flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{saveSuccess}</span>
            </div>
          )}

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Contracts</span>
              <span className="text-base font-bold text-slate-900">{contractsCount}</span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Physical Sites</span>
              <span className="text-base font-bold text-slate-900">{sitesCount}</span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Colleagues</span>
              <span className="text-base font-bold text-slate-900">{colleaguesCount}</span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Instruments</span>
              <span className="text-base font-bold text-slate-900">{toolsCount}</span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-center col-span-2 sm:col-span-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Submissions</span>
              <span className="text-base font-bold text-slate-900">{recordsCount}</span>
            </div>
          </div>

          {isEditing ? (
            <form onSubmit={handleSave} className="space-y-5">
              
              {/* Company Legal Information */}
              <div className="space-y-3">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-900 border-b border-slate-100 pb-1 flex items-center">
                  <Briefcase className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
                  Legal Company Information
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-600">Company Legal Name *</label>
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="e.g. GXO Logistics UK Limited"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-900 font-semibold focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-slate-600">System Display Name *</label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g. GXO UK Operations"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-900 font-semibold focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-slate-600">Company Registration Number</label>
                    <input
                      type="text"
                      value={companyNumber}
                      onChange={(e) => setCompanyNumber(e.target.value)}
                      placeholder="e.g. 01234567"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-900 font-mono focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-slate-600">VAT / Tax Identification</label>
                    <input
                      type="text"
                      value={vatNumber}
                      onChange={(e) => setVatNumber(e.target.value)}
                      placeholder="e.g. GB 123 4567 89"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-900 font-mono focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white"
                    />
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <label className="font-semibold text-slate-600">Industry / Sector</label>
                    <input
                      type="text"
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                      placeholder="e.g. Contract Logistics, Warehousing & Supply Chain"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Registered Address */}
              <div className="space-y-3">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-900 border-b border-slate-100 pb-1 flex items-center">
                  <MapPin className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
                  Registered Business Address
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1 sm:col-span-2">
                    <label className="font-semibold text-slate-600">Address Line 1</label>
                    <input
                      type="text"
                      value={addressLine1}
                      onChange={(e) => setAddressLine1(e.target.value)}
                      placeholder="e.g. 100 Logistics Boulevard"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-slate-600">Town / City</label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="e.g. Northampton"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-slate-600">Postal Code</label>
                    <input
                      type="text"
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      placeholder="e.g. NN4 7YB"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-900 font-mono focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white"
                    />
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <label className="font-semibold text-slate-600">Country</label>
                    <input
                      type="text"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      placeholder="e.g. United Kingdom"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Primary Contact Person */}
              <div className="space-y-3">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-900 border-b border-slate-100 pb-1 flex items-center">
                  <Users className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
                  Primary Organisation Contact
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-600">Contact Name</label>
                    <input
                      type="text"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="e.g. Operations Director"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-slate-600">Contact Email</label>
                    <input
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="e.g. contact@organisation.com"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-slate-600">Telephone</label>
                    <input
                      type="tel"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      placeholder="e.g. +44 1604 123456"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  disabled={saving}
                  className="px-4 py-2 text-slate-600 hover:text-slate-900 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-xs flex items-center space-x-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{saving ? 'Saving Changes...' : 'Save Profile'}</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-6">
              
              {/* Organisation Credentials Card */}
              <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                  <div className="flex items-center space-x-2">
                    <Building2 className="w-4 h-4 text-indigo-600" />
                    <span className="font-bold text-slate-900">Legal Entity</span>
                  </div>
                  <span className="text-[10px] font-semibold text-slate-500">
                    Slug: <code className="font-mono text-indigo-700 bg-indigo-50 px-1 py-0.5 rounded">/{tenant.slug}</code>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Company Legal Name</span>
                    <span className="text-sm font-bold text-slate-900 block mt-0.5">
                      {companyName || tenant.name}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Display Brand Name</span>
                    <span className="text-sm font-semibold text-slate-700 block mt-0.5">
                      {tenant.name}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Company Registration Number</span>
                    <span className="text-xs font-mono font-semibold text-slate-700 block mt-0.5">
                      {companyNumber || 'Not specified'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">VAT / Tax ID</span>
                    <span className="text-xs font-mono font-semibold text-slate-700 block mt-0.5">
                      {vatNumber || 'Not specified'}
                    </span>
                  </div>

                  <div className="sm:col-span-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Sector / Industry</span>
                    <span className="text-xs font-medium text-slate-700 block mt-0.5">
                      {industry}
                    </span>
                  </div>
                </div>
              </div>

              {/* Address and Contact info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Registered Address */}
                <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-4 space-y-2">
                  <div className="flex items-center space-x-1.5 text-slate-900 font-bold border-b border-slate-200/60 pb-1.5">
                    <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Registered Business Address</span>
                  </div>
                  {addressLine1 || city || postalCode ? (
                    <div className="text-xs space-y-0.5 text-slate-700 pt-1">
                      {addressLine1 && <p className="font-medium">{addressLine1}</p>}
                      <p>{[city, postalCode].filter(Boolean).join(', ')}</p>
                      <p className="font-semibold text-slate-900">{country}</p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic pt-1">No address registered yet.</p>
                  )}
                </div>

                {/* Primary Contact */}
                <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-4 space-y-2">
                  <div className="flex items-center space-x-1.5 text-slate-900 font-bold border-b border-slate-200/60 pb-1.5">
                    <Users className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Organisation Contact</span>
                  </div>
                  {contactName || contactEmail || contactPhone ? (
                    <div className="text-xs space-y-1 text-slate-700 pt-1">
                      {contactName && <p className="font-bold text-slate-900">{contactName}</p>}
                      {contactEmail && (
                        <p className="flex items-center space-x-1 text-slate-600">
                          <Mail className="w-3 h-3 text-slate-400" />
                          <span>{contactEmail}</span>
                        </p>
                      )}
                      {contactPhone && (
                        <p className="flex items-center space-x-1 text-slate-600">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{contactPhone}</span>
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic pt-1">No primary contact details entered.</p>
                  )}
                </div>
              </div>

              {/* Tenancy & Security Architecture */}
              <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 space-y-3">
                <div className="flex items-center space-x-2 text-indigo-950 font-bold">
                  <Shield className="w-4 h-4 text-indigo-600" />
                  <span>Architecture & Security Isolation</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-indigo-950">
                  <div className="p-2.5 bg-white/80 rounded-lg border border-indigo-100/60">
                    <span className="text-[10px] text-indigo-700 font-bold uppercase tracking-wider block">Security Isolation</span>
                    <span className="font-semibold flex items-center mt-0.5 text-emerald-800">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mr-1" />
                      Row-Level Security (RLS) Active
                    </span>
                  </div>

                  <div className="p-2.5 bg-white/80 rounded-lg border border-indigo-100/60">
                    <span className="text-[10px] text-indigo-700 font-bold uppercase tracking-wider block">Registration Authority</span>
                    <span className="font-semibold text-slate-800 mt-0.5 block truncate">
                      chris.jeal@gxo.com
                    </span>
                  </div>

                  <div className="p-2.5 bg-white/80 rounded-lg border border-indigo-100/60">
                    <span className="text-[10px] text-indigo-700 font-bold uppercase tracking-wider block">Provisioning Timestamp</span>
                    <span className="font-mono text-slate-700 mt-0.5 block">
                      {new Date(tenant.created_at).toLocaleString()}
                    </span>
                  </div>

                  <div className="p-2.5 bg-white/80 rounded-lg border border-indigo-100/60">
                    <span className="text-[10px] text-indigo-700 font-bold uppercase tracking-wider block">Database UUID</span>
                    <span className="font-mono text-slate-700 mt-0.5 block truncate" title={tenant.id}>
                      {tenant.id}
                    </span>
                  </div>
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            D2 Tenancy Isolation Platform • Multi-Tenant Enterprise Tier
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-xl text-xs cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
