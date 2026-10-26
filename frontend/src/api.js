const BASE = '/api/v1';

async function request(path, options) {
  const response = await fetch(BASE + path, options);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = Array.isArray(body?.detail) ? body.detail.join(', ') : body?.detail;
    throw new Error(detail || `Request failed (${response.status})`);
  }
  return body;
}

export function searchDrugs(query, signal) {
  return request(`/drugs/search?q=${encodeURIComponent(query)}`, { signal });
}

export async function checkKnownInteractions(drugIds) {
  const body = await request('/interactions/known', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ drug_ids: drugIds }),
  });
  return {
    drugs: body.drugs,
    pairsChecked: body.pairs_checked,
    pairsWithoutRecord: body.pairs_without_record,
    interactions: body.interactions.map((item) => ({
      id: item.interaction_id,
      pair: item.pair,
      description: item.description,
      severity: item.severity,
      contraindicated: item.contraindicated,
      severityRaw: item.severity_raw,
      severitySources: item.severity_sources,
      source: item.source,
    })),
  };
}
