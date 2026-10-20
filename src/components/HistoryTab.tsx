/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Clock,
  Play,
  Download,
  Trash2,
  Search,
  Archive,
  Layers,
  FileText,
} from 'lucide-react';
import { SubtitleProject, loadSavedProjects, deleteSavedProject } from '../utils/storage.ts';
import { SubtitleCue, buildSrt } from '../utils/subtitleConverter.ts';
import { downloadText, downloadZip } from '../utils/downloadZip.ts';
import { getLanguageName } from '../utils/translator.ts';

interface HistoryTabProps {
  onOpenInEditor: (title: string, cues: SubtitleCue[]) => void;
  onToast: (msg: string) => void;
}

export const HistoryTab: React.FC<HistoryTabProps> = ({ onOpenInEditor, onToast }) => {
  const [projects, setProjects] = useState<SubtitleProject[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setProjects(loadSavedProjects());
  }, []);

  const handleDelete = (id: string) => {
    deleteSavedProject(id);
    setProjects(prev => prev.filter(p => p.id !== id));
    onToast('Project deleted');
  };

  const handleDownloadSingle = (p: SubtitleProject) => {
    const content = buildSrt(p.cues, 'target');
    downloadText(content, `${p.title}.km.srt`, 'application/x-subrip');
    onToast(`Downloaded ${p.title}.km.srt`);
  };

  const handleDownloadAllZip = async () => {
    if (!projects.length) return;
    const files = projects.map(p => ({
      name: `${p.title}.km.srt`,
      content: buildSrt(p.cues, 'target'),
    }));
    await downloadZip(files, 'Translate-Sub-khmer.zip');
    onToast(`Downloaded ${files.length} projects in Translate-Sub-khmer.zip`);
  };

  const filtered = projects.filter(
    p =>
      !search ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.cues.some(c => c.text.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-900/30 via-pink-900/20 to-cyan-900/30 border border-purple-500/30 backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-purple-400" />
            <h2 className="text-base font-bold text-white">Subtitle Library & History</h2>
          </div>
          <p className="text-xs text-slate-300 mt-0.5">
            Everything you convert, transcribe, or edit is securely saved in your browser. Re-open or export anytime.
          </p>
        </div>

        {projects.length > 0 && (
          <button
            onClick={handleDownloadAllZip}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 text-white border border-white/15"
          >
            <Archive className="w-3.5 h-3.5 text-cyan-400" />
            <span>Download All (ZIP)</span>
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search saved subtitle projects..."
          className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white/[0.03] border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/50 backdrop-blur-xl"
        />
      </div>

      {/* Grid of Projects */}
      {filtered.length === 0 ? (
        <div className="p-16 rounded-3xl bg-white/[0.02] border border-white/10 text-center space-y-3">
          <Clock className="w-10 h-10 mx-auto text-slate-600" />
          <h3 className="text-sm font-bold text-white">No Saved Projects Found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Convert subtitles, translate a file, or transcribe audio and it will automatically appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(p => {
            const previewText = p.cues[0]?.km || p.cues[0]?.text || 'No text';
            return (
              <div
                key={p.id}
                className="p-4 rounded-3xl bg-white/[0.03] hover:bg-white/[0.05] border border-white/10 hover:border-purple-500/40 transition-all flex flex-col justify-between space-y-3 group"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-bold text-white truncate flex-1">{p.title}</h4>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-purple-300">
                      {p.kind}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-2">
                    <span>{p.cues.length} lines</span>
                    <span>·</span>
                    <span>{getLanguageName(p.sourceLang)} → ខ្មែរ</span>
                    <span>·</span>
                    <span>{new Date(p.updatedAt).toLocaleDateString()}</span>
                  </div>

                  {/* Sample preview line */}
                  <div className="mt-3 p-2.5 rounded-xl bg-black/40 border border-white/5 text-xs text-slate-300 font-khmer line-clamp-2">
                    "{previewText}"
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                  <button
                    onClick={() => onOpenInEditor(p.title, p.cues)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-semibold bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/30"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Open Editor</span>
                  </button>

                  <button
                    onClick={() => handleDownloadSingle(p)}
                    className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10"
                    title="Download SRT"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => handleDelete(p.id)}
                    className="p-1.5 rounded-xl hover:bg-rose-500/20 text-slate-400 hover:text-rose-400"
                    title="Delete project"
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
  );
};
