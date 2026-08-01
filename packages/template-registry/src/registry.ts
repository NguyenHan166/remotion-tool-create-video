import {
  InvalidTemplateRegistryError,
  TemplateNotFoundError,
  TemplateVersionMismatchError,
} from './errors.js';
import { breakingRedV1 } from './templates/breaking-red-v1.js';
import { newsCleanV1 } from './templates/news-clean-v1.js';
import { warningDarkV1 } from './templates/warning-dark-v1.js';
import { type TemplateManifest, type TemplateMetadata, type TemplateRegistry } from './types.js';

export function defineTemplateRegistry<const TRegistry extends TemplateRegistry>(
  registry: TRegistry,
): Readonly<TRegistry> {
  for (const [registryKey, manifest] of Object.entries(registry)) {
    if (registryKey !== manifest.id) {
      throw new InvalidTemplateRegistryError(registryKey, manifest.id);
    }
  }

  return Object.freeze({ ...registry });
}

export const templateRegistry = defineTemplateRegistry({
  [breakingRedV1.id]: breakingRedV1,
  [newsCleanV1.id]: newsCleanV1,
  [warningDarkV1.id]: warningDarkV1,
});

export function getTemplate(
  templateId: string,
  version: number,
  registry: TemplateRegistry = templateRegistry,
): TemplateManifest {
  if (!Object.hasOwn(registry, templateId)) {
    throw new TemplateNotFoundError(templateId);
  }

  const manifest = registry[templateId]!;

  if (manifest.version !== version) {
    throw new TemplateVersionMismatchError(templateId, version, manifest.version);
  }

  return manifest;
}

function toTemplateMetadata(manifest: TemplateManifest): TemplateMetadata {
  return {
    id: manifest.id,
    version: manifest.version,
    name: manifest.name,
    description: manifest.description,
    thumbnailAsset: manifest.thumbnailAsset,
    supportedAspectRatios: [...manifest.supportedAspectRatios],
    supportedSceneTypes: [...manifest.supportedSceneTypes],
    variants: manifest.variants.map((variant) => ({ ...variant })),
    defaultProjectPatch: manifest.defaultProjectPatch,
  };
}

export function listTemplateMetadata(
  registry: TemplateRegistry = templateRegistry,
): TemplateMetadata[] {
  return Object.values(registry)
    .sort((left, right) => left.id.localeCompare(right.id) || left.version - right.version)
    .map(toTemplateMetadata);
}
