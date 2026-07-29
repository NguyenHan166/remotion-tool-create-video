import { ProjectDocumentSchema } from '@hansys/project-schema';
import { type VideoProps } from './types.js';

export const STUDIO_PROJECT_FIXTURE = ProjectDocumentSchema.parse({
  schemaVersion: 1,
  metadata: {
    title: 'Bản tin mẫu',
    description: 'Fixture mặc định cho Remotion Studio.',
  },
  composition: {
    width: 1080,
    height: 1920,
    fps: 30,
    backgroundColor: '#090B10',
  },
  template: {
    id: 'news-clean-v1',
    version: 1,
  },
  scenes: [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      type: 'headline',
      name: 'Mở đầu',
      enabled: true,
      durationInFrames: 90,
      text: {
        label: 'HANSYS STUDIO',
        headline: 'Khởi tạo composition dùng chung',
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
        body: 'Metadata được tính trực tiếp từ ProjectDocument.',
      },
      style: {
        textAlign: 'left',
        emphasis: 'normal',
      },
    },
  ],
});

export const STUDIO_VIDEO_PROPS = {
  project: STUDIO_PROJECT_FIXTURE,
  assets: {},
} satisfies VideoProps;
