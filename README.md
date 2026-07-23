# Hera Nest

**Advanced DXF Nesting Application**

Desktop application for intelligent 2D nesting with DXF support, built on Electron.

---

## Overview

Hera Nest is a desktop nesting application forked from [Kenzap Nesting](https://github.com/kenzap/nesting-app), evolving in a new direction with enhanced features and workflows tailored for advanced manufacturing needs.

### Key Features

- **DXF Import/Export** — Full DXF support with multi-layer preservation
- **Intelligent Nesting** — State-of-the-art 2D nesting algorithm via [Sparrow](https://github.com/JeroenGar/sparrow)
- **Multi-Shape Detection** — Automatic detection of individual shapes within complex DXF files
- **Live Preview** — Real-time visualization as nesting algorithm optimizes
- **Sheet & Strip Modes** — Configurable output for different material types
- **Engraving Support** — Preserve and layout internal geometry
- **Cross-Platform** — macOS, Windows, Linux

---

## Installation

### From Source

```bash
# Clone repository
git clone https://github.com/yourusername/hera-nest.git
cd hera-nest

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run dist:mac    # macOS (DMG + ZIP)
npm run dist:win    # Windows (NSIS installer)
npm run dist:snap   # Linux (Snap)
```

### Requirements

- Node.js (latest LTS recommended)
- npm or yarn
- Native nesting binaries (included in `native/` directory)

---

## Development

### Project Structure

```
hera-nest/
├── main/           # Electron main process
├── renderer/       # UI and visualization layer
├── preload.js      # Secure IPC bridge
├── shared/         # Shared constants and utilities
├── native/         # Platform-specific Sparrow binaries
├── assets/         # Icons and resources
└── docs/           # Documentation
```

### Available Scripts

- `npm start` — Launch application
- `npm run dev` — Launch with DevTools enabled
- `npm run dist:mac` — Build macOS DMG + ZIP
- `npm run dist:win` — Build Windows installer
- `npm run dist:win-portable` — Build Windows portable
- `npm run dist:snap` — Build Linux Snap
- `npm run dist:appx` — Build Windows AppX (Microsoft Store)

### Architecture

Hera Nest follows Electron's multi-process architecture:

- **Main Process** (`main/`) — System integration, file operations, algorithm orchestration
- **Renderer Process** (`renderer/`) — UI rendering, canvas visualization, user interaction
- **Preload Script** (`preload.js`) — Secure IPC bridge with context isolation

---

## Technology Stack

- **Electron** — Cross-platform desktop framework
- **Sparrow** — Native nesting engine (Rust-based)
- **DXF Parser** — DXF file parsing and generation
- **Canvas API** — 2D rendering and visualization
- **JSTS** — Computational geometry operations

### Key Dependencies

- `@flatten-js/core` — 2D geometry primitives
- `@tarikjabiri/dxf` — DXF writing
- `dxf-parser` — DXF parsing
- `jsts` — Geometry operations
- `planar-face-discovery` — Shape detection
- `concaveman` — Concave hull computation

---

## Roadmap

Hera Nest is evolving beyond the original Kenzap Nesting with focus on:

- [ ] Enhanced material management and sheet inventory
- [ ] Advanced nesting strategies with priority rules
- [ ] Batch processing and job queue management
- [ ] CNC machine integration and G-code generation
- [ ] Cloud synchronization and collaboration features
- [ ] Performance optimizations for large part libraries
- [ ] Extended file format support (SVG, AI, PDF)
- [ ] Advanced reporting and material utilization analytics

---

## Contributing

This is a personal fork with different goals from the original project. Contributions are welcome, but please open an issue first to discuss proposed changes.

---

## Credits

Hera Nest is forked from [Kenzap Nesting](https://github.com/kenzap/nesting-app) by Kenzap Pte Ltd.

The nesting algorithm is powered by [Sparrow](https://github.com/JeroenGar/sparrow).

Research foundation: [Computational Geometry for Nesting](https://arxiv.org/abs/2509.13329)

---

## License

Licensed under **Apache License 2.0**. See [LICENSE](LICENSE) for full text.

Original work Copyright © Kenzap Pte Ltd  
Modified work Copyright © 2026 Thanh Loi
