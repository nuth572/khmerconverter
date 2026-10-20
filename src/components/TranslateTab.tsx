/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import {
  Upload,
  Globe,
  Play,
  Download,
  Archive,
  Check,
  AlertCircle,
  FileText,
  Loader2,
  Trash2,
  ArrowRight,
} from 'lucide-react';
import { SubtitleCue, parseSubtitles, buildSrt, buildVtt } from '../utils/subtitleConverter.ts';
import { LANGUAGES, translateAll, getLanguageName } from '../utils/translator.ts';
import { isZipFile, unpackZipSubtitles } from '../utils/zipHandler.ts';
import { downloadText, downloadZip } from '../utils/downloadZip.ts';
import { saveProject } from '../utils/storage.ts';

interface TranslateItem {
  id: string;
  name: string;
  cues: SubtitleCue[];
  status: 'idle' | 'translating' | 'done' | 'error';
  progress: number;
  detectedLang?: string;
  error?: string;
}

interface TranslateTabProps {
  onOpenInEditor: (title: string, cues: SubtitleCue[]) => void;
  onToast: (msg: string) => void;
}

export const TranslateTab: React.FC<TranslateTabProps> = ({ onOpenInEditor, onToast }) => {
  const [items, setItems] = useState<TranslateItem[]>([]);
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('km');
  const [isTranslating, setIsTranslating] = useState(false);
  const [livePreview, setLivePreview] = useState<{ orig: string; trans: string }[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const newItems: TranslateItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];

      if (isZipFile(f)) {
        try {
          onToast(`Unpacking ZIP: ${f.name}...`);
          const extracted = await unpackZipSubtitles(f);
          if (!extracted.length) {
            onToast(`No subtitle files found inside ${f.name}`);
          } else {
            onToast(`Extracted ${extracted.length} subtitle files from ${f.name}!`);
            for (let j = 0; j < extracted.length; j++) {
              const item = extracted[j];
              const cues = parseSubtitles(item.content, undefined, item.name);
              if (cues.length > 0) {
                newItems.push({
                  id: 'item_zip_' + Date.now() + '_' + i + '_' + j,
                  name: item.name,
                  cues,
                  status: 'idle',
                  progress: 0,
                });
              }
            }
          }
        } catch {
          onToast(`Failed to unpack ${f.name}`);
        }
      } else {
        try {
          const text = await f.text();
          const cues = parseSubtitles(text, undefined, f.name);
          if (cues.length > 0) {
            newItems.push({
              id: 'item_' + Date.now() + '_' + i,
              name: f.name,
              cues,
              status: 'idle',
              progress: 0,
            });
          }
        } catch {
          onToast(`Error parsing ${f.name}`);
        }
      }
    }

    if (newItems.length > 0) {
      setItems(prev => [...prev, ...newItems]);
      onToast(`Added ${newItems.length} subtitle file(s) for translation`);
    }
  };

  const startTranslation = async () => {
    if (!items.length || isTranslating) return;
    setIsTranslating(true);
    setLivePreview([]);
    onToast(`Translating ${items.length} files in parallel...`);

    const updated = [...items];
    const PARALLEL_FILES = 2;

    for (let i = 0; i < updated.length; i += PARALLEL_FILES) {
      const slice = updated.slice(i, i + PARALLEL_FILES);

      await Promise.all(
        slice.map(async item => {
          if (item.status === 'done') return;
          item.status = 'translating';
          item.progress = 0;
          setItems([...updated]);

          try {
            const texts = item.cues.map(c => c.text);
            let translations: string[] = [];
            let detected = sourceLang;

            if (sourceLang === targetLang) {
              translations = texts;
            } else {
              const res = await translateAll(texts, {
                source: sourceLang,
                target: targetLang,
                onProgress: (done, total, partials) => {
                  item.progress = Math.round((done / total) * 100);
                  setItems([...updated]);

                  const recent: { orig: string; trans: string }[] = [];
                  for (let k = Math.max(0, done - 5); k < done; k++) {
                    if (partials[k]) {
                      recent.push({ orig: texts[k], trans: partials[k] });
                    }
                  }
                  if (recent.length) setLivePreview(recent);
                },
              });
              translations = res.texts;
              if (res.detected) detected = res.detected;
            }

            const translatedCues = item.cues.map((c, k) => ({
              ...c,
              km: translations[k] || c.text,
            }));

            item.cues = translatedCues;
            item.status = 'done';
            item.progress = 100;
            item.detectedLang = detected;
            setItems([...updated]);

            // Auto save to history
            saveProject({
              title: item.name.replace(/\.[^.]+$/, ''),
              kind: 'translated',
              sourceLang: detected,
              targetLang,
              cues: translatedCues,
            });
          } catch (err) {
            item.status = 'error';
            item.error = String(err);
            setItems([...updated]);
          }
        })
      );
    }

    setIsTranslating(false);
    onToast('Batch translation finished!');
  };

  const handleDownloadSingle = (item: TranslateItem, mode: 'target' | 'bilingual_top_bottom') => {
    const base = item.name.replace(/\.[^.]+$/, '');
    const ext = mode === 'bilingual_top_bottom' ? '.bilingual.srt' : `.${targetLang}.srt`;
    const content = buildSrt(item.cues, mode);
    downloadText(content, `${base}${ext}`, 'application/x-subrip');
    onToast(`Downloaded ${base}${ext}`);
  };

  const handleDownloadAllZip = async () => {
    const doneItems = items.filter(it => it.status === 'done');
    if (!doneItems.length) return;

    const files = doneItems.map(it => {
      const base = it.name.replace(/\.[^.]+$/, '');
      return {
        name: `${base}.${targetLang}.srt`,
        content: buildSrt(it.cues, 'target'),
      };
    });

    await downloadZip(files, 'Translate-Sub-khmer.zip');
    onToast(`Downloaded ${files.length} translated files in Translate-Sub-khmer.zip`);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-cyan-900/30 via-purple-900/20 to-pink-900/30 border border-cyan-500/30 backdrop-blur-md">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-cyan-400" />
              <h2 className="text-base font-bold text-white">Batch Subtitle Translation Studio</h2>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Translate your SRT, VTT, or ASS files into Khmer (<span className="font-khmer">ភាសាខ្មែរ</span>) or any other language with preserved timecodes.
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={sourceLang}
              onChange={e => setSourceLang(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white"
            >
              {LANGUAGES.map(l => (
                <option key={l.code} value={l.code}>
                  {l.flag} {l.name}
                </option>
              ))}
            </select>
            <span className="text-slate-400">→</span>
            <select
              value={targetLang}
              onChange={e => setTargetLang(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-purple-950/60 border border-purple-500/40 text-xs text-purple-200 font-semibold"
            >
              {LANGUAGES.filter(l => l.code !== 'auto').map(l => (
                <option key={l.code} value={l.code}>
                  {l.flag} {l.name} {l.code === 'km' ? '(ភាសាខ្មែរ)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: File list and dropzone */}
        <div className="space-y-4">
          {/* Dropzone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              handleFiles(e.dataTransfer.files);
            }}
            className="group border-2 border-dashed border-white/15 hover:border-cyan-500/50 rounded-3xl p-6 text-center cursor-pointer transition-all bg-white/[0.02] hover:bg-white/[0.04]"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".srt,.vtt,.ass,.ssa,.sbv,.lrc,.ttml,.csv,.txt,.zip,application/zip,application/x-zip-compressed"
              multiple
              onChange={e => handleFiles(e.target.files)}
              className="hidden"
            />
            <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-300 group-hover:scale-105 transition-transform">
              <Upload className="w-5 h-5" />
            </div>
            <div className="text-sm font-semibold text-white">
              Drop multiple subtitle files or .ZIP archive here
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Select multiple files or .ZIP archives · Automatically unpacks & translates all files!
            </div>
          </div>

          {/* Files List */}
          <div className="p-5 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Uploaded Files ({items.length})
              </span>
              {items.length > 0 && !isTranslating && (
                <button
                  onClick={() => setItems([])}
                  className="text-xs text-rose-400 hover:text-rose-300 transition-colors flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear All</span>
                </button>
              )}
            </div>

            {items.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs">
                No files uploaded yet. Drop some above!
              </div>
            ) : (
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {items.map((item, idx) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-purple-400 shrink-0" />
                        <span className="text-xs font-semibold text-white truncate">{item.name}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                        <span>{item.cues.length} lines</span>
                        {item.detectedLang && <span>· Detected: {getLanguageName(item.detectedLang)}</span>}
                      </div>

                      {/* Progress bar */}
                      {item.status === 'translating' && (
                        <div className="mt-2 w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-pink-500 to-cyan-400 progress-shimmer transition-all duration-300"
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.status === 'done' && (
                        <>
                          <button
                            onClick={() => handleDownloadSingle(item, 'target')}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-white border border-white/15"
                            title="Download translated SRT"
                          >
                            ⬇ SRT
                          </button>
                          <button
                            onClick={() => onOpenInEditor(item.name.replace(/\.[^.]+$/, ''), item.cues)}
                            className="p-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300"
                            title="Open in editor"
                          >
                            <Play className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      {item.status === 'translating' && (
                        <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                      )}
                      {!isTranslating && (
                        <button
                          onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}
                          className="p-1.5 text-slate-500 hover:text-rose-400"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {items.length > 0 && (
              <div className="pt-2 flex flex-col sm:flex-row gap-2">
                <button
                  onClick={startTranslation}
                  disabled={isTranslating || !items.some(i => i.status !== 'done')}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 hover:opacity-95 text-white shadow-lg shadow-purple-500/20 disabled:opacity-50 transition-all"
                >
                  {isTranslating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Translating...</span>
                    </>
                  ) : (
                    <>
                      <Globe className="w-4 h-4" />
                      <span>Start Translating ({items.length} Files)</span>
                    </>
                  )}
                </button>

                {items.some(i => i.status === 'done') && (
                  <button
                    onClick={handleDownloadAllZip}
                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl font-semibold text-xs bg-white/5 hover:bg-white/10 text-slate-200 border border-white/15"
                  >
                    <Archive className="w-4 h-4 text-cyan-400" />
                    <span>Download All (ZIP)</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Live Stream Preview */}
        <div className="p-5 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Live Translation Preview
              </span>
              <span className="text-xs font-khmer text-pink-300">
                ភាសាខ្មែរ {targetLang === 'km' ? '· Khmer' : ''}
              </span>
            </div>

            {livePreview.length > 0 ? (
              <div className="space-y-2.5">
                {livePreview.map((item, idx) => (
                  <div key={idx} className="p-3 rounded-2xl bg-black/40 border border-white/10 space-y-1">
                    <div className="text-xs text-slate-400 font-mono line-clamp-1">{item.orig}</div>
                    <div className="text-sm font-khmer font-semibold text-white">{item.trans}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20 text-slate-500 text-xs space-y-2">
                <Globe className="w-8 h-8 mx-auto text-slate-600" />
                <p>Translations will stream here in real-time as they process.</p>
                <p className="text-[11px] text-slate-600 font-khmer">
                  ដំណើរការបកប្រែនឹងបង្ហាញនៅទីនេះផ្ទាល់
                </p>
              </div>
            )}
          </div>

          <div className="mt-6 p-3 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-200">
            <strong>Pro Tip:</strong> After translation, you can open any file in the <strong>Live Video Editor</strong> to watch subtitles synchronized over your video and tweak wording.
          </div>
        </div>
      </div>
    </div>
  );
};
