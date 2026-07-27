import { describe, expect, it } from 'vitest';
import { splitScriptIntoSceneDrafts } from '../packages/project-schema/src/index.js';

describe('deterministic script splitting', () => {
  it('splits Vietnamese paragraphs on blank lines without rewriting text', () => {
    const input = {
      rawText:
        'Cảnh báo lừa đảo trực tuyến.\r\nKhông chia sẻ mã OTP.\r\n \r\n  Hãy kiểm tra kỹ đường dẫn trước khi đăng nhập.  \r\n\r\nLiên hệ ngân hàng khi cần hỗ trợ.',
      splitMode: 'blank-line' as const,
      defaultSceneType: 'content' as const,
      defaultDurationInFrames: 120,
    };

    expect(splitScriptIntoSceneDrafts(input)).toEqual({
      scenes: [
        {
          name: 'Scene 1',
          body: 'Cảnh báo lừa đảo trực tuyến.\nKhông chia sẻ mã OTP.',
          type: 'content',
          durationInFrames: 120,
        },
        {
          name: 'Scene 2',
          body: 'Hãy kiểm tra kỹ đường dẫn trước khi đăng nhập.',
          type: 'content',
          durationInFrames: 120,
        },
        {
          name: 'Scene 3',
          body: 'Liên hệ ngân hàng khi cần hỗ trợ.',
          type: 'content',
          durationInFrames: 120,
        },
      ],
      warnings: [],
    });
    expect(splitScriptIntoSceneDrafts(input)).toEqual(splitScriptIntoSceneDrafts(input));
  });

  it('splits on an exact custom delimiter and ignores empty segments', () => {
    expect(
      splitScriptIntoSceneDrafts({
        rawText: 'Mở đầu\n---\nNội dung chính\n---\n\n---\nKết thúc',
        splitMode: 'delimiter',
        delimiter: '\n---\n',
        defaultSceneType: 'headline',
        defaultDurationInFrames: 60,
      }),
    ).toEqual({
      scenes: [
        {
          name: 'Scene 1',
          body: 'Mở đầu',
          type: 'headline',
          durationInFrames: 60,
        },
        {
          name: 'Scene 2',
          body: 'Nội dung chính',
          type: 'headline',
          durationInFrames: 60,
        },
        {
          name: 'Scene 3',
          body: 'Kết thúc',
          type: 'headline',
          durationInFrames: 60,
        },
      ],
      warnings: ['Ignored 1 empty script segment(s).'],
    });
  });

  it('keeps all normalized text in one scene in single mode', () => {
    expect(
      splitScriptIntoSceneDrafts({
        rawText: '  Dòng thứ nhất.\r\n\r\nDòng thứ hai.  ',
        splitMode: 'single',
        defaultSceneType: 'quote',
        defaultDurationInFrames: 150,
      }),
    ).toEqual({
      scenes: [
        {
          name: 'Scene 1',
          body: 'Dòng thứ nhất.\n\nDòng thứ hai.',
          type: 'quote',
          durationInFrames: 150,
        },
      ],
      warnings: [],
    });
  });
});
