import { fetchCustomers, fetchPosts, type Post } from '../../lib/api';

function groupByStatus(posts: Post[]): Record<string, number> {
  return posts.reduce<Record<string, number>>((acc, post) => {
    acc[post.status] = (acc[post.status] ?? 0) + 1;
    return acc;
  }, {});
}

export default async function PublishingPage() {
  let posts: Post[] = [];
  let errorMessage: string | null = null;
  let customerName: string | null = null;

  try {
    const customers = await fetchCustomers();
    const targetCustomerId = customers[0]?.id;
    customerName = customers[0]?.name ?? null;
    posts = await fetchPosts(targetCustomerId ? { customerId: targetCustomerId } : undefined);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  const byStatus = groupByStatus(posts);

  return (
    <div className="stack">
      <section className="section">
        <h2 style={{ margin: 0 }}>발행 관리</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          {customerName ? `${customerName} 조직 기준` : '연결된 조직 기준'}
        </p>
        <div className="toolbar">
          {Object.entries(byStatus).map(([status, count]) => (
            <span key={status} className={`status ${status}`}>
              {status}: {count}
            </span>
          ))}
          {!Object.keys(byStatus).length && <span className="chip">데이터 없음</span>}
        </div>
      </section>

      {errorMessage ? (
        <section className="section">
          <p className="muted">{errorMessage}</p>
        </section>
      ) : (
        <section className="section">
          <table className="table">
            <thead>
              <tr>
                <th>제목</th>
                <th>채널</th>
                <th>상태</th>
                <th>예약 시각</th>
                <th>발행 시각</th>
                <th>에러</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr key={post.id}>
                  <td>{post.title}</td>
                  <td>{post.channel}</td>
                  <td>
                    <span className={`status ${post.status}`}>{post.status}</span>
                  </td>
                  <td>{post.scheduledAt.slice(0, 19).replace('T', ' ')}</td>
                  <td>{post.publishedAt ? post.publishedAt.slice(0, 19).replace('T', ' ') : '-'}</td>
                  <td>{post.errorMessage ?? '-'}</td>
                </tr>
              ))}
              {!posts.length && (
                <tr>
                  <td colSpan={6} className="muted">
                    발행 데이터가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
