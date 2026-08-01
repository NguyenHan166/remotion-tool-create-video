import { ProjectDocumentSchema } from '@hansys/project-schema';
import { type VideoProps } from './types.js';

export const STUDIO_PROJECT_FIXTURE = ProjectDocumentSchema.parse({
  schemaVersion: 1,
  metadata: {
    title: 'Bản tin công nghệ',
    description: 'Fixture tiếng Việt mặc định cho Remotion Studio.',
  },
  composition: {
    width: 1080,
    height: 1920,
    fps: 30,
    backgroundColor: '#F4F1EB',
  },
  template: {
    id: 'news-clean-v1',
    version: 1,
  },
  theme: {
    primaryColor: '#0E2238',
    secondaryColor: '#E8E2D8',
    accentColor: '#D85C32',
    textColor: '#13202C',
    mutedTextColor: '#52616D',
    fontFamily: 'BeVietnamPro',
    watermarkText: 'HANSYS',
  },
  scenes: [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      type: 'headline',
      name: 'Mở đầu',
      enabled: true,
      durationInFrames: 90,
      text: {
        label: 'CÔNG NGHỆ',
        headline: 'Nền tảng dựng video nay có một composition dùng chung',
      },
      style: {
        textAlign: 'left',
        emphasis: 'strong',
      },
    },
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      type: 'content',
      name: 'Nội dung',
      enabled: true,
      durationInFrames: 120,
      text: {
        headline: 'Một nguồn dữ liệu cho cả xem trước và kết xuất',
        body: 'Metadata được tính trực tiếp từ ProjectDocument, giúp thời lượng và khung hình luôn nhất quán.',
        source: 'Nguồn: HanSYS Video Studio',
      },
      style: {
        textAlign: 'left',
        emphasis: 'normal',
      },
    },
  ],
  captions: {
    enabled: true,
    source: 'manual',
    style: 'clean',
    entries: [
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        startMs: 0,
        endMs: 2_400,
        text: 'Xin chào, đây là bản tin công nghệ hôm nay.',
      },
      {
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        startMs: 2_700,
        endMs: 5_600,
        text: 'Các điểm đáng chú ý sẽ được cập nhật liên tục.',
      },
      {
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        startMs: 5_900,
        endMs: 7_000,
        text: 'Cảm ơn bạn đã theo dõi.',
      },
    ],
    options: {
      maxWordsPerPage: 6,
      highlightCurrentWord: false,
      position: 'bottom',
      fontSize: 58,
    },
  },
});

export const STUDIO_VIDEO_PROPS = {
  project: STUDIO_PROJECT_FIXTURE,
  assets: {},
} satisfies VideoProps;
