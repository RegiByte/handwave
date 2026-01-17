/**
 * Weighted Math Utilities
 *
 * Pure functions for weighted calculations, scoring, and comparisons.
 * Useful for stable sorting, priority systems, and multi-factor decisions.
 *
 * Philosophy: Simple rules compose. Weight different factors to create
 * emergent behavior without complex conditionals.
 */

/**
 * Calculate a weighted sum of values
 *
 * @example
 * weightedSum([
 *   { value: 100, weight: 1.0 },  // Primary factor
 *   { value: 50, weight: 0.5 },   // Secondary factor
 *   { value: 10, weight: 0.1 },   // Tertiary factor
 * ])
 * // → 100*1.0 + 50*0.5 + 10*0.1 = 126
 */
export function weightedSum(
    factors: Array<{ value: number; weight: number }>
  ): number {
    return factors.reduce((sum, { value, weight }) => sum + value * weight, 0)
  }
  
  /**
   * Calculate a weighted difference between two sets of factors
   *
   * Useful for stable sorting where multiple factors matter.
   *
   * @example
   * // Sort by tick (high weight) and count (low weight)
   * items.sort((a, b) =>
   *   weightedDifference(
   *     [
   *       { value: b.tick, weight: 1.0 },
   *       { value: b.count, weight: 0.1 },
   *     ],
   *     [
   *       { value: a.tick, weight: 1.0 },
   *       { value: a.count, weight: 0.1 },
   *     ]
   *   )
   * );
   */
  export function weightedDifference(
    factorsA: Array<{ value: number; weight: number }>,
    factorsB: Array<{ value: number; weight: number }>
  ): number {
    return weightedSum(factorsA) - weightedSum(factorsB)
  }
  
  /**
   * Create a weighted comparator function for sorting
   *
   * Returns a comparator function that can be used with Array.sort()
   *
   * @example
   * const comparator = createWeightedComparator([
   *   { getValue: (item) => item.priority, weight: 10.0 },
   *   { getValue: (item) => item.timestamp, weight: 1.0 },
   *   { getValue: (item) => item.count, weight: 0.1 },
   * ]);
   *
   * items.sort(comparator); // Sort by weighted factors
   */
  export function createWeightedComparator<T>(
    factors: Array<{
      getValue: (item: T) => number
      weight: number
      order?: 'asc' | 'desc'
    }>
  ): (a: T, b: T) => number {
    return (a: T, b: T) => {
      let score = 0
  
      for (const { getValue, weight, order = 'desc' } of factors) {
        const valueA = getValue(a)
        const valueB = getValue(b)
        const diff = order === 'desc' ? valueB - valueA : valueA - valueB
        score += diff * weight
      }
  
      return score
    }
  }
  
  /**
   * Calculate a weighted average
   *
   * @example
   * weightedAverage([
   *   { value: 100, weight: 2 },
   *   { value: 50, weight: 1 },
   * ])
   * // → (100*2 + 50*1) / (2+1) = 83.33
   */
  export function weightedAverage(
    factors: Array<{ value: number; weight: number }>
  ): number {
    const totalWeight = factors.reduce((sum, { weight }) => sum + weight, 0)
    if (totalWeight === 0) return 0
    return weightedSum(factors) / totalWeight
  }
  
  /**
   * Normalize weights to sum to 1.0
   *
   * Useful for ensuring weights are proportional.
   *
   * @example
   * normalizeWeights([
   *   { value: 100, weight: 10 },
   *   { value: 50, weight: 5 },
   * ])
   * // → [
   * //   { value: 100, weight: 0.667 },
   * //   { value: 50, weight: 0.333 },
   * // ]
   */
  export function normalizeWeights(
    factors: Array<{ value: number; weight: number }>
  ): Array<{ value: number; weight: number }> {
    const totalWeight = factors.reduce((sum, { weight }) => sum + weight, 0)
    if (totalWeight === 0) return factors
  
    return factors.map(({ value, weight }) => ({
      value,
      weight: weight / totalWeight,
    }))
  }
  
  /**
   * Calculate a weighted score with min/max normalization
   *
   * Normalizes each value to [0, 1] range before weighting.
   * Useful when factors have different scales.
   *
   * @example
   * weightedScoreNormalized([
   *   { value: 150, weight: 1.0, min: 100, max: 200 }, // → 0.5 * 1.0
   *   { value: 75, weight: 0.5, min: 0, max: 100 },    // → 0.75 * 0.5
   * ])
   * // → 0.5 + 0.375 = 0.875
   */
  export function weightedScoreNormalized(
    factors: Array<{
      value: number
      weight: number
      min: number
      max: number
    }>
  ): number {
    return factors.reduce((sum, { value, weight, min, max }) => {
      const range = max - min
      const normalized = range === 0 ? 0 : (value - min) / range
      return sum + normalized * weight
    }, 0)
  }
  
  /**
   * Apply exponential decay to a weight based on time
   *
   * Useful for time-based priority decay.
   *
   * @example
   * decayWeight(1.0, 100, 0.01)
   * // → 1.0 * e^(-0.01 * 100) ≈ 0.368
   */
  export function decayWeight(
    initialWeight: number,
    timePassed: number,
    decayRate: number
  ): number {
    return initialWeight * Math.exp(-decayRate * timePassed)
  }
  
  /**
   * Calculate a weighted Manhattan distance
   *
   * Useful for multi-dimensional similarity/distance calculations.
   *
   * @example
   * weightedManhattanDistance(
   *   [100, 50, 10],
   *   [90, 45, 12],
   *   [1.0, 0.5, 0.1]
   * )
   * // → |100-90|*1.0 + |50-45|*0.5 + |10-12|*0.1
   * // → 10 + 2.5 + 0.2 = 12.7
   */
  export function weightedManhattanDistance(
    pointA: Array<number>,
    pointB: Array<number>,
    weights: Array<number>
  ): number {
    const minLength = Math.min(pointA.length, pointB.length, weights.length)
    let distance = 0
  
    for (let i = 0; i < minLength; i++) {
      distance += Math.abs(pointA[i] - pointB[i]) * weights[i]
    }
  
    return distance
  }
  
  /**
   * Calculate a weighted Euclidean distance
   *
   * @example
   * weightedEuclideanDistance(
   *   [100, 50],
   *   [90, 45],
   *   [1.0, 0.5]
   * )
   * // → sqrt((100-90)^2*1.0 + (50-45)^2*0.5)
   * // → sqrt(100 + 12.5) = 10.61
   */
  export function weightedEuclideanDistance(
    pointA: Array<number>,
    pointB: Array<number>,
    weights: Array<number>
  ): number {
    const minLength = Math.min(pointA.length, pointB.length, weights.length)
    let sumSquares = 0
  
    for (let i = 0; i < minLength; i++) {
      const diff = pointA[i] - pointB[i]
      sumSquares += diff * diff * weights[i]
    }
  
    return Math.sqrt(sumSquares)
  }
  
  /**
   * Create a weighted priority queue comparator
   *
   * Combines multiple priority factors with optional time decay.
   *
   * @example
   * // Without decay (simple weighted comparison)
   * const comparator = createPriorityComparator(
   *   currentTick,
   *   [
   *     { getValue: (task) => task.urgency, weight: 10.0 },
   *     { getValue: (task) => task.importance, weight: 5.0 },
   *   ]
   * );
   *
   * // With decay (priority decreases over time)
   * const comparatorWithDecay = createPriorityComparator(
   *   currentTick,
   *   [
   *     { getValue: (task) => task.urgency, weight: 10.0 },
   *     { getValue: (task) => task.importance, weight: 5.0 },
   *   ],
   *   {
   *     decayRate: 0.01,
   *     getCreatedAt: (task) => task.createdAt,
   *   }
   * );
   *
   * tasks.sort(comparator);
   */
  export function createPriorityComparator<T>(
    currentTime: number,
    factors: Array<{
      getValue: (item: T) => number
      weight: number
    }>,
    options?: {
      decayRate?: number
      getCreatedAt?: (item: T) => number
    }
  ): (a: T, b: T) => number {
    const decayRate = options?.decayRate ?? 0
    const getCreatedAt = options?.getCreatedAt
  
    return (a: T, b: T) => {
      const calculateBaseScore = (item: T): number => {
        return factors.reduce((sum, { getValue, weight }) => {
          return sum + getValue(item) * weight
        }, 0)
      }
  
      const applyDecay = (baseScore: number, item: T): number => {
        if (decayRate === 0 || !getCreatedAt) {
          return baseScore
        }
  
        const createdAt = getCreatedAt(item)
        const age = currentTime - createdAt
  
        if (age <= 0) {
          return baseScore
        }
  
        return baseScore * Math.exp(-decayRate * age)
      }
  
      const scoreA = applyDecay(calculateBaseScore(a), a)
      const scoreB = applyDecay(calculateBaseScore(b), b)
  
      return scoreB - scoreA // Higher score = higher priority
    }
  }
  
  /**
   * Interpolate between two values with a weight
   *
   * @example
   * lerp(0, 100, 0.5)  // → 50
   * lerp(0, 100, 0.25) // → 25
   * lerp(0, 100, 0.75) // → 75
   */
  export function lerp(start: number, end: number, weight: number): number {
    return start + (end - start) * weight
  }
  
  /**
   * Calculate inverse lerp (find weight for a value)
   *
   * @example
   * inverseLerp(0, 100, 50)  // → 0.5
   * inverseLerp(0, 100, 25)  // → 0.25
   * inverseLerp(0, 100, 150) // → 1.5 (clamped: 1.0)
   */
  export function inverseLerp(
    start: number,
    end: number,
    value: number,
    clamp: boolean = false
  ): number {
    const range = end - start
    if (range === 0) return 0
  
    const t = (value - start) / range
    return clamp ? Math.max(0, Math.min(1, t)) : t
  }
  
  /**
   * Remap a value from one range to another
   *
   * @example
   * remap(50, 0, 100, 0, 1)    // → 0.5
   * remap(75, 0, 100, 0, 10)   // → 7.5
   * remap(150, 0, 100, 0, 1)   // → 1.5 (or 1.0 if clamped)
   */
  export function remap(
    value: number,
    fromMin: number,
    fromMax: number,
    toMin: number,
    toMax: number,
    clamp: boolean = false
  ): number {
    const t = inverseLerp(fromMin, fromMax, value, clamp)
    return lerp(toMin, toMax, t)
  }
  