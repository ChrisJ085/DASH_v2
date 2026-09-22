import React, { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, X, Search, Plus } from 'lucide-react';

export interface MultiSelectOption {
  id: string;
  name: string;
  code?: string;
  description?: string | null;
}

interface MultiSelectEntityDropdownProps {
  label: string;
  placeholder?: string;
  allSelectedLabel?: string;
  options: MultiSelectOption[];
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
  onCreateNew?: () => void;
  createNewText?: string;
  badgeColor?: 'indigo' | 'emerald' | 'purple' | 'blue' | 'amber' | 'slate';
  disabled?: boolean;
}

export const MultiSelectEntityDropdown: React.FC<MultiSelectEntityDropdownProps> = ({
  label,
  placeholder = 'Select options...',
  allSelectedLabel = '-- All --',
  options,
  selectedIds,
  onChange,
  onCreateNew,
  createNewText,
  badgeColor = 'indigo',
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter((opt) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      opt.name.toLowerCase().includes(query) ||
      (opt.code && opt.code.toLowerCase().includes(query)) ||
      (opt.description && opt.description.toLowerCase().includes(query))
    );
  });

  const isAllSelected = options.length > 0 && selectedIds.length === options.length;

  const handleToggleOption = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((item) => item !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const handleSelectAll = () => {
    if (isAllSelected) {
      onChange([]);
    } else {
      onChange(options.map((o) => o.id));
    }
  };

  const handleRemoveBadge = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onChange(selectedIds.filter((item) => item !== id));
  };

  const handleClearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  const badgeStyles = {
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
    purple: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
    slate: 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
  }[badgeColor];

  const selectedOptions = options.filter((o) => selectedIds.includes(o.id));

  return (
    <div className="space-y-1 text-xs relative" ref={dropdownRef}>
      <div className="flex items-center justify-between">
        <label className="font-bold text-slate-700 block">{label}</label>
        {selectedIds.length > 0 && (
          <button
            type="button"
            onClick={handleClearAll}
            className="text-[10px] font-semibold text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
          >
            Clear All ({selectedIds.length})
          </button>
        )}
      </div>

      {/* Trigger Box */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full min-h-[38px] p-1.5 px-2.5 bg-white border rounded-xl flex items-center justify-between cursor-pointer transition-all ${
          isOpen
            ? 'border-indigo-600 ring-2 ring-indigo-100 shadow-xs'
            : 'border-slate-200 hover:border-slate-300'
        } ${disabled ? 'opacity-60 cursor-not-allowed bg-slate-50' : ''}`}
      >
        <div className="flex flex-wrap gap-1 items-center flex-1 pr-2">
          {selectedIds.length === 0 ? (
            <span className="text-slate-400 font-medium italic">{allSelectedLabel}</span>
          ) : (
            selectedOptions.map((opt) => (
              <span
                key={opt.id}
                className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${badgeStyles}`}
              >
                <span>
                  {opt.code ? `[${opt.code}] ` : ''}
                  {opt.name}
                </span>
                <button
                  type="button"
                  onClick={(e) => handleRemoveBadge(e, opt.id)}
                  className="hover:text-red-700 p-0.5 rounded-full cursor-pointer ml-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))
          )}
        </div>

        <div className="flex items-center space-x-1 text-slate-400 shrink-0">
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-indigo-600' : ''
            }`}
          />
        </div>
      </div>

      {/* Popover Dropdown Panel */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Header & Controls */}
          <div className="p-2 border-b border-slate-100 space-y-2 bg-slate-50/70">
            {options.length > 4 && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Search ${label}...`}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}

            <div className="flex items-center justify-between text-[11px]">
              <button
                type="button"
                onClick={handleSelectAll}
                className="font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
              >
                {isAllSelected ? 'Deselect All' : `Select All (${options.length})`}
              </button>
              <span className="text-slate-400 font-medium">
                {selectedIds.length} of {options.length} selected
              </span>
            </div>
          </div>

          {/* Option List */}
          <div className="max-h-56 overflow-y-auto p-1 divide-y divide-slate-100">
            {onCreateNew && createNewText && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onCreateNew();
                }}
                className="w-full text-left px-3 py-2 hover:bg-indigo-50/80 rounded-lg font-bold text-indigo-700 flex items-center space-x-2 text-xs cursor-pointer mb-1 border-b border-indigo-100"
              >
                <Plus className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>{createNewText}</span>
              </button>
            )}

            {filteredOptions.length === 0 ? (
              <div className="p-4 text-center text-slate-400 italic text-xs">
                No options found
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = selectedIds.includes(opt.id);
                return (
                  <div
                    key={opt.id}
                    onClick={() => handleToggleOption(opt.id)}
                    className={`flex items-start space-x-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors text-xs ${
                      isSelected ? 'bg-indigo-50/70 font-semibold' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center border transition-colors shrink-0 ${
                        isSelected
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-1.5">
                        {opt.code && (
                          <span className="px-1.5 py-0.2 bg-slate-100 text-slate-600 border border-slate-200 rounded text-[10px] font-mono">
                            {opt.code}
                          </span>
                        )}
                        <span className="text-slate-900 truncate font-medium">{opt.name}</span>
                      </div>
                      {opt.description && (
                        <p className="text-[10px] text-slate-400 truncate mt-0.5">
                          {opt.description}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
