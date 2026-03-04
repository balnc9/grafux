# Grafux

## Project Overview

Grafux is a lightweight CLI tool that scans a file directory and visualizes it as an interactive force-directed graph in the browser. Think Obsidian's graph view, but for any directory on your filesystem.

**Command:** `grf`
**Usage:** Run `grf` in any directory → scans files/folders → opens localhost in default browser → renders an interactive node graph

## Tech Stack

| Layer             | Technology                    | Rationale                                                                                                                                                              |
| ----------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI + HTTP server | **Go**                        | Compiles to a single binary with zero runtime dependencies. Fast startup, excellent stdlib for HTTP serving and filesystem operations. Cross-platform.                 |
| Frontend          | **Vanilla JS + HTML5 Canvas** | No build step, no bundler, no framework. Embedded directly into the Go binary via `go:embed`. Canvas over SVG for performance (SVG dies past ~500 nodes).              |
| Graph physics     | **d3-force**                  | Industry-standard force-directed layout library (~30KB). Handles node repulsion, edge attraction, centering, and collision. This is what Obsidian uses under the hood. |
| Frontend delivery | **Go `embed` package**        | The entire frontend (HTML, JS, CSS) is compiled into the single Go binary. No external assets to manage or serve.                                                      |

## Architecture

```
grafux/
├── main.go                # CLI entry point: flag parsing, starts server, opens browser
├── scanner/
│   └── scanner.go         # Walks the filesystem using filepath.Walk, builds node/edge data
├── server/
│   └── server.go          # HTTP server: serves embedded frontend + /api/graph JSON endpoint
├── web/
│   ├── index.html         # Single-page shell (dark theme)
│   ├── graph.js           # d3-force simulation, canvas rendering, interaction handlers
│   └── style.css          # Minimal dark theme styles
├── go.mod
├── go.sum
└── README.md
```

### Data Flow

```
CLI invoked (`grf [flags] [path]`)
  → scanner walks directory tree
  → builds graph JSON (nodes + edges)
  → server starts on a random open port
  → opens default browser to localhost:<port>
  → frontend fetches /api/graph
  → d3-force simulation renders interactive canvas
```

## Build & Run

```bash
# Run from source (any directory)
go run . [flags] [path]

# Build binary
go build -o grf .

# Install to $GOPATH/bin
go install .

# Example: visualize current directory at depth 3
go run . --depth 3

# Example: visualize a specific path on a fixed port
go run . /path/to/project --port 8080 --no-open
```

**Project layout (implemented):**

```
grafux/
├── main.go                  # CLI entry point
├── scanner/scanner.go       # filepath.Walk → nodes + edges
├── server/
│   ├── server.go            # HTTP server + go:embed
│   └── web/
│       ├── index.html       # Shell page, loads d3 from CDN
│       ├── style.css        # Dark theme
│       └── graph.js         # d3-force simulation + canvas renderer
├── go.mod
└── CLAUDE.md
```

**Dependencies:** Go stdlib only. d3 v7 loaded from CDN at runtime.

## Core Concepts

### Graph Model

- **Nodes** represent files and folders in the scanned directory.
- **Edges** represent relationships between nodes.

### Node Types

| Type   | Visual                     | Size                                              |
| ------ | -------------------------- | ------------------------------------------------- |
| Folder | Orange/warm colored circle | Larger — scales with number of children (degree)  |
| File   | Blue/cool colored circle   | Smaller — base size, may scale slightly by degree |
| Root   | Orange, largest            | Center of graph                                   |

### Edge Types

**Structural edges (MVP):** Every file connects to its parent folder. Every subfolder connects to its parent folder. This creates a tree structure at minimum.

**Content edges (v2):** For markdown files, parse `[[wikilinks]]` and `[text](relative-path.md)` to create cross-links between files. These show up as non-hierarchical connections in the graph.

### Force-Directed Layout

The graph uses a d3-force simulation with these forces:

- **`forceLink`** — Pulls connected nodes toward each other (edges act as springs)
- **`forceManyBody`** — All nodes repel each other (prevents clumping)
- **`forceCenter`** — Gently pulls everything toward the center of the viewport
- **`forceCollide`** — Prevents nodes from overlapping

### Interaction Model

- **Cursor repulsion:** Nodes near the mouse cursor are gently pushed away (Obsidian's magnetic cursor effect). Implemented as a custom force in the d3-force simulation.
- **Hover:** Highlights the hovered node and all its direct connections. Dims everything else.
- **Click:** Highlights the node's connection subgraph. May show file info panel in future.
- **Drag:** Nodes can be dragged and pinned in place.
- **Zoom/Pan:** Standard scroll-to-zoom and click-drag-to-pan on the canvas.

## Visual Design

Target aesthetic matches Obsidian's graph view:

- **Background:** Dark navy/charcoal (`#1a1b2e` or similar)
- **Edges:** Thin, semi-transparent white/gray lines
- **Folder nodes:** Orange/amber fill with subtle glow
- **File nodes:** Light blue/cyan fill
- **Hover state:** Bright highlight on node + connected edges, dim everything else
- **Text labels:** Small, white, shown on hover (not all at once — too cluttered)

## CLI Interface

```bash
# Basic usage — scan current directory
grf

# Scan a specific path
grf /path/to/directory

# Flags
grf --depth 3          # Max directory depth (default: 5)
grf --port 8080        # Specific port (default: random open port)
grf --no-open          # Don't auto-open browser
grf --show-hidden      # Include dotfiles/hidden files
grf --include "*.md"   # Only show specific file types
grf --exclude "*.log"  # Exclude specific file types
```

## Default Ignore List

These are excluded from scanning by default (overridable via flags):

- `.git/`
- `node_modules/`
- `__pycache__/`
- `.DS_Store`
- `thumbs.db`
- Hidden files/folders (names starting with `.`)
- Binary files (images, compiled artifacts, etc.)

## API Contract

### `GET /api/graph`

Returns the full graph data as JSON.

```json
{
  "nodes": [
    {
      "id": "src",
      "name": "src",
      "type": "folder",
      "path": "/project/src",
      "depth": 1,
      "children": 5
    },
    {
      "id": "src/main.go",
      "name": "main.go",
      "type": "file",
      "path": "/project/src/main.go",
      "depth": 2,
      "extension": ".go",
      "size": 2048
    }
  ],
  "edges": [
    {
      "source": "src",
      "target": "src/main.go",
      "type": "structural"
    }
  ],
  "meta": {
    "root": "/project",
    "totalFiles": 42,
    "totalFolders": 8,
    "scanDepth": 5,
    "scannedAt": "2026-03-04T12:00:00Z"
  }
}
```

## Development Roadmap

### MVP (v0.1)

- [x] Directory scanning with configurable depth
- [x] Go HTTP server serving embedded frontend
- [x] Force-directed graph rendering on canvas
- [x] Dark theme matching Obsidian aesthetic
- [x] Folder/file node differentiation (color + size)
- [x] Cursor repulsion effect
- [x] Hover to highlight node + connections
- [x] Node dragging
- [x] Zoom and pan
- [x] Auto-open browser
- [x] Default ignore list (.git, node_modules, etc.)
- [x] `--depth`, `--port`, `--no-open` flags

### v0.2 — Content Awareness

- [ ] Parse markdown `[[wikilinks]]` and `[text](path)` links
- [ ] Show content-based edges as a different color/style
- [ ] Filter: toggle structural vs content edges
- [ ] Color nodes by file extension/type

### v0.3 — Interactivity

- [ ] Search/filter nodes by name or extension
- [ ] Click node to open file info panel (size, modified date, connections)
- [ ] Click node to open file in default editor
- [ ] Minimap for large graphs
- [ ] Zoom-to-fit button

### v0.4 — Algorithms & Customization

- [ ] Spanning tree overlays (Prim's / Kruskal's) as toggle
- [ ] Layout algorithm selection (force-directed, radial, hierarchical)
- [ ] User-configurable physics parameters (repulsion strength, link distance, etc.)
- [ ] Settings panel in the UI

### v0.5 — Performance & Polish

- [ ] WebGL rendering for graphs with 10,000+ nodes
- [ ] Watch mode: live filesystem updates via fsnotify
- [ ] Incremental scanning (only rescan changed subtrees)
- [ ] Export graph as PNG/SVG
- [ ] Config file support (`.grafux.yml` in project root)

## Code Conventions

- **Go:** Follow standard Go conventions. Use `gofmt`. Keep packages small and focused.
- **JS:** Vanilla ES6+. No transpilation. No classes unless truly needed — prefer functions and closures.
- **CSS:** Minimal. CSS custom properties for theming. No preprocessor.
- **Error handling:** In Go, always handle errors explicitly. In JS, wrap async operations in try/catch.
- **Naming:** Go uses camelCase for unexported, PascalCase for exported. JS uses camelCase throughout.

## Key Design Principles

1. **Single binary, zero dependencies.** A user should be able to download one file and run it. No runtime, no config, no setup.
2. **Fast startup.** The tool should feel instant. Scan + server start + browser open should take under a second for typical directories.
3. **Canvas over SVG.** Always render with canvas for performance. The graph needs to handle hundreds to thousands of nodes smoothly at 60fps.
4. **Progressive enhancement.** The MVP is a directory tree visualizer. Each version adds more intelligence (content links, algorithms, customization) without breaking the core experience.
5. **Obsidian-quality interaction.** The graph should feel alive — smooth physics, responsive cursor effects, satisfying drag behavior. This is the main differentiator over a static tree view.
