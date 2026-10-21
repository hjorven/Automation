// Simulations-Konstanten. Alle Zeiten in Ticks.

export const TICKS_PER_SECOND = 20;
export const TICK_MS = 1000 / TICKS_PER_SECOND;

/** Strecke pro Tick in Feldern (0.1 -> 2 Felder/Sekunde). */
export const BELT_SPEED = 0.1;
/** Mindestabstand zwischen zwei Items auf einem Band (in Feldern). */
export const ITEM_SPACING = 0.34;

/** Ein Bohrer foerdert alle 40 Ticks ein Erz (0,5/s). */
export const EXTRACT_TICKS = 40;
