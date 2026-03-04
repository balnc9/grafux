'use strict';

// ─── Themes ───────────────────────────────────────────────────────────────────
const THEMES = {
  gruvbox: {
    bg:            '#282828',
    root:          '#fabd2f',
    folder:        '#fe8019',
    file:          '#8ec07c',
    edge:          'rgba(146,131,116,0.25)',
    edgeHover:     'rgba(235,219,178,0.75)',
    edgeDim:       'rgba(146,131,116,0.05)',
    hoverRing:     'rgba(250,189,47,0.5)',
    label:         'rgba(235,219,178,1)',
    labelNeighbor: 'rgba(235,219,178,0.65)',
    accent:        '#fabd2f',
  },
  obsidian: {
    bg:            '#13131f',
    root:          '#f4a261',
    folder:        '#e76f51',
    file:          '#4db8ff',
    edge:          'rgba(255,255,255,0.18)',
    edgeHover:     'rgba(255,255,255,0.65)',
    edgeDim:       'rgba(255,255,255,0.05)',
    hoverRing:     'rgba(255,255,255,0.55)',
    label:         'rgba(255,255,255,1)',
    labelNeighbor: 'rgba(255,255,255,0.6)',
    accent:        '#e76f51',
  },
  forest: {
    bg:            '#0c180c',
    root:          '#95d5b2',
    folder:        '#52b788',
    file:          '#40916c',
    edge:          'rgba(149,213,178,0.2)',
    edgeHover:     'rgba(149,213,178,0.7)',
    edgeDim:       'rgba(149,213,178,0.04)',
    hoverRing:     'rgba(149,213,178,0.6)',
    label:         'rgba(210,240,220,1)',
    labelNeighbor: 'rgba(210,240,220,0.65)',
    accent:        '#52b788',
  },
  aurora: {
    bg:            '#0b0b18',
    root:          '#c4b5fd',
    folder:        '#818cf8',
    file:          '#38bdf8',
    edge:          'rgba(196,181,253,0.18)',
    edgeHover:     'rgba(196,181,253,0.7)',
    edgeDim:       'rgba(196,181,253,0.04)',
    hoverRing:     'rgba(196,181,253,0.6)',
    label:         'rgba(230,225,255,1)',
    labelNeighbor: 'rgba(230,225,255,0.65)',
    accent:        '#818cf8',
  },
  mono: {
    bg:            '#111111',
    root:          '#ffffff',
    folder:        '#bbbbbb',
    file:          '#666666',
    edge:          'rgba(255,255,255,0.14)',
    edgeHover:     'rgba(255,255,255,0.6)',
    edgeDim:       'rgba(255,255,255,0.03)',
    hoverRing:     'rgba(255,255,255,0.5)',
    label:         'rgba(255,255,255,1)',
    labelNeighbor: 'rgba(255,255,255,0.55)',
    accent:        '#bbbbbb',
  },
};

let activeTheme = THEMES.gruvbox;

// Visual settings — defaults match config.Defaults(); overridden by /api/config response
const settings = {
  fileRadius:  5,
  folderBase:  8,
  folderScale: 2.5,
  edgeWidth:   1.0,
  labelZoom:   2.0,
};

function applyTheme(name) {
  activeTheme = THEMES[name] || THEMES.gruvbox;
  document.documentElement.style.setProperty('--bg', activeTheme.bg);
  document.documentElement.style.setProperty('--accent', activeTheme.accent);
  document.body.style.background = activeTheme.bg;
  document.querySelectorAll('.theme-dot').forEach(d => {
    d.classList.toggle('active', d.dataset.theme === name);
  });
  try { sessionStorage.setItem('grafux-theme', name); } catch (_) {}
  scheduleRender();
}

function setupThemeSwitcher() {
  document.querySelectorAll('.theme-dot').forEach(dot => {
    dot.addEventListener('click', () => applyTheme(dot.dataset.theme));
  });
}

// ─── State ────────────────────────────────────────────────────────────────────
let graphData = { nodes: [], edges: [] };
let simulation = null;
let transform = d3.zoomIdentity;
let mouse = { x: -9999, y: -9999 };
let hoveredNode = null;
let dragNode = null;
let rafPending = false;
const adjacency = new Map();

// ─── Canvas ───────────────────────────────────────────────────────────────────
const canvas = document.getElementById('graph');
const ctx = canvas.getContext('2d');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  if (simulation) {
    simulation.force('center', d3.forceCenter(canvas.width / 2, canvas.height / 2));
    scheduleRender();
  }
}

window.addEventListener('resize', resize);
resize();

// ─── Node visuals ─────────────────────────────────────────────────────────────
function nodeRadius(n) {
  if (n.type === 'folder') {
    const base = settings.folderBase;
    return Math.max(base + 2, base + Math.sqrt(n.children || 0) * settings.folderScale);
  }
  return settings.fileRadius;
}

function nodeColor(n) {
  if (n.depth === 0)       return activeTheme.root;
  if (n.type === 'folder') return activeTheme.folder;
  return activeTheme.file;
}

// ─── Coordinate helpers ───────────────────────────────────────────────────────
function screenToSim(sx, sy) {
  return transform.invert([sx, sy]);
}

function findNodeAt(sx, sy) {
  const [wx, wy] = screenToSim(sx, sy);
  let closest = null;
  let minDist2 = Infinity;
  for (const n of graphData.nodes) {
    if (n.x === undefined) continue;
    const r = nodeRadius(n) + 4;
    const dx = n.x - wx;
    const dy = n.y - wy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r && d2 < minDist2) {
      minDist2 = d2;
      closest = n;
    }
  }
  return closest;
}

// ─── Adjacency ────────────────────────────────────────────────────────────────
function buildAdjacency() {
  adjacency.clear();
  for (const e of graphData.edges) {
    const s = typeof e.source === 'object' ? e.source.id : e.source;
    const t = typeof e.target === 'object' ? e.target.id : e.target;
    if (!adjacency.has(s)) adjacency.set(s, new Set());
    if (!adjacency.has(t)) adjacency.set(t, new Set());
    adjacency.get(s).add(t);
    adjacency.get(t).add(s);
  }
}

function isConnected(a, b) {
  const nbrs = adjacency.get(a.id);
  return nbrs ? nbrs.has(b.id) : false;
}

// ─── Simulation ───────────────────────────────────────────────────────────────
function setupSimulation() {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  for (const n of graphData.nodes) {
    n.x = cx + (Math.random() - 0.5) * 30;
    n.y = cy + (Math.random() - 0.5) * 30;
  }

  simulation = d3.forceSimulation(graphData.nodes)
    .force('link', d3.forceLink(graphData.edges)
      .id(d => d.id)
      .distance(d => 55 + nodeRadius(d.source) + nodeRadius(d.target))
      .strength(0.4))
    .force('charge', d3.forceManyBody()
      .strength(d => -100 - nodeRadius(d) * 14)
      .distanceMax(400))
    .force('center', d3.forceCenter(cx, cy).strength(0.05))
    .force('collide', d3.forceCollide()
      .radius(d => nodeRadius(d) + 5)
      .strength(0.8))
    .alphaDecay(0.02)
    .velocityDecay(0.35)
    .on('tick', scheduleRender);

  buildAdjacency();
}

// ─── Render loop ──────────────────────────────────────────────────────────────
function scheduleRender() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    render();
  });
}

function render() {
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  ctx.save();
  ctx.translate(transform.x, transform.y);
  ctx.scale(transform.k, transform.k);

  const k = transform.k;
  const ew = settings.edgeWidth;
  const hasHover = hoveredNode !== null;

  // ── Edges ──────────────────────────────────────────────────────────────────
  for (const e of graphData.edges) {
    const src = e.source;
    const tgt = e.target;
    if (src.x === undefined || tgt.x === undefined) continue;

    const highlighted = hasHover && (src === hoveredNode || tgt === hoveredNode);

    ctx.beginPath();
    ctx.moveTo(src.x, src.y);
    ctx.lineTo(tgt.x, tgt.y);

    if (hasHover) {
      ctx.strokeStyle = highlighted ? activeTheme.edgeHover : activeTheme.edgeDim;
      ctx.lineWidth = highlighted ? (1.5 * ew) / k : (0.5 * ew) / k;
    } else {
      ctx.strokeStyle = activeTheme.edge;
      ctx.lineWidth = (0.8 * ew) / k;
    }
    ctx.stroke();
  }

  // ── Nodes ──────────────────────────────────────────────────────────────────
  for (const n of graphData.nodes) {
    if (n.x === undefined) continue;

    const r = nodeRadius(n);
    const color = nodeColor(n);
    const isHover = n === hoveredNode;
    const isNeighbor = hasHover && !isHover && isConnected(n, hoveredNode);
    const isDim = hasHover && !isHover && !isNeighbor;

    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);

    if (isHover) {
      ctx.shadowBlur = 20;
      ctx.shadowColor = color;
      ctx.fillStyle = color;
    } else if (isDim) {
      ctx.shadowBlur = 0;
      ctx.fillStyle = color + '28'; // ~16% opacity
    } else {
      ctx.shadowBlur = 0;
      ctx.fillStyle = color;
    }

    ctx.fill();
    ctx.shadowBlur = 0;

    if (isHover) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, r + 2.5 / k, 0, Math.PI * 2);
      ctx.strokeStyle = activeTheme.hoverRing;
      ctx.lineWidth = 1.5 / k;
      ctx.stroke();
    }
  }

  // ── Labels ─────────────────────────────────────────────────────────────────
  const showAllLabels = k >= settings.labelZoom;
  if (hasHover || showAllLabels) {
    const fontSize = Math.max(9, 13 / k);
    ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
    ctx.textBaseline = 'middle';

    for (const n of graphData.nodes) {
      if (n.x === undefined) continue;
      const isHover = n === hoveredNode;
      const isNeighbor = hasHover && isConnected(n, hoveredNode);
      if (!showAllLabels && !isHover && !isNeighbor) continue;
      const r = nodeRadius(n);
      const isDimmed = hasHover && !isHover && !isNeighbor;
      ctx.fillStyle = isHover ? activeTheme.label : activeTheme.labelNeighbor;
      ctx.globalAlpha = isDimmed ? 0.2 : 1;
      ctx.fillText(n.name, n.x + (r + 5) / k, n.y);
    }
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

// ─── Interactions ─────────────────────────────────────────────────────────────
function setupInteractions() {
  canvas.addEventListener('mousedown', onMouseDown, { capture: true });
  canvas.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mouseleave', onMouseLeave);

  const zoomBehavior = d3.zoom()
    .scaleExtent([0.04, 14])
    .filter(event => {
      if (event.type === 'mousedown' && event.button === 0) {
        const rect = canvas.getBoundingClientRect();
        return !findNodeAt(event.clientX - rect.left, event.clientY - rect.top);
      }
      return !event.button;
    })
    .on('zoom', event => {
      transform = event.transform;
      scheduleRender();
    });

  d3.select(canvas).call(zoomBehavior);

  canvas.addEventListener('dblclick', (e) => {
    const node = findNodeAt(
      e.clientX - canvas.getBoundingClientRect().left,
      e.clientY - canvas.getBoundingClientRect().top
    );
    if (!node) {
      d3.select(canvas)
        .transition()
        .duration(400)
        .call(zoomBehavior.transform, d3.zoomIdentity);
    }
  });
}

function onMouseMove(e) {
  const rect = canvas.getBoundingClientRect();
  mouse.x = e.clientX - rect.left;
  mouse.y = e.clientY - rect.top;

  if (dragNode) {
    const [wx, wy] = screenToSim(mouse.x, mouse.y);
    dragNode.fx = wx;
    dragNode.fy = wy;
    if (simulation) simulation.alphaTarget(0.3).restart();
  } else {
    const prev = hoveredNode;
    hoveredNode = findNodeAt(mouse.x, mouse.y);
    canvas.style.cursor = hoveredNode ? 'grab' : 'default';
    if (hoveredNode !== prev) scheduleRender();
  }
}

function onMouseDown(e) {
  if (e.button !== 0) return;
  const rect = canvas.getBoundingClientRect();
  const node = findNodeAt(e.clientX - rect.left, e.clientY - rect.top);
  if (node) {
    e.stopImmediatePropagation();
    dragNode = node;
    node.fx = node.x;
    node.fy = node.y;
    canvas.style.cursor = 'grabbing';
    if (simulation) simulation.alphaTarget(0.1).restart();
  }
}

function onMouseUp() {
  if (dragNode) {
    dragNode.fx = null;
    dragNode.fy = null;
    if (simulation) simulation.alphaTarget(0);
    dragNode = null;
  }
  canvas.style.cursor = hoveredNode ? 'grab' : 'default';
}

function onMouseLeave() {
  mouse = { x: -9999, y: -9999 };
  if (!dragNode) {
    hoveredNode = null;
    scheduleRender();
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  const statsEl = document.getElementById('stats');

  setupThemeSwitcher();

  try {
    // Fetch config and graph in parallel
    const [cfgRes, graphRes] = await Promise.all([
      fetch('/api/config'),
      fetch('/api/graph'),
    ]);

    // Determine initial theme: server config → sessionStorage (within-session switch) → default
    let themeName = 'gruvbox';
    if (cfgRes.ok) {
      const cfg = await cfgRes.json();
      // Apply visual settings from server config
      if (cfg.fileRadius  != null) settings.fileRadius  = cfg.fileRadius;
      if (cfg.folderBase  != null) settings.folderBase  = cfg.folderBase;
      if (cfg.folderScale != null) settings.folderScale = cfg.folderScale;
      if (cfg.edgeWidth   != null) settings.edgeWidth   = cfg.edgeWidth;
      if (cfg.labelZoom   != null) settings.labelZoom   = cfg.labelZoom;
      if (cfg.theme) themeName = cfg.theme;
    }
    // sessionStorage overrides server theme only if user switched themes this session
    try { themeName = sessionStorage.getItem('grafux-theme') || themeName; } catch (_) {}
    applyTheme(themeName);

    if (!graphRes.ok) throw new Error(`HTTP ${graphRes.status}`);
    graphData = await graphRes.json();

    if (!graphData.nodes || graphData.nodes.length === 0) {
      statsEl.textContent = 'No files found';
      return;
    }

    const m = graphData.meta || {};
    const depthStr = m.scanDepth > 0 ? `depth ${m.scanDepth}` : 'unlimited depth';
    statsEl.textContent = `${m.totalFiles || 0} files · ${m.totalFolders || 0} folders · ${depthStr}`;

    setupSimulation();
    setupInteractions();
    scheduleRender();
  } catch (err) {
    console.error('Grafux error:', err);
    statsEl.textContent = `Error: ${err.message}`;
  }
}

init();
