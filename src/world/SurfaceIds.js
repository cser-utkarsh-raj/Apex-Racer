/**
 * Surface material ids shared by the tile builder and the detail shader.
 * Kept dependency-free so geometry tests (which stub three) can import it.
 */
export const SURFACE = {
    NATURAL: 0,
    SOIL: 1,
    BUILT: 2,
    ROCK: 3,
    GLASS: 4,
    OTHER: 5,
    ASPHALT: 6,
    PAINT: 7,
    PAVING: 8
};

/** Guess a surface family from a baked Minecraft block colour. */
export function classifySurface(r, g, b, kind = 0) {
    if (kind === 1 || kind === 2) return SURFACE.ASPHALT;
    if (kind === 3) return SURFACE.PAVING;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const sat = max > 0 ? (max - min) / max : 0;

    // Grass, leaves, moss.
    if (g > r * 1.06 && g > b * 1.10) return SURFACE.NATURAL;
    // Soil, sand, timber, terracotta.
    if (r > g * 1.10 && g >= b * 0.92) return SURFACE.SOIL;
    // Glass / water / blue cladding.
    if (b > r * 1.04 && b >= g && sat > 0.12) return SURFACE.GLASS;
    // Bright neutral = concrete, quartz, plaster.
    if (lum > 0.55 && sat < 0.14) return SURFACE.BUILT;
    // Very dark neutral = deep stone / shadowed masonry.
    if (lum < 0.24) return SURFACE.ROCK;
    // Mid neutral = stone, gravel, weathered concrete.
    if (sat < 0.16) return SURFACE.ROCK;
    return SURFACE.OTHER;
}
