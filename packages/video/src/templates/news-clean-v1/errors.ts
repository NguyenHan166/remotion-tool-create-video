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

export class MissingVoiceoverAssetError extends Error {
  readonly code = 'TEMPLATE_ASSET_MISSING';
  readonly assetId: string;

  constructor(assetId: string) {
    super(`Voiceover asset "${assetId}" is missing.`);
    this.name = 'MissingVoiceoverAssetError';
    this.assetId = assetId;
  }
}

export class MissingBackgroundMusicAssetError extends Error {
  readonly code = 'TEMPLATE_ASSET_MISSING';
  readonly assetId: string;

  constructor(assetId: string) {
    super(`Background music asset "${assetId}" is missing.`);
    this.name = 'MissingBackgroundMusicAssetError';
    this.assetId = assetId;
  }
}

export class InvalidTemplateProjectError extends Error {
  readonly code = 'TEMPLATE_PROJECT_INVALID';
  readonly issues: readonly { code: string; path: string; message: string }[];

  constructor(issues: readonly { code: string; path: string; message: string }[]) {
    super('Project is not valid for the news-clean-v1 template.');
    this.name = 'InvalidTemplateProjectError';
    this.issues = issues;
  }
}
