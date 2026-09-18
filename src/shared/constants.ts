/**
 * Match Pop Multiplayer - Core Constants & Balancing
 */

export const GRID_ROWS = 9;
export const GRID_COLS = 9;

export const CANDY_COLORS_COUNT = 6;

// Scoring Constants
export const SCORE_BASE_TILE = 20; // Per tile matched (3 = 60, 4 = 80, 5 = 100)
export const SCORE_STRIPED_TILE = 60; // Per tile cleared by stripe beam
export const SCORE_WRAPPED_TILE = 100; // Per tile cleared by wrapped bomb
export const SCORE_COLOR_BOMB_TILE = 200; // Per tile cleared by color bomb

// Super-Combo Direct Bonuses
export const SCORE_COMBO_STRIPED_STRIPED = 1000;
export const SCORE_COMBO_STRIPED_WRAPPED = 2500;
export const SCORE_COMBO_WRAPPED_WRAPPED = 3500;
export const SCORE_COMBO_COLOR_BOMB_STRIPED = 3000;
export const SCORE_COMBO_COLOR_BOMB_WRAPPED = 3500;
export const SCORE_COMBO_COLOR_BOMB_COLOR_BOMB = 5000;

// Turn & Timing Defaults (ms)
export const DEFAULT_TURN_DURATION_MS = 20000; // 20s
export const RECONNECT_GRACE_PERIOD_MS = 45000; // 45s
