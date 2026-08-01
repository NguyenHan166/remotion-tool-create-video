import { describe, expect, it } from 'vitest';
import {
  createTtsProviderRegistry,
  TTS_PROVIDER_KOKORO,
  ttsProviderRegistry,
  TtsProviderAlreadyRegisteredError,
  TtsProviderNotFoundError,
  type TtsProvider,
} from '../packages/shared/src/tts.js';

function createTestProvider(id = 'test-provider'): TtsProvider {
  return {
    id,
    displayName: 'Test provider',
    listVoices: async () => [
      {
        id: 'test-voice',
        displayName: 'Test voice',
        languageCodes: ['vi-VN'],
      },
    ],
    synthesize: async (request) => ({
      audio: new Uint8Array(),
      durationMs: request.text.length * 10,
      format: request.format,
      mimeType: request.format === 'wav' ? 'audio/wav' : 'audio/mpeg',
      sampleRateHz: request.sampleRateHz ?? 24_000,
    }),
  };
}

describe('TTS provider boundary', () => {
  it('keeps the default registry empty until a concrete provider is installed', () => {
    expect(ttsProviderRegistry.list()).toEqual([]);
    expect(ttsProviderRegistry.get(TTS_PROVIDER_KOKORO)).toBeUndefined();
    expect(() => ttsProviderRegistry.require(TTS_PROVIDER_KOKORO)).toThrow(
      TtsProviderNotFoundError,
    );
  });

  it('registers a provider contract and returns its voice and synthesis result', async () => {
    const provider = createTestProvider();
    const registry = createTtsProviderRegistry([provider]);

    expect(registry.list()).toEqual([provider]);
    await expect(provider.listVoices()).resolves.toEqual([
      {
        id: 'test-voice',
        displayName: 'Test voice',
        languageCodes: ['vi-VN'],
      },
    ]);
    await expect(
      provider.synthesize({
        format: 'wav',
        languageCode: 'vi-VN',
        text: 'Xin chào',
        voiceId: 'test-voice',
      }),
    ).resolves.toMatchObject({
      durationMs: 80,
      format: 'wav',
      mimeType: 'audio/wav',
      sampleRateHz: 24_000,
    });
  });

  it('rejects duplicate provider registration without replacing the first provider', () => {
    const first = createTestProvider();
    const registry = createTtsProviderRegistry([first]);

    expect(() => registry.register(createTestProvider())).toThrow(
      TtsProviderAlreadyRegisteredError,
    );
    expect(registry.require(first.id)).toBe(first);
  });
});
