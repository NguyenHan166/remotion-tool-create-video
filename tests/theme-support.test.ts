import { describe, expect, it } from 'vitest';
import {
  TEMPLATE_THEME_CONTROLS,
  getTemplate,
  templateRegistry,
  validateTemplateSupport,
} from '../packages/template-registry/src/index.js';
import { ProjectVideo } from '../packages/video/src/project-video.js';
import {
  BREAKING_RED_PROJECT_FIXTURE,
  STUDIO_PROJECT_FIXTURE,
  THEME_FIXTURE_ASSETS,
  THEME_TEMPLATE_FIXTURES,
  WARNING_DARK_PROJECT_FIXTURE,
} from '../packages/video/src/fixture.js';
import { resolveSceneSource as resolveBreakingSource } from '../packages/video/src/templates/breaking-red-v1/components.js';
import { resolveSceneSource as resolveNewsSource } from '../packages/video/src/templates/news-clean-v1/components.js';
import { resolveSceneSource as resolveWarningSource } from '../packages/video/src/templates/warning-dark-v1/components.js';

describe('template theme support', () => {
  it('declares every shared theme, branding and source control', () => {
    for (const manifest of Object.values(templateRegistry)) {
      expect(manifest.themeControls).toEqual(TEMPLATE_THEME_CONTROLS);
      expect(validateTemplateSupport(manifest)).toEqual({ errors: [], warnings: [] });
    }
  });

  it('uses the global source when a scene does not provide an override', () => {
    const projects = [
      STUDIO_PROJECT_FIXTURE,
      BREAKING_RED_PROJECT_FIXTURE,
      WARNING_DARK_PROJECT_FIXTURE,
    ].map((project) => {
      const next = structuredClone(project);
      next.theme.sourceText = 'HanSYS Editorial Desk';
      const scene = next.scenes[0]!;
      const text = { ...scene.text };
      delete text.source;
      next.scenes[0] = { ...scene, text };
      return next;
    });

    expect(resolveNewsSource(projects[0]!, projects[0]!.scenes[0]!)).toBe('HanSYS Editorial Desk');
    expect(resolveBreakingSource(projects[1]!, projects[1]!.scenes[0]!)).toBe(
      'HanSYS Editorial Desk',
    );
    expect(resolveWarningSource(projects[2]!, projects[2]!.scenes[0]!)).toBe(
      'HanSYS Editorial Desk',
    );
  });

  it('routes a logo, watermark and source theme fixture through every template', () => {
    for (const [templateId, project] of Object.entries(THEME_TEMPLATE_FIXTURES)) {
      const manifest = getTemplate(templateId, project.template.version);
      expect(manifest.validate(project).errors).toEqual([]);
      expect(project.theme.logoAssetId).toBeDefined();
      expect(project.theme.watermarkText).toBe('THEME FIXTURE');
      expect(project.theme.sourceText).toBe('HanSYS Theme Desk');

      const element = ProjectVideo({ project, assets: THEME_FIXTURE_ASSETS });
      expect(element.type).toBe(manifest.Component);
    }
  });
});
