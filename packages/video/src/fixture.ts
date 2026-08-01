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

export const BREAKING_RED_PROJECT_FIXTURE = ProjectDocumentSchema.parse({
  ...STUDIO_PROJECT_FIXTURE,
  metadata: {
    title: 'Tin nóng: cập nhật đột phá về hạ tầng số Việt Nam',
    description: 'Fixture breaking-red-v1 với headline tiếng Việt dài và nhiều dấu.',
  },
  composition: {
    ...STUDIO_PROJECT_FIXTURE.composition,
    backgroundColor: '#120507',
  },
  template: {
    id: 'breaking-red-v1',
    version: 1,
  },
  theme: {
    ...STUDIO_PROJECT_FIXTURE.theme,
    primaryColor: '#E11D2E',
    secondaryColor: '#320910',
    accentColor: '#FFD166',
    textColor: '#FFF8F5',
    mutedTextColor: '#F4A5A9',
  },
  scenes: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      type: 'headline',
      name: 'Headline dài tiếng Việt',
      enabled: true,
      durationInFrames: 120,
      text: {
        label: 'TIN KHẨN',
        headline:
          'Việt Nam công bố bước tiến mới trong chiến lược phát triển hạ tầng số an toàn, bền vững và kết nối toàn dân trong giai đoạn tăng tốc chuyển đổi',
        body: 'Thông tin mới nhất đang được cập nhật với các mốc triển khai cụ thể.',
      },
      style: {
        textAlign: 'left',
        emphasis: 'urgent',
      },
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      type: 'bullet-list',
      name: 'Điểm chính',
      enabled: true,
      durationInFrames: 120,
      text: {
        label: 'ĐIỂM NÓNG',
        headline: 'Ba điều cần biết ngay lúc này',
        bullets: [
          'Hệ thống mới ưu tiên khả năng mở rộng và bảo mật dữ liệu.',
          'Các địa phương sẽ nhận hỗ trợ theo từng giai đoạn.',
          'Người dùng được cập nhật minh bạch về tiến độ triển khai.',
        ],
        source: 'Nguồn: HanSYS Video Studio',
      },
      style: {
        textAlign: 'left',
        emphasis: 'strong',
      },
    },
  ],
});

export const BREAKING_RED_VIDEO_PROPS = {
  project: BREAKING_RED_PROJECT_FIXTURE,
  assets: {},
} satisfies VideoProps;

export const WARNING_DARK_PROJECT_FIXTURE = ProjectDocumentSchema.parse({
  ...STUDIO_PROJECT_FIXTURE,
  metadata: {
    title: 'Cảnh báo an toàn số cho cộng đồng',
    description: 'Fixture warning-dark-v1 kiểm tra bullet emphasis và caption safe area.',
  },
  composition: {
    ...STUDIO_PROJECT_FIXTURE.composition,
    backgroundColor: '#090A0F',
  },
  template: {
    id: 'warning-dark-v1',
    version: 1,
  },
  theme: {
    ...STUDIO_PROJECT_FIXTURE.theme,
    primaryColor: '#F04438',
    secondaryColor: '#171A24',
    accentColor: '#F7C948',
    textColor: '#F8FAFC',
    mutedTextColor: '#AAB2C0',
  },
  scenes: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      type: 'headline',
      name: 'Cảnh báo chính',
      enabled: true,
      durationInFrames: 120,
      text: {
        label: 'CẢNH BÁO',
        headline: 'Không chia sẻ mã OTP hoặc mật khẩu cho bất kỳ ai',
        body: 'Kẻ xấu có thể giả danh ngân hàng, sàn thương mại điện tử hoặc cơ quan nhà nước.',
      },
      style: {
        textAlign: 'left',
        emphasis: 'urgent',
      },
    },
    {
      id: '55555555-5555-4555-8555-555555555555',
      type: 'bullet-list',
      name: 'Ba bước an toàn',
      enabled: true,
      durationInFrames: 120,
      text: {
        label: 'ĐIỂM CẦN NHỚ',
        headline: 'Dừng lại và kiểm tra trước khi hành động',
        bullets: [
          'Không đọc hoặc gửi mã xác thực một lần qua điện thoại.',
          'Kiểm tra địa chỉ website và số hotline trên kênh chính thức.',
          'Báo cáo ngay khi phát hiện dấu hiệu lừa đảo.',
        ],
        source: 'Nguồn: HanSYS Safety Desk',
      },
      style: {
        textAlign: 'left',
        emphasis: 'strong',
      },
    },
  ],
});

export const WARNING_DARK_VIDEO_PROPS = {
  project: WARNING_DARK_PROJECT_FIXTURE,
  assets: {},
} satisfies VideoProps;
