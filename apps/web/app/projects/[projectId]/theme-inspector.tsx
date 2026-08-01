'use client';

import { ProjectDocumentSchema, type ProjectDocumentV1 } from '@hansys/project-schema';
import {
  getTemplate,
  validateTemplateSupport,
  type TemplateThemeControl,
} from '@hansys/template-registry';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { fetchAssets, type AssetDto } from '../../../src/assets/client';
import { getSelectedScene, type SceneEditorState } from '../../../src/projects/editor-state';

const inputClassName =
  'mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-orange-400/50 focus:ring-3 focus:ring-orange-400/10';
const labelClassName = 'block text-xs font-medium text-slate-300';

const colorControls = [
  { key: 'primaryColor', label: 'Màu chính' },
  { key: 'secondaryColor', label: 'Màu phụ' },
  { key: 'accentColor', label: 'Màu nhấn' },
  { key: 'textColor', label: 'Màu chữ' },
  { key: 'mutedTextColor', label: 'Màu chữ phụ' },
] as const satisfies ReadonlyArray<{
  key: keyof Pick<
    ProjectDocumentV1['theme'],
    'primaryColor' | 'secondaryColor' | 'accentColor' | 'textColor' | 'mutedTextColor'
  >;
  label: string;
}>;

const themeControlLabels: Record<TemplateThemeControl, string> = {
  colors: 'màu sắc',
  font: 'font',
  logo: 'logo',
  watermark: 'watermark',
  source: 'nguồn',
};

function colorInputValue(value: string): string {
  return /^#[0-9A-Fa-f]{6}$/.test(value) ? value : '#000000';
}

function updateOptionalThemeText(
  theme: ProjectDocumentV1['theme'],
  key: 'watermarkText' | 'sourceText',
  value: string,
): ProjectDocumentV1['theme'] {
  const nextTheme = { ...theme };

  if (value.length === 0) {
    delete nextTheme[key];
  } else {
    nextTheme[key] = value;
  }

  return nextTheme;
}

function LogoOptions({ assets }: { assets: AssetDto[] }) {
  return assets
    .filter((asset) => asset.kind === 'LOGO' || asset.kind === 'IMAGE')
    .map((asset) => (
      <option key={asset.id} value={asset.id}>
        {asset.originalName}
      </option>
    ));
}

export function ThemeInspector({
  state,
  onChange,
}: {
  state: SceneEditorState;
  onChange: (state: SceneEditorState) => void;
}) {
  const [validationError, setValidationError] = useState<string | null>(null);
  const assetsQuery = useQuery({
    queryKey: ['assets', 'theme-inspector', 'ready'],
    queryFn: ({ signal }) =>
      fetchAssets(
        {
          page: 1,
          pageSize: 100,
          search: '',
          kind: '',
          status: 'READY',
        },
        signal,
      ),
    staleTime: 30_000,
  });
  const templateSupport = useMemo(() => {
    try {
      const manifest = getTemplate(state.document.template.id, state.document.template.version);
      return {
        controls: manifest.themeControls ?? [],
        issues: validateTemplateSupport(manifest).errors,
      };
    } catch {
      return { controls: [], issues: [] };
    }
  }, [state.document.template.id, state.document.template.version]);
  const selectedScene = getSelectedScene(state);
  const theme = state.document.theme;

  const commitTheme = (
    updater: (theme: ProjectDocumentV1['theme']) => ProjectDocumentV1['theme'],
  ) => {
    const result = ProjectDocumentSchema.safeParse({
      ...state.document,
      theme: updater(state.document.theme),
    });

    if (!result.success) {
      setValidationError(result.error.issues[0]?.message ?? 'Theme không hợp lệ.');
      return;
    }

    setValidationError(null);
    onChange({ ...state, document: result.data });
  };

  return (
    <section
      aria-label="Theme inspector"
      data-testid="theme-inspector"
      className="mb-5 rounded-2xl border border-white/10 bg-[#10151e] shadow-[0_18px_50px_rgba(0,0,0,0.18)]"
    >
      <div className="border-b border-white/8 p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Theme inspector
        </p>
        <h2 className="mt-1 text-base font-semibold text-white">Thương hiệu & nguồn</h2>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Các scene có thể ghi đè nguồn mặc định trong Scene inspector.
        </p>
        {validationError !== null ? (
          <p
            role="alert"
            data-testid="theme-validation-error"
            className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/8 px-3 py-2.5 text-xs leading-5 text-rose-200"
          >
            {validationError}
          </p>
        ) : null}
        {templateSupport.issues.length > 0 ? (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/8 px-3 py-2.5 text-xs leading-5 text-amber-100"
          >
            Template chưa hỗ trợ: {templateSupport.issues.map((issue) => issue.path).join(', ')}
          </p>
        ) : null}
      </div>

      <div className="space-y-5 p-5">
        <fieldset>
          <legend className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Màu & font
          </legend>
          <div className="grid grid-cols-2 gap-3">
            {colorControls.map(({ key, label }) => (
              <label key={key} className={labelClassName}>
                {label}
                <input
                  aria-label={label}
                  className="mt-2 h-10 w-full cursor-pointer rounded-xl border border-white/10 bg-black/20 p-1"
                  type="color"
                  value={colorInputValue(theme[key])}
                  onChange={(event) => {
                    const value = event.currentTarget.value.toUpperCase();
                    commitTheme((current) => ({ ...current, [key]: value }));
                  }}
                />
              </label>
            ))}
          </div>
          <label className={`${labelClassName} mt-4`}>
            Font chữ
            <select
              aria-label="Font chữ"
              className={inputClassName}
              value={theme.fontFamily}
              onChange={(event) => {
                const fontFamily = event.currentTarget
                  .value as ProjectDocumentV1['theme']['fontFamily'];
                commitTheme((current) => ({ ...current, fontFamily }));
              }}
            >
              <option value="BeVietnamPro">Be Vietnam Pro</option>
              <option value="Inter">Inter</option>
              <option value="NotoSans">Noto Sans</option>
            </select>
          </label>
        </fieldset>

        <fieldset className="border-t border-white/8 pt-5">
          <legend className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Logo & watermark
          </legend>
          <label className={labelClassName}>
            Logo thương hiệu
            <select
              aria-label="Logo thương hiệu"
              className={inputClassName}
              disabled={assetsQuery.isLoading}
              value={theme.logoAssetId ?? ''}
              onChange={(event) => {
                const logoAssetId = event.currentTarget.value;
                commitTheme((current) => ({
                  ...current,
                  ...(logoAssetId.length === 0 ? { logoAssetId: undefined } : { logoAssetId }),
                }));
              }}
            >
              <option value="">Không dùng logo</option>
              <LogoOptions assets={assetsQuery.data?.items ?? []} />
            </select>
          </label>

          <label className={`${labelClassName} mt-4`}>
            Watermark
            <input
              aria-label="Watermark"
              className={inputClassName}
              maxLength={200}
              placeholder="Ví dụ: HANSYS"
              value={theme.watermarkText ?? ''}
              onChange={(event) => {
                commitTheme((current) =>
                  updateOptionalThemeText(current, 'watermarkText', event.currentTarget.value),
                );
              }}
            />
          </label>
        </fieldset>

        <fieldset className="border-t border-white/8 pt-5">
          <legend className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Nguồn
          </legend>
          <label className={labelClassName}>
            Nguồn mặc định
            <input
              aria-label="Nguồn mặc định"
              className={inputClassName}
              maxLength={500}
              placeholder="Ví dụ: HanSYS News Desk"
              value={theme.sourceText ?? ''}
              onChange={(event) => {
                commitTheme((current) =>
                  updateOptionalThemeText(current, 'sourceText', event.currentTarget.value),
                );
              }}
            />
          </label>
          <p className="mt-2 text-[11px] leading-5 text-slate-500">
            Scene hiện tại: {selectedScene.text.source?.trim() || 'dùng nguồn mặc định'}
          </p>
        </fieldset>

        <div
          data-testid="theme-controls-support"
          className="rounded-xl border border-white/8 bg-black/15 px-3 py-2.5 text-[11px] text-slate-500"
        >
          Hỗ trợ template:{' '}
          {templateSupport.controls.length === 0
            ? 'chưa xác định'
            : templateSupport.controls.map((control) => themeControlLabels[control]).join(' · ')}
        </div>
      </div>
    </section>
  );
}
