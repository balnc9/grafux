'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
let graphData = { nodes: [], edges: [] };
let simulation = null;
let transform = d3.zoomIdentity;
let mouse = { x: -9999, y: -9999 }; // canvas-relative screen coords
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
    return Math.max(10, 8 + Math.sqrt(n.children || 0) * 2.5);
  }
  return 5;
}

function nodeColor(n) {
  if (n.depth === 0)       return '#f4a261'; // root: bright amber
  if (n.type === 'folder') return '#e76f51'; // folder: orange-red
  return '#4db8ff';                          // file: blue
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
    const r = nodeRadius(n) + 4; // slightly generous hit area
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
    // After d3-force initializes, source/target are node objects
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

  // Start all nodes near center for a satisfying "explosion" on load
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
      ctx.strokeStyle = highlighted
        ? 'rgba(255, 255, 255, 0.65)'
        : 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = highlighted ? 1.5 / k : 0.5 / k;
    } else {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = 0.8 / k;
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
      ctx.fillStyle = color + '28';
    } else {
      ctx.shadowBlur = 0;
      ctx.fillStyle = color;
    }

    ctx.fill();
    ctx.shadowBlur = 0;

    // Bright ring on hover
    if (isHover) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, r + 2.5 / k, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = 1.5 / k;
      ctx.stroke();
    }
  }

  // ── Labels ─────────────────────────────────────────────────────────────────
  if (hasHover) {
    const fontSize = Math.max(9, 13 / k);
    ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
    ctx.textBaseline = 'middle';

    // Label hovered node and its neighbors
    const labelNodes = graphData.nodes.filter(n =>
      n === hoveredNode || isConnected(n, hoveredNode)
    );

    for (const n of labelNodes) {
      if (n.x === undefined) continue;
      const r = nodeRadius(n);
      ctx.fillStyle = n === hoveredNode
        ? 'rgba(255, 255, 255, 1)'
        : 'rgba(255, 255, 255, 0.6)';
      ctx.fillText(n.name, n.x + (r + 5) / k, n.y);
    }
  }

  ctx.restore();
}

// ─── Interactions ─────────────────────────────────────────────────────────────
function setupInteractions() {
  // ── Node drag (registered BEFORE zoom so it fires first in capture phase) ──
  canvas.addEventListener('mousedown', onMouseDown, { capture: true });
  canvas.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mouseleave', onMouseLeave);

  // ── Zoom & pan ─────────────────────────────────────────────────────────────
  const zoomBehavior = d3.zoom()
    .scaleExtent([0.04, 14])
    .filter(event => {
      // Prevent zoom/pan starting on a node (we handle that as drag)
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

  // Double-click canvas to reset zoom
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
    // Update dragged node position
    const [wx, wy] = screenToSim(mouse.x, mouse.y);
    dragNode.fx = wx;
    dragNode.fy = wy;
    if (simulation) simulation.alphaTarget(0.3).restart();
  } else {
    // Hover detection
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
    e.stopImmediatePropagation(); // prevent zoom from starting pan
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

  try {
    const res = await fetch('/api/graph');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    graphData = await res.json();

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
