import {
  type TemplateManifest,
  type TemplateThemeControl,
  type TemplateValidationIssue,
} from './types.js';

export const TEMPLATE_THEME_CONTROLS = [
  'colors',
  'font',
  'logo',
  'watermark',
  'source',
] as const satisfies readonly TemplateThemeControl[];

export function validateTemplateSupport(
  manifest: Pick<TemplateManifest, 'id' | 'themeControls'>,
  requiredControls: readonly TemplateThemeControl[] = TEMPLATE_THEME_CONTROLS,
): { errors: TemplateValidationIssue[]; warnings: TemplateValidationIssue[] } {
  const supportedControls = new Set(manifest.themeControls ?? []);
  const errors = requiredControls
    .filter((control) => !supportedControls.has(control))
    .map((control) => ({
      code: 'UNSUPPORTED_THEME_CONTROL',
      path: `themeControls.${control}`,
      message: `Template "${manifest.id}" does not support the ${control} theme control.`,
    }));

  return { errors, warnings: [] };
}
