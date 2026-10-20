/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import JSZip from 'jszip';

export interface FileToZip {
  name: string;
  content: string;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadText(content: string, filename: string, mime = 'text/plain'): void {
  const blob = new Blob(['\uFEFF' + content], { type: `${mime};charset=utf-8` });
  downloadBlob(blob, filename);
}

export async function downloadZip(files: FileToZip[], zipName = 'Translate-Sub-khmer.zip'): Promise<void> {
  const zip = new JSZip();
  const used = new Set<string>();

  for (const f of files) {
    let safe = f.name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'subtitles.srt';
    if (used.has(safe.toLowerCase())) {
      const dot = safe.lastIndexOf('.');
      let n = 2;
      let candidate = safe;
      do {
        candidate = dot > 0 ? `${safe.slice(0, dot)} (${n})${safe.slice(dot)}` : `${safe} (${n})`;
        n++;
      } while (used.has(candidate.toLowerCase()));
      safe = candidate;
    }
    used.add(safe.toLowerCase());
    zip.file(safe, '\uFEFF' + f.content);
  }

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });

  downloadBlob(blob, zipName);
}
