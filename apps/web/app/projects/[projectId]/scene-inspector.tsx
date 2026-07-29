'use client';

import { PROJECT_SCENE_TYPES, type SceneV1 } from '@hansys/project-schema';
import { getTemplate } from '@hansys/template-registry';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { fetchAssets, type AssetDto } from '../../../src/assets/client';
import {
  getSelectedScene,
  updateSelectedScene,
  type SceneEditorState,
  type SceneUpdater,
} from '../../../src/projects/editor-state';

const inputClassName =
  'mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-orange-400/50 focus:ring-3 focus:ring-orange-400/10';
const labelClassName = 'block text-xs font-medium text-slate-300';

const sceneTypeLabels: Record<SceneV1['type'], string> = {
  hook: 'Hook',
  headline: 'Headline',
  content: 'Nội dung',
  image: 'Hình ảnh',
  video: 'Video',
  'bullet-list': 'Danh sách',
  quote: 'Trích dẫn',
  outro: 'Kết',
};

type OptionalTextKey = Exclude<keyof SceneV1['text'], 'bullets'>;

function updateOptionalText(scene: SceneV1, key: OptionalTextKey, value: string): SceneV1 {
  const text = { ...scene.text };

  if (value.length === 0) {
    delete text[key];
  } else {
    text[key] = value;
  }

  return { ...scene, text };
}

function updateBullets(scene: SceneV1, bullets: string[]): SceneV1 {
  const text = { ...scene.text };

  if (bullets.length === 0) {
    delete text.bullets;
  } else {
    text.bullets = bullets;
  }

  return { ...scene, text };
}

function createMedia(assetId: string): NonNullable<SceneV1['media']> {
  return {
    assetId,
    fit: 'cover',
    positionX: 0.5,
    positionY: 0.5,
    scale: 1,
    startFromMs: 0,
    playbackRate: 1,
    muted: true,
  };
}

function isAssetCompatible(asset: AssetDto, sceneType: SceneV1['type']): boolean {
  if (sceneType === 'video') {
    return asset.kind === 'VIDEO';
  }

  return asset.kind === 'IMAGE' || asset.kind === 'LOGO';
}

function InspectorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="border-t border-white/8 pt-5">
      <legend className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {title}
      </legend>
      <div className="space-y-4">{children}</div>
    </fieldset>
  );
}

export function SceneInspector({
  state,
  onChange,
}: {
  state: SceneEditorState;
  onChange: (state: SceneEditorState) => void;
}) {
  const [validationError, setValidationError] = useState<string | null>(null);
  const scene = getSelectedScene(state);
  const assetsQuery = useQuery({
    queryKey: ['assets', 'scene-inspector', 'ready'],
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
  const templateVariants = useMemo(() => {
    try {
      return getTemplate(state.document.template.id, state.document.template.version).variants;
    } catch {
      return [];
    }
  }, [state.document.template.id, state.document.template.version]);
  const compatibleAssets = useMemo(
    () => (assetsQuery.data?.items ?? []).filter((asset) => isAssetCompatible(asset, scene.type)),
    [assetsQuery.data?.items, scene.type],
  );

  const commit = (updater: SceneUpdater) => {
    const result = updateSelectedScene(state, updater);

    if (!result.success) {
      const path = result.error.path.length > 0 ? `${result.error.path}: ` : '';
      setValidationError(`${path}${result.error.message}`);
      return;
    }

    setValidationError(null);
    onChange(result.state);
  };

  const changeSceneType = (type: SceneV1['type']) => {
    if (type === scene.type) {
      return;
    }

    const requiresNewAsset =
      (type === 'image' || type === 'video') && (scene.type !== type || scene.media === undefined);
    const defaultAsset = (assetsQuery.data?.items ?? []).find((asset) =>
      isAssetCompatible(asset, type),
    );

    if (requiresNewAsset && defaultAsset === undefined) {
      setValidationError(
        assetsQuery.isLoading
          ? 'Đang tải thư viện media. Hãy thử lại sau ít giây.'
          : `Cần ít nhất một ${type === 'video' ? 'video' : 'hình ảnh'} READY để dùng loại scene này.`,
      );
      return;
    }

    commit((current) => ({
      ...current,
      type,
      ...(requiresNewAsset && defaultAsset !== undefined
        ? { media: createMedia(defaultAsset.id) }
        : {}),
    }));
  };

  const updateMedia = (
    updater: (media: NonNullable<SceneV1['media']>) => NonNullable<SceneV1['media']>,
  ) => {
    const media = scene.media;

    if (media === undefined) {
      return;
    }

    commit((current) => ({
      ...current,
      media: updater(current.media ?? media),
    }));
  };

  return (
    <section
      aria-label="Scene inspector"
      className="rounded-2xl border border-white/10 bg-[#10151e] shadow-[0_18px_50px_rgba(0,0,0,0.18)]"
    >
      <div className="border-b border-white/8 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Scene inspector
            </p>
            <h2 className="mt-1 truncate text-base font-semibold text-white">{scene.name}</h2>
          </div>
          <span className="rounded-lg border border-orange-400/20 bg-orange-400/8 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-orange-300">
            {scene.type}
          </span>
        </div>

        {validationError !== null ? (
          <p
            role="alert"
            data-testid="inspector-validation-error"
            className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/8 px-3 py-2.5 text-xs leading-5 text-rose-200"
          >
            {validationError}
          </p>
        ) : null}
      </div>

      <div className="max-h-[calc(100vh-190px)] space-y-5 overflow-y-auto p-5">
        <InspectorSection title="Cơ bản">
          <label className={labelClassName}>
            Tên scene
            <input
              aria-label="Tên scene"
              className={inputClassName}
              maxLength={200}
              value={scene.name}
              onChange={(event) => {
                const name = event.currentTarget.value;
                commit((current) => ({ ...current, name }));
              }}
            />
          </label>

          <label className={labelClassName}>
            Loại scene
            <select
              aria-label="Loại scene"
              className={inputClassName}
              value={scene.type}
              onChange={(event) => {
                changeSceneType(event.currentTarget.value as SceneV1['type']);
              }}
            >
              {PROJECT_SCENE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {sceneTypeLabels[type]}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-[1fr_auto] items-end gap-3">
            <label className={labelClassName}>
              Thời lượng (frame)
              <input
                aria-label="Thời lượng frame"
                className={inputClassName}
                min={6}
                step={1}
                type="number"
                value={scene.durationInFrames}
                onChange={(event) => {
                  const durationInFrames = event.currentTarget.valueAsNumber;
                  commit((current) => ({ ...current, durationInFrames }));
                }}
              />
            </label>
            <span className="pb-2.5 text-xs text-slate-500">
              {(scene.durationInFrames / state.document.composition.fps).toFixed(1)}s
            </span>
          </div>

          <label className="flex items-center justify-between gap-4 rounded-xl border border-white/8 bg-black/15 px-3 py-2.5 text-xs font-medium text-slate-300">
            Bật scene
            <input
              aria-label="Bật scene"
              checked={scene.enabled}
              className="h-4 w-4 accent-orange-500"
              type="checkbox"
              onChange={(event) => {
                const enabled = event.currentTarget.checked;
                commit((current) => ({ ...current, enabled }));
              }}
            />
          </label>
        </InspectorSection>

        <InspectorSection title="Nội dung chữ">
          <label className={labelClassName}>
            Nhãn
            <input
              aria-label="Nhãn"
              className={inputClassName}
              maxLength={200}
              placeholder="Ví dụ: Tin mới"
              value={scene.text.label ?? ''}
              onChange={(event) => {
                const value = event.currentTarget.value;
                commit((current) => updateOptionalText(current, 'label', value));
              }}
            />
          </label>

          <label className={labelClassName}>
            Tiêu đề
            <textarea
              aria-label="Tiêu đề"
              className={`${inputClassName} resize-y leading-6`}
              maxLength={300}
              placeholder="Tiêu đề chính của scene"
              rows={3}
              value={scene.text.headline ?? ''}
              onChange={(event) => {
                const value = event.currentTarget.value;
                commit((current) => updateOptionalText(current, 'headline', value));
              }}
            />
          </label>

          <label className={labelClassName}>
            Nội dung
            <textarea
              aria-label="Nội dung"
              className={`${inputClassName} resize-y leading-6`}
              maxLength={5_000}
              placeholder="Nội dung bổ sung"
              rows={4}
              value={scene.text.body ?? ''}
              onChange={(event) => {
                const value = event.currentTarget.value;
                commit((current) => updateOptionalText(current, 'body', value));
              }}
            />
          </label>

          {scene.type === 'bullet-list' ? (
            <label className={labelClassName}>
              Danh sách (mỗi dòng một ý, tối đa 10)
              <textarea
                aria-label="Danh sách bullet"
                className={`${inputClassName} resize-y leading-6`}
                rows={5}
                value={(scene.text.bullets ?? []).join('\n')}
                onChange={(event) => {
                  const bullets = event.currentTarget.value
                    .split(/\r?\n/)
                    .filter((line) => line.length > 0);
                  commit((current) => updateBullets(current, bullets));
                }}
              />
            </label>
          ) : null}

          {scene.type === 'quote' ? (
            <label className={labelClassName}>
              Tác giả trích dẫn
              <input
                aria-label="Tác giả trích dẫn"
                className={inputClassName}
                maxLength={200}
                value={scene.text.quoteAuthor ?? ''}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  commit((current) => updateOptionalText(current, 'quoteAuthor', value));
                }}
              />
            </label>
          ) : null}

          <label className={labelClassName}>
            Nguồn
            <input
              aria-label="Nguồn"
              className={inputClassName}
              maxLength={500}
              placeholder="Tên hoặc URL nguồn"
              value={scene.text.source ?? ''}
              onChange={(event) => {
                const value = event.currentTarget.value;
                commit((current) => updateOptionalText(current, 'source', value));
              }}
            />
          </label>
        </InspectorSection>

        {scene.type === 'image' || scene.type === 'video' ? (
          <InspectorSection title="Media">
            <label className={labelClassName}>
              Asset
              <select
                aria-label="Media asset"
                className={inputClassName}
                disabled={assetsQuery.isLoading}
                value={scene.media?.assetId ?? ''}
                onChange={(event) => {
                  const assetId = event.currentTarget.value;
                  commit((current) => ({
                    ...current,
                    media:
                      current.media === undefined
                        ? createMedia(assetId)
                        : { ...current.media, assetId },
                  }));
                }}
              >
                <option disabled value="">
                  {assetsQuery.isLoading ? 'Đang tải media…' : 'Chọn media'}
                </option>
                {scene.media !== undefined &&
                !compatibleAssets.some((asset) => asset.id === scene.media?.assetId) ? (
                  <option value={scene.media.assetId}>Asset hiện tại</option>
                ) : null}
                {compatibleAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.originalName}
                  </option>
                ))}
              </select>
            </label>

            {assetsQuery.isError ? (
              <p className="text-xs leading-5 text-amber-300">
                Không thể tải thư viện media. Asset hiện tại vẫn được giữ nguyên.
              </p>
            ) : null}

            {scene.media !== undefined ? (
              <>
                <label className={labelClassName}>
                  Cách đặt media
                  <select
                    aria-label="Cách đặt media"
                    className={inputClassName}
                    value={scene.media.fit}
                    onChange={(event) => {
                      const fit = event.currentTarget.value as 'cover' | 'contain';
                      updateMedia((media) => ({ ...media, fit }));
                    }}
                  >
                    <option value="cover">Phủ khung</option>
                    <option value="contain">Vừa khung</option>
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className={labelClassName}>
                    Vị trí X
                    <input
                      aria-label="Vị trí X"
                      className={inputClassName}
                      max={1}
                      min={0}
                      step={0.05}
                      type="number"
                      value={scene.media.positionX}
                      onChange={(event) => {
                        const positionX = event.currentTarget.valueAsNumber;
                        updateMedia((media) => ({ ...media, positionX }));
                      }}
                    />
                  </label>
                  <label className={labelClassName}>
                    Vị trí Y
                    <input
                      aria-label="Vị trí Y"
                      className={inputClassName}
                      max={1}
                      min={0}
                      step={0.05}
                      type="number"
                      value={scene.media.positionY}
                      onChange={(event) => {
                        const positionY = event.currentTarget.valueAsNumber;
                        updateMedia((media) => ({ ...media, positionY }));
                      }}
                    />
                  </label>
                </div>

                <label className={labelClassName}>
                  Tỷ lệ
                  <input
                    aria-label="Tỷ lệ media"
                    className={inputClassName}
                    max={5}
                    min={0.1}
                    step={0.1}
                    type="number"
                    value={scene.media.scale}
                    onChange={(event) => {
                      const scale = event.currentTarget.valueAsNumber;
                      updateMedia((media) => ({ ...media, scale }));
                    }}
                  />
                </label>

                {scene.type === 'video' ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <label className={labelClassName}>
                        Bắt đầu (ms)
                        <input
                          aria-label="Bắt đầu media"
                          className={inputClassName}
                          min={0}
                          step={1}
                          type="number"
                          value={scene.media.startFromMs}
                          onChange={(event) => {
                            const startFromMs = event.currentTarget.valueAsNumber;
                            updateMedia((media) => ({ ...media, startFromMs }));
                          }}
                        />
                      </label>
                      <label className={labelClassName}>
                        Tốc độ
                        <input
                          aria-label="Tốc độ phát"
                          className={inputClassName}
                          max={4}
                          min={0.25}
                          step={0.25}
                          type="number"
                          value={scene.media.playbackRate}
                          onChange={(event) => {
                            const playbackRate = event.currentTarget.valueAsNumber;
                            updateMedia((media) => ({ ...media, playbackRate }));
                          }}
                        />
                      </label>
                    </div>
                    <label className="flex items-center justify-between gap-4 rounded-xl border border-white/8 bg-black/15 px-3 py-2.5 text-xs font-medium text-slate-300">
                      Tắt tiếng video
                      <input
                        aria-label="Tắt tiếng video"
                        checked={scene.media.muted}
                        className="h-4 w-4 accent-orange-500"
                        type="checkbox"
                        onChange={(event) => {
                          const muted = event.currentTarget.checked;
                          updateMedia((media) => ({ ...media, muted }));
                        }}
                      />
                    </label>
                  </>
                ) : null}
              </>
            ) : null}
          </InspectorSection>
        ) : null}

        <InspectorSection title="Trình bày">
          <label className={labelClassName}>
            Căn chữ
            <select
              aria-label="Căn chữ"
              className={inputClassName}
              value={scene.style.textAlign}
              onChange={(event) => {
                const textAlign = event.currentTarget.value as SceneV1['style']['textAlign'];
                commit((current) => ({
                  ...current,
                  style: { ...current.style, textAlign },
                }));
              }}
            >
              <option value="left">Trái</option>
              <option value="center">Giữa</option>
              <option value="right">Phải</option>
            </select>
          </label>

          <label className={labelClassName}>
            Mức nhấn mạnh
            <select
              aria-label="Mức nhấn mạnh"
              className={inputClassName}
              value={scene.style.emphasis}
              onChange={(event) => {
                const emphasis = event.currentTarget.value as SceneV1['style']['emphasis'];
                commit((current) => ({
                  ...current,
                  style: { ...current.style, emphasis },
                }));
              }}
            >
              <option value="normal">Bình thường</option>
              <option value="strong">Mạnh</option>
              <option value="urgent">Khẩn cấp</option>
            </select>
          </label>

          <label className={labelClassName}>
            Biến thể template
            <select
              aria-label="Biến thể template"
              className={inputClassName}
              value={scene.style.variant ?? ''}
              onChange={(event) => {
                const variant = event.currentTarget.value;
                commit((current) => {
                  const style = {
                    textAlign: current.style.textAlign,
                    emphasis: current.style.emphasis,
                  };

                  return {
                    ...current,
                    style: variant.length === 0 ? style : { ...style, variant },
                  };
                });
              }}
            >
              <option value="">Mặc định</option>
              {templateVariants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.name}
                </option>
              ))}
            </select>
          </label>
        </InspectorSection>
      </div>
    </section>
  );
}
