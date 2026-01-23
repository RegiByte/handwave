/**
 * Intent Engine - Grid System
 *
 * Pure functions for converting between normalized coordinates and grid cells.
 *
 * Responsibilities:
 * - Convert normalized coordinates (0-1) to grid cells
 * - Convert grid cells to normalized coordinates
 * - Calculate cell centers and bounds
 * - Validate cells
 *
 * Philosophy:
 * - Pure transformation functions
 * - Clear coordinate system semantics
 * - Handles edge cases gracefully
 */

import { intentKeywords } from '../vocabulary'
import type {
  Cell,
  GridConfig,
  GridPresets,
  GridResolution,
  Position,
} from '../vocabulary'

// ============================================================================
// Coordinate Conversions
// ============================================================================

/**
 * Convert normalized position to grid cell
 *
 * @param position - Normalized position (0-1)
 * @param config - Grid configuration
 * @returns Grid cell coordinates
 */
export function normalizedToCell(position: Position, config: GridConfig): Cell {
  // Clamp position to [0, 1] range
  const x = Math.max(0, Math.min(1, position.x))
  const y = Math.max(0, Math.min(1, position.y))

  // Convert to cell coordinates
  const col = Math.floor(x * config.cols)
  const row = Math.floor(y * config.rows)

  // Clamp to valid cell range (handles edge case where x or y = 1.0)
  return {
    col: Math.min(col, config.cols - 1),
    row: Math.min(row, config.rows - 1),
  }
}

/**
 * Convert grid cell to normalized position (cell center)
 *
 * @param cell - Grid cell
 * @param config - Grid configuration
 * @returns Normalized position at cell center
 */
export function cellToNormalized(cell: Cell, config: GridConfig): Position {
  const cellWidth = 1 / config.cols
  const cellHeight = 1 / config.rows

  return {
    x: (cell.col + 0.5) * cellWidth,
    y: (cell.row + 0.5) * cellHeight,
    z: 0, // Grid is 2D, z is always 0
  }
}

// ============================================================================
// Cell Geometry
// ============================================================================

/**
 * Get the center position of a cell
 *
 * @param cell - Grid cell
 * @param config - Grid configuration
 * @returns Normalized position at cell center
 */
export function getCellCenter(cell: Cell, config: GridConfig): Position {
  return cellToNormalized(cell, config)
}

/**
 * Get the bounds of a cell
 *
 * @param cell - Grid cell
 * @param config - Grid configuration
 * @returns Min and max positions of cell
 */
export function getCellBounds(
  cell: Cell,
  config: GridConfig,
): { min: Position; max: Position } {
  const cellWidth = 1 / config.cols
  const cellHeight = 1 / config.rows

  return {
    min: {
      x: cell.col * cellWidth,
      y: cell.row * cellHeight,
      z: 0,
    },
    max: {
      x: (cell.col + 1) * cellWidth,
      y: (cell.row + 1) * cellHeight,
      z: 0,
    },
  }
}

/**
 * Get cell dimensions (width and height)
 *
 * @param config - Grid configuration
 * @returns Cell width and height in normalized coordinates
 */
export function getCellDimensions(config: GridConfig): {
  width: number
  height: number
} {
  return {
    width: 1 / config.cols,
    height: 1 / config.rows,
  }
}

// ============================================================================
// Cell Validation
// ============================================================================

/**
 * Check if a cell is valid for the grid
 *
 * @param cell - Cell to validate
 * @param config - Grid configuration
 * @returns True if cell is valid
 */
export function isValidCell(cell: Cell, config: GridConfig): boolean {
  return (
    cell.col >= 0 &&
    cell.col < config.cols &&
    cell.row >= 0 &&
    cell.row < config.rows
  )
}

/**
 * Clamp a cell to valid grid bounds
 *
 * @param cell - Cell to clamp
 * @param config - Grid configuration
 * @returns Valid cell
 */
export function clampCell(cell: Cell, config: GridConfig): Cell {
  return {
    col: Math.max(0, Math.min(config.cols - 1, cell.col)),
    row: Math.max(0, Math.min(config.rows - 1, cell.row)),
  }
}

// ============================================================================
// Cell Neighbors
// ============================================================================

/**
 * Get all neighboring cells (8-connected)
 *
 * @param cell - Center cell
 * @param config - Grid configuration
 * @returns Array of valid neighboring cells
 */
export function getNeighborCells(cell: Cell, config: GridConfig): Array<Cell> {
  const neighbors: Array<Cell> = []

  for (let dRow = -1; dRow <= 1; dRow++) {
    for (let dCol = -1; dCol <= 1; dCol++) {
      // Skip center cell
      if (dRow === 0 && dCol === 0) continue

      const neighbor = {
        col: cell.col + dCol,
        row: cell.row + dRow,
      }

      if (isValidCell(neighbor, config)) {
        neighbors.push(neighbor)
      }
    }
  }

  return neighbors
}

/**
 * Get cardinal neighbors (4-connected: up, down, left, right)
 *
 * @param cell - Center cell
 * @param config - Grid configuration
 * @returns Array of valid cardinal neighbors
 */
export function getCardinalNeighbors(
  cell: Cell,
  config: GridConfig,
): Array<Cell> {
  const offsets = [
    { col: 0, row: -1 }, // Up
    { col: 0, row: 1 }, // Down
    { col: -1, row: 0 }, // Left
    { col: 1, row: 0 }, // Right
  ]

  return offsets
    .map((offset) => ({
      col: cell.col + offset.col,
      row: cell.row + offset.row,
    }))
    .filter((neighbor) => isValidCell(neighbor, config))
}

// ============================================================================
// Cell Comparison
// ============================================================================

/**
 * Check if two cells are equal
 *
 * @param a - First cell
 * @param b - Second cell
 * @returns True if cells are equal
 */
export function cellsEqual(a: Cell, b: Cell): boolean {
  return a.col === b.col && a.row === b.row
}

/**
 * Calculate Manhattan distance between two cells
 *
 * @param a - First cell
 * @param b - Second cell
 * @returns Manhattan distance
 */
export function cellManhattanDistance(a: Cell, b: Cell): number {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row)
}

/**
 * Calculate Euclidean distance between two cells
 *
 * @param a - First cell
 * @param b - Second cell
 * @returns Euclidean distance
 */
export function cellEuclideanDistance(a: Cell, b: Cell): number {
  const dCol = a.col - b.col
  const dRow = a.row - b.row
  return Math.sqrt(dCol * dCol + dRow * dRow)
}

// ============================================================================
// Spatial Hash System
// ============================================================================

/**
 * Item with position and associated data
 */
export type PositionedItem<TData = unknown> = {
  position: Position
  data: TData
}

/**
 * Item with distance from query position
 */
export type ItemWithDistance<TData = unknown> = {
  item: PositionedItem<TData>
  distance: number
}

/**
 * Spatial hash for efficient neighbor queries in 3D space
 *
 * Uses grid-based spatial hashing for O(1) lookups.
 * Positions are in normalized coordinates (0-1).
 */
export type SpatialHash<TData = unknown> = {
  config: GridConfig
  grid: Map<string, Array<PositionedItem<TData>>>

  // Mutation methods
  clear: () => void
  insert: (position: Position, data: TData) => void
  insertMany: (items: Array<PositionedItem<TData>>) => void

  // Query methods
  getNearby: (
    position: Position,
    radius: number,
    maxItems?: number,
  ) => Array<ItemWithDistance<TData>>

  getInCell: (cell: Cell) => Array<PositionedItem<TData>>
  getAllItems: () => Array<PositionedItem<TData>>
}

/**
 * Get cell key for spatial hash map
 *
 * @param cell - Grid cell
 * @returns String key for map
 */
function getCellKey(cell: Cell): string {
  return `${cell.col},${cell.row}`
}

/**
 * Calculate 3D Euclidean distance between two positions
 *
 * @param a - First position
 * @param b - Second position
 * @returns Distance
 */
function distance3D(a: Position, b: Position): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/**
 * Get cells within radius of a position
 * Returns all cells that could contain points within the radius
 *
 * @param position - Center position (normalized)
 * @param radius - Search radius (normalized)
 * @param config - Grid configuration
 * @returns Array of cells to check
 */
function getCellsInRadius(
  position: Position,
  radius: number,
  config: GridConfig,
): Array<Cell> {
  const centerCell = normalizedToCell(position, config)
  const cellWidth = 1 / config.cols
  const cellHeight = 1 / config.rows

  // Calculate how many cells to check in each direction
  // Add 1 to ensure we cover the full radius
  const cellsX = Math.ceil(radius / cellWidth) + 1
  const cellsY = Math.ceil(radius / cellHeight) + 1

  const cells: Array<Cell> = []

  for (let dRow = -cellsY; dRow <= cellsY; dRow++) {
    for (let dCol = -cellsX; dCol <= cellsX; dCol++) {
      const cell = {
        col: centerCell.col + dCol,
        row: centerCell.row + dRow,
      }

      // Only include valid cells (no wrapping, viewport has edges)
      if (isValidCell(cell, config)) {
        cells.push(cell)
      }
    }
  }

  return cells
}

/**
 * Create a spatial hash for efficient neighbor queries
 *
 * Spatial hash uses grid cells to partition space, enabling O(1) lookups
 * for nearby items. Ideal for checking "is hand in region X" patterns.
 *
 * @param config - Grid configuration
 * @returns Spatial hash instance
 */
export function createSpatialHash<TData = unknown>(
  config: GridConfig,
): SpatialHash<TData> {
  const grid = new Map<string, Array<PositionedItem<TData>>>()

  // Reusable array for query results (avoid allocations)
  const queryCache: Array<ItemWithDistance<TData>> = []

  const api: SpatialHash<TData> = {
    config,
    grid,

    clear: () => {
      grid.clear()
    },

    insert: (position: Position, data: TData) => {
      const cell = normalizedToCell(position, config)
      const key = getCellKey(cell)

      const cellItems = grid.get(key)
      if (!cellItems) {
        grid.set(key, [{ position, data }])
      } else {
        cellItems.push({ position, data })
      }
    },

    insertMany: (items: Array<PositionedItem<TData>>) => {
      for (const item of items) {
        api.insert(item.position, item.data)
      }
    },

    getNearby: (
      position: Position,
      radius: number,
      maxItems?: number,
    ): Array<ItemWithDistance<TData>> => {
      queryCache.length = 0

      const radiusSquared = radius * radius
      const cellsToCheck = getCellsInRadius(position, radius, config)

      // Check all cells within radius
      for (const cell of cellsToCheck) {
        const key = getCellKey(cell)
        const cellItems = grid.get(key)

        if (!cellItems) continue

        // Check each item in the cell
        for (const item of cellItems) {
          const dist = distance3D(position, item.position)
          const distSquared = dist * dist

          if (distSquared <= radiusSquared) {
            queryCache.push({
              item,
              distance: dist,
            })
          }
        }
      }

      // Sort by distance (closest first)
      queryCache.sort((a, b) => a.distance - b.distance)

      // Limit results if requested
      if (maxItems !== undefined && queryCache.length > maxItems) {
        queryCache.length = maxItems
      }

      return queryCache
    },

    getInCell: (cell: Cell): Array<PositionedItem<TData>> => {
      const key = getCellKey(cell)
      return grid.get(key) ?? []
    },

    getAllItems: (): Array<PositionedItem<TData>> => {
      const allItems: Array<PositionedItem<TData>> = []
      for (const items of grid.values()) {
        allItems.push(...items)
      }
      return allItems
    },
  }

  return api
}

// ============================================================================
// Multi-Resolution Grid System
// ============================================================================

/**
 * Grid presets for different resolutions
 */
export const DEFAULT_GRID_PRESETS = {
  coarse: { cols: 6, rows: 4 },
  medium: { cols: 12, rows: 8 },
  fine: { cols: 24, rows: 16 },
} as const

/**
 * Multi-resolution spatial hash
 */
export type MultiResolutionSpatialHash<TData = unknown> = {
  coarse: SpatialHash<TData>
  medium: SpatialHash<TData>
  fine: SpatialHash<TData>

  // Configuration
  presets: GridPresets

  // Bulk operations
  clearAll: () => void
  insertAll: (position: Position, data: TData) => void
  insertManyAll: (items: Array<PositionedItem<TData>>) => void

  // Resolution-specific queries
  getNearby: (
    position: Position,
    radius: number,
    resolution: GridResolution,
    maxItems?: number,
  ) => Array<ItemWithDistance<TData>>

  getInCell: (
    cell: Cell,
    resolution: GridResolution,
  ) => Array<PositionedItem<TData>>

  // Get specific spatial hash by resolution
  getHash: (resolution: GridResolution) => SpatialHash<TData>
}

/**
 * Create multi-resolution spatial hash system
 *
 * Creates separate spatial hashes for coarse, medium, and fine grid resolutions.
 * Allows efficient spatial queries at different granularity levels.
 *
 * @param presets - Grid presets for each resolution (defaults to DEFAULT_GRID_PRESETS)
 * @returns Multi-resolution spatial hash instance
 */
export function createMultiResolutionSpatialHash<TData = unknown>(
  presets: GridPresets = DEFAULT_GRID_PRESETS,
): MultiResolutionSpatialHash<TData> {
  // Create spatial hash for each resolution
  const coarseHash = createSpatialHash<TData>(presets.coarse)
  const mediumHash = createSpatialHash<TData>(presets.medium)
  const fineHash = createSpatialHash<TData>(presets.fine)

  const api: MultiResolutionSpatialHash<TData> = {
    coarse: coarseHash,
    medium: mediumHash,
    fine: fineHash,
    presets,

    clearAll: () => {
      coarseHash.clear()
      mediumHash.clear()
      fineHash.clear()
    },

    insertAll: (position: Position, data: TData) => {
      coarseHash.insert(position, data)
      mediumHash.insert(position, data)
      fineHash.insert(position, data)
    },

    insertManyAll: (items: Array<PositionedItem<TData>>) => {
      coarseHash.insertMany(items)
      mediumHash.insertMany(items)
      fineHash.insertMany(items)
    },

    getNearby: (position, radius, resolution, maxItems) => {
      const hash = api.getHash(resolution)
      return hash.getNearby(position, radius, maxItems)
    },

    getInCell: (cell, resolution) => {
      const hash = api.getHash(resolution)
      return hash.getInCell(cell)
    },

    getHash: (resolution) => {
      switch (resolution) {
        case intentKeywords.gridResolutions.coarse:
          return coarseHash
        case intentKeywords.gridResolutions.medium:
          return mediumHash
        case intentKeywords.gridResolutions.fine:
          return fineHash
        default:
          return mediumHash
      }
    },
  }

  return api
}

/**
 * Get grid config for a resolution
 *
 * @param resolution - Grid resolution (coarse/medium/fine)
 * @param presets - Grid presets (defaults to DEFAULT_GRID_PRESETS)
 * @returns Grid configuration for the specified resolution
 */
export function getGridConfigForResolution(
  resolution: GridResolution,
  presets: GridPresets = DEFAULT_GRID_PRESETS,
): GridConfig {
  return presets[resolution]
}

/**
 * Convert position to cell for specific resolution
 *
 * @param position - Normalized position (0-1)
 * @param resolution - Grid resolution (coarse/medium/fine)
 * @param presets - Grid presets (defaults to DEFAULT_GRID_PRESETS)
 * @returns Grid cell for the specified resolution
 */
export function normalizedToCellByResolution(
  position: Position,
  resolution: GridResolution,
  presets: GridPresets = DEFAULT_GRID_PRESETS,
): Cell {
  const config = getGridConfigForResolution(resolution, presets)
  return normalizedToCell(position, config)
}
