export class MissingTemplateAssetError extends Error {
  readonly code = 'TEMPLATE_ASSET_MISSING';
  readonly assetId: string;
  readonly sceneId: string;

  constructor(assetId: string, sceneId: string) {
    super(`Asset "${assetId}" required by scene "${sceneId}" is missing.`);
    this.name = 'MissingTemplateAssetError';
    this.assetId = assetId;
    this.sceneId = sceneId;
  }
}

export class InvalidTemplateProjectError extends Error {
  readonly code = 'TEMPLATE_PROJECT_INVALID';
  readonly issues: readonly { code: string; path: string; message: string }[];

  constructor(issues: readonly { code: string; path: string; message: string }[]) {
    super('Project is not valid for the breaking-red-v1 template.');
    this.name = 'InvalidTemplateProjectError';
    this.issues = issues;
  }
}
