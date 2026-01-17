import chroma from 'chroma-js'

/**
 * Color Utilities using chroma-js
 * Provides pure functional color manipulation with perceptually accurate transformations
 */

/**
 * Adjust color brightness based on energy ratio
 * Uses perceptually accurate luminance scaling
 * Low energy = darker, high energy = brighter
 *
 * @param hexColor - Base color in hex format
 * @param energyRatio - Energy ratio (0-1)
 * @param minBrightness - Minimum brightness multiplier (default 0.4 = 40%)
 * @returns RGB color string suitable for canvas fillStyle
 */
export const adjustColorBrightness = (
  hexColor: string,
  energyRatio: number,
  minBrightness = 0.4
): string => {
  const brightness = minBrightness + (1 - minBrightness) * energyRatio
  return chroma(hexColor)
    .brighten(brightness - 1)
    .css()
}

/**
 * Convert hex color to RGBA with specified alpha
 * Useful for background rendering with trail effects
 *
 * @param hexColor - Color in hex format
 * @param alpha - Alpha value (0-1)
 * @returns RGBA color string suitable for canvas fillStyle
 */
export const hexToRgba = (hexColor: string, alpha: number): string => {
  return chroma(hexColor).alpha(alpha).css()
}

/**
 * Parse any color format to RGB components
 * Returns [r, g, b] array for manual canvas operations if needed
 *
 * @param color - Color in any format (hex, rgb, rgba, named)
 * @returns [r, g, b] array with values 0-255
 */
export const toRgb = (color: string): [number, number, number] => {
  return chroma(color).rgb()
}

/**
 * Parse any color format to hex
 *
 * @param color - Color in any format
 * @returns Hex color string
 */
export const toHex = (color: string): string => {
  return chroma(color).hex()
}

/**
 * Mix two colors together
 * Useful for genetics, affinity visualization, color inheritance
 *
 * @param color1 - First color
 * @param color2 - Second color
 * @param ratio - Mix ratio (0 = all color1, 1 = all color2, 0.5 = equal mix)
 * @param mode - Color space for mixing (default 'lab' for perceptual accuracy)
 * @returns Mixed color as hex string
 */
export const mixColors = (
  color1: string,
  color2: string,
  ratio: number,
  mode: 'rgb' | 'lab' | 'lch' = 'lab'
): string => {
  return chroma.mix(color1, color2, ratio, mode).hex()
}

/**
 * Get contrasting text color for any background
 * Returns white or black depending on background luminance
 *
 * @param backgroundColor - Background color
 * @returns "#ffffff" for dark backgrounds, "#000000" for light backgrounds
 */
export const getContrastColor = (
  backgroundColor: string,
  darkColor = '#000000',
  lightColor = '#ffffff'
): string => {
  return chroma(backgroundColor).luminance() > 0.5 ? darkColor : lightColor
}


/**
 * Create a color scale for data visualization
 * Uses perceptually uniform LAB color space
 *
 * @param from - Start color
 * @param to - End color
 * @param steps - Number of steps in the scale
 * @returns Array of hex colors
 */
export const createColorScale = (
  from: string,
  to: string,
  steps: number
): Array<string> => {
  const scale = chroma.scale([from, to]).mode('lab')
  return Array.from({ length: steps }, (_, i) => scale(i / (steps - 1)).hex())
}

/**
 * Lighten a color by a specified amount
 *
 * @param color - Base color
 * @param amount - Amount to lighten (0-3, default 1)
 * @returns Lightened color as hex
 */
export const lighten = (color: string, amount = 1): string => {
  return chroma(color).brighten(amount).hex()
}

/**
 * Darken a color by a specified amount
 *
 * @param color - Base color
 * @param amount - Amount to darken (0-3, default 1)
 * @returns Darkened color as hex
 */
export const darken = (color: string, amount = 1): string => {
  return chroma(color).darken(amount).hex()
}

/**
 * Saturate a color
 *
 * @param color - Base color
 * @param amount - Amount to saturate (0-3, default 1)
 * @returns Saturated color as hex
 */
export const saturate = (color: string, amount = 1): string => {
  return chroma(color).saturate(amount).hex()
}

/**
 * Desaturate a color
 *
 * @param color - Base color
 * @param amount - Amount to desaturate (0-3, default 1)
 * @returns Desaturated color as hex
 */
export const desaturate = (color: string, amount = 1): string => {
  return chroma(color).desaturate(amount).hex()
}

/**
 * Calculate perceptual distance between two colors using DeltaE (LAB color space)
 * Uses CIE76 formula - perceptually uniform distance metric
 *
 * @param color1 - First color
 * @param color2 - Second color
 * @returns Distance value (0 = identical, 100 = very different)
 *          < 1.0 = imperceptible difference
 *          1-2 = perceptible through close observation
 *          2-10 = perceptible at a glance
 *          11-49 = colors are more similar than opposite
 *          100+ = colors are exact opposite
 */
export const colorDistance = (color1: string, color2: string): number => {
  return chroma.deltaE(color1, color2)
}
