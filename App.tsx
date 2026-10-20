/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  FileCode,
  Globe,
  Mic,
  Layers,
  Play,
  Mail,
  Clock,
  Sparkles,
  MessageCircle,
  ExternalLink,
  FolderArchive,
  Music,
} from 'lucide-react';
import { Header } from './components/Header.tsx';
import { ConverterTab } from './components/ConverterTab.tsx';
import { TranslateTab } from './components/TranslateTab.tsx';
import { SpeechTab } from './components/SpeechTab.tsx';
import { BilingualMergerTab } from './components/BilingualMergerTab.tsx';
import { ZipRenamerTab } from './components/ZipRenamerTab.tsx';
import { Audio2MidiTab } from './components/Audio2MidiTab.tsx';
import { VideoEditorView } from './components/VideoEditorView.tsx';
import { TempMailTab } from './components/TempMailTab.tsx';
import { HistoryTab } from './components/HistoryTab.tsx';
import { HelpModal } from './components/HelpModal.tsx';
import { SubtitleCue } from './utils/subtitleConverter.ts';

export type AppTab =
  | 'convert'
  | 'translate'
  | 'speech'
  | 'bilingual'
  | 'renamer'
  | 'audio2midi'
  | 'editor'
  | 'tempmail'
  | 'history';

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('convert');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  // Editor Session State
  const [editorTitle, setEditorTitle] = useState('My Subtitles');
  const [editorCues, setEditorCues] = useState<SubtitleCue[]>([]);
  const [editorMediaUrl, setEditorMediaUrl] = useState<string | undefined>();
  const [editorMediaKind, setEditorMediaKind] = useState<'video' | 'audio'>('video');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => (prev === msg ? null : prev));
    }, 2500);
  };

  const handleOpenInEditor = (
    title: string,
    cues: SubtitleCue[],
    mediaUrl?: string,
    mediaKind: 'video' | 'audio' = 'video'
  ) => {
    setEditorTitle(title);
    setEditorCues(cues);
    setEditorMediaUrl(mediaUrl);
    setEditorMediaKind(mediaKind);
    setActiveTab('editor');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast(`Opened "${title}" in Live Video Editor`);
  };

  return (
    <div className="min-h-screen text-slate-100 relative pb-20 selection:bg-purple-500/30 selection:text-white">
      {/* Background Ambience */}
      <div className="bg-aurora" />
      <div className="bg-grid" />

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Header
          onOpenTempMail={() => setActiveTab('tempmail')}
          onOpenHelp={() => setHelpOpen(true)}
          onOpenRenamer={() => setActiveTab('renamer')}
          onOpenAudio2Midi={() => setActiveTab('audio2midi')}
        />

        {/* Hero Section (only when not in full editor view) */}
        {activeTab !== 'editor' && (
          <div className="text-center py-6 sm:py-8 max-w-3xl mx-auto space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-pink-400" />
              <span>Convert 12+ Formats · Audio2Midi AI · ZIP Bulk Tools · Video Preview</span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
              Any Subtitle Format.{' '}
              <span className="bg-gradient-to-r from-pink-500 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
                Perfect Khmer SRT.
              </span>
            </h1>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed font-light">
              Convert, repair, translate between <strong>SRT, WebVTT, ASS, SSA, SBV, LRC, TTML, CSV, JSON</strong>, transcribe <strong>Audio to MIDI</strong> with piano roll & sheet music, batch rename ZIPs, and auto-fix timing errors.
            </p>
            <p className="text-xs sm:text-sm text-purple-300 font-khmer">
              បំប្លែងទម្រង់អក្សររត់គ្រប់ប្រភេទ បម្លែងសំឡេងជា MIDI និងបកប្រែជាភាសាខ្មែរដោយឥតគិតថ្លៃ
            </p>
          </div>
        )}

        {/* Navigation Tabs */}
        {activeTab !== 'editor' && (
          <div className="flex justify-center mb-8">
            <div className="inline-flex p-1.5 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-xl gap-1 max-w-full overflow-x-auto shadow-2xl">
              <button
                onClick={() => setActiveTab('convert')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                  activeTab === 'convert'
                    ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-md shadow-purple-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <FileCode className="w-4 h-4" />
                <span>Convert Formats</span>
              </button>

              <button
                onClick={() => setActiveTab('translate')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                  activeTab === 'translate'
                    ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-md shadow-purple-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Globe className="w-4 h-4" />
                <span>Translate SRT</span>
              </button>

              <button
                onClick={() => setActiveTab('audio2midi')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                  activeTab === 'audio2midi'
                    ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-black shadow-md shadow-amber-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Music className="w-4 h-4 text-amber-400" />
                <span>Audio2Midi</span>
                <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-amber-400/30 text-amber-300">
                  AI
                </span>
              </button>

              <button
                onClick={() => setActiveTab('speech')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                  activeTab === 'speech'
                    ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-md shadow-purple-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Mic className="w-4 h-4" />
                <span>Speech to Subtitles</span>
              </button>

              <button
                onClick={() => setActiveTab('bilingual')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                  activeTab === 'bilingual'
                    ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-md shadow-purple-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>Bilingual Merger</span>
              </button>

              <button
                onClick={() => setActiveTab('renamer')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                  activeTab === 'renamer'
                    ? 'bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 text-white shadow-md shadow-cyan-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <FolderArchive className="w-4 h-4 text-cyan-400" />
                <span>ZIP Renamer</span>
                <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-pink-500/40 text-pink-200">
                  PRO
                </span>
              </button>

              <button
                onClick={() => setActiveTab('tempmail')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                  activeTab === 'tempmail'
                    ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-md shadow-purple-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Mail className="w-4 h-4" />
                <span>Temp Email</span>
              </button>

              <button
                onClick={() => setActiveTab('history')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                  activeTab === 'history'
                    ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-md shadow-purple-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>History</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab Panels */}
        <main>
          {activeTab === 'convert' && (
            <ConverterTab onOpenInEditor={handleOpenInEditor} onToast={showToast} />
          )}

          {activeTab === 'translate' && (
            <TranslateTab onOpenInEditor={handleOpenInEditor} onToast={showToast} />
          )}

          {activeTab === 'audio2midi' && (
            <Audio2MidiTab onToast={showToast} />
          )}

          {activeTab === 'speech' && (
            <SpeechTab onOpenInEditor={handleOpenInEditor} onToast={showToast} />
          )}

          {activeTab === 'bilingual' && (
            <BilingualMergerTab onOpenInEditor={handleOpenInEditor} onToast={showToast} />
          )}

          {activeTab === 'renamer' && (
            <ZipRenamerTab onToast={showToast} onNavigateToConvert={() => setActiveTab('convert')} />
          )}

          {activeTab === 'editor' && (
            <VideoEditorView
              initialTitle={editorTitle}
              initialCues={editorCues}
              initialMediaUrl={editorMediaUrl}
              initialMediaKind={editorMediaKind}
              onBack={() => setActiveTab('convert')}
              onToast={showToast}
            />
          )}

          {activeTab === 'tempmail' && (
            <TempMailTab onToast={showToast} />
          )}

          {activeTab === 'history' && (
            <HistoryTab onOpenInEditor={handleOpenInEditor} onToast={showToast} />
          )}
        </main>

        {/* Footer */}
        <footer className="mt-20 pt-8 border-t border-white/10 text-center text-xs text-slate-400 space-y-2">
          <div>
            KhmerSub AI & Universal Subtitle Converter · Pure client-side processing ·{' '}
            <span className="font-khmer text-pink-300">សូមអរគុណ</span>
          </div>
          <div className="flex items-center justify-center gap-4 text-[11px] text-slate-500">
            <button onClick={() => setHelpOpen(true)} className="hover:text-purple-300">
              Format Guide
            </button>
            <span>·</span>
            <button onClick={() => setActiveTab('audio2midi')} className="hover:text-amber-300">
              Audio2Midi Studio
            </button>
            <span>·</span>
            <button onClick={() => setActiveTab('renamer')} className="hover:text-cyan-300">
              ZIP Renamer Pro
            </button>
            <span>·</span>
            <button onClick={() => setActiveTab('tempmail')} className="hover:text-purple-300">
              Temp Email
            </button>
            <span>·</span>
            <a
              href="https://t.me/Nuthkna"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
            >
              <span>Contact owner: @Nuthkna on Telegram</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </footer>
      </div>

      {/* Floating Telegram Action Button */}
      <a
        href="https://t.me/Nuthkna"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 rounded-full bg-gradient-to-r from-[#229ED9] to-[#1e88c7] text-white shadow-xl shadow-[#229ED9]/40 hover:scale-105 active:scale-95 transition-all text-xs font-bold"
        title="Contact owner on Telegram (@Nuthkna)"
      >
        <MessageCircle className="w-5 h-5" />
        <span className="hidden sm:inline">Contact @Nuthkna</span>
      </a>

      {/* Global Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-2xl bg-slate-900/95 border border-purple-500/40 text-white text-xs font-semibold shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-150">
          {toastMessage}
        </div>
      )}

      {/* Format Help Modal */}
      <HelpModal isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
