'use client';

import { useRef, useState } from 'react';
import { UploadCloud, CheckCircle2, MessageSquare, FileUp, Sparkles, Loader2 } from 'lucide-react';
import ProtectedShell from '@/components/ProtectedShell';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Alert from '@/components/ui/Alert';
import { aiApi, filesApi } from '@/lib/api';

export default function UploadPage() {
  const [prompt, setPrompt] = useState('');
  const [reply, setReply] = useState<string | null>(null);
  const [chatting, setChatting] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lastUpload, setLastUpload] = useState<{ originalName: string; sizeBytes: number } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const onChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    setChatting(true);
    setChatError(null);
    setReply(null);
    try {
      const { data } = await aiApi.chat({ messages: [{ role: 'user', content: prompt }] });
      setReply(data.content);
    } catch (err: any) {
      setChatError(
        err?.response?.data?.error?.message ||
          'AI request failed — check that ai-storage-service is running and reachable from main-service.'
      );
    } finally {
      setChatting(false);
    }
  };

  const onUpload = async () => {
    const file = fileInput.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const { data } = await filesApi.upload(file);
      setLastUpload({ originalName: data.file.originalName, sizeBytes: data.file.sizeBytes });
    } catch (err: any) {
      setUploadError(
        err?.response?.data?.error?.message ||
          'Upload failed — check that AZURE_STORAGE_CONNECTION_STRING is set on ai-storage-service.'
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <ProtectedShell>
      <PageHeader
        eyebrow="ai-storage-service · Azure Blob Storage"
        title="AI Intelligence &amp; Artifact Storage"
        description="Interact directly with the RAG reasoning engine and store security compliance artifacts in Azure Blob Storage."
      />

      <div className="grid md:grid-cols-2 gap-6">
        {/* AI Chat Card */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-accent-purple-soft text-accent-purple flex items-center justify-center">
              <Sparkles size={16} />
            </div>
            <div>
              <h2 className="text-xs font-mono uppercase tracking-wider text-text-muted">Security Assistant</h2>
              <h3 className="font-display font-semibold text-sm text-text-primary">Chat with AI Engine</h3>
            </div>
          </div>

          <form onSubmit={onChat} className="space-y-3">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="Ask the configured AI engine about CVE remediation, AST rules, or architecture…"
              className="w-full bg-bg-subtle border border-border-default rounded-xl px-3.5 py-2.5 text-xs font-mono text-text-primary placeholder:text-text-muted focus:border-accent-cyan outline-none resize-none transition-colors"
            />
            <Button type="submit" disabled={chatting} className="text-xs font-mono py-2">
              {chatting ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={13} className="animate-spin" /> Reasoning…
                </span>
              ) : (
                'Send Query'
              )}
            </Button>
          </form>

          {chatError && <Alert className="mt-4">{chatError}</Alert>}

          {reply && (
            <div className="mt-4 bg-bg-subtle border border-border-default rounded-xl p-4 text-xs font-mono text-text-primary leading-relaxed whitespace-pre-wrap animate-fade-rise-in">
              {reply}
            </div>
          )}
        </Card>

        {/* File Upload Card */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-accent-cyan-soft text-accent-cyan flex items-center justify-center">
              <FileUp size={16} />
            </div>
            <div>
              <h2 className="text-xs font-mono uppercase tracking-wider text-text-muted">Blob Store</h2>
              <h3 className="font-display font-semibold text-sm text-text-primary">Upload Artifact</h3>
            </div>
          </div>

          <label className="flex flex-col items-center justify-center gap-2 border border-dashed border-border-default rounded-xl p-8 cursor-pointer hover:border-accent-cyan transition-colors bg-bg-subtle/40 group">
            <UploadCloud size={24} strokeWidth={1.5} className="text-text-muted group-hover:text-accent-cyan transition-colors" />
            <span className="text-xs font-mono text-text-muted group-hover:text-text-primary transition-colors">
              Choose a report or SBOM to store in Azure Blob
            </span>
            <input ref={fileInput} type="file" className="hidden" />
          </label>

          <Button onClick={onUpload} disabled={uploading} variant="secondary" className="mt-4 w-full text-xs font-mono py-2">
            {uploading ? (
              <span className="flex items-center gap-2">
                <Loader2 size={13} className="animate-spin" /> Uploading…
              </span>
            ) : (
              'Upload to Azure Blob'
            )}
          </Button>

          {uploadError && <Alert className="mt-4">{uploadError}</Alert>}

          {lastUpload && (
            <div className="mt-4 flex items-center gap-2 text-xs font-mono text-accent-emerald bg-accent-emerald-soft p-3 rounded-lg border border-accent-emerald/30 animate-fade-rise-in">
              <CheckCircle2 size={14} />
              Stored {lastUpload.originalName} ({(lastUpload.sizeBytes / 1024).toFixed(1)} KB)
            </div>
          )}
        </Card>
      </div>
    </ProtectedShell>
  );
}
