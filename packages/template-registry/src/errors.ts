export class InvalidTemplateRegistryError extends Error {
  readonly code = 'TEMPLATE_REGISTRY_INVALID';
  readonly registryKey: string;
  readonly manifestId: string;

  constructor(registryKey: string, manifestId: string) {
    super(`Template registry key "${registryKey}" must match manifest ID "${manifestId}".`);
    this.name = 'InvalidTemplateRegistryError';
    this.registryKey = registryKey;
    this.manifestId = manifestId;
  }
}

export class TemplateNotFoundError extends Error {
  readonly code = 'TEMPLATE_NOT_FOUND';
  readonly templateId: string;

  constructor(templateId: string) {
    super(`Template "${templateId}" was not found.`);
    this.name = 'TemplateNotFoundError';
    this.templateId = templateId;
  }
}

export class TemplateVersionMismatchError extends Error {
  readonly code = 'TEMPLATE_VERSION_MISMATCH';
  readonly templateId: string;
  readonly requestedVersion: number;
  readonly availableVersion: number;

  constructor(templateId: string, requestedVersion: number, availableVersion: number) {
    super(
      `Template "${templateId}" version ${requestedVersion} is unavailable; ` +
        `version ${availableVersion} is registered.`,
    );
    this.name = 'TemplateVersionMismatchError';
    this.templateId = templateId;
    this.requestedVersion = requestedVersion;
    this.availableVersion = availableVersion;
  }
}
