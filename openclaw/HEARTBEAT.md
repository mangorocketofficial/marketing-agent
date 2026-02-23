# HEARTBEAT.md

## Daily Tasks (2-4x/day)

1. Fetch metrics summary
   - `GET /api/metrics/summary?days=30`
   - Compare by channel and recent trend

2. Trigger metrics collection (if needed)
   - `POST /api/metrics/collect`
   - Use when latest data is stale or missing

3. Update memory with learnings
   - Record top-performing topics, tones, CTA styles
   - Record underperforming patterns to avoid

4. Prepare next generation directives
   - Translate learnings into `styleDirectives` and `ragFilters.performanceMin`
   - Prefer references with `performance in (high, medium)`
