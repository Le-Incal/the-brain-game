// Read-only queries over a compiled graph. The agent tools and the competency
// questions both go through these; nothing here infers new facts.
const uniq = (xs) => [...new Set(xs)];

export function createQuery(graph) {
  const pos = (type) => graph.edges.filter((e) => e.type === type && e.positive);
  const out = (type, from) => pos(type).filter((e) => e.from === from).map((e) => e.to);
  const into = (type, to) => pos(type).filter((e) => e.to === to);
  const node = (id) => graph.nodes[id] ?? null;
  const regionOf = (id) => (node(id)?.class === 'Region' ? id : node(id)?.pointTo ?? null);
  const partsOf = (id) => uniq(pos('PART_OF').filter((e) => e.to === id).map((e) => e.from)).sort();

  return {
    node,
    regionsFor: (fn, role) => uniq(pos('SUPPORTED_BY').filter((e) => e.from === fn && (!role || e.props.role === role)).map((e) => regionOf(e.to)).filter(Boolean)).sort(),
    functionsOf: (regionId) => {
      const targets = new Set([regionId, ...Object.values(graph.nodes).filter((n) => n.pointTo === regionId).map((n) => n.id)]);
      return uniq(pos('SUPPORTED_BY').filter((e) => targets.has(e.to)).map((e) => e.from)).sort();
    },
    lateralityOf: (id) => node(id)?.lateralization ?? null,
    pointTo: (id) => (node(id)?.pointTo ? { region: node(id).pointTo, hint: node(id).hint ?? null } : null),
    tractsConnecting: (a, b) => {
      const ends = (t) => new Set(pos('CONNECTS').filter((e) => e.from === t).flatMap((e) => [e.to, regionOf(e.to)]).filter(Boolean));
      return uniq(pos('CONNECTS').map((e) => e.from)).filter((t) => { const s = ends(t); return s.has(a) && s.has(b); }).sort();
    },
    networksOf: (id, role) => uniq(pos('MEMBER_OF').filter((e) => e.from === id && (!role || e.props.role === role)).map((e) => e.to)).sort(),
    involvedIn: (id) => uniq(out('INVOLVED_IN', id)).sort(),
    partsOf,
    overlapsOf: (id) => uniq(out('OVERLAPS', id)).sort(),
    cellsIn: (id) => uniq([id, ...partsOf(id)].flatMap((x) => out('CONTAINS_CELL', x))).sort(),
    releases: (id) => uniq(out('RELEASES', id)).sort(),
    participatesIn: (id) => uniq(out('PARTICIPATES_IN', id)).sort(),
    affects: (id) => uniq(out('AFFECTS', id)).sort(),
    impairs: (id) => uniq(out('IMPAIRS', id)).sort(),
    suppliedBy: (id) => uniq(out('SUPPLIED_BY', id)).sort(),
    isCorrected: (myth) => into('DEBUNKS', myth).length > 0 || node(myth)?.standaloneCorrection === true,
    correctedBy: (myth) => (into('DEBUNKS', myth).length ? into('DEBUNKS', myth).map((e) => e.from) : node(myth)?.standaloneCorrection ? 'standalone' : null),
    mythsFor: (regionId) => graph.byRegion[regionId.split(':')[1]]?.myths ?? [],
    debatesAbout: (id) => uniq(graph.debates.filter((d) => d.subject === id).map((d) => d.object)).sort(),
    guide: (id) => ({ anchor: out('ANCHORED_ON', id)[0] ?? null, namedAfter: out('NAMED_AFTER', id)[0] ?? null, regions: node(id)?.anchorRegions ?? [] }),
    personStatus: (id) => (node(id) ? { living: node(id).living, checkedOn: node(id).statusCheckedOn ?? null } : null),
    visibleFrom: (view) => uniq(into('VISIBLE_FROM', view).map((e) => e.from)).sort(),
    wordsAccepting: (regionId) => Object.entries(graph.words).filter(([, w]) => [...w.derivedTargets, ...w.derivedAlternates].includes(regionId)).map(([id]) => id).sort(),
    describedBy: (id) => into('DESCRIBED', id).map((e) => ({ person: e.from, year: e.props.year })),
    explainedBy: (id) => uniq(out('EXPLAINED_BY', id)).sort(),
    caveat: (assertionId) => graph.edges.find((e) => e.id === assertionId)?.inferenceCaveat ?? null,
    resolveAlias: (text) => graph.aliases[String(text).toLowerCase().trim()] ?? null,
  };
}
