import { describe, expect, it } from 'vitest';
import {
  InvalidTemplateRegistryError,
  TemplateNotFoundError,
  TemplateVersionMismatchError,
  defineTemplateRegistry,
  getTemplate,
  listTemplateMetadata,
  type TemplateManifest,
} from '../packages/template-registry/src/index.js';
import { createTemplateCollectionHandlers } from '../apps/web/src/templates/handlers.js';

function FixtureTemplate(): null {
  return null;
}

const fixtureManifest: TemplateManifest = {
  id: 'fixture-clean-v1',
  version: 1,
  name: 'Fixture Clean',
  description: 'Template fixture for registry contract tests.',
  thumbnailAsset: '/templates/fixture-clean-v1/thumbnail.webp',
  supportedAspectRatios: ['9:16', '1:1'],
  supportedSceneTypes: ['headline', 'content'],
  variants: [
    {
      id: 'default',
      name: 'Default',
    },
  ],
  defaultProjectPatch: {},
  validate: () => ({
    errors: [],
    warnings: [],
  }),
  Component: FixtureTemplate,
};

const fixtureRegistry = defineTemplateRegistry({
  [fixtureManifest.id]: fixtureManifest,
});

describe('static template registry', () => {
  it('looks up an exact template ID and version', () => {
    expect(getTemplate('fixture-clean-v1', 1, fixtureRegistry)).toBe(fixtureManifest);
  });

  it('throws a typed error for an unknown template', () => {
    expect(() => getTemplate('unknown-v1', 1, fixtureRegistry)).toThrowError(TemplateNotFoundError);

    try {
      getTemplate('unknown-v1', 1, fixtureRegistry);
    } catch (error) {
      expect(error).toMatchObject({
        name: 'TemplateNotFoundError',
        code: 'TEMPLATE_NOT_FOUND',
        templateId: 'unknown-v1',
      });
    }
  });

  it('throws a typed error when the requested version is unavailable', () => {
    expect(() => getTemplate('fixture-clean-v1', 2, fixtureRegistry)).toThrowError(
      TemplateVersionMismatchError,
    );

    try {
      getTemplate('fixture-clean-v1', 2, fixtureRegistry);
    } catch (error) {
      expect(error).toMatchObject({
        name: 'TemplateVersionMismatchError',
        code: 'TEMPLATE_VERSION_MISMATCH',
        templateId: 'fixture-clean-v1',
        requestedVersion: 2,
        availableVersion: 1,
      });
    }
  });

  it('rejects a registry key that differs from its immutable manifest ID', () => {
    expect(() =>
      defineTemplateRegistry({
        'different-id': fixtureManifest,
      }),
    ).toThrowError(InvalidTemplateRegistryError);
  });

  it('returns deterministic serializable metadata without executable fields', () => {
    const secondManifest: TemplateManifest = {
      ...fixtureManifest,
      id: 'alpha-v1',
      name: 'Alpha',
    };
    const registry = defineTemplateRegistry({
      [fixtureManifest.id]: fixtureManifest,
      [secondManifest.id]: secondManifest,
    });

    const metadata = listTemplateMetadata(registry);

    expect(metadata.map(({ id }) => id)).toEqual(['alpha-v1', 'fixture-clean-v1']);
    expect(metadata[1]).toMatchObject({
      id: 'fixture-clean-v1',
      version: 1,
      supportedAspectRatios: ['9:16', '1:1'],
      supportedSceneTypes: ['headline', 'content'],
    });
    expect(metadata[1]).not.toHaveProperty('Component');
    expect(metadata[1]).not.toHaveProperty('validate');
  });
});

describe('template list API', () => {
  it('exposes static registry metadata without executable component references', async () => {
    const handlers = createTemplateCollectionHandlers(fixtureRegistry);
    const response = handlers.GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      items: [
        {
          id: 'fixture-clean-v1',
          version: 1,
          name: 'Fixture Clean',
          description: 'Template fixture for registry contract tests.',
          thumbnailAsset: '/templates/fixture-clean-v1/thumbnail.webp',
          supportedAspectRatios: ['9:16', '1:1'],
          supportedSceneTypes: ['headline', 'content'],
          variants: [
            {
              id: 'default',
              name: 'Default',
            },
          ],
          defaultProjectPatch: {},
        },
      ],
    });
  });
});
