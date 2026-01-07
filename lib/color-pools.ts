// Color pools: each color name maps to an array of available hex values
// These are finite pools - when exhausted, users must pick another color

// Helper: Normalize hex to lowercase and ensure starts with "#"
export function normalizeHex(hex: string): string {
  const trimmed = hex.trim()
  if (!trimmed.startsWith('#')) {
    return '#' + trimmed.toLowerCase()
  }
  return trimmed.toLowerCase()
}

// Helper: Convert hex to RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = normalizeHex(hex)
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(normalized)
  if (!result) {
    return null
  }
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  }
}

// Helper: Calculate relative luminance (sRGB formula)
// Returns value between 0 (black) and 1 (white)
function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  const [r, g, b] = [rgb.r / 255, rgb.g / 255, rgb.b / 255]
  
  const [rs, gs, bs] = [
    r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4),
    g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4),
    b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4)
  ]
  
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

// Helper: Check if color is visible on white background
// Returns true if luminance is between 0.08 and 0.92
function isVisibleOnWhite(hex: string): boolean {
  const rgb = hexToRgb(hex)
  if (!rgb) return false
  
  const luminance = relativeLuminance(rgb)
  // Filter out very light colors (luminance > 0.92) and very dark colors (luminance < 0.08)
  return luminance >= 0.08 && luminance <= 0.92
}

// Helper: Calculate brightness using weighted RGB values
// Returns value between 0 (black) and 255 (white)
function calculateBrightness(hex: string): number | null {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  
  // brightness = 0.299*r + 0.587*g + 0.114*b
  return 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b
}

// Helper: Check if color is not too light or too dark
// Rejects if brightness > 235 (too light) or brightness < 15 (too dark)
function hasValidBrightness(hex: string): boolean {
  const brightness = calculateBrightness(hex)
  if (brightness === null) return false
  
  return brightness >= 15 && brightness <= 235
}

// Helper: Sanitize a color pool
// 1. Normalize all hex values
// 2. Deduplicate via Set
// 3. Filter by visibility on white
// 4. Filter by valid brightness (not too light or too dark)
function sanitizePool(pool: string[]): string[] {
  const normalized = pool.map(normalizeHex)
  const deduped = Array.from(new Set(normalized))
  const visible = deduped.filter(isVisibleOnWhite)
  const validBrightness = visible.filter(hasValidBrightness)
  return validBrightness
}

// Raw color pools (before sanitization)
// Keys are lowercase canonical names
const RAW_COLOR_POOLS: Record<string, string[]> = {
  blue: [
    '#0000ff', '#0000cd', '#00008b', '#191970', '#1e90ff', '#4169e1', '#4682b4',
    '#483d8b', '#6495ed', '#6a5acd', '#7b68ee', '#87ceeb', '#87cefa', '#add8e6',
    '#afeeee', '#b0c4de', '#b0e0e6', '#c0d6e1', '#d0e0f0', '#e0f0ff', '#e6f3ff',
    '#1a237e', '#283593', '#303f9f', '#3949ab', '#3f51b5', '#5c6bc0', '#7986cb',
    '#9fa8da', '#c5cae9', '#e8eaf6', '#0d47a1', '#1565c0', '#1976d2', '#1e88e5',
    '#2196f3', '#42a5f5', '#64b5f6', '#90caf9', '#bbdefb', '#e3f2fd', '#0277bd',
    '#0288d1', '#039be5', '#03a9f4', '#29b6f6', '#4fc3f7', '#81d4fa', '#b3e5fc'
  ],
  red: [
    '#ff0000', '#dc143c', '#b22222', '#8b0000', '#a52a2a', '#cd5c5c', '#f08080',
    '#ff6347', '#ff7f50', '#ff4500', '#ff1493', '#c71585', '#ff69b4', '#ffb6c1',
    '#ffc0cb', '#db7093', '#ff1744', '#d32f2f', '#c62828', '#b71c1c', '#ff5252',
    '#d50000', '#c51162', '#d81b60', '#e91e63', '#ec407a', '#f06292', '#f48fb1',
    '#f8bbd0', '#fce4ec', '#b71c1c', '#c62828', '#d32f2f', '#e53935', '#ef5350',
    '#e57373', '#ef9a9a', '#ffcdd2', '#ffebee', '#c62828', '#d32f2f', '#e53935'
  ],
  green: [
    '#008000', '#00ff00', '#228b22', '#32cd32', '#6b8e23', '#808000', '#9acd32',
    '#adff2f', '#7cfc00', '#7fff00', '#90ee90', '#98fb98', '#00ff7f', '#00fa9a',
    '#3cb371', '#2e8b57', '#66cdaa', '#40e0d0', '#48d1cc', '#00ced1', '#20b2aa',
    '#5f9ea0', '#4caf50', '#388e3c', '#2e7d32', '#1b5e20', '#66bb6a', '#81c784',
    '#a5d6a7', '#c8e6c9', '#e8f5e9', '#00e676', '#00c853', '#00b248', '#009624',
    '#087f23', '#0d5d20', '#12401d', '#1b5e20', '#2e7d32', '#388e3c', '#43a047',
    '#4caf50', '#66bb6a', '#81c784', '#a5d6a7', '#c8e6c9', '#e8f5e9'
  ],
  yellow: [
    '#ffff00', '#ffd700', '#ffa500', '#ff8c00', '#ffeb3b', '#ffc107', '#ff9800',
    '#fffacd', '#ffffe0', '#fffff0', '#fff8dc', '#fffaf0', '#fff5ee', '#ffe4b5',
    '#ffdead', '#f5deb3', '#deb887', '#d2b48c', '#f0e68c', '#eee8aa', '#bdb76b',
    '#f9f900', '#f5f500', '#f0f000', '#ebeb00', '#e6e600', '#e1e100', '#dcdc00',
    '#d7d700', '#d2d200', '#cdcd00', '#c8c800', '#c3c300', '#bebe00', '#b9b900',
    '#b4b400', '#afaf00', '#aaaa00', '#a5a500', '#a0a000', '#9b9b00', '#969600',
    '#fbc02d', '#f9a825', '#f57f17', '#fdd835', '#fbc02d', '#f9a825', '#f57f17'
  ],
  purple: [
    '#800080', '#4b0082', '#6a5acd', '#7b68ee', '#9370db', '#8b008b', '#663399',
    '#7f00ff', '#9400d3', '#9932cc', '#ba55d3', '#c71585', '#da70d6', '#dda0dd',
    '#ee82ee', '#ff00ff', '#9c27b0', '#7b1fa2', '#6a1b9a', '#4a148c', '#e1bee7',
    '#ce93d8', '#ba68c8', '#ab47bc', '#8e24aa', '#7b1fa2', '#6a1b9a', '#4a148c',
    '#38006b', '#6a1b9a', '#7b1fa2', '#8e24aa', '#9c27b0', '#ab47bc', '#ba68c8',
    '#ce93d8', '#e1bee7', '#f3e5f5', '#e1bee7', '#ce93d8', '#ba68c8', '#ab47bc'
  ],
  orange: [
    '#ff8c00', '#ff7f50', '#ff6347', '#ff4500', '#ffa500', '#ff9800', '#ff6f00',
    '#ff5722', '#ff7043', '#ff8a65', '#ffab91', '#ffccbc', '#ffe0b2', '#fff3e0',
    '#ff6f00', '#f57c00', '#ef6c00', '#e65100', '#ff6f00', '#ff8f00', '#ffa000',
    '#ffb300', '#ffc107', '#ffca28', '#ffd54f', '#ffe082', '#ffecb3', '#fff8e1',
    '#ff6d00', '#ff8f00', '#ffa000', '#ffb300', '#ffc107', '#ffca28', '#ffd54f',
    '#ffe082', '#ffecb3', '#fff8e1', '#ff9800', '#ff6f00', '#f57c00', '#ef6c00'
  ],
  pink: [
    '#ff1493', '#ff69b4', '#ffb6c1', '#ffc0cb', '#ff69b4', '#ff1493', '#c71585',
    '#db7093', '#da70d6', '#dda0dd', '#ee82ee', '#ff00ff', '#e91e63', '#ec407a',
    '#f06292', '#f48fb1', '#f8bbd0', '#fce4ec', '#c2185b', '#ad1457', '#880e4f',
    '#e91e63', '#ec407a', '#f06292', '#f48fb1', '#f8bbd0', '#fce4ec', '#f50057',
    '#c51162', '#d81b60', '#e91e63', '#ec407a', '#f06292', '#f48fb1', '#f8bbd0',
    '#fce4ec', '#ff4081', '#f50057', '#c51162', '#d81b60', '#e91e63', '#ec407a'
  ],
  teal: [
    '#008080', '#20b2aa', '#48d1cc', '#40e0d0', '#00ced1', '#5f9ea0', '#66cdaa',
    '#7fffd4', '#b2dfdb', '#80cbc4', '#4db6ac', '#26a69a', '#009688', '#00897b',
    '#00796b', '#00695c', '#004d40', '#26a69a', '#4db6ac', '#80cbc4', '#b2dfdb',
    '#e0f2f1', '#b2dfdb', '#80cbc4', '#4db6ac', '#26a69a', '#009688', '#00897b',
    '#00796b', '#00695c', '#004d40', '#1de9b6', '#00bfa5', '#00acc1', '#0097a7',
    '#00838f', '#006064', '#00acc1', '#0097a7', '#00838f', '#006064', '#004d40'
  ]
}

// Sanitized color pools (normalized, deduplicated, filtered for visibility)
export const COLOR_POOLS: Record<string, string[]> = Object.fromEntries(
  Object.entries(RAW_COLOR_POOLS).map(([key, pool]) => [key, sanitizePool(pool)])
)

// Allowed color names (canonical lowercase)
export const ALLOWED_COLORS = ['blue', 'red', 'green', 'yellow', 'purple', 'orange', 'pink', 'teal'] as const

// Get available hex for a color name
export function getAvailableHex(
  colorName: string,
  usedHexes: string[]
): string | null {
  // Canonicalize color name
  const canonical = String(colorName ?? '').trim().toLowerCase()
  
  // Validate against allowed colors
  if (!ALLOWED_COLORS.includes(canonical as any)) {
    return null
  }
  
  const pool = COLOR_POOLS[canonical]
  if (!pool || pool.length === 0) {
    return null
  }

  // Normalize used hexes
  const normalizedUsed = usedHexes.map(normalizeHex).filter(Boolean)
  
  // Find first available hex in sanitized pool
  // Also validate brightness to prevent near-white/near-black colors
  for (const hex of pool) {
    const normalized = normalizeHex(hex)
    if (!normalizedUsed.includes(normalized) && hasValidBrightness(normalized)) {
      return normalized
    }
  }

  return null // Pool exhausted
}

// Development safety checks
if (process.env.NODE_ENV === 'development') {
  // Verify each ALLOWED_COLORS key exists in COLOR_POOLS
  for (const color of ALLOWED_COLORS) {
    if (!COLOR_POOLS[color]) {
      console.error(`[color-pools] Missing pool for color: ${color}`)
    } else if (COLOR_POOLS[color].length === 0) {
      console.error(`[color-pools] Empty pool for color: ${color}`)
    }
  }
  
  // Verify no pool contains "#ffffff" after sanitization
  for (const [color, pool] of Object.entries(COLOR_POOLS)) {
    if (pool.includes('#ffffff') || pool.includes('#FFFFFF')) {
      console.error(`[color-pools] Pool "${color}" contains white (#ffffff) after sanitization`)
    }
  }
  
  // Log pool sizes
  console.log('[color-pools] Sanitized pool sizes:', 
    Object.fromEntries(
      Object.entries(COLOR_POOLS).map(([color, pool]) => [color, pool.length])
    )
  )
}
