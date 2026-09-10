'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  MessageSquare,
  Sparkles,
  Zap,
  Send,
  X,
  Minimize2,
  Maximize2,
  HelpCircle,
  ShieldAlert,
  Loader2,
  Bot,
  User,
  Trash2,
} from 'lucide-react';
import { riskApi } from '@/lib/api';

interface FloatingNlpPanelProps {
  industry: string;
  criticality: number;
  totalEalUsd: number;
  totalVar95Usd: number;
  counts: Record<string, number>;
  activeControls: string[];
  activeAsset?: string;
  externalOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'groq';
  text: string;
  timestamp: string;
  latencyMs?: number;
  model?: string;
  provider?: string;
}

const SUGGESTED_QUESTIONS = [
  'What happens if we suffer a ransomware attack?',
  'Why is our Expected Annual Loss at this amount?',
  'Which 2 security controls will give the highest ROSI?',
  'How does CERT-In compliance affect our insurance premium?',
];

export default function FloatingNlpPanel({
  industry,
  criticality,
  totalEalUsd,
  totalVar95Usd,
  counts,
  activeControls,
  activeAsset,
  externalOpen,
  onOpenChange,
}: FloatingNlpPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (externalOpen !== undefined) {
      setIsOpen(externalOpen);
    }
  }, [externalOpen]);

  const setPanelOpen = (open: boolean) => {
    setIsOpen(open);
    onOpenChange?.(open);
  };
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'groq',
      text: `👋 **Hi! I am your real-time Cyber Risk Co-Pilot**, powered by **Groq Llama-3.3** for sub-second NLP analysis. Ask me anything about your quantitative financial exposure, threat vectors, or control ROI!`,
      timestamp: 'Just now',
      provider: 'Groq API',
      model: 'llama-3.3-70b-versatile',
      latencyMs: 82,
    },
  ]);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSend = async (questionText?: string) => {
    const textToSend = (questionText || query).trim();
    if (!textToSend || loading) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setQuery('');
    setLoading(true);

    try {
      const { data } = await riskApi.nlpQuery({
        query: textToSend,
        industry,
        criticality,
        total_eal_usd: totalEalUsd,
        total_var95_usd: totalVar95Usd,
        severity_counts: counts,
        active_controls: activeControls,
      });

      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        sender: 'groq',
        text: data?.answer || 'Analysis complete.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        latencyMs: data?.latency_ms,
        model: data?.model || 'llama-3.3-70b-versatile',
        provider: data?.provider || 'Groq API',
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'groq',
        text: `⚠️ ${err?.response?.data?.detail || 'Unable to connect to Groq API. Please verify network or try again.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        provider: 'Fallback Engine',
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Collapsed Pill Button (Fixed on the Left) */}
      {!isOpen && (
        <div className="fixed left-5 bottom-8 z-40">
          <button
            onClick={() => setPanelOpen(true)}
            className="group relative flex items-center gap-3 px-4 py-3 rounded-full bg-slate-900/90 hover:bg-slate-850 text-white border border-purple-500/40 hover:border-purple-400/70 shadow-[0_4px_25px_rgba(168,85,247,0.35)] backdrop-blur-md transition-all duration-300 hover:scale-105 active:scale-95"
            title="Open Groq NLP Risk Assistant"
          >
            <div className="relative flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-tr from-amber-500 to-orange-500 text-white shadow-md">
              <Zap size={15} className="fill-white" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            </div>

            <div className="text-left">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold font-mono tracking-wide text-white">
                  Ask Groq AI
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  ⚡ &lt;100ms
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono">NLP Assessment Co-Pilot</p>
            </div>
          </button>
        </div>
      )}

      {/* Expanded Floating Left Panel */}
      {isOpen && (
        <aside
          aria-label="Groq NLP Risk Assistant"
          className="fixed left-5 bottom-6 z-40 w-96 max-w-[calc(100vw-2.5rem)] h-[580px] max-h-[calc(100vh-6rem)] flex flex-col rounded-2xl bg-slate-900/95 border border-purple-500/40 shadow-[0_12px_45px_rgba(0,0,0,0.6)] backdrop-blur-xl text-slate-100 overflow-hidden transition-all animate-in fade-in slide-in-from-left-4 duration-200"
        >
          {/* Header */}
          <div className="p-3.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-orange-500 to-amber-500 flex items-center justify-center text-white shadow-md">
                <Zap size={16} className="fill-white" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-bold text-white font-mono tracking-wide">
                    Groq NLP Assistant
                  </h3>
                  <span className="text-[9px] font-mono px-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    Llama-3.3
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[10px] font-mono text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Ultra-fast Groq Inference</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() =>
                  setMessages([
                    {
                      id: 'clear',
                      sender: 'groq',
                      text: 'Chat history cleared. How can I assist your risk evaluation?',
                      timestamp: 'Now',
                      provider: 'Groq API',
                    },
                  ])
                }
                title="Clear history"
                className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition"
              >
                <Trash2 size={13} />
              </button>
              <button
                onClick={() => setPanelOpen(false)}
                title="Minimize panel"
                className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition"
              >
                <Minimize2 size={13} />
              </button>
            </div>
          </div>

          {/* Context Banner */}
          <div className="px-3.5 py-1.5 bg-purple-950/40 border-b border-purple-900/30 flex items-center justify-between text-[10px] font-mono text-purple-200">
            <span>Context: {industry.replace('_', ' ').toUpperCase()}</span>
            <span>EAL: ${totalEalUsd.toLocaleString()}</span>
          </div>

          {/* Chat Messages Body */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3 scrollbar-thin scrollbar-thumb-slate-700">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-2.5 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {m.sender === 'groq' && (
                  <div className="w-6 h-6 rounded-lg bg-orange-500/20 border border-orange-500/40 flex items-center justify-center shrink-0 text-orange-400 mt-0.5">
                    <Bot size={13} />
                  </div>
                )}

                <div
                  className={`max-w-[84%] rounded-xl p-3 text-xs leading-relaxed ${
                    m.sender === 'user'
                      ? 'bg-purple-600 text-white rounded-br-none shadow-md'
                      : 'bg-slate-800/90 text-slate-200 border border-slate-700/80 rounded-bl-none'
                  }`}
                >
                  <p className="whitespace-pre-wrap font-sans text-xs">{m.text}</p>

                  {m.sender === 'groq' && (
                    <div className="mt-2 pt-1.5 border-t border-slate-700/60 flex items-center justify-between text-[9px] font-mono text-slate-400">
                      <span>{m.provider}</span>
                      {m.latencyMs && (
                        <span className="text-amber-300 font-bold flex items-center gap-0.5">
                          <Zap size={9} /> {m.latencyMs}ms
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {m.sender === 'user' && (
                  <div className="w-6 h-6 rounded-lg bg-purple-500/30 border border-purple-500/50 flex items-center justify-center shrink-0 text-purple-200 mt-0.5">
                    <User size={13} />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-2.5 justify-start items-center text-xs text-slate-400 font-mono">
                <div className="w-6 h-6 rounded-lg bg-orange-500/20 border border-orange-500/40 flex items-center justify-center shrink-0 text-orange-400">
                  <Loader2 size={13} className="animate-spin" />
                </div>
                <div className="px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center gap-2">
                  <span className="text-amber-400">Groq streaming response...</span>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Quick Prompt Chips */}
          <div className="px-3 py-2 bg-slate-950/60 border-t border-slate-800/80">
            <div className="text-[10px] font-mono text-slate-400 mb-1.5 flex items-center gap-1">
              <Sparkles size={11} className="text-purple-400" />
              <span>Suggested Inquiries:</span>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {SUGGESTED_QUESTIONS.map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(q)}
                  disabled={loading}
                  className="shrink-0 text-[10px] font-mono px-2.5 py-1 rounded-lg bg-slate-800/90 hover:bg-purple-950/40 text-slate-300 hover:text-purple-300 border border-slate-700/80 hover:border-purple-500/40 transition whitespace-nowrap"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Input Footer */}
          <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question (e.g. 'What if we deploy EDR?')..."
              disabled={loading}
              className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-sans text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition"
            />
            <button
              onClick={() => handleSend()}
              disabled={!query.trim() || loading}
              className="p-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 disabled:opacity-40 text-white font-bold transition flex items-center justify-center shrink-0 shadow-md"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </div>
        </aside>
      )}
    </>
  );
}
