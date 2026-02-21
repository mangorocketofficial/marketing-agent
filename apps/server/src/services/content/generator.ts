import { buildTemplatePrompt, type TemplateContext } from './templates';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4.1-mini';
const DEFAULT_TEMPERATURE = 0.7;

export interface GenerateContentInput extends TemplateContext {
  topic: string;
  angle?: string;
  referenceText?: string;
  targetLength?: 'short' | 'medium' | 'long';
}

export interface GeneratedContent {
  title: string;
  content: string;
  tags: string[];
  suggestedImages: string[];
  suggestedPublishHour?: number;
}

interface OpenAIChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

function getModel(): string {
  return process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
}

function buildUserPrompt(input: GenerateContentInput): string {
  const templatePrompt = buildTemplatePrompt(input);
  const lengthGuide =
    input.targetLength === 'short'
      ? '짧게 (약 120~250자)'
      : input.targetLength === 'long'
        ? '길게 (약 800~1400자)'
        : '중간 길이 (약 300~700자)';

  return [
    templatePrompt,
    '',
    `주제: ${input.topic}`,
    `관점: ${input.angle ?? '기본 관점 (참여 전환 중심)'}`,
    `길이 가이드: ${lengthGuide}`,
    `참고 텍스트: ${input.referenceText ?? '(없음)'}`,
    '',
    '아래 JSON만 반환하세요. 다른 설명/코드블록 없이 JSON 객체만 반환해야 합니다.',
    '{',
    '  "title": "string",',
    '  "content": "string",',
    '  "tags": ["string"],',
    '  "suggestedImages": ["string"],',
    '  "suggestedPublishHour": 14',
    '}',
  ].join('\n');
}

function extractJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = codeBlockMatch ? codeBlockMatch[1].trim() : trimmed;

  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    const first = candidate.indexOf('{');
    const last = candidate.lastIndexOf('}');
    if (first >= 0 && last > first) {
      const sliced = candidate.slice(first, last + 1);
      return JSON.parse(sliced) as Record<string, unknown>;
    }
    throw new Error('Model response is not valid JSON');
  }
}

function normalizeGeneratedContent(value: Record<string, unknown>): GeneratedContent {
  const title =
    typeof value.title === 'string' && value.title.trim()
      ? value.title.trim()
      : '제목이 생성되지 않았습니다';
  const content =
    typeof value.content === 'string' && value.content.trim()
      ? value.content.trim()
      : '본문이 생성되지 않았습니다';
  const tags = Array.isArray(value.tags)
    ? value.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
    : [];
  const suggestedImages = Array.isArray(value.suggestedImages)
    ? value.suggestedImages.filter(
        (item): item is string => typeof item === 'string' && item.trim().length > 0,
      )
    : [];
  const suggestedPublishHour =
    typeof value.suggestedPublishHour === 'number' &&
    value.suggestedPublishHour >= 0 &&
    value.suggestedPublishHour <= 23
      ? value.suggestedPublishHour
      : undefined;

  return {
    title,
    content,
    tags,
    suggestedImages,
    suggestedPublishHour,
  };
}

export async function generateContent(input: GenerateContentInput): Promise<GeneratedContent> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: getModel(),
      temperature: DEFAULT_TEMPERATURE,
      messages: [
        {
          role: 'system',
          content:
            '당신은 NGO 마케팅 콘텐츠 생성기입니다. 사실 기반이고 과장 없는 톤으로 작성합니다.',
        },
        {
          role: 'user',
          content: buildUserPrompt(input),
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as OpenAIChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error('OpenAI returned empty content');
  }

  const parsed = extractJsonObject(content);
  return normalizeGeneratedContent(parsed);
}
