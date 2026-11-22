import { CONFIG } from './config';

/** Accuracy a player of this rating typically reaches on chess.com (fitted on public games). */
export function expectedAccuracy(rating: number): number {
  const { slope, offset } = CONFIG.rating;
  return slope * Math.log(Math.max(rating, 1)) + offset;
}

/**
 * Approximate rating shown for this game. With the player's Elo: their rating, moved up or down
 * by how far the accuracy is above or below what that rating usually scores (shrunk, since one
 * game is noisy). Without Elo: the rating whose expected accuracy equals this one.
 */
export function estimateGameRating(accuracy: number | null, elo?: number): number | null {
  if (accuracy === null || !Number.isFinite(accuracy)) return null;
  const { slope, offset, shrink, min, max } = CONFIG.rating;
  let r: number;
  if (elo && elo > 0) {
    r = elo * Math.exp((shrink * (accuracy - expectedAccuracy(elo))) / slope);
  } else {
    r = Math.exp((accuracy - offset) / slope);
  }
  return Math.round(Math.min(max, Math.max(min, r)) / 50) * 50;
}
