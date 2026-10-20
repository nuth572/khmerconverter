/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Mail,
  RefreshCw,
  Copy,
  Trash2,
  Check,
  ExternalLink,
  Plus,
  Search,
  Clock,
  Inbox,
  AlertCircle,
} from 'lucide-react';
import {
  Mailbox,
  MailMessage,
  createNewMailbox,
  checkMailboxMessages,
  fetchFullEmail,
} from '../utils/tempMail.ts';

interface TempMailTabProps {
  onToast: (msg: string) => void;
}

const STORAGE_MAILBOXES = 'khmersub.mailboxes.v2';

export const TempMailTab: React.FC<TempMailTabProps> = ({ onToast }) => {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_MAILBOXES) || '[]');
    } catch {
      return [];
    }
  });

  const [activeMailboxId, setActiveMailboxId] = useState<string | null>(() => {
    try {
      const list = JSON.parse(localStorage.getItem(STORAGE_MAILBOXES) || '[]');
      return list[0]?.id || null;
    } catch {
      return null;
    }
  });

  const [customUsername, setCustomUsername] = useState('');
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<MailMessage | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const activeMailbox = mailboxes.find(m => m.id === activeMailboxId);

  // Save mailboxes to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_MAILBOXES, JSON.stringify(mailboxes));
  }, [mailboxes]);

  // Handle mailbox creation
  const handleCreateMailbox = async () => {
    setIsCreating(true);
    try {
      const newMb = await createNewMailbox(customUsername);
      setMailboxes(prev => [newMb, ...prev]);
      setActiveMailboxId(newMb.id);
      setCustomUsername('');
      onToast(`Created mailbox: ${newMb.address}`);
    } catch (err) {
      onToast('Error creating mailbox: ' + String(err));
    } finally {
      setIsCreating(false);
    }
  };

  // Poll mailbox messages
  const refreshCurrentInbox = async () => {
    if (!activeMailbox) return;
    setIsRefreshing(true);
    try {
      const { messages: fetched, expired } = await checkMailboxMessages(activeMailbox);
      setMessages(fetched);

      if (expired) {
        setMailboxes(prev =>
          prev.map(m => (m.id === activeMailbox.id ? { ...m, expired: true } : m))
        );
        onToast('This temporary mailbox has expired.');
      } else {
        const unreadCount = fetched.filter(m => !m.read).length;
        setMailboxes(prev =>
          prev.map(m => (m.id === activeMailbox.id ? { ...m, unread: unreadCount } : m))
        );
      }
    } catch {
      // ignore
    } finally {
      setIsRefreshing(false);
    }
  };

  // Initial load or mailbox change
  useEffect(() => {
    if (activeMailbox) {
      refreshCurrentInbox();
      setSelectedMessage(null);
    }
  }, [activeMailboxId]);

  // Auto-refresh timer every 15s
  useEffect(() => {
    if (!autoRefresh || !activeMailbox) return;
    const interval = setInterval(() => {
      refreshCurrentInbox();
    }, 15000);
    return () => clearInterval(interval);
  }, [autoRefresh, activeMailbox]);

  const handleCopy = async () => {
    if (!activeMailbox) return;
    try {
      await navigator.clipboard.writeText(activeMailbox.address);
      setCopied(true);
      onToast('Email address copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onToast('Copy failed');
    }
  };

  const handleDeleteMailbox = (id: string) => {
    const next = mailboxes.filter(m => m.id !== id);
    setMailboxes(next);
    if (activeMailboxId === id) {
      setActiveMailboxId(next[0]?.id || null);
    }
    onToast('Mailbox deleted');
  };

  const handleOpenMessage = async (msg: MailMessage) => {
    setSelectedMessage(msg);
    // Mark as read
    msg.read = true;
    setMessages([...messages]);

    // Fetch full body if needed
    if (activeMailbox && !msg.body) {
      const body = await fetchFullEmail(activeMailbox, msg.id);
      msg.body = body;
      setSelectedMessage({ ...msg, body });
    }
  };

  const filteredMessages = messages.filter(
    m =>
      !searchQuery ||
      m.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.from.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.excerpt.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-900/30 via-pink-900/20 to-purple-900/30 border border-amber-500/30 backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-amber-400" />
            <h2 className="text-base font-bold text-white">Disposable Temp Email Studio</h2>
          </div>
          <p className="text-xs text-slate-300 mt-0.5">
            Instant disposable email address for quick registrations, verification codes, and testing. Receive emails live!
          </p>
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={e => setAutoRefresh(e.target.checked)}
            className="rounded accent-amber-500"
          />
          <span>Auto-refresh (15s)</span>
        </label>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: Mailboxes List (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="p-5 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Create Temp Email
            </h3>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customUsername}
                onChange={e => setCustomUsername(e.target.value)}
                placeholder="Custom username (optional)"
                className="flex-1 px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
              />
              <button
                onClick={handleCreateMailbox}
                disabled={isCreating}
                className="px-3.5 py-2 rounded-xl font-bold text-xs bg-gradient-to-r from-amber-500 to-pink-500 hover:opacity-95 text-white shadow-md shadow-amber-500/20 disabled:opacity-50"
              >
                {isCreating ? '...' : <Plus className="w-4 h-4" />}
              </button>
            </div>

            <div className="pt-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-2">
                Your Mailboxes ({mailboxes.length})
              </span>

              {mailboxes.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-xs">
                  No mailboxes created yet. Click "+" above!
                </div>
              ) : (
                <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                  {mailboxes.map(mb => {
                    const isActive = mb.id === activeMailboxId;
                    return (
                      <div
                        key={mb.id}
                        onClick={() => setActiveMailboxId(mb.id)}
                        className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-center justify-between gap-2 ${
                          isActive
                            ? 'bg-amber-500/15 border-amber-500/50 text-white'
                            : 'bg-black/30 hover:bg-black/50 border-white/10 text-slate-300'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-mono font-semibold truncate">{mb.address}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {mb.expired ? 'Expired' : 'Active'} · {new Date(mb.createdAt).toLocaleTimeString()}
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          {mb.unread > 0 && (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-pink-500 text-white">
                              {mb.unread}
                            </span>
                          )}
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              handleDeleteMailbox(mb.id);
                            }}
                            className="p-1 rounded text-slate-500 hover:text-rose-400"
                            title="Delete mailbox"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Active Mailbox Inbox & Email Reader (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          {activeMailbox ? (
            <div className="p-5 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl space-y-4">
              {/* Mailbox Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/10">
                <div className="min-w-0">
                  <div className="text-xs text-slate-400 font-semibold">Active Email Address:</div>
                  <div className="text-sm font-mono font-bold text-white flex items-center gap-2 truncate">
                    <span>{activeMailbox.address}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 text-slate-200 border border-white/15"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy Address'}</span>
                  </button>

                  <button
                    onClick={refreshCurrentInbox}
                    disabled={isRefreshing}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                    <span>Check Mail</span>
                  </button>
                </div>
              </div>

              {/* Search Inbox */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search received emails..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                />
              </div>

              {/* Message List */}
              {filteredMessages.length === 0 ? (
                <div className="text-center py-16 text-slate-500 text-xs space-y-2">
                  <Inbox className="w-8 h-8 mx-auto text-slate-600" />
                  <p>Your inbox is empty.</p>
                  <p className="text-[11px] text-slate-600">
                    Send an email or verification code to <strong>{activeMailbox.address}</strong> and it will show up here.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {filteredMessages.map(msg => (
                    <div
                      key={msg.id}
                      onClick={() => handleOpenMessage(msg)}
                      className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                        selectedMessage?.id === msg.id
                          ? 'bg-amber-500/20 border-amber-500/50 text-white'
                          : msg.read
                          ? 'bg-black/30 hover:bg-black/40 border-white/10 text-slate-300'
                          : 'bg-white/[0.06] border-purple-500/40 text-white font-medium'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-semibold truncate">{msg.from}</span>
                        <span className="text-[10px] text-slate-500 font-mono">{msg.date}</span>
                      </div>
                      <div className="text-xs font-bold truncate">{msg.subject}</div>
                      <div className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">{msg.excerpt}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Email Reader View */}
              {selectedMessage && (
                <div className="p-4 rounded-2xl bg-black/50 border border-white/10 space-y-2 pt-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-white">{selectedMessage.subject}</h4>
                    <span className="text-xs text-slate-500">{selectedMessage.date}</span>
                  </div>
                  <div className="text-xs text-slate-400">
                    From: <span className="text-amber-300 font-mono">{selectedMessage.from}</span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-white/10 text-xs text-slate-200 whitespace-pre-wrap leading-relaxed max-h-[220px] overflow-y-auto">
                    {selectedMessage.body || selectedMessage.excerpt}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-12 rounded-3xl bg-white/[0.03] border border-white/10 text-center space-y-3">
              <Mail className="w-10 h-10 mx-auto text-amber-400" />
              <h3 className="text-sm font-bold text-white">No Mailbox Selected</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Create a temporary email address on the left to start receiving messages anonymously without spam.
              </p>
              <button
                onClick={handleCreateMailbox}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-pink-500 text-white"
              >
                Create Instant Mailbox
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
