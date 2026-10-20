/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { X, Check, HelpCircle } from 'lucide-react';
import { SUPPORTED_FORMATS } from '../utils/subtitleConverter.ts';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-2xl rounded-3xl bg-slate-900 border border-white/15 p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-cyan-400" />
            <h3 className="text-base font-bold text-white">Supported Subtitle Formats</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-300">
          KhmerSub AI allows lossless conversion across all major subtitle formats and <strong>.ZIP archives</strong> (auto-unpacks all subtitle files inside):
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {SUPPORTED_FORMATS.map(fmt => (
            <div key={fmt.id} className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white uppercase">{fmt.id} ({fmt.extension})</span>
                {fmt.supportsStyles && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">
                    Styles
                  </span>
                )}
              </div>
              <div className="text-slate-400 text-[11px]">{fmt.description}</div>
            </div>
          ))}
        </div>

        <div className="pt-2 border-t border-white/10 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/15 text-white"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
};
