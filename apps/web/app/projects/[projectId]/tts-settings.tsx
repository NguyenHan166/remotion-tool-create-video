'use client';

import { TTS_PROVIDER_KOKORO, ttsProviderRegistry } from '@hansys/shared/tts';

export function TtsSettings({ projectArchived }: { projectArchived: boolean }) {
  const providerAvailable = ttsProviderRegistry.list().length > 0;
  const disabled = projectArchived || !providerAvailable;

  return (
    <section
      data-testid="tts-settings"
      className="mt-5 overflow-hidden rounded-2xl border border-dashed border-white/10 bg-[#0d121b]"
    >
      <div className="border-b border-white/8 px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-white">Tạo voiceover bằng văn bản</p>
          <span className="rounded-full border border-slate-400/20 bg-slate-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            Sắp hỗ trợ
          </span>
        </div>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Cấu hình này đã dành chỗ cho provider TTS, nhưng hiện chưa cài engine tổng hợp giọng nói.
        </p>
      </div>

      <div className="space-y-3 p-4">
        <label className="block text-xs font-medium text-slate-400">
          Provider TTS
          <select
            aria-label="Provider TTS"
            disabled={disabled}
            value={TTS_PROVIDER_KOKORO}
            onChange={() => undefined}
            className="mt-1.5 h-10 w-full cursor-not-allowed rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-slate-500 opacity-70"
          >
            <option value={TTS_PROVIDER_KOKORO}>Kokoro · chưa cài đặt</option>
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-medium text-slate-500">
            Ngôn ngữ
            <input
              aria-label="Ngôn ngữ TTS"
              disabled
              readOnly
              value="vi-VN"
              className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 font-mono text-sm text-slate-600"
            />
          </label>
          <label className="block text-xs font-medium text-slate-500">
            Giọng đọc
            <input
              aria-label="Giọng đọc TTS"
              disabled
              readOnly
              placeholder="Provider chưa sẵn sàng"
              value=""
              className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-slate-600"
            />
          </label>
        </div>

        <button
          type="button"
          disabled={disabled}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-semibold text-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Tạo voiceover
        </button>
        <p role="status" className="text-[11px] leading-5 text-slate-600">
          {projectArchived
            ? 'Dự án đã lưu trữ; cài provider sau cũng không sửa được bản nháp này.'
            : 'Khi provider được cài, panel này sẽ nối vào hợp đồng TTS mà không đổi ProjectDocument.'}
        </p>
      </div>
    </section>
  );
}
