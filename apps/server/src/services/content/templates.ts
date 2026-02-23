import fs from 'node:fs';
import path from 'node:path';
import type { OrganizationType, PostChannel } from '@marketing-agent/shared';

export interface TemplateContext {
  organizationType: OrganizationType;
  channel: PostChannel;
  customerName: string;
  mission: string;
  keywords: string[];
  location: string;
}

export interface ContentTemplate {
  templateId: string;
  tone: string;
  objective: string;
  ctaExamples: string[];
  structureGuide: string[];
}

const ORGANIZATION_TONE: Record<OrganizationType, string> = {
  environment: '참여를 이끄는 실천형 톤, 생활 속 행동 제안 중심',
  education: '신뢰감 있는 정보형 톤, 변화 사례와 배움 강조',
  'human-rights': '존엄성과 권리 중심 톤, 사실 기반 메시지',
  animal: '공감형 톤, 보호 대상의 변화 스토리 중심',
  welfare: '따뜻한 돌봄 톤, 현장 지원의 실질적 효과 강조',
  health: '신뢰 기반 안내형 톤, 근거 중심의 건강 메시지',
  culture: '감성형 톤, 문화 경험과 공동체 연결 강조',
  community: '친근한 지역 밀착 톤, 참여 독려 중심',
  international: '연대와 지속가능성 중심 톤, 글로벌 임팩트 강조',
  other: '명확하고 진정성 있는 설명형 톤',
};

const CHANNEL_TEMPLATE_BASE: Record<PostChannel, Omit<ContentTemplate, 'templateId' | 'tone'>> = {
  'nextjs-blog': {
    objective: '검색 유입과 신뢰 형성을 동시에 확보한다.',
    ctaExamples: ['정기 후원 참여하기', '캠페인 자세히 보기', '뉴스레터 구독하기'],
    structureGuide: [
      '문제/배경 소개',
      '현장 사례와 수치',
      '현재 진행 중인 활동',
      '참여 방법(CTA)',
    ],
  },
  'naver-blog': {
    objective: '국내 독자 대상 공감 스토리와 참여 전환을 만든다.',
    ctaExamples: ['캠페인 참여 댓글 남기기', '후원 문의하기', '공유로 응원하기'],
    structureGuide: [
      '도입: 이번 이슈 한 줄 요약',
      '본문: 사례 중심 설명',
      '정리: 이번 주 핵심 성과',
      '마무리: 참여 요청',
    ],
  },
  instagram: {
    objective: '짧고 강한 메시지로 반응(좋아요/저장/공유)을 높인다.',
    ctaExamples: ['저장하고 함께 실천해요', '댓글로 응원 남겨주세요', '프로필 링크에서 참여하기'],
    structureGuide: [
      '후킹 한 줄',
      '핵심 메시지 2~3줄',
      '증거(숫자/사례) 1줄',
      '행동 유도 CTA',
    ],
  },
  threads: {
    objective: '대화형 톤으로 논의와 확산을 유도한다.',
    ctaExamples: ['여러분의 의견을 알려주세요', '이 글을 공유해 주세요', '오늘 함께 할 수 있는 행동은?'],
    structureGuide: [
      '질문 또는 관점 제시',
      '근거/사례 요약',
      '실천 제안',
      '토론형 마무리 질문',
    ],
  },
};

let cachedGuidelinesMarkdown: string | null = null;

function buildGuidelinesFallbackMarkdown(): string {
  const organizationToneSection = Object.entries(ORGANIZATION_TONE)
    .map(([organizationType, tone]) => `- ${organizationType}: ${tone}`)
    .join('\n');

  const channelSection = (Object.keys(CHANNEL_TEMPLATE_BASE) as PostChannel[])
    .map((channel) => {
      const template = CHANNEL_TEMPLATE_BASE[channel];
      return [
        `### ${channel}`,
        `- Objective: ${template.objective}`,
        `- Structure: ${template.structureGuide.join(' -> ')}`,
        `- CTA: ${template.ctaExamples.join(' / ')}`,
      ].join('\n');
    })
    .join('\n\n');

  return [
    '# Channel Guidelines',
    '',
    '## Organization Tones',
    organizationToneSection,
    '',
    '## Channel Structures',
    channelSection,
  ].join('\n');
}

function resolveGuidelinesPathCandidates(): string[] {
  return [
    path.resolve(process.cwd(), 'openclaw/prompts/channel-guidelines.md'),
    path.resolve(process.cwd(), '../openclaw/prompts/channel-guidelines.md'),
    path.resolve(__dirname, '../../../../openclaw/prompts/channel-guidelines.md'),
  ];
}

export function getChannelGuidelinesMarkdown(): string {
  if (cachedGuidelinesMarkdown !== null) {
    return cachedGuidelinesMarkdown;
  }

  for (const candidate of resolveGuidelinesPathCandidates()) {
    if (!fs.existsSync(candidate)) continue;
    const raw = fs.readFileSync(candidate, 'utf8').trim();
    if (raw) {
      cachedGuidelinesMarkdown = raw;
      return raw;
    }
  }

  cachedGuidelinesMarkdown = buildGuidelinesFallbackMarkdown();
  return cachedGuidelinesMarkdown;
}

export function getContentTemplate(context: TemplateContext): ContentTemplate {
  const channelTemplate = CHANNEL_TEMPLATE_BASE[context.channel];
  const tone = `${ORGANIZATION_TONE[context.organizationType]} / ${context.customerName}의 미션(${context.mission})에 맞춘 진정성 있는 문체`;

  return {
    templateId: `${context.organizationType}:${context.channel}`,
    tone,
    objective: channelTemplate.objective,
    ctaExamples: channelTemplate.ctaExamples,
    structureGuide: channelTemplate.structureGuide,
  };
}

export function buildTemplatePrompt(context: TemplateContext): string {
  const template = getContentTemplate(context);
  return [
    `채널: ${context.channel}`,
    `조직 분야: ${context.organizationType}`,
    `톤: ${template.tone}`,
    `목표: ${template.objective}`,
    `핵심 키워드: ${context.keywords.join(', ') || '(없음)'}`,
    `지역: ${context.location}`,
    `구성 가이드: ${template.structureGuide.join(' -> ')}`,
    `CTA 예시: ${template.ctaExamples.join(' / ')}`,
  ].join('\n');
}
