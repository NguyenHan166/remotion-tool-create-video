'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createProject } from '../../src/projects/client';

export function CreateProjectDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('breaking-red-v1');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // Defaulting to standard vertical format 1080x1920 30FPS
      const project = await createProject(name, templateId, 1080, 1920, 30);
      router.push(`/projects/${project.id}`);
    } catch (err: any) {
      setError(err.message || 'Lỗi khi tạo dự án');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0f141f] p-6 shadow-2xl">
        <h2 className="text-xl font-semibold text-white">Tạo dự án mới</h2>
        <p className="mt-2 text-sm text-slate-400">
          Tạo dự án video dọc (9:16) để bắt đầu biên tập.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">Tên dự án</label>
            <input
              type="text"
              required
              autoFocus
              className="w-full rounded-lg border border-white/10 bg-black/50 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
              placeholder="VD: Video TikTok Tháng 8"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">Template</label>
            <select
              className="w-full rounded-lg border border-white/10 bg-black/50 px-4 py-2.5 text-sm text-white outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              disabled={isSubmitting}
            >
              <option value="breaking-red-v1">Bản tin khẩn cấp (Breaking Red)</option>
              <option value="warning-dark-v1">Cảnh báo (Warning Dark)</option>
            </select>
          </div>

          {error && <div className="text-sm text-red-500 font-medium">{error}</div>}

          <div className="mt-4 flex items-center justify-end gap-3">
            <button
              type="button"
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5 transition-colors"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Hủy
            </button>
            <button
              type="submit"
              className="rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-[#0f141f] transition-all disabled:opacity-50"
              disabled={isSubmitting || !name.trim()}
            >
              {isSubmitting ? 'Đang tạo...' : 'Tạo dự án'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
