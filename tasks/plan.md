# Implementation Plan: TypeScript Typecheck Fixes (Updated)

## Overview

The project needs to fix 130 strict TypeScript errors across the renderer process. Main process is already clean (0 errors). This plan incorporates lessons learned from attempted type consolidation that revealed cascading error issues.

## Current State

- **Main process (node):** 0 errors ✅
- **Renderer process (web):** 130 errors
- **Completed:** dxf-preview-service.ts (90 errors fixed)
- **In progress:** canvas-view.ts (13/66 errors fixed, 19.7%)
- **Commits:** 103

## Critical Lesson Learned

**Type consolidation must be holistic, not incremental!**

Attempted incremental consolidation of `DxfEntity` type caused cascade:

- 130 → 145 errors (+15)
- Revealed duplicate definitions cause conflicts
- Local interfaces had properties central ones lacked
- Changes propagated through import chains unpredictably

**Solution:** Complete type audit and consolidation BEFORE individual file fixes.

## Root Causes

1. **Duplicate type definitions** (3 DxfEntity definitions!)
2. **Incomplete base interfaces** (missing optional properties from subtypes)
3. **DOM element refs typed as `{}`** (should be HTMLElement)
4. **Missing properties** on result types (SparrowResult, NestResult)

## Task List

### ✅ Phase 1: Main Process (COMPLETE)

- ✅ Main process typecheck: 0 errors

### Phase 2: Type System Audit & Consolidation

**Goal:** Establish single source of truth for all shared types.

- [ ] **Task 1: Type Definition Audit**
  - Map all type definitions in src/types/
  - Find duplicate definitions (DxfEntity, DXFEntity, etc.)
  - Document which files use which definitions
  - **Acceptance:** Complete type dependency map
  - **Verification:** Document lists all duplicates
  - **Effort:** Medium (2-3 hours)

- [ ] **Task 2: Design Consolidated Type Strategy**
  - Design comprehensive base interfaces with ALL optional properties
  - Plan import consolidation (what imports from where)
  - Identify type files to merge/remove
  - **Acceptance:** Written strategy document
  - **Verification:** Strategy addresses all 3 DxfEntity definitions
  - **Effort:** Small (1 hour)

- [ ] **Task 3: Implement Type Consolidation (Isolated Branch)**
  - Create feature branch for consolidation
  - Consolidate DxfEntity (remove duplicates, comprehensive base)
  - Add missing properties (SparrowResult.inputPath, NestResult.strip_count)
  - Update all imports
  - **Acceptance:** All files use central definitions
  - **Verification:** `grep -r "interface DxfEntity" src/` shows only 1 result
  - **Effort:** Medium (2-3 hours)

- [ ] **Task 4: Verify No Error Cascade**
  - Run typecheck after consolidation
  - Verify error count DECREASES (not increases!)
  - If cascade occurs, analyze and adjust strategy
  - **Acceptance:** Error count ≤ 130 (no worse than current)
  - **Verification:** `bun run typecheck:web` shows ≤ 130 errors
  - **Effort:** Small (30 min)

### Checkpoint: Type Consolidation Complete

- [ ] Error count has decreased OR stayed same (no cascade)
- [ ] All files import from central type definitions
- [ ] Ready for targeted fixes

### Phase 3: Targeted File Fixes

**Note:** Start only AFTER Phase 2 consolidation complete!

- [ ] **Task 5: Complete canvas-view.ts**
  - Fix remaining 53 errors (was 66, 13 done)
  - Focus on DOM ref types and null checks
  - **Acceptance:** canvas-view.ts: 0 errors
  - **Verification:** No canvas-view.ts in typecheck output
  - **Effort:** Medium (2-3 hours)

- [ ] **Task 6: Fix dxf-svg.ts**
  - Fix 21 errors (after consolidation, should be simpler)
  - Most should be null checks after type fixes
  - **Acceptance:** dxf-svg.ts: 0 errors
  - **Verification:** No dxf-svg.ts in typecheck output
  - **Effort:** Medium (1-2 hours)

- [ ] **Task 7: Fix dxf-preview-modal.ts**
  - Fix 16 errors
  - **Acceptance:** dxf-preview-modal.ts: 0 errors
  - **Verification:** No dxf-preview-modal.ts in typecheck output
  - **Effort:** Small (1 hour)

- [ ] **Task 8: Fix Services**
  - nesting-service.ts: 12 errors
  - dxf-shape-structure-service.ts: 12 errors
  - dxf-service.ts: 4 errors
  - **Acceptance:** All service files: 0 errors
  - **Verification:** No service files in typecheck output
  - **Effort:** Medium (2-3 hours)

- [ ] **Task 9: Fix Remaining Files**
  - src/main.ts: 8 errors
  - custom-selects.ts: 3 errors
  - dxf-preview-state.ts: 1 error
  - **Acceptance:** All files: 0 errors
  - **Verification:** `bun run typecheck:web` shows 0 errors
  - **Effort:** Small (1-2 hours)

### Checkpoint: Complete

- [ ] `bun run typecheck` passes completely (0 errors)
- [ ] All type definitions consolidated
- [ ] Ready for review

## Estimated Timeline

- **Phase 2 (Type Consolidation):** 4-6 hours
- **Phase 3 (Targeted Fixes):** 6-10 hours
- **Total remaining:** 10-16 hours

## Risks and Mitigations

| Risk                              | Impact | Mitigation                                       |
| --------------------------------- | ------ | ------------------------------------------------ |
| Type consolidation causes cascade | High   | Isolated branch + verify before merge            |
| Missing properties on base types  | Medium | Comprehensive audit before consolidation         |
| Import chain breaks               | Medium | Test in isolation, update imports systematically |

## Success Criteria

1. `bun run typecheck` passes with 0 errors
2. No duplicate type definitions
3. All files import from central src/types/
4. Changes are maintainable (no `any` hacks)
