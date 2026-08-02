'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import Link from 'next/link';
import { listProjects } from '../../src/projects/client';
import { CreateProjectDialog } from './create-project-dialog';

export default function ProjectsPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useQuery({
    queryKey: ['projects', page],
    queryFn: () => listProjects(page, 20),
  });

  return (
    <main className="min-h-screen bg-[#090c12]">
      <header className="border-b border-white/8 bg-[#090c12]/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="mx-auto flex max-w-[1560px] items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500 font-black text-white shadow-[0_0_32px_rgba(255,90,54,0.25)]">
                H
              </div>
              <div>
                <p className="text-sm font-semibold tracking-wide text-white">HANSYS STUDIO</p>
                <p className="text-[11px] text-slate-500">Local video workspace</p>
              </div>
            </div>

            <nav className="hidden md:flex items-center gap-6">
              <Link href="/projects" className="text-sm font-semibold text-orange-500">
                Dự án
              </Link>
              <Link
                href="/assets"
                className="text-sm font-medium text-slate-400 hover:text-white transition-colors"
              >
                Thư viện media
              </Link>
            </nav>
          </div>

          <div className="hidden items-center gap-2 text-xs text-slate-500 sm:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]" />
            Dữ liệu được lưu cục bộ
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1560px] px-5 py-8 sm:px-8 lg:py-10">
        <section className="flex flex-col gap-6 border-b border-white/8 pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-400">
              Video Workspace
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Danh sách dự án
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">
              Quản lý các video đang được chỉnh sửa và tạo dự án mới.
            </p>
          </div>
          <div>
            <button
              onClick={() => setIsCreateOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-orange-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_0_24px_rgba(234,88,12,0.4)] transition-all hover:bg-orange-500 hover:shadow-[0_0_32px_rgba(234,88,12,0.6)]"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Tạo dự án mới
            </button>
          </div>
        </section>

        <section className="mt-8">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center text-sm text-slate-500">
              Đang tải danh sách...
            </div>
          ) : error ? (
            <div className="flex h-40 items-center justify-center text-sm text-red-500">
              Đã xảy ra lỗi khi tải danh sách dự án.
            </div>
          ) : data?.items.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/5">
              <p className="text-sm text-slate-400 mb-4">Chưa có dự án nào.</p>
              <button
                onClick={() => setIsCreateOpen(true)}
                className="text-sm font-medium text-orange-500 hover:text-orange-400"
              >
                Tạo dự án đầu tiên
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {data?.items.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-white/10 bg-[#141a23] p-6 transition-all hover:border-orange-500/50 hover:bg-[#1a222d] hover:shadow-[0_0_32px_rgba(234,88,12,0.15)]"
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500/10 text-orange-500">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
                          <line x1="7" y1="2" x2="7" y2="22"></line>
                          <line x1="17" y1="2" x2="17" y2="22"></line>
                          <line x1="2" y1="12" x2="22" y2="12"></line>
                          <line x1="2" y1="7" x2="7" y2="7"></line>
                          <line x1="2" y1="17" x2="7" y2="17"></line>
                          <line x1="17" y1="17" x2="22" y2="17"></line>
                          <line x1="17" y1="7" x2="22" y2="7"></line>
                        </svg>
                      </div>
                      <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/70">
                        {project.status === 'DRAFT' ? 'Bản nháp' : 'Lưu trữ'}
                      </span>
                    </div>
                    <h3 className="mt-5 text-lg font-semibold text-white group-hover:text-orange-400 transition-colors line-clamp-1">
                      {project.name}
                    </h3>
                  </div>

                  <div className="mt-6 flex items-center justify-between border-t border-white/5 pt-4 text-[11px] text-slate-500">
                    <span>Cập nhật: {new Date(project.updatedAt).toLocaleDateString('vi-VN')}</span>
                    <span className="flex items-center gap-1 group-hover:text-orange-400 transition-colors">
                      Mở Editor
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                        <polyline points="12 5 19 12 12 19"></polyline>
                      </svg>
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      {isCreateOpen && <CreateProjectDialog onClose={() => setIsCreateOpen(false)} />}
    </main>
  );
}
