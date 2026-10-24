import { TICKS_PER_SECOND } from "./constants";

// Tag und Nacht folgen der Spielzeit (world.tick), damit sie mit dem
// Spielstand gespeichert werden. Die Simulation braucht sie fuer Solarstrom,
// die Beleuchtung in der Nacht und naechtliche Angriffe; die Darstellung
// (render3d/environment.ts) fuer Licht und Himmel.

/** Laenge von Tag und Nacht in Sekunden Spielzeit. Die Nacht ist kuerzer und hell genug zum Bauen. */
export const DAY_SECONDS = 12 * 60;
export const NIGHT_SECONDS = 4 * 60;
export const CYCLE_SECONDS = DAY_SECONDS + NIGHT_SECONDS;
/** Ein neues Spiel beginnt am Vormittag. */
export const START_SECONDS = DAY_SECONDS * 0.3;

/** Phase 0..1: 0 Sonnenaufgang, 0.75 Sonnenuntergang, danach Nacht. */
export function phaseAt(gameSeconds: number): number {
  return ((((gameSeconds + START_SECONDS) % CYCLE_SECONDS) + CYCLE_SECONDS) % CYCLE_SECONDS) / CYCLE_SECONDS;
}

export function dayPhase(tick: number): number {
  return phaseAt(tick / TICKS_PER_SECOND);
}

/** Sonnenwinkel 0..PI am Tag, PI..2PI in der (kuerzeren) Nacht. */
export function sunAngle(phase: number): number {
  const p = phase * CYCLE_SECONDS;
  return p < DAY_SECONDS ? (Math.PI * p) / DAY_SECONDS : Math.PI + (Math.PI * (p - DAY_SECONDS)) / NIGHT_SECONDS;
}

export function isNight(tick: number): boolean {
  return dayPhase(tick) * CYCLE_SECONDS >= DAY_SECONDS;
}

/**
 * Wie stark die Sonne scheint (0..1): mittags voll, morgens und abends weniger,
 * nachts gar nicht. Bestimmt die Leistung der Solarfelder.
 */
export function sunlight(tick: number): number {
  const e = Math.sin(sunAngle(dayPhase(tick)));
  if (e <= 0) return 0;
  // Schon bei halber Sonnenhoehe fast voll, damit der Tag nicht nur aus Mittag besteht.
  return Math.min(1, e / 0.6);
}

/** Sekunden bis zum naechsten Wechsel zwischen Tag und Nacht (fuer die Anzeige). */
export function secondsToSwitch(tick: number): number {
  const p = dayPhase(tick) * CYCLE_SECONDS;
  return p < DAY_SECONDS ? DAY_SECONDS - p : CYCLE_SECONDS - p;
}
