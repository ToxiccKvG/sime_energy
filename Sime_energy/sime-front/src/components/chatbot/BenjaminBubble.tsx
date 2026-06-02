import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { X, Send, Trash2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import {
  loadHistory,
  saveHistory,
  clearHistory,
  buildPageContext,
  streamChat,
  type ChatMessage,
} from '@/services/benjamin-service';

// ─── Benjamin logo SVG ────────────────────────────────────────────────────────
function BenjaminLogo({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle cx="20" cy="20" r="20" fill="#1a2540" />
      <circle cx="20" cy="20" r="16" stroke="#F59E0B" strokeWidth="0.8" strokeDasharray="3 2" opacity="0.5" />
      <ellipse cx="20" cy="18" rx="7" ry="8" fill="#0f172a" stroke="#F59E0B" strokeWidth="0.8" />
      <circle cx="17.5" cy="17" r="1.5" fill="#F59E0B" />
      <circle cx="22.5" cy="17" r="1.5" fill="#F59E0B" />
      <circle cx="17.5" cy="17" r="2.5" fill="#F59E0B" opacity="0.2" />
      <circle cx="22.5" cy="17" r="2.5" fill="#F59E0B" opacity="0.2" />
      <rect x="18.5" y="26" width="3" height="4" rx="1" fill="#F59E0B" opacity="0.6" />
      <path d="M11 32 Q11 28 15 27 Q17 26.5 18.5 27" stroke="#F59E0B" strokeWidth="0.8" fill="none" opacity="0.5" />
      <path d="M29 32 Q29 28 25 27 Q23 26.5 21.5 27" stroke="#F59E0B" strokeWidth="0.8" fill="none" opacity="0.5" />
      <path d="M21 8 L18 14 L20.5 14 L19 19 L23 12 L20.5 12 Z" fill="#F59E0B" opacity="0.9" />
      <circle cx="11" cy="32" r="1" fill="#F59E0B" opacity="0.6" />
      <circle cx="29" cy="32" r="1" fill="#F59E0B" opacity="0.6" />
    </svg>
  );
}

// ─── Typing indicator ────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s`, animationDuration: '0.8s' }}
        />
      ))}
    </div>
  );
}

// ─── Inline markdown renderer ────────────────────────────────────────────────
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Bullet list item: lines starting with "* " or "- "
    if (/^[\*\-]\s+/.test(line)) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length && /^[\*\-]\s+/.test(lines[i])) {
        listItems.push(
          <li key={i} className="ml-1">
            {renderInline(lines[i].replace(/^[\*\-]\s+/, ''))}
          </li>
        );
        i++;
      }
      nodes.push(
        <ul key={`ul-${i}`} className="list-disc list-inside space-y-0.5 my-1">
          {listItems}
        </ul>
      );
      continue;
    }

    // Empty line → spacing
    if (line.trim() === '') {
      nodes.push(<div key={i} className="h-1.5" />);
      i++;
      continue;
    }

    // Normal paragraph line
    nodes.push(
      <p key={i} className="leading-relaxed">
        {renderInline(line)}
      </p>
    );
    i++;
  }

  return nodes;
}

function renderInline(text: string): React.ReactNode[] {
  // Match **bold** or *italic*
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, j) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={j} className="font-semibold text-slate-100">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={j} className="italic">{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

// ─── Message bubble ──────────────────────────────────────────────────────────
function MessageBubble({ msg, isStreaming }: { msg: ChatMessage; isStreaming?: boolean }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex w-full mb-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="flex-shrink-0 mr-2 mt-0.5">
          <BenjaminLogo size={24} />
        </div>
      )}
      <div
        className={`max-w-[80%] px-3 py-2.5 rounded-2xl text-sm break-words ${
          isUser
            ? 'bg-blue-600/20 text-slate-100 rounded-br-sm border border-blue-500/20'
            : 'bg-[#1e2235] text-slate-200 rounded-bl-sm border border-white/[0.06]'
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
        ) : (
          <div className="space-y-0.5">
            {renderMarkdown(msg.content)}
          </div>
        )}
        {isStreaming && (
          <span className="inline-block w-0.5 h-3.5 bg-amber-400 ml-0.5 animate-pulse align-middle" />
        )}
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export function BenjaminBubble() {
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadHistory());
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [pageContext, setPageContext] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<boolean>(false);

  // Build page context whenever location changes and panel is open
  useEffect(() => {
    if (!isOpen) return;
    buildPageContext(location.pathname, searchParams).then(setPageContext);
  }, [location.pathname, searchParams, isOpen]);

  // Also build context when panel first opens
  const handleOpen = useCallback(async () => {
    setIsOpen(true);
    const ctx = await buildPageContext(location.pathname, searchParams);
    setPageContext(ctx);
  }, [location.pathname, searchParams]);

  // Auto-scroll to bottom
  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Focus textarea when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    setIsStreaming(true);
    setStreamingContent('');
    abortRef.current = false;

    let full = '';
    try {
      for await (const token of streamChat(updated, pageContext)) {
        if (abortRef.current) break;
        full += token;
        setStreamingContent(full);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      toast.error(`Benjamin : ${msg}`);
      full = full || '(Une erreur est survenue. Veuillez réessayer.)';
    }

    const final: ChatMessage[] = [...updated, { role: 'assistant', content: full }];
    setMessages(final);
    saveHistory(final);
    setIsStreaming(false);
    setStreamingContent('');
  }, [input, isStreaming, messages, pageContext]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    abortRef.current = true;
    setMessages([]);
    setStreamingContent('');
    setIsStreaming(false);
    clearHistory();
    setConfirmClear(false);
  };

  // Extract audit name from context for badge
  const auditName = pageContext.match(/Projet ouvert : "([^"]+)"/)?.[1];

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {/* Chat panel */}
      {isOpen && (
        <div
          className="w-[370px] flex flex-col rounded-2xl border border-white/[0.08] bg-[#12141e] shadow-2xl overflow-hidden"
          style={{ height: '560px' }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.07] bg-[#0f111a] flex-shrink-0">
            <BenjaminLogo size={32} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-100">Benjamin</span>
                <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  en ligne
                </span>
              </div>
              <p className="text-[11px] text-slate-500 truncate">Expert énergie · CER2E Sénégal</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7 text-slate-500 hover:text-slate-200 flex-shrink-0"
              onClick={() => setIsOpen(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Context badge */}
          {auditName && (
            <div className="flex items-center gap-1.5 px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/20 flex-shrink-0">
              <Zap className="w-3 h-3 text-amber-400 flex-shrink-0" />
              <span className="text-[11px] text-amber-300 truncate">
                Projet : {auditName}
              </span>
            </div>
          )}

          {/* Messages */}
          <ScrollArea className="flex-1 px-3 py-3">
            {messages.length === 0 && !isStreaming && (
              <div className="flex flex-col items-center justify-center h-full py-8 text-center gap-3">
                <BenjaminLogo size={48} />
                <div>
                  <p className="text-sm font-medium text-slate-300">Bonjour, je suis Benjamin</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-[240px]">
                    Votre assistant expert en audit énergétique. Posez-moi vos questions sur SENELEC, les équipements, la consommation…
                  </p>
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} />
            ))}

            {/* Streaming message */}
            {isStreaming && (
              streamingContent ? (
                <MessageBubble
                  msg={{ role: 'assistant', content: streamingContent }}
                  isStreaming
                />
              ) : (
                <div className="flex items-start mb-3">
                  <div className="flex-shrink-0 mr-2 mt-0.5">
                    <BenjaminLogo size={24} />
                  </div>
                  <div className="bg-[#1e2235] rounded-2xl rounded-bl-sm border border-white/[0.06]">
                    <TypingIndicator />
                  </div>
                </div>
              )
            )}

            {/* Scroll anchor */}
            <div ref={scrollAnchorRef} />
          </ScrollArea>

          {/* Input */}
          <div className="flex-shrink-0 px-3 pb-3 pt-2 border-t border-white/[0.07] bg-[#0f111a]">
            <div className="flex gap-2 items-end">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Posez votre question… (Entrée pour envoyer)"
                disabled={isStreaming}
                rows={1}
                className="flex-1 min-h-[36px] max-h-[100px] resize-none bg-[#1e2235] border-white/[0.08] text-slate-100 placeholder:text-slate-600 text-sm focus-visible:ring-amber-500/30 focus-visible:border-amber-500/40 py-2"
                style={{ fieldSizing: 'content' } as React.CSSProperties}
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || isStreaming}
                size="icon"
                className="w-9 h-9 flex-shrink-0 bg-amber-500 hover:bg-amber-400 text-black disabled:opacity-30"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex justify-between items-center mt-1.5">
              <p className="text-[10px] text-slate-600">Shift+Entrée pour un saut de ligne</p>
              <button
                onClick={handleClear}
                className={`flex items-center gap-1 text-[10px] transition-colors ${
                  confirmClear
                    ? 'text-red-400 hover:text-red-300'
                    : 'text-slate-600 hover:text-slate-400'
                }`}
              >
                <Trash2 className="w-3 h-3" />
                {confirmClear ? 'Confirmer ?' : 'Effacer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={isOpen ? () => setIsOpen(false) : handleOpen}
        className="group relative w-14 h-14 rounded-full shadow-2xl transition-all duration-200 hover:scale-105 active:scale-95 focus:outline-none"
        title="Benjamin — Assistant IA"
        aria-label="Ouvrir Benjamin"
      >
        {/* Glow ring */}
        <span className="absolute inset-0 rounded-full bg-amber-500/20 scale-110 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <span className="absolute inset-0 rounded-full bg-[#1a2540] border border-amber-500/30" />
        <span className="relative flex items-center justify-center w-full h-full">
          {isOpen ? (
            <X className="w-5 h-5 text-amber-400" />
          ) : (
            <BenjaminLogo size={40} />
          )}
        </span>
        {/* Unread dot when closed with history */}
        {!isOpen && messages.length > 0 && (
          <span className="absolute top-0.5 right-0.5 w-3 h-3 rounded-full bg-amber-400 border-2 border-[#0f111a]" />
        )}
      </button>
    </div>
  );
}
