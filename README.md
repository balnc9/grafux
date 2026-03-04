# grafux

**Obsidian's graph view, for any directory on your filesystem.**

Run `grf` in any folder → it scans the file tree, starts a localhost server, and opens an interactive force-directed graph in your browser. Files are nodes. Folders are hubs. Everything is physics.

---

## Install

```bash
go install github.com/mtwchin/grafux@latest
```

Or build from source:

```bash
git clone https://github.com/mtwchin/grafux
cd grafux
go build -o grf .
```

Requires Go 1.21+. No other runtime dependencies.

---

## Usage

```bash
# Visualize the current directory
grf

# Visualize a specific path
grf /path/to/project

# Limit scan depth (recommended for large repos)
grf --depth 3
```

### Flags

| Flag            | Default | Description                                   |
| --------------- | ------- | --------------------------------------------- |
| `--depth N`     | `5`     | Max directory depth to scan (`0` = unlimited) |
| `--port N`      | random  | Port to serve on                              |
| `--no-open`     | false   | Don't auto-open the browser                   |
| `--show-hidden` | false   | Include dotfiles and hidden folders           |

---

## What it does

```
grf invoked
  → scans directory tree (respects --depth, ignores .git / node_modules / etc.)
  → builds a graph: files + folders as nodes, parent relationships as edges
  → starts a local HTTP server
  → opens your default browser
  → renders an interactive force-directed graph on HTML5 Canvas
```

**Node types:**

| Type        | Color      | Size                           |
| ----------- | ---------- | ------------------------------ |
| Root folder | Amber      | Largest — center of graph      |
| Subfolder   | Orange-red | Scales with number of children |
| File        | Blue       | Small, uniform                 |

**Interactions:**

| Input                   | Effect                                                                   |
| ----------------------- | ------------------------------------------------------------------------ |
| Hover node              | Highlights node + direct connections, dims everything else, shows labels |
| Drag node               | Pick up and reposition; releases back into physics                       |
| Scroll                  | Zoom in/out                                                              |
| Click + drag background | Pan                                                                      |
| Double-click background | Reset zoom                                                               |

---

## Ignored by default

`.git` · `node_modules` · `__pycache__` · `.DS_Store` · `.idea` · `.vscode` · hidden files/folders (`.` prefix)

---

## Roadmap

- [x] **v0.1** — Directory scan, force-directed graph, dark theme, drag/zoom/pan, hover highlights, auto-open browser
- [ ] **v0.2** — Parse markdown `[[wikilinks]]` and `[links](path)` for content-based edges
- [ ] **v0.3** — Search/filter nodes, click to open file info panel, minimap
- [ ] **v0.4** — Spanning tree overlays, layout algorithm selection, physics settings panel
- [ ] **v0.5** — WebGL rendering for 10k+ node graphs, watch mode (live filesystem updates), PNG/SVG export

---

## Development

```bash
# Run from source
go run . [flags] [path]

# Project layout
grafux/
├── main.go                  # CLI: flags, scanner, server, browser open
├── scanner/scanner.go       # filepath.Walk → nodes + edges JSON
├── server/
│   ├── server.go            # HTTP server + go:embed
│   └── web/
│       ├── index.html       # Single-page shell
│       ├── style.css        # Dark theme
│       └── graph.js         # d3-force simulation + canvas renderer
└── go.mod
```

Frontend is embedded into the Go binary at build time via `go:embed`. No build step, no bundler — vanilla JS served directly.
