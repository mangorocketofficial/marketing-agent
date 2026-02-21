type PostChannel = 'naver-blog' | 'instagram' | 'threads' | 'nextjs-blog';

interface ChannelStats {
  channel: PostChannel;
  totalPosts: number;
  successCount: number;
  failCount: number;
}

interface CompetitorActivity {
  competitorName: string;
  newPosts: number;
  topKeywords: string[];
}

interface MarketingReport {
  id: string;
  customerId: string;
  type: 'marketing-daily' | 'marketing-weekly';
  periodStart: string;
  periodEnd: string;
  channelStats: ChannelStats[];
  competitors: CompetitorActivity[];
  summary: string;
  createdAt: string;
}

type Report = MarketingReport;

export interface FormattedReport {
  title: string;
  subtitle: string;
  summary: string;
  highlights: string[];
  text: string;
  html: string;
}

function toShortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return date.toISOString().slice(0, 10);
}

function toPeriodLabel(periodStart: string, periodEnd: string): string {
  return `${toShortDate(periodStart)} ~ ${toShortDate(periodEnd)}`;
}

function reportTypeLabel(report: Report): string {
  if (report.type === 'marketing-daily') {
    return 'Daily Marketing Report';
  }
  return 'Weekly Marketing Report';
}

function calcSuccessRate(total: number, successCount: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.round((successCount / total) * 10000) / 100;
}

function buildChannelHighlights(channelStats: ChannelStats[]): string[] {
  if (!channelStats.length) {
    return ['No channel activity in this period.'];
  }

  const topVolume = [...channelStats].sort((a, b) => b.totalPosts - a.totalPosts)[0];
  const topSuccess = [...channelStats].sort((a, b) => {
    const byRate = calcSuccessRate(b.totalPosts, b.successCount) - calcSuccessRate(a.totalPosts, a.successCount);
    if (byRate !== 0) {
      return byRate;
    }
    return b.successCount - a.successCount;
  })[0];

  return [
    `Top volume channel: ${topVolume.channel} (${topVolume.totalPosts} posts)`,
    `Best stability channel: ${topSuccess.channel} (${calcSuccessRate(topSuccess.totalPosts, topSuccess.successCount)}% success)`,
  ];
}

function buildCompetitorHighlights(competitors: CompetitorActivity[]): string[] {
  if (!competitors.length) {
    return ['No competitor activity snapshot for this period.'];
  }

  const top = [...competitors].sort((a, b) => b.newPosts - a.newPosts)[0];
  const keywords = top.topKeywords.slice(0, 3).join(', ');

  return [
    `Most active competitor: ${top.competitorName} (${top.newPosts} new posts)`,
    keywords ? `Top competitor topics: ${keywords}` : 'No notable competitor topics extracted.',
  ];
}

function buildMarketingSummary(report: MarketingReport): string {
  const totalPosts = report.channelStats.reduce((sum, stat) => sum + stat.totalPosts, 0);
  const totalSuccess = report.channelStats.reduce((sum, stat) => sum + stat.successCount, 0);
  const successRate = calcSuccessRate(totalPosts, totalSuccess);

  return [
    report.summary,
    `Total posts: ${totalPosts}`,
    `Publishing success rate: ${successRate}%`,
  ].join(' | ');
}

function buildMarketingHighlights(report: MarketingReport): string[] {
  return [
    ...buildChannelHighlights(report.channelStats),
    ...buildCompetitorHighlights(report.competitors),
  ];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildText(title: string, subtitle: string, summary: string, highlights: string[]): string {
  return [
    title,
    subtitle,
    '',
    summary,
    '',
    'Highlights',
    ...highlights.map((item) => `- ${item}`),
  ].join('\n');
}

function buildHtml(title: string, subtitle: string, summary: string, highlights: string[]): string {
  const safeTitle = escapeHtml(title);
  const safeSubtitle = escapeHtml(subtitle);
  const safeSummary = escapeHtml(summary);
  const highlightList = highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join('');

  return `
<div style="font-family: Arial, sans-serif; line-height: 1.5; color: #222;">
  <h2>${safeTitle}</h2>
  <p><strong>${safeSubtitle}</strong></p>
  <p>${safeSummary}</p>
  <h3>Highlights</h3>
  <ul>${highlightList}</ul>
</div>
`.trim();
}

export function formatReport(report: Report): FormattedReport {
  const title = reportTypeLabel(report);
  const subtitle = `Customer ${report.customerId} | ${toPeriodLabel(report.periodStart, report.periodEnd)}`;

  const summary = buildMarketingSummary(report);
  const highlights = buildMarketingHighlights(report);

  return {
    title,
    subtitle,
    summary,
    highlights,
    text: buildText(title, subtitle, summary, highlights),
    html: buildHtml(title, subtitle, summary, highlights),
  };
}
