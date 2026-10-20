/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Share2, MessageCircle, MoreVertical, Mail, Check, ExternalLink, HelpCircle, FolderArchive, Music } from 'lucide-react';

interface HeaderProps {
  onOpenTempMail: () => void;
  onOpenHelp: () => void;
  onOpenRenamer?: () => void;
  onOpenAudio2Midi?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenTempMail,
  onOpenHelp,
  onOpenRenamer,
  onOpenAudio2Midi,
}) => {
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share && /mobile|android|iphone/i.test(navigator.userAgent)) {
        await navigator.share({
          title: 'KhmerSub AI & Universal Subtitle Converter',
          text: 'Convert any subtitle format (SRT, VTT, ASS, SBV, TTML, LRC, etc.) and translate to Khmer and 100+ languages.',
          url,
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      window.prompt('Copy share link:', url);
    }
  };

  return (
    <header className="flex items-center justify-between py-4 mb-6 border-b border-white/10">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-pink-500 via-purple-600 to-cyan-400 flex items-center justify-center font-khmer font-bold text-2xl text-white shadow-lg shadow-purple-500/30 select-none">
          ក
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-1.5">
              KhmerSub<span className="bg-gradient-to-r from-pink-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">AI</span>
            </h1>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
              Universal Converter
            </span>
          </div>
          <p className="text-xs text-slate-400 font-khmer">
            កម្មវិធីបំប្លែងអក្សររត់ និងបកប្រែជាភាសាខ្មែរគ្រប់ទម្រង់
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <button
          onClick={handleShare}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all backdrop-blur-md border ${
            copied
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              : 'bg-white/5 hover:bg-white/10 text-white border-white/15 hover:border-purple-500/40 shadow-sm'
          }`}
          title="Copy link to share"
          aria-label="Share this app"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5 text-cyan-400" />}
          <span className="hidden sm:inline">{copied ? 'Link Copied!' : 'Share App'}</span>
        </button>

        <a
          href="https://t.me/Nuthkna"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#229ED9]/20 hover:bg-[#229ED9]/30 text-[#7dd3fc] hover:text-white border border-[#229ED9]/40 transition-all shadow-sm"
          title="Contact owner on Telegram (@Nuthkna)"
        >
          <MessageCircle className="w-3.5 h-3.5 text-[#38bdf8]" />
          <span className="hidden md:inline">Telegram @Nuthkna</span>
        </a>

        {/* 3-dots menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
            title="More tools"
            aria-label="More tools menu"
            aria-expanded={menuOpen}
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 mt-2 w-64 p-2 rounded-2xl bg-slate-900/95 border border-white/15 shadow-2xl backdrop-blur-2xl z-50 animate-in fade-in zoom-in-95 duration-150">
                {onOpenAudio2Midi && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenAudio2Midi();
                    }}
                    className="w-full flex items-start gap-3 p-2.5 rounded-xl text-left hover:bg-white/10 transition-colors group"
                  >
                    <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 group-hover:bg-amber-500/30">
                      <Music className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                        <span>Audio2Midi Studio</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-400 text-black">NEW</span>
                      </div>
                      <div className="text-xs text-slate-400 font-khmer">បម្លែងសំឡេងជា MIDI & ព្យាណូ</div>
                    </div>
                  </button>
                )}

                {onOpenRenamer && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenRenamer();
                    }}
                    className="w-full flex items-start gap-3 p-2.5 rounded-xl text-left hover:bg-white/10 transition-colors group"
                  >
                    <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400 group-hover:bg-cyan-500/30">
                      <FolderArchive className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                        <span>ZIP Bulk Renamer</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-pink-500/30 text-pink-300">PRO</span>
                      </div>
                      <div className="text-xs text-slate-400 font-khmer">ប្ដូរឈ្មោះឯកសារក្នុង ZIP (1, 2, 3...)</div>
                    </div>
                  </button>
                )}

                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenTempMail();
                  }}
                  className="w-full flex items-start gap-3 p-2.5 rounded-xl text-left hover:bg-white/10 transition-colors group"
                >
                  <div className="p-2 rounded-lg bg-pink-500/20 text-pink-400 group-hover:bg-pink-500/30">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">Temp Email</div>
                    <div className="text-xs text-slate-400 font-khmer">អ៊ីមែលបណ្ដោះអាសន្ន</div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenHelp();
                  }}
                  className="w-full flex items-start gap-3 p-2.5 rounded-xl text-left hover:bg-white/10 transition-colors group"
                >
                  <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400 group-hover:bg-cyan-500/30">
                    <HelpCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">Supported Formats</div>
                    <div className="text-xs text-slate-400">SRT, VTT, ASS, SBV, TTML, LRC...</div>
                  </div>
                </button>

                <div className="my-1.5 h-px bg-white/10" />

                <a
                  href="https://t.me/Nuthkna"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-between p-2.5 rounded-xl text-left hover:bg-white/10 transition-colors text-xs text-slate-300 hover:text-white"
                >
                  <span>Report Bugs & Feedback</span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
