export const TTS_PROVIDER_KOKORO = 'kokoro' as const;
export const TTS_PROVIDER_IDS = [TTS_PROVIDER_KOKORO] as const;

export type TtsProviderId = string;

export type TtsAudioFormat = 'wav' | 'mp3';

export type TtsVoice = Readonly<{
  id: string;
  displayName: string;
  languageCodes: readonly string[];
}>;

export type TtsSynthesisRequest = Readonly<{
  text: string;
  languageCode: string;
  voiceId: string;
  format: TtsAudioFormat;
  sampleRateHz?: number;
  signal?: AbortSignal;
}>;

export type TtsSynthesisResult = Readonly<{
  audio: Uint8Array;
  durationMs: number;
  format: TtsAudioFormat;
  mimeType: 'audio/wav' | 'audio/mpeg';
  sampleRateHz: number;
}>;

export interface TtsProvider {
  readonly id: TtsProviderId;
  readonly displayName: string;
  listVoices(): Promise<readonly TtsVoice[]>;
  synthesize(request: TtsSynthesisRequest): Promise<TtsSynthesisResult>;
}

export interface TtsProviderRegistry {
  get(providerId: TtsProviderId): TtsProvider | undefined;
  require(providerId: TtsProviderId): TtsProvider;
  list(): readonly TtsProvider[];
  register(provider: TtsProvider): void;
}

export class TtsProviderNotFoundError extends Error {
  readonly code = 'TTS_PROVIDER_NOT_FOUND';
  readonly providerId: TtsProviderId;

  constructor(providerId: TtsProviderId) {
    super(`TTS provider "${providerId}" is not installed.`);
    this.name = 'TtsProviderNotFoundError';
    this.providerId = providerId;
  }
}

export class TtsProviderAlreadyRegisteredError extends Error {
  readonly code = 'TTS_PROVIDER_ALREADY_REGISTERED';
  readonly providerId: TtsProviderId;

  constructor(providerId: TtsProviderId) {
    super(`TTS provider "${providerId}" is already registered.`);
    this.name = 'TtsProviderAlreadyRegisteredError';
    this.providerId = providerId;
  }
}

export function createTtsProviderRegistry(
  providers: readonly TtsProvider[] = [],
): TtsProviderRegistry {
  const registered = new Map<TtsProviderId, TtsProvider>();

  const register = (provider: TtsProvider): void => {
    if (registered.has(provider.id)) {
      throw new TtsProviderAlreadyRegisteredError(provider.id);
    }

    registered.set(provider.id, provider);
  };

  providers.forEach(register);

  return {
    get: (providerId) => registered.get(providerId),
    require: (providerId) => {
      const provider = registered.get(providerId);

      if (provider === undefined) {
        throw new TtsProviderNotFoundError(providerId);
      }

      return provider;
    },
    list: () => [...registered.values()],
    register,
  };
}

/** The default registry is intentionally empty until a concrete provider is installed. */
export const ttsProviderRegistry = createTtsProviderRegistry();
