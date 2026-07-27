/**
 * UI Type Definitions
 * Types for UI state, events, and DOM interactions
 */

export interface FileItem {
  id: string
  name: string
  path: string
  status: 'pending' | 'loaded' | 'error'
  bookmark?: string
  size?: number
}

export interface SheetConfig {
  width: number
  height: number
  margin: number
  material?: string
}

export interface CanvasViewport {
  x: number
  y: number
  zoom: number
  width: number
  height: number
}

export interface MouseState {
  isDragging: boolean
  lastX: number
  lastY: number
  button: number
}

export interface ModalOptions {
  title?: string
  width?: string
  height?: string
  closable?: boolean
  onClose?: () => void
}

export interface SelectOption {
  value: string | number
  label: string
  disabled?: boolean
}

export interface TabItem {
  id: string
  label: string
  active: boolean
}

// DOM Event types (standard browser events)

// Canvas-specific types
export interface CanvasRenderContext {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  viewport: CanvasViewport
}

export interface DrawOptions {
  strokeStyle?: string
  fillStyle?: string
  lineWidth?: number
  lineDash?: number[]
  globalAlpha?: number
}

// Form-related types
export interface FormField {
  name: string
  value: string | number | boolean
  type: 'text' | 'number' | 'checkbox' | 'select'
  label?: string
  placeholder?: string
  options?: SelectOption[]
  validation?: (value: unknown) => string | null
}

export interface ValidationResult {
  valid: boolean
  errors: Record<string, string>
}
