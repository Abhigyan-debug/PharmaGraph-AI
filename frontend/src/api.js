const BASE = '/api/v1';

const OFFLINE = 'Can’t reach the PharmGraph server. Check that the backend is running, then try again.';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

let signedOut = () => {};

// App registers one handler; any request the server refuses for lack of a session calls it.
export function onSignedOut(handler) {
  signedOut = handler;
}

async function request(path, options) {
  let response;
  try {
    response = await fetch(BASE + path, options);
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error(OFFLINE);
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    if (!body) throw new Error(OFFLINE);
    if (body.error === 'not_signed_in') signedOut();
    const detail = Array.isArray(body.detail) ? body.detail.map((d) => d.message ?? d).join(', ') : body.detail;
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
    headers: JSON_HEADERS,
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

export async function getStructure(drugId, signal) {
  const body = await request(`/drugs/${encodeURIComponent(drugId)}/structure`, { signal });
  return {
    id: body.id,
    name: body.name,
    drugbankId: body.drugbank_id,
    pubchemCid: body.pubchem_cid,
    formula: body.formula,
    molecularWeight: body.molecular_weight,
    heavyAtoms: body.heavy_atoms,
    svg: body.svg,
    molblock: body.molblock,
    note3d: body.note_3d,
  };
}

function post(path, body) {
  return request(path, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) });
}

export function currentUser() {
  return request('/auth/me');
}

export function register(email, password, acceptHistory) {
  return post('/auth/register', { email, password, accept_history: acceptHistory });
}

export function signIn(email, password) {
  return post('/auth/login', { email, password });
}

export function signOut() {
  return request('/auth/logout', { method: 'POST' });
}

export function deleteAccount() {
  return request('/auth/me', { method: 'DELETE' });
}

export async function listChecks() {
  const checks = await request('/checks');
  return checks.map((check) => ({ id: check.id, createdAt: new Date(check.created_at), drugs: check.drugs }));
}

export function deleteCheck(id) {
  return request(`/checks/${id}`, { method: 'DELETE' });
}

export async function listDrugs(page, query, signal) {
  const params = new URLSearchParams({ page });
  if (query) params.set('q', query);
  const body = await request(`/drugs?${params}`, { signal });
  return {
    total: body.total,
    page: body.page,
    pageSize: body.page_size,
    drugs: body.drugs.map((drug) => ({
      id: drug.id,
      name: drug.name,
      drugbankId: drug.drugbank_id,
      has3d: drug.has_3d,
      interactions: drug.interactions,
      thumbnail: drug.thumbnail,
    })),
  };
}

export async function getDrug(drugId, signal) {
  const body = await request(`/drugs/${encodeURIComponent(drugId)}`, { signal });
  return {
    id: body.id,
    name: body.name,
    description: body.description,
    meshId: body.mesh_id,
    synonyms: body.synonyms,
    smiles: body.smiles,
    inchi: body.inchi,
    inchikey: body.inchikey,
    identifiers: body.identifiers,
    interactionTotal: body.interaction_total,
    bySeverity: body.by_severity,
    partners: body.partners,
  };
}

export async function getStats(signal) {
  const body = await request('/stats', { signal });
  return {
    drugs: body.drugs,
    pairs: body.pairs,
    graded: body.graded,
    with3d: body.with_3d,
    identifiers: { drugbank: body.drugbank, pubchem: body.pubchem, ddinter: body.ddinter, kegg: body.kegg, inchikey: body.inchikey },
    severity: body.severity,
  };
}
