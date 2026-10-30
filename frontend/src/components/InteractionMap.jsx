const WIDTH = 560;
const HEIGHT = 380;
const RADIUS = 135;
const MAX_LABEL = 16;

function layout(drugs) {
  return Object.fromEntries(
    drugs.map((drug, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / drugs.length;
      return [drug.id, { angle, x: WIDTH / 2 + RADIUS * Math.cos(angle), y: HEIGHT / 2 + RADIUS * Math.sin(angle) }];
    }),
  );
}

function shorten(name) {
  return name.length > MAX_LABEL ? `${name.slice(0, MAX_LABEL - 1)}…` : name;
}

// `interactions` must be sorted worst first, so the first one per pair is the line's colour.
function InteractionMap({ drugs, interactions, pairsWithoutRecord, labels, activeId, onSelect }) {
  const points = layout(drugs);
  const names = Object.fromEntries(drugs.map((drug) => [drug.id, drug.name]));
  const seen = new Set();
  const edges = interactions.filter((item) => {
    const key = item.pair.join('__');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const summary = `${drugs.length} drugs, ${edges.length} pairs with a documented interaction, ${pairsWithoutRecord.length} with no record.`;

  return (
    <svg className="interaction-map" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={summary}>
      {pairsWithoutRecord.map(([a, b]) => (
        <line
          key={`${a}__${b}`}
          className="edge edge-none"
          x1={points[a].x}
          y1={points[a].y}
          x2={points[b].x}
          y2={points[b].y}
        >
          <title>{`${names[a]} + ${names[b]}: no record`}</title>
        </line>
      ))}
      {[...edges].reverse().map((item) => {
        const [a, b] = item.pair;
        return (
          <line
            key={item.id}
            className={`edge sev-${item.severity}${item.contraindicated ? ' edge-ci' : ''}`}
            x1={points[a].x}
            y1={points[a].y}
            x2={points[b].x}
            y2={points[b].y}
          >
            <title>{`${names[a]} + ${names[b]}: ${labels[item.severity]}${item.contraindicated ? ', contraindicated' : ''}`}</title>
          </line>
        );
      })}
      {drugs.map((drug) => {
        const { angle, x, y } = points[drug.id];
        const cos = Math.cos(angle);
        const anchor = Math.abs(cos) < 0.3 ? 'middle' : cos > 0 ? 'start' : 'end';
        return (
          <g
            key={drug.id}
            className={`node${drug.id === activeId ? ' node-active' : ''}`}
            onClick={() => onSelect(drug.id)}
          >
            <title>{`${drug.name}: show structure`}</title>
            <circle cx={x} cy={y} r="13" />
            <text
              x={x + 24 * cos}
              y={y + 24 * Math.sin(angle)}
              textAnchor={anchor}
              dominantBaseline="middle"
            >
              {shorten(drug.name)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default InteractionMap;
