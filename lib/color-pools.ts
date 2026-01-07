// Color pools: each color name maps to an array of available hex values
// These are finite pools - when exhausted, users must pick another color

// Allowed color names (canonical lowercase)
export const ALLOWED_COLORS = [
  'blue',
  'red',
  'green',
  'yellow',
  'purple',
  'orange',
  'pink',
  'teal'
] as const

export type AllowedColor = typeof ALLOWED_COLORS[number]

// Raw color pools (may contain duplicates, off-theme colors, and invisible colors)
const RAW_COLOR_POOLS: Record<string, string[]> = {
  blue: [
    '#0000ff', '#0000cd', '#00008b', '#191970', '#1e90ff', '#4169e1', '#4682b4',
    '#483d8b', '#6495ed', '#6a5acd', '#7b68ee', '#87ceeb', '#87cefa', '#add8e6',
    '#afeeee', '#b0c4de', '#b0e0e6', '#c0d6e1', '#d0e0f0', '#e0f0ff', '#e6f3ff',
    '#1e3a8a', '#1e40af', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe',
    '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a', '#172554', '#0f172a', '#0ea5e9',
    '#0284c7', '#0369a1', '#075985', '#0c4a6e', '#082f49', '#0c1221', '#0a1929'
  ],
  red: [
    '#ff0000', '#dc143c', '#b22222', '#8b0000', '#a52a2a', '#cd5c5c', '#f08080',
    '#ff6347', '#ff7f50', '#ff4500', '#ff1493', '#c71585', '#ff69b4', '#ffb6c1',
    '#ffc0cb', '#db7093', '#ff1744', '#d32f2f', '#c62828', '#b71c1c', '#ff5252',
    '#d50000', '#c51162', '#dc2626', '#ef4444', '#f87171', '#fca5a5', '#fecaca',
    '#991b1b', '#7f1d1d', '#b91c1c', '#dc2626', '#ef4444', '#f87171', '#fca5a5'
  ],
  green: [
    '#008000', '#00ff00', '#228b22', '#32cd32', '#6b8e23', '#808000', '#9acd32',
    '#adff2f', '#7cfc00', '#7fff00', '#90ee90', '#98fb98', '#00ff7f', '#00fa9a',
    '#3cb371', '#2e8b57', '#66cdaa', '#40e0d0', '#48d1cc', '#00ced1', '#20b2aa',
    '#16a34a', '#22c55e', '#4ade80', '#86efac', '#bbf7d0', '#dcfce7', '#166534',
    '#15803d', '#16a34a', '#22c55e', '#4ade80', '#86efac', '#bbf7d0', '#dcfce7'
  ],
  yellow: [
    '#ffff00', '#ffd700', '#ffa500', '#ff8c00', '#ffeb3b', '#ffc107', '#ff9800',
    '#fffacd', '#ffffe0', '#fffff0', '#fff8dc', '#fffaf0', '#fff5ee', '#ffe4b5',
    '#ffdead', '#f5deb3', '#deb887', '#d2b48c', '#f0e68c', '#eee8aa', '#bdb76b',
    '#eab308', '#facc15', '#fde047', '#fef08a', '#fef9c3', '#fefce8', '#ca8a04',
    '#a16207', '#854d0e', '#713f12', '#eab308', '#facc15', '#fde047', '#fef08a'
  ],
  purple: [
    '#800080', '#4b0082', '#6a5acd', '#7b68ee', '#9370db', '#8b008b', '#663399',
    '#7f00ff', '#9400d3', '#9932cc', '#ba55d3', '#c71585', '#da70d6', '#dda0dd',
    '#ee82ee', '#ff00ff', '#9c27b0', '#7b1fa2', '#6a1b9a', '#4a148c', '#e1bee7',
    '#a855f7', '#9333ea', '#7e22ce', '#6b21a8', '#581c87', '#3b0764', '#9333ea',
    '#7e22ce', '#6b21a8', '#581c87', '#3b0764', '#a855f7', '#c084fc', '#d8b4fe'
  ],
  orange: [
    '#ff8c00', '#ff7f50', '#ff6347', '#ff4500', '#ffa500', '#ff9800', '#ff6b00',
    '#ff8c00', '#ff7f00', '#ff6600', '#ff5500', '#ff4400', '#ff3300', '#ff2200',
    '#fb923c', '#f97316', '#ea580c', '#c2410c', '#9a3412', '#7c2d12', '#fb923c',
    '#f97316', '#ea580c', '#c2410c', '#9a3412', '#7c2d12', '#fd7e14', '#fd7e14'
  ],
  pink: [
    '#ff1493', '#ff69b4', '#ffb6c1', '#ffc0cb', '#db7093', '#c71585', '#ff1744',
    '#ec4899', '#f472b6', '#f9a8d4', '#fbcfe8', '#fce7f3', '#fdf2f8', '#ec4899',
    '#f472b6', '#f9a8d4', '#fbcfe8', '#fce7f3', '#fdf2f8', '#db2777', '#be185d',
    '#9f1239', '#831843', '#db2777', '#be185d', '#9f1239', '#831843', '#ec4899'
  ],
  teal: [
    '#008080', '#20b2aa', '#48d1cc', '#00ced1', '#40e0d0', '#5f9ea0', '#4caf50',
    '#14b8a6', '#2dd4bf', '#5eead4', '#99f6e4', '#ccfbf1', '#f0fdfa', '#14b8a6',
    '#2dd4bf', '#5eead4', '#99f6e4', '#ccfbf1', '#f0fdfa', '#0d9488', '#0f766e',
    '#115e59', '#134e4a', '#0d9488', '#0f766e', '#115e59', '#134e4a', '#14b8a6'
  ]
}

// Helper: Normalize hex to lowercase and ensure it starts with "#"
export function normalizeHex(hex: string): string {
  if (!hex) return ''
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
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      }
    : null
}

// Helper: Calculate relative luminance (sRGB formula)
// Returns a value between 0 (black) and 1 (white)
function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((val) => {
    val = val / 255
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// Helper: Check if color is visible on white background
// Filters out very light colors (luminance > 0.92) and very dark colors (luminance < 0.08)
export function isVisibleOnWhite(hex: string): boolean {
  const rgb = hexToRgb(hex)
  if (!rgb) return false
  
  const luminance = relativeLuminance(rgb)
  // Keep colors with luminance between 0.08 and 0.92
  // This excludes near-white (luminance > 0.92) and near-black (luminance < 0.08)
  return luminance >= 0.08 && luminance <= 0.92
}

// Helper: Sanitize a color pool
// 1. Normalize all hex values
// 2. Deduplicate using Set
// 3. Filter by visibility on white
export function sanitizePool(pool: string[]): string[] {
  // Step 1: Normalize
  const normalized = pool.map(normalizeHex).filter(Boolean)
  
  // Step 2: Deduplicate
  const unique = Array.from(new Set(normalized))
  
  // Step 3: Filter by visibility
  const visible = unique.filter(isVisibleOnWhite)
  
  return visible
}

// Sanitized color pools (deduplicated, visible on white)
export const COLOR_POOLS: Record<string, string[]> = {}

// Initialize sanitized pools
for (const colorName of ALLOWED_COLORS) {
  const rawPool = RAW_COLOR_POOLS[colorName] || []
  COLOR_POOLS[colorName] = sanitizePool(rawPool)
}

// Development safety checks
if (process.env.NODE_ENV === 'development') {
  console.log('[color-pools] Running development safety checks...')
  
  // Check 1: Each ALLOWED_COLORS key exists in COLOR_POOLS
  for (const colorName of ALLOWED_COLORS) {
    if (!COLOR_POOLS[colorName]) {
      console.error(`[color-pools] ERROR: Missing pool for ${colorName}`)
    }
  }
  
  // Check 2: Each sanitized pool length > 0
  for (const colorName of ALLOWED_COLORS) {
    const pool = COLOR_POOLS[colorName]
    if (!pool || pool.length === 0) {
      console.error(`[color-pools] ERROR: Empty pool for ${colorName}`)
    } else {
      console.log(`[color-pools] ${colorName}: ${pool.length} colors`)
    }
  }
  
  // Check 3: No pool contains "#ffffff" after sanitization
  for (const colorName of ALLOWED_COLORS) {
    const pool = COLOR_POOLS[colorName]
    if (pool && pool.includes('#ffffff')) {
      console.error(`[color-pools] ERROR: Pool ${colorName} contains #ffffff`)
    }
  }
  
  console.log('[color-pools] Safety checks complete')
}

// Get available hex for a color name
export function getAvailableHex(
  colorName: string,
  usedHexes: string[]
): string | null {
  // Canonicalize color name
  const canonical = String(colorName ?? '').trim().toLowerCase()
  
  // Validate against ALLOWED_COLORS
  if (!ALLOWED_COLORS.includes(canonical as AllowedColor)) {
    return null
  }
  
  const pool = COLOR_POOLS[canonical]
  if (!pool || pool.length === 0) {
    return null
  }
  
  // Normalize used hexes
  const normalizedUsed = usedHexes.map(normalizeHex).filter(Boolean)
  
  // Find first hex in pool not in used hexes
  for (const hex of pool) {
    const normalized = normalizeHex(hex)
    if (!normalizedUsed.includes(normalized)) {
      return normalized
    }
  }
  
  return null // Pool exhausted
}
