import { fetchCustomers, fetchReports, type ReportRecord } from '../../lib/api';

function summarize(payload: Record<string, unknown>): string {
  const summary = payload.summary;
  return typeof summary === 'string' && summary.trim()
    ? summary
    : '요약 정보가 아직 생성되지 않았습니다.';
}

export default async function ReportsPage() {
  let reports: ReportRecord[] = [];
  let customerName: string | null = null;
  let errorMessage: string | null = null;

  try {
    const customers = await fetchCustomers();
    const targetCustomerId = customers[0]?.id;
    customerName = customers[0]?.name ?? null;
    reports = await fetchReports(targetCustomerId ? { customerId: targetCustomerId } : undefined);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  return (
    <div className="stack">
      <section className="section">
        <h2 style={{ margin: 0 }}>마케팅 리포트</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          {customerName ? `${customerName} 조직 기준` : '연결된 조직 기준'}
        </p>
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
                <th>타입</th>
                <th>기간</th>
                <th>생성일</th>
                <th>요약</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.id}>
                  <td>{report.type}</td>
                  <td>
                    {report.periodStart.slice(0, 10)} ~ {report.periodEnd.slice(0, 10)}
                  </td>
                  <td>{report.createdAt.slice(0, 19).replace('T', ' ')}</td>
                  <td>{summarize(report.payload)}</td>
                </tr>
              ))}
              {!reports.length && (
                <tr>
                  <td colSpan={4} className="muted">
                    생성된 리포트가 없습니다.
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
