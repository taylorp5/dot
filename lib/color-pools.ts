// Color pools: each color name maps to an array of available hex values
// These are finite pools - when exhausted, users must pick another color

export const COLOR_POOLS: Record<string, string[]> = {
  'Blue': [
    '#0000ff', '#0000cd', '#00008b', '#191970', '#1e90ff', '#4169e1', '#4682b4',
    '#483d8b', '#6495ed', '#6a5acd', '#7b68ee', '#87ceeb', '#87cefa', '#add8e6',
    '#afeeee', '#b0c4de', '#b0e0e6', '#b0e0e6', '#c0d6e1', '#d0e0f0', '#e0f0ff',
    '#e6f3ff', '#ecf6ff', '#f0f8ff', '#f5faff', '#fafcff', '#ffffff', '#f5f5f5',
    '#e8e8e8', '#dcdcdc', '#d0d0d0', '#c4c4c4', '#b8b8b8', '#acacac', '#a0a0a0',
    '#949494', '#888888', '#7c7c7c', '#707070', '#646464', '#585858', '#4c4c4c',
    '#404040', '#343434', '#282828', '#1c1c1c', '#101010', '#050505', '#000000',
    '#0a0a1e', '#14143c', '#1e1e5a', '#282878', '#323296', '#3c3cb4', '#4646d2'
  ],
  'Red': [
    '#ff0000', '#dc143c', '#b22222', '#8b0000', '#a52a2a', '#cd5c5c', '#f08080',
    '#ff6347', '#ff7f50', '#ff4500', '#ff1493', '#c71585', '#ff69b4', '#ffb6c1',
    '#ffc0cb', '#db7093', '#ff1744', '#d32f2f', '#c62828', '#b71c1c', '#ff5252',
    '#ff1744', '#d50000', '#c51162', '#aa00ff', '#b388ff', '#7c4dff', '#651fff',
    '#6200ea', '#3f51b5', '#2196f3', '#00bcd4', '#009688', '#4caf50', '#8bc34a',
    '#cddc39', '#ffeb3b', '#ffc107', '#ff9800', '#ff5722', '#795548', '#607d8b',
    '#ff1744', '#d32f2f', '#c62828', '#b71c1c', '#ff5252', '#ff1744', '#d50000',
    '#c51162', '#aa00ff', '#b388ff', '#7c4dff', '#651fff'
  ],
  'Green': [
    '#008000', '#00ff00', '#228b22', '#32cd32', '#6b8e23', '#808000', '#9acd32',
    '#adff2f', '#7cfc00', '#7fff00', '#90ee90', '#98fb98', '#00ff7f', '#00fa9a',
    '#3cb371', '#2e8b57', '#66cdaa', '#40e0d0', '#48d1cc', '#00ced1', '#20b2aa',
    '#5f9ea0', '#4caf50', '#388e3c', '#2e7d32', '#1b5e20', '#66bb6a', '#81c784',
    '#a5d6a7', '#c8e6c9', '#e8f5e9', '#00e676', '#00c853', '#00b248', '#009624',
    '#087f23', '#0d5d20', '#12401d', '#17231a', '#1c2617', '#212914', '#262c11',
    '#2f2f0e', '#34320b', '#393508', '#3e3805', '#433b02', '#483e00', '#4d4100',
    '#524400', '#574700', '#5c4a00', '#614d00', '#665000', '#6b5300', '#705600'
  ],
  'Yellow': [
    '#ffff00', '#ffd700', '#ffa500', '#ff8c00', '#ffeb3b', '#ffc107', '#ff9800',
    '#fffacd', '#ffffe0', '#fffff0', '#fff8dc', '#fffaf0', '#fff5ee', '#ffe4b5',
    '#ffdead', '#f5deb3', '#deb887', '#d2b48c', '#f0e68c', '#eee8aa', '#bdb76b',
    '#f9f900', '#f5f500', '#f0f000', '#ebeb00', '#e6e600', '#e1e100', '#dcdc00',
    '#d7d700', '#d2d200', '#cdcd00', '#c8c800', '#c3c300', '#bebe00', '#b9b900',
    '#b4b400', '#afaf00', '#aaaa00', '#a5a500', '#a0a000', '#9b9b00', '#969600',
    '#919100', '#8c8c00', '#878700', '#828200', '#7d7d00', '#787800', '#737300',
    '#6e6e00', '#696900', '#646400', '#5f5f00', '#5a5a00', '#555500', '#505000'
  ],
  'Purple': [
    '#800080', '#4b0082', '#6a5acd', '#7b68ee', '#9370db', '#8b008b', '#663399',
    '#7f00ff', '#9400d3', '#9932cc', '#ba55d3', '#c71585', '#da70d6', '#dda0dd',
    '#ee82ee', '#ff00ff', '#9c27b0', '#7b1fa2', '#6a1b9a', '#4a148c', '#e1bee7',
    '#ce93d8', '#ba68c8', '#ab47bc', '#9c27b0', '#8e24aa', '#7b1fa2', '#6a1b9a',
    '#4a148c', '#38006b', '#4a0e4e', '#5c1a5c', '#6e266a', '#803278', '#923e86',
    '#a44a94', '#b656a2', '#c862b0', '#da6ebe', '#ec7acc', '#fe86da', '#ff92e8',
    '#ff9ef6', '#ffaaff', '#ffb6ff', '#ffc2ff', '#ffceff', '#ffdaff', '#ffe6ff',
    '#fff2ff', '#ffffff', '#faf5ff', '#f5ebff', '#f0e1ff', '#ebd7ff', '#e6cdff'
  ]
}

// Normalize hex to lowercase for consistency
export function normalizeHex(hex: string): string {
  return hex.toLowerCase()
}

// Get available hex for a color name
export function getAvailableHex(
  colorName: string,
  usedHexes: string[]
): string | null {
  const pool = COLOR_POOLS[colorName]
  if (!pool) {
    return null // Color name not in pool
  }

  const normalizedUsed = usedHexes.map(normalizeHex)
  
  for (const hex of pool) {
    const normalized = normalizeHex(hex)
    if (!normalizedUsed.includes(normalized)) {
      return normalized
    }
  }

  return null // Pool exhausted
}

