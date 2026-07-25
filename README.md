# Hera Nest

A cross-platform DXF nesting application built with Electron, TypeScript, and React. Hera Nest processes DXF files, automatically detects shapes, and performs intelligent 2D nesting optimization to minimize material waste.

## Overview

Hera Nest is a desktop application for optimizing the layout of 2D shapes on sheet material. It reads DXF (Drawing Exchange Format) files, analyzes the geometry, and uses advanced nesting algorithms to arrange parts efficiently, reducing material waste and improving production efficiency.

### Key Features

- **DXF Import & Export**: Full support for DXF file format with automatic shape detection
- **Intelligent Nesting**: Powered by the high-performance Sparrow nesting engine
- **Real-time Visualization**: Interactive canvas for viewing and manipulating nested layouts
- **Multiple Export Options**: Export nested results as DXF with configurable layers and settings
- **Cross-platform**: Runs on Windows, macOS, and Linux
- **State Persistence**: Automatic project state saving and restoration
- **Material Optimization**: Minimize waste by efficiently packing shapes onto sheets

## Architecture

The application follows a multi-process Electron architecture:

- **Main Process** (`src/main`): Node.js backend handling file I/O, native binary orchestration, and system integration
- **Renderer Process** (`src/renderer`): Browser-based UI with React/Vanilla JS, canvas visualization, and state management
- **Preload** (`src/preload`): Context bridge for secure IPC communication
- **Native Binary** (`native/sparrow`): High-performance Rust-based nesting engine

### Nesting Engine

Hera Nest uses [Sparrow](https://github.com/JeroenGar/sparrow), a state-of-the-art 2D irregular bin packing algorithm written in Rust. Sparrow provides:

- Fast, high-quality nesting solutions
- Support for irregular polygon shapes
- Configurable optimization parameters
- Real-time progress updates

## Credits & Attribution

This project is based on and inspired by:

- **[Kenzap Nesting App](https://github.com/kenzap/nesting-app)** - The original Electron-based DXF nesting application that provided the foundation for this project
- **[Sparrow](https://github.com/JeroenGar/sparrow)** by Jeroen Gar - The high-performance Rust nesting algorithm that powers the optimization engine

Special thanks to the original authors and contributors of these projects for their excellent work in making efficient nesting solutions accessible.

## Project Setup

### Prerequisites

- [Bun](https://bun.sh/) - Fast JavaScript runtime and package manager
- Node.js 18+ (for Electron compatibility)

### Install

```bash
bun install
```

### Development

Run the application in development mode with hot-reload:

```bash
bun run dev
```

### Type Checking

```bash
# Check all TypeScript files
bun run typecheck

# Check only main process
bun run typecheck:node

# Check only renderer process
bun run typecheck:web
```

### Linting

```bash
bun run lint
```

### Build

Build the application for production:

```bash
# For Windows
bun run build:win

# For macOS
bun run build:mac

# For Linux
bun run build:linux
```

## Usage

1. **Import DXF**: Open a DXF file containing the shapes you want to nest
2. **Configure Parameters**: Set material dimensions, spacing, rotation options, and other nesting parameters
3. **Run Nesting**: Execute the optimization algorithm and watch real-time progress
4. **Review Results**: Visualize the nested layout on the interactive canvas
5. **Export**: Save the optimized layout as a DXF file for production

## Technology Stack

- **Electron** - Cross-platform desktop framework
- **TypeScript** - Type-safe JavaScript
- **Vite** - Fast build tool and dev server
- **React/Vanilla JS** - UI rendering
- **DXF Libraries** - Geometry parsing and generation
  - `@tarikjabiri/dxf` - DXF file generation
  - `dxf-parser` - DXF file parsing
- **Geometry Processing**
  - `@flatten-js/core` - 2D geometry operations
  - `jsts` - Topology operations
  - `concaveman` - Concave hull generation
- **Sparrow** - Native Rust nesting engine

## Development Guidelines

For detailed development guidelines, code conventions, and architectural decisions, see [AGENTS.md](./AGENTS.md).

### Key Conventions

- Factory-based services with dependency injection
- Single global state object with debounced persistence
- Standardized IPC result objects: `{ success: boolean, data?: T, error?: string }`
- `kebab-case` for files, `camelCase` for functions and variables

## License

This project inherits licensing considerations from its parent projects. Please refer to the original repositories for specific license terms:

- [Kenzap Nesting App License](https://github.com/kenzap/nesting-app)
- [Sparrow License](https://github.com/JeroenGar/sparrow)

## Contributing

Contributions are welcome! Please ensure that:

1. TypeScript compilation passes (`bun run typecheck`)
2. Linting passes (`bun run lint`)
3. The application builds successfully (`bun run build`)
4. Changes follow the project's code conventions (see AGENTS.md)
