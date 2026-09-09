'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronDown,
  Search,
  GitBranch,
  Lock,
  Globe,
  Check,
  Plus,
  FolderGit2,
  ExternalLink,
} from 'lucide-react';

export interface RepoItem {
  id: number;
  fullName: string;
  private: boolean;
  url?: string;
  description?: string | null;
  defaultBranch?: string;
}

interface RepoSelectDropdownProps {
  repos: RepoItem[];
  selectedRepo: string;
  onSelectRepo: (repoFullName: string, defaultBranch?: string) => void;
  disabled?: boolean;
  className?: string;
}

export default function RepoSelectDropdown({
  repos,
  selectedRepo,
  onSelectRepo,
  disabled = false,
  className = '',
}: RepoSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [customInput, setCustomInput] = useState('');
  const [isCustomMode, setIsCustomMode] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredRepos = repos.filter((r) =>
    r.fullName.toLowerCase().includes(searchTerm.toLowerCase().trim()) ||
    (r.description && r.description.toLowerCase().includes(searchTerm.toLowerCase().trim()))
  );

  const selectedItem = repos.find((r) => r.fullName.toLowerCase() === selectedRepo.toLowerCase());

  const handleSelect = (repo: RepoItem) => {
    onSelectRepo(repo.fullName, repo.defaultBranch || 'main');
    setIsOpen(false);
    setSearchTerm('');
    setIsCustomMode(false);
  };

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (customInput.trim()) {
      onSelectRepo(customInput.trim());
      setIsOpen(false);
      setCustomInput('');
      setIsCustomMode(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Dropdown Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-lg bg-bg-subtle border border-border-default hover:border-border-hover focus:border-accent-cyan text-xs font-mono text-text-primary outline-none transition-all disabled:opacity-60 text-left"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FolderGit2 size={15} className="text-accent-cyan shrink-0" />
          <span className="truncate font-semibold text-text-primary">
            {selectedRepo || 'Select repository…'}
          </span>
          {selectedItem && (
            <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-bg-card border border-border-default text-text-muted">
              {selectedItem.private ? <Lock size={10} /> : <Globe size={10} />}
              {selectedItem.private ? 'Private' : 'Public'}
            </span>
          )}
        </div>

        <ChevronDown
          size={14}
          className={`text-text-muted shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-accent-cyan' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1.5 rounded-xl bg-bg-card border border-border-hover shadow-2xl overflow-hidden animate-fade-rise-in max-h-96 flex flex-col">
          {/* Header Search Input */}
          <div className="p-2.5 border-b border-border-default bg-bg-subtle/50 space-y-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                autoFocus
                placeholder="Search connected repos…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-bg-card border border-border-default focus:border-accent-cyan text-xs font-mono text-text-primary outline-none placeholder:text-text-muted transition-colors"
              />
            </div>
          </div>

          {/* Repositories List */}
          <div className="overflow-y-auto flex-1 p-1.5 space-y-1 divide-y divide-border-default/40">
            {filteredRepos.length > 0 ? (
              filteredRepos.map((repo) => {
                const isSelected = repo.fullName.toLowerCase() === selectedRepo.toLowerCase();
                return (
                  <button
                    key={repo.id}
                    type="button"
                    onClick={() => handleSelect(repo)}
                    className={`w-full flex items-center justify-between gap-3 p-2.5 rounded-lg text-left transition-colors font-mono text-xs ${
                      isSelected
                        ? 'bg-accent-cyan-soft text-accent-cyan font-semibold'
                        : 'hover:bg-bg-subtle text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-text-primary">{repo.fullName}</span>
                        <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] text-text-muted px-1.5 py-0.2 rounded bg-bg-subtle border border-border-default">
                          {repo.private ? <Lock size={9} /> : <Globe size={9} />}
                          {repo.private ? 'Private' : 'Public'}
                        </span>
                      </div>
                      {repo.description && (
                        <p className="text-[11px] text-text-muted truncate max-w-sm">
                          {repo.description}
                        </p>
                      )}
                    </div>

                    {isSelected && (
                      <Check size={14} className="text-accent-cyan shrink-0" strokeWidth={2.5} />
                    )}
                  </button>
                );
              })
            ) : (
              <div className="py-4 text-center text-xs font-mono text-text-muted">
                {repos.length === 0 ? 'No repositories found on connected GitHub.' : 'No matching repositories found.'}
              </div>
            )}
          </div>

          {/* Custom Repo Footer */}
          <div className="p-2 border-t border-border-default bg-bg-subtle/80 text-xs font-mono">
            {isCustomMode ? (
              <form onSubmit={handleApplyCustom} className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    placeholder="e.g. facebook/react"
                    className="flex-1 px-2.5 py-1.5 rounded bg-bg-card border border-border-default focus:border-accent-cyan text-xs font-mono text-text-primary outline-none"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded bg-accent-cyan text-bg-page font-bold text-xs hover:bg-accent-cyan-strong transition-colors"
                  >
                    Set
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCustomMode(false)}
                  className="text-[11px] text-text-muted hover:underline"
                >
                  Cancel custom input
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsCustomMode(true);
                  setCustomInput(selectedRepo);
                }}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded text-accent-cyan hover:bg-bg-card transition-colors text-xs"
              >
                <Plus size={13} />
                <span>Specify custom repository (owner/repo)</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
