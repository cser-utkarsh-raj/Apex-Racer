/**
 * Compatibility shim.
 *
 * The procedural streaming engine now lives at src/world/WorldAssemblerV3.js.
 * This file is retained so older imports keep working; new code should import
 * the canonical module directly.
 */
export { WorldAssemblerV3 } from '../WorldAssemblerV3.js';
