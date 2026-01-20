/**
 * Grid System Tests
 * 
 * Tests for grid coordinate conversions, spatial hash, and cell operations.
 */

import {
  cellEuclideanDistance,
  cellManhattanDistance,
  cellToNormalized,
  cellsEqual,
  clampCell,
  createSpatialHash,
  getCardinalNeighbors,
  getCellBounds,
  getCellCenter,
  getCellDimensions,
  getNeighborCells,
  isValidCell,
  normalizedToCell,
} from '@/core/lib/intent/spatial/grid'
import type { GridConfig, Position } from '@/core/lib/intent/core/types'

describe('Grid System', () => {
  const gridConfig: GridConfig = {
    cols: 12,
    rows: 8,
  }

  describe('Coordinate Conversions', () => {
    it('should convert normalized position to cell', () => {
      const position: Position = { x: 0.5, y: 0.5, z: 0 }
      const cell = normalizedToCell(position, gridConfig)
      
      expect(cell.col).toBe(6) // Middle column
      expect(cell.row).toBe(4) // Middle row
    })

    it('should handle edge cases (0, 0)', () => {
      const position: Position = { x: 0, y: 0, z: 0 }
      const cell = normalizedToCell(position, gridConfig)
      
      expect(cell.col).toBe(0)
      expect(cell.row).toBe(0)
    })

    it('should handle edge cases (1, 1)', () => {
      const position: Position = { x: 1, y: 1, z: 0 }
      const cell = normalizedToCell(position, gridConfig)
      
      // Should clamp to last cell
      expect(cell.col).toBe(11)
      expect(cell.row).toBe(7)
    })

    it('should convert cell to normalized position (center)', () => {
      const cell = { col: 6, row: 4 }
      const position = cellToNormalized(cell, gridConfig)
      
      // Should be at cell center
      expect(position.x).toBeCloseTo(0.5417, 3) // (6 + 0.5) / 12
      expect(position.y).toBeCloseTo(0.5625, 3) // (4 + 0.5) / 8
      expect(position.z).toBe(0)
    })
  })

  describe('Cell Geometry', () => {
    it('should get cell center', () => {
      const cell = { col: 0, row: 0 }
      const center = getCellCenter(cell, gridConfig)
      
      expect(center.x).toBeCloseTo(0.0417, 3) // 0.5 / 12
      expect(center.y).toBeCloseTo(0.0625, 3) // 0.5 / 8
    })

    it('should get cell bounds', () => {
      const cell = { col: 1, row: 1 }
      const bounds = getCellBounds(cell, gridConfig)
      
      expect(bounds.min.x).toBeCloseTo(0.0833, 3) // 1 / 12
      expect(bounds.min.y).toBeCloseTo(0.125, 3) // 1 / 8
      expect(bounds.max.x).toBeCloseTo(0.1667, 3) // 2 / 12
      expect(bounds.max.y).toBeCloseTo(0.25, 3) // 2 / 8
    })

    it('should get cell dimensions', () => {
      const dims = getCellDimensions(gridConfig)
      
      expect(dims.width).toBeCloseTo(0.0833, 3) // 1 / 12
      expect(dims.height).toBeCloseTo(0.125, 3) // 1 / 8
    })
  })

  describe('Cell Validation', () => {
    it('should validate cells', () => {
      expect(isValidCell({ col: 0, row: 0 }, gridConfig)).toBe(true)
      expect(isValidCell({ col: 11, row: 7 }, gridConfig)).toBe(true)
      expect(isValidCell({ col: -1, row: 0 }, gridConfig)).toBe(false)
      expect(isValidCell({ col: 0, row: -1 }, gridConfig)).toBe(false)
      expect(isValidCell({ col: 12, row: 0 }, gridConfig)).toBe(false)
      expect(isValidCell({ col: 0, row: 8 }, gridConfig)).toBe(false)
    })

    it('should clamp cells to valid bounds', () => {
      expect(clampCell({ col: -1, row: -1 }, gridConfig)).toEqual({ col: 0, row: 0 })
      expect(clampCell({ col: 15, row: 10 }, gridConfig)).toEqual({ col: 11, row: 7 })
      expect(clampCell({ col: 5, row: 3 }, gridConfig)).toEqual({ col: 5, row: 3 })
    })
  })

  describe('Cell Neighbors', () => {
    it('should get 8-connected neighbors', () => {
      const cell = { col: 5, row: 4 }
      const neighbors = getNeighborCells(cell, gridConfig)
      
      expect(neighbors).toHaveLength(8)
      expect(neighbors).toContainEqual({ col: 4, row: 3 })
      expect(neighbors).toContainEqual({ col: 5, row: 3 })
      expect(neighbors).toContainEqual({ col: 6, row: 3 })
      expect(neighbors).toContainEqual({ col: 4, row: 4 })
      expect(neighbors).toContainEqual({ col: 6, row: 4 })
      expect(neighbors).toContainEqual({ col: 4, row: 5 })
      expect(neighbors).toContainEqual({ col: 5, row: 5 })
      expect(neighbors).toContainEqual({ col: 6, row: 5 })
    })

    it('should get 4-connected neighbors', () => {
      const cell = { col: 5, row: 4 }
      const neighbors = getCardinalNeighbors(cell, gridConfig)
      
      expect(neighbors).toHaveLength(4)
      expect(neighbors).toContainEqual({ col: 5, row: 3 }) // Up
      expect(neighbors).toContainEqual({ col: 5, row: 5 }) // Down
      expect(neighbors).toContainEqual({ col: 4, row: 4 }) // Left
      expect(neighbors).toContainEqual({ col: 6, row: 4 }) // Right
    })

    it('should handle edge cells', () => {
      const cell = { col: 0, row: 0 }
      const neighbors = getNeighborCells(cell, gridConfig)
      
      // Corner cell should have 3 neighbors
      expect(neighbors).toHaveLength(3)
    })
  })

  describe('Cell Comparison', () => {
    it('should check cell equality', () => {
      expect(cellsEqual({ col: 1, row: 2 }, { col: 1, row: 2 })).toBe(true)
      expect(cellsEqual({ col: 1, row: 2 }, { col: 2, row: 1 })).toBe(false)
    })

    it('should calculate Manhattan distance', () => {
      const a = { col: 0, row: 0 }
      const b = { col: 3, row: 4 }
      
      expect(cellManhattanDistance(a, b)).toBe(7) // 3 + 4
    })

    it('should calculate Euclidean distance', () => {
      const a = { col: 0, row: 0 }
      const b = { col: 3, row: 4 }
      
      expect(cellEuclideanDistance(a, b)).toBe(5) // sqrt(9 + 16)
    })
  })

  describe('Spatial Hash', () => {
    it('should create spatial hash', () => {
      const hash = createSpatialHash(gridConfig)
      
      expect(hash.config).toEqual(gridConfig)
      expect(hash.grid.size).toBe(0)
    })

    it('should insert items', () => {
      const hash = createSpatialHash<string>(gridConfig)
      
      hash.insert({ x: 0.5, y: 0.5, z: 0 }, 'center')
      hash.insert({ x: 0.1, y: 0.1, z: 0 }, 'top-left')
      
      expect(hash.getAllItems()).toHaveLength(2)
    })

    it('should find nearby items', () => {
      const hash = createSpatialHash<string>(gridConfig)
      
      // Insert items in a cluster
      hash.insert({ x: 0.5, y: 0.5, z: 0 }, 'center')
      hash.insert({ x: 0.52, y: 0.52, z: 0 }, 'near-center')
      hash.insert({ x: 0.9, y: 0.9, z: 0 }, 'far')
      
      // Query near center
      const nearby = hash.getNearby({ x: 0.5, y: 0.5, z: 0 }, 0.1)
      
      // Should find center and near-center, but not far
      expect(nearby).toHaveLength(2)
      expect(nearby[0].item.data).toBe('center')
      expect(nearby[1].item.data).toBe('near-center')
    })

    it('should sort results by distance', () => {
      const hash = createSpatialHash<string>(gridConfig)
      
      hash.insert({ x: 0.5, y: 0.5, z: 0 }, 'center')
      hash.insert({ x: 0.6, y: 0.6, z: 0 }, 'far')
      hash.insert({ x: 0.51, y: 0.51, z: 0 }, 'near')
      
      const nearby = hash.getNearby({ x: 0.5, y: 0.5, z: 0 }, 0.2)
      
      // Should be sorted by distance (closest first)
      expect(nearby[0].item.data).toBe('center')
      expect(nearby[1].item.data).toBe('near')
      expect(nearby[2].item.data).toBe('far')
    })

    it('should limit results', () => {
      const hash = createSpatialHash<number>(gridConfig)
      
      // Insert 10 items
      for (let i = 0; i < 10; i++) {
        hash.insert({ x: 0.5 + i * 0.01, y: 0.5, z: 0 }, i)
      }
      
      // Query with max 5 items
      const nearby = hash.getNearby({ x: 0.5, y: 0.5, z: 0 }, 0.5, 5)
      
      expect(nearby).toHaveLength(5)
    })

    it('should get items in specific cell', () => {
      const hash = createSpatialHash<string>(gridConfig)
      
      hash.insert({ x: 0.5, y: 0.5, z: 0 }, 'center')
      hash.insert({ x: 0.1, y: 0.1, z: 0 }, 'top-left')
      
      const centerCell = normalizedToCell({ x: 0.5, y: 0.5, z: 0 }, gridConfig)
      const itemsInCell = hash.getInCell(centerCell)
      
      expect(itemsInCell).toHaveLength(1)
      expect(itemsInCell[0].data).toBe('center')
    })

    it('should clear hash', () => {
      const hash = createSpatialHash<string>(gridConfig)
      
      hash.insert({ x: 0.5, y: 0.5, z: 0 }, 'test')
      expect(hash.getAllItems()).toHaveLength(1)
      
      hash.clear()
      expect(hash.getAllItems()).toHaveLength(0)
    })

    it('should handle 3D distances', () => {
      const hash = createSpatialHash<string>(gridConfig)
      
      hash.insert({ x: 0.5, y: 0.5, z: 0 }, 'flat')
      hash.insert({ x: 0.5, y: 0.5, z: 0.1 }, 'elevated')
      
      // Query with small radius (2D)
      const nearby2D = hash.getNearby({ x: 0.5, y: 0.5, z: 0 }, 0.05)
      expect(nearby2D).toHaveLength(1) // Only flat
      
      // Query with larger radius (includes Z)
      const nearby3D = hash.getNearby({ x: 0.5, y: 0.5, z: 0 }, 0.15)
      expect(nearby3D).toHaveLength(2) // Both flat and elevated
    })
  })
})

