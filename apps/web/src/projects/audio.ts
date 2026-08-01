import {
  type AudioTrackV1,
  type BackgroundMusicTrackV1,
  type ProjectDocumentV1,
} from '@hansys/project-schema';

export function setProjectVoiceover(
  document: ProjectDocumentV1,
  voiceover: AudioTrackV1 | undefined,
): ProjectDocumentV1 {
  const audio = { ...document.audio };

  if (voiceover === undefined) {
    delete audio.voiceover;
  } else {
    audio.voiceover = voiceover;
  }

  return { ...document, audio };
}

export function setProjectBackgroundMusic(
  document: ProjectDocumentV1,
  backgroundMusic: BackgroundMusicTrackV1 | undefined,
): ProjectDocumentV1 {
  const audio = { ...document.audio };

  if (backgroundMusic === undefined) {
    delete audio.backgroundMusic;
  } else {
    audio.backgroundMusic = backgroundMusic;
  }

  return { ...document, audio };
}
