// src/components/ObservationList.tsx

import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth-context';
import { supabase } from '../lib/supabase';
import {
  fetchFullToolDefinition,
  FullToolDefinition
} from '../lib/observation-service';
import { Observation, ObservationResponse } from '../types/tool-engine';
import {
  FileText,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  MapPin,
  CheckCircle,
  AlertCircle,
  Eye,
  X,
  Camera,
  PenTool,
  Users
} from 'lucide-react';

export default function ObservationList() {
  const { profile, tenant } = useAuth();

  const [observations, setObservations] = useState<Observation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination & Filter State
  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(10);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Selected Detail View Modal
  const [selectedObs, setSelectedObs] = useState<Observation | null>(null);
  const [selectedObsResponses, setSelectedObsResponses] = useState<ObservationResponse[]>([]);
  const [selectedObsDef, setSelectedObsDef] = useState<FullToolDefinition | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!profile?.tenant_id) return;
    loadObservations();
  }, [profile?.tenant_id, page, statusFilter]);

  const loadObservations = async () => {
    if (!profile?.tenant_id) return;
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('observations')
        .select('*', { count: 'exact' })
        .eq('tenant_id', profile.tenant_id)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, count, error: err } = await query;
      if (err) throw err;

      setObservations(data || []);
      setTotalCount(count || 0);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDetail = async (obs: Observation) => {
    if (!profile?.tenant_id) return;
    setSelectedObs(obs);
    setDetailLoading(true);

    try {
      // 1. Fetch exact tool version definition associated with this observation!
      const def = await fetchFullToolDefinition(obs.tool_version_id, profile.tenant_id);
      setSelectedObsDef(def);

      // 2. Fetch responses for this observation
      const { data: respData, error: respErr } = await supabase
        .from('observation_responses')
        .select('*')
        .eq('observation_id', obs.id)
        .eq('tenant_id', profile.tenant_id);

      if (respErr) throw respErr;
      setSelectedObsResponses(respData || []);
    } catch (err) {
      alert(`Failed to load historical detail: ${(err as Error).message}`);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header & Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 font-sans">Observation Records</h2>
            <p className="text-xs text-slate-500">View submitted and in-progress shopfloor observation logs.</p>
          </div>

          {/* Status Filter Tabs */}
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-lg text-xs font-semibold">
            {['all', 'completed', 'in_progress'].map(st => (
              <button
                key={st}
                onClick={() => {
                  setStatusFilter(st);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-md capitalize transition-colors cursor-pointer ${
                  statusFilter === st
                    ? 'bg-white text-slate-900 shadow-3xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Table / List View */}
        {loading ? (
          <div className="p-8 text-center text-xs font-semibold text-slate-400">Loading observations...</div>
        ) : observations.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-slate-200 rounded-xl text-xs text-slate-400">
            No observation records found for the selected filter.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {observations.map(obs => (
              <div
                key={obs.id}
                className="py-3 flex items-center justify-between hover:bg-slate-50 px-3 rounded-lg transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-[11px] font-bold text-slate-900">
                      #{obs.id.substring(0, 8)}
                    </span>
                    <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${
                      obs.status === 'completed'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {obs.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span className="flex items-center">
                      <Clock className="w-3 h-3 mr-1 text-slate-400" />
                      {new Date(obs.created_at).toLocaleString()}
                    </span>
                    {(obs.metadata as any)?.observed_colleague_name && (
                      <span className="flex items-center font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                        <Users className="w-3 h-3 mr-1 text-indigo-600" />
                        Observed: <strong className="ml-1">{(obs.metadata as any).observed_colleague_name}</strong>
                        {((obs.metadata as any).observed_colleague_employee_id || (obs.metadata as any).observed_colleague_role) && (
                          <span className="text-slate-500 font-mono ml-1">
                            ({(obs.metadata as any).observed_colleague_employee_id || (obs.metadata as any).observed_colleague_role})
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => handleOpenDetail(obs)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg transition-colors flex items-center cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 mr-1" /> View Detail
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Pagination Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500 font-semibold">
          <span>
            Showing page {page} of {Math.ceil(totalCount / pageSize) || 1} ({totalCount} total)
          </span>
          <div className="flex space-x-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 border rounded-md disabled:opacity-30 hover:bg-slate-50 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page * pageSize >= totalCount}
              className="p-1.5 border rounded-md disabled:opacity-30 hover:bg-slate-50 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Historical Detail Modal */}
      {selectedObs && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-6">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">
                  Historical Observation Record
                </span>
                <h2 className="text-lg font-bold text-slate-900">
                  Observation #{selectedObs.id.substring(0, 13)}...
                </h2>
              </div>
              <button
                onClick={() => setSelectedObs(null)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {detailLoading || !selectedObsDef ? (
              <div className="p-8 text-center text-xs text-slate-400 font-semibold">
                Loading immutable tool version definition...
              </div>
            ) : (
              <div className="space-y-6 text-xs">
                {/* Header detail */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Instrument</span>
                    <span className="font-bold text-slate-900">{selectedObsDef.tool.name}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Tool Version</span>
                    <span className="font-mono font-bold text-indigo-700">v{selectedObsDef.version.version_number}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Status</span>
                    <span className="font-bold uppercase text-green-700">{selectedObs.status}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Captured Date</span>
                    <span className="font-semibold text-slate-800">{new Date(selectedObs.created_at).toLocaleString()}</span>
                  </div>
                  {(selectedObs.metadata as any)?.observed_colleague_name && (
                    <div className="col-span-2 pt-2 border-t border-slate-200/80 flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-[10px]">
                          <Users className="w-3 h-3" />
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Observed Colleague</span>
                          <span className="font-bold text-slate-900">
                            {(selectedObs.metadata as any).observed_colleague_name}
                          </span>
                          {((selectedObs.metadata as any).observed_colleague_employee_id || (selectedObs.metadata as any).observed_colleague_role) && (
                            <span className="text-slate-500 font-mono ml-1.5 text-[11px]">
                              ({(selectedObs.metadata as any).observed_colleague_employee_id || (selectedObs.metadata as any).observed_colleague_role})
                            </span>
                          )}
                        </div>
                      </div>
                      {(selectedObs.metadata as any).observed_colleague_role && (
                        <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded capitalize">
                          {(selectedObs.metadata as any).observed_colleague_role}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Question & Answer Responses */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Recorded Responses</h3>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                    {selectedObsDef.questions.map(q => {
                      const resp = selectedObsResponses.find(r => r.question_id === q.id);
                      const displayVal = resp?.answer_text || resp?.answer_numeric || (resp?.answer_boolean !== null && resp?.answer_boolean !== undefined ? String(resp.answer_boolean) : null) || resp?.selected_option_id || 'N/A';

                      return (
                        <div key={q.id} className="p-3.5 bg-white flex items-start justify-between">
                          <div className="space-y-0.5">
                            <span className="font-mono text-[9px] font-bold text-slate-400">{q.question_code}</span>
                            <p className="font-bold text-slate-800">{q.question_text}</p>
                          </div>
                          <div className="text-right">
                            <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded inline-block">
                              {String(displayVal)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
