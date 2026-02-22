import Link from 'next/link';
import {
  fetchAgentTasks,
  fetchCustomers,
  fetchHealth,
  fetchPosts,
  fetchReports,
  fetchRecipientSummary,
} from '../lib/api';

async function loadDashboardData() {
  try {
    const health = await fetchHealth();
    const customers = await fetchCustomers();
    const customerId = customers[0]?.id;

    const [posts, reports, tasks, recipientSummary] = await Promise.all([
      fetchPosts(customerId ? { customerId } : undefined),
      fetchReports(customerId ? { customerId } : undefined),
      fetchAgentTasks(customerId ? { customerId } : undefined),
      customerId
        ? fetchRecipientSummary(customerId)
        : Promise.resolve({
            totalRecipients: 0,
            activeRecipients: 0,
            pausedRecipients: 0,
            unsubscribedRecipients: 0,
            mailableRecipients: 0,
          }),
    ]);

    return {
      ok: true as const,
      health,
      customers,
      posts,
      reports,
      tasks,
      recipientSummary,
    };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export default async function AdminDashboardPage() {
  const data = await loadDashboardData();

  if (!data.ok) {
    return (
      <section className="section">
        <h2>연결 상태 확인 필요</h2>
        <p className="muted">서버 API에 연결하지 못했습니다.</p>
        <p className="muted">{data.message}</p>
      </section>
    );
  }

  const published = data.posts.filter((post) => post.status === 'published').length;
  const failed = data.posts.filter((post) => post.status === 'failed').length;
  const runningTasks = data.tasks.filter((task) => task.status === 'running').length;

  return (
    <div className="stack">
      <section className="section">
        <div className="toolbar" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0 }}>운영 요약</h2>
            <p className="muted" style={{ margin: '6px 0 0' }}>
              DB 상태: {data.health.db}
            </p>
          </div>
          <div className="toolbar">
            <Link className="nav" href="/reports">
              리포트 보기
            </Link>
            <Link className="nav" href="/publishing">
              발행 관리
            </Link>
          </div>
        </div>
      </section>

      <section className="grid cards">
        <article className="card">
          <p className="label">고객 조직</p>
          <p className="value">{data.customers.length}</p>
        </article>
        <article className="card">
          <p className="label">전체 포스트</p>
          <p className="value">{data.posts.length}</p>
        </article>
        <article className="card">
          <p className="label">발행 성공</p>
          <p className="value">{published}</p>
        </article>
        <article className="card">
          <p className="label">발행 실패</p>
          <p className="value">{failed}</p>
        </article>
        <article className="card">
          <p className="label">마케팅 리포트</p>
          <p className="value">{data.reports.length}</p>
        </article>
        <article className="card">
          <p className="label">실행 중 Agent Task</p>
          <p className="value">{runningTasks}</p>
        </article>
      </section>

      <section className="section">
        <h3 style={{ marginTop: 0 }}>후원자 이메일 수신자</h3>
        <div className="toolbar">
          <span className="chip">전체 {data.recipientSummary.totalRecipients}</span>
          <span className="chip">발송 가능 {data.recipientSummary.mailableRecipients}</span>
          <span className="chip">일시중지 {data.recipientSummary.pausedRecipients}</span>
          <span className="chip">수신거부 {data.recipientSummary.unsubscribedRecipients}</span>
        </div>
      </section>
    </div>
  );
}
