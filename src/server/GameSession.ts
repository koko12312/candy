import { Room, RoomPlayer } from './Room';
import { Match3Engine } from '../shared/engine/Match3Engine';
import { PRNG } from '../shared/prng';
import {
  Coordinate,
  EngineEvent,
  GameOverPayload,
  GameStartPayload,
  GameSyncStatePayload,
  MoveResultPayload,
  ReshufflePayload,
  Tile,
  TurnChangePayload,
  TurnTimeoutPayload
} from '../shared/types';
import { DEFAULT_TURN_DURATION_MS } from '../shared/constants';

export interface GameSessionCallbacks {
  onGameStart: (payload: GameStartPayload) => void;
  onMoveResult: (payload: MoveResultPayload) => void;
  onMoveRejected?: (payload: MoveResultPayload) => void;
  onTurnChange: (payload: TurnChangePayload) => void;
  onTurnTimeout: (payload: TurnTimeoutPayload) => void;
  onReshuffle: (payload: ReshufflePayload) => void;
  onGameOver: (payload: GameOverPayload) => void;
}

export class GameSession {
  public readonly room: Room;
  private engine: Match3Engine;
  private prng: PRNG;
  private seed: number;

  public board: Tile[][] = [];
  public activePlayerId = '';
  public activeSlot = 0;
  public currentTurnIndex = 0; // Index into active connected players list
  public round = 1;
  public turnStartedAt = 0;
  public turnExpiresAt = 0;
  public turnDurationMs: number;

  private turnTimer: NodeJS.Timeout | null = null;
  private animationTimer: NodeJS.Timeout | null = null;
  public isEvaluatingMove = false;
  private callbacks: GameSessionCallbacks;

  constructor(room: Room, callbacks: GameSessionCallbacks, customSeed?: number) {
    this.room = room;
    this.callbacks = callbacks;
    this.engine = new Match3Engine();
    this.seed = customSeed ?? Math.floor(Math.random() * 1000000);
    this.prng = new PRNG(this.seed);
    this.turnDurationMs = (this.room.settings.turnDurationSeconds || 20) * 1000;
  }

  /**
   * Returns list of currently active playing participants in slot order.
   */
  public getActivePlayers(): RoomPlayer[] {
    return this.room.players.filter((p) => p.isConnected);
  }

  /**
   * Gets the player whose turn it currently is.
   */
  public getCurrentPlayer(): RoomPlayer | null {
    if (!this.activePlayerId) return null;
    return this.room.players.find((p) => p.playerId === this.activePlayerId) || null;
  }

  /**
   * Initializes board, starts the game session and the first turn.
   */
  public start(): void {
    this.board = this.engine.createInitialBoard(this.seed);
    this.round = 1;

    const connected = this.getActivePlayers();
    if (connected.length === 0) {
      throw new Error('Cannot start GameSession with 0 connected players');
    }

    const firstPlayer = connected[0];
    this.activePlayerId = firstPlayer.playerId;
    this.activeSlot = firstPlayer.slot;
    this.currentTurnIndex = 0;

    this.startTurnCountdown();

    this.callbacks.onGameStart({
      seed: this.seed,
      board: Match3Engine.cloneBoard(this.board),
      activePlayerId: this.activePlayerId,
      round: this.round,
      turnExpiresAt: this.turnExpiresAt,
      turnDurationMs: this.turnDurationMs
    });
  }

  /**
   * Starts turn timer countdown for current player.
   */
  private startTurnCountdown(): void {
    this.clearTurnTimer();
    this.turnStartedAt = Date.now();
    this.turnExpiresAt = this.turnStartedAt + this.turnDurationMs;

    this.turnTimer = setTimeout(() => {
      this.handleTurnTimeout();
    }, this.turnDurationMs);
  }

  /**
   * Pauses turn timer during move and cascade animations.
   */
  public pauseTimer(): void {
    this.clearTurnTimer();
  }

  private clearTurnTimer(): void {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
  }

  private clearAnimationTimer(): void {
    if (this.animationTimer) {
      clearTimeout(this.animationTimer);
      this.animationTimer = null;
    }
  }

  /**
   * Handles turn expiration when active player fails to make a move.
   */
  public handleTurnTimeout(): void {
    this.clearTurnTimer();
    const currentP = this.getCurrentPlayer();
    if (!currentP) return;

    currentP.consecutiveTimeouts++;

    const timedOutId = currentP.playerId;
    // Advance to next player
    const wrapped = this.advanceTurn();
    const nextP = this.getCurrentPlayer();

    this.callbacks.onTurnTimeout({
      timedOutPlayerId: timedOutId,
      nextPlayerId: nextP ? nextP.playerId : ''
    });

    if (wrapped && this.round > this.room.settings.maxRounds) {
      this.triggerGameOver();
      return;
    }

    if (nextP && this.room.status === 'IN_GAME') {
      this.emitTurnChange(nextP);
    }
  }

  /**
   * Executes a player move authoritatively.
   */
  public handleMove(playerId: string, from: Coordinate, to: Coordinate): MoveResultPayload {
    const currentP = this.getCurrentPlayer();

    // Verification 1: In-game status
    if (this.room.status !== 'IN_GAME') {
      const rejectPayload: MoveResultPayload = {
        valid: false,
        playerId,
        from,
        to,
        reason: 'GAME_NOT_ACTIVE',
        events: [],
        scoreAwarded: 0,
        playerTotalScore: 0,
        boardAfterSettled: Match3Engine.cloneBoard(this.board),
        needsReshuffle: false
      };
      if (this.callbacks.onMoveRejected) {
        this.callbacks.onMoveRejected(rejectPayload);
      }
      return rejectPayload;
    }

    // Verification 2: Active player check
    if (!currentP || currentP.playerId !== playerId) {
      const rejectPayload: MoveResultPayload = {
        valid: false,
        playerId,
        from,
        to,
        reason: 'NOT_YOUR_TURN',
        events: [],
        scoreAwarded: 0,
        playerTotalScore: currentP ? currentP.score : 0,
        boardAfterSettled: Match3Engine.cloneBoard(this.board),
        needsReshuffle: false
      };
      if (this.callbacks.onMoveRejected) {
        this.callbacks.onMoveRejected(rejectPayload);
      }
      return rejectPayload;
    }

    // Verification 3: Concurrency lockout check
    if (this.isEvaluatingMove) {
      const rejectPayload: MoveResultPayload = {
        valid: false,
        playerId,
        from,
        to,
        reason: 'EVALUATING',
        events: [],
        scoreAwarded: 0,
        playerTotalScore: currentP.score,
        boardAfterSettled: Match3Engine.cloneBoard(this.board),
        needsReshuffle: false
      };
      if (this.callbacks.onMoveRejected) {
        this.callbacks.onMoveRejected(rejectPayload);
      }
      return rejectPayload;
    }

    this.isEvaluatingMove = true;
    this.pauseTimer();

    let scheduledAsync = false;

    try {
      // Execute move via Match3Engine
      const resolution = this.engine.resolveMove(this.board, { playerId, from, to }, this.prng);

      if (!resolution.valid) {
        this.isEvaluatingMove = false;
        const elapsed = Date.now() - this.turnStartedAt;
        const remainingMs = Math.max(1000, this.turnDurationMs - elapsed);
        this.turnExpiresAt = Date.now() + remainingMs;
        this.turnTimer = setTimeout(() => {
          this.handleTurnTimeout();
        }, remainingMs);

        const resultPayload: MoveResultPayload = {
          valid: false,
          playerId,
          from,
          to,
          reason: 'INVALID_SWAP',
          events: resolution.events,
          scoreAwarded: 0,
          playerTotalScore: currentP.score,
          boardAfterSettled: Match3Engine.cloneBoard(this.board),
          needsReshuffle: false
        };

        this.callbacks.onMoveResult(resultPayload);
        return resultPayload;
      }

      // Valid move! Update board and score
      this.board = resolution.finalBoard;
      currentP.score += resolution.turnScore;
      currentP.consecutiveTimeouts = 0; // Reset consecutive timeouts on successful move

      // Check if board has 0 valid moves remaining -> trigger Reshuffle
      let needsReshuffle = false;
      if (!this.engine.hasValidMoves(this.board)) {
        needsReshuffle = true;
        const reshuffled = this.engine.reshuffleBoard(this.board, this.prng);
        this.board = reshuffled.newBoard;
        resolution.events.push(...reshuffled.events);
        this.callbacks.onReshuffle({
          reason: 'NO_VALID_MOVES',
          newBoard: Match3Engine.cloneBoard(this.board),
          events: reshuffled.events
        });
      }

      const movePayload: MoveResultPayload = {
        valid: true,
        playerId,
        from,
        to,
        events: resolution.events,
        scoreAwarded: resolution.turnScore,
        playerTotalScore: currentP.score,
        boardAfterSettled: Match3Engine.cloneBoard(this.board),
        needsReshuffle
      };

      // Emit game:move_result immediately
      this.callbacks.onMoveResult(movePayload);

      // Authentic animation settling delay based on cascade steps
      const cascadeSteps = Math.max(
        1,
        resolution.events.filter((e) => e.type === 'CASCADE_STEP_COMPLETE').length
      );
      const animDelay = Math.min(3000, cascadeSteps * 400);

      scheduledAsync = true;
      this.clearAnimationTimer();

      this.animationTimer = setTimeout(() => {
        this.animationTimer = null;
        this.isEvaluatingMove = false;

        if (this.room.status !== 'IN_GAME') return;

        const wrapped = this.advanceTurn();
        if (wrapped && this.round > this.room.settings.maxRounds) {
          this.triggerGameOver();
          return;
        }

        const nextP = this.getCurrentPlayer();
        if (nextP && this.room.status === 'IN_GAME') {
          this.emitTurnChange(nextP);
        }
      }, animDelay);

      return movePayload;
    } finally {
      if (!scheduledAsync) {
        this.isEvaluatingMove = false;
      }
    }
  }

  /**
   * Advances turn to the next connected player in cyclic slot order (0 -> 1 -> 2 -> 3 -> 0).
   * Increments round when the cycle wraps around.
   * Returns true if round wrapped.
   */
  public advanceTurn(): boolean {
    const connected = this.getActivePlayers();
    if (connected.length === 0) return false;

    // Find connected players with slot > current activeSlot
    const higherSlotPlayers = connected.filter((p) => p.slot > this.activeSlot);

    let nextPlayer: RoomPlayer;
    let wrapped = false;

    if (higherSlotPlayers.length > 0) {
      nextPlayer = higherSlotPlayers[0];
    } else {
      nextPlayer = connected[0];
      wrapped = true;
      this.round++;
    }

    this.activePlayerId = nextPlayer.playerId;
    this.activeSlot = nextPlayer.slot;
    this.currentTurnIndex = connected.findIndex((p) => p.playerId === this.activePlayerId);
    if (this.currentTurnIndex < 0) this.currentTurnIndex = 0;

    return wrapped;
  }

  /**
   * Broadcasts turn change and restarts the authoritative turn timer.
   */
  private emitTurnChange(player: RoomPlayer): void {
    this.startTurnCountdown();

    this.callbacks.onTurnChange({
      activePlayerId: player.playerId,
      slot: player.slot,
      round: this.round,
      turnExpiresAt: this.turnExpiresAt,
      turnDurationMs: this.turnDurationMs,
      serverTimestamp: Date.now()
    });
  }

  /**
   * Called if a player disconnects or forfeits mid-game.
   * @param playerId The player ID that dropped or left.
   * @param isForfeit True only if player explicitly forfeits/leaves OR 45s grace timer expired.
   */
  public handlePlayerDropped(playerId: string, isForfeit = false): void {
    const active = this.getActivePlayers();
    if (active.length === 0) {
      this.triggerGameOver();
      return;
    }

    if (isForfeit && active.length <= 1 && this.room.players.length >= 2) {
      // If only 1 player remains in multiplayer after forfeit or grace period expiration, declare winner
      this.triggerGameOver();
      return;
    }

    if (playerId === this.activePlayerId) {
      if (!this.animationTimer) {
        // If dropped player was active and no animation is running, pass turn immediately
        this.pauseTimer();
        this.advanceTurn();
        const nextP = this.getCurrentPlayer();
        if (nextP && this.room.status === 'IN_GAME') {
          this.emitTurnChange(nextP);
        }
      }
    }
  }

  /**
   * Triggers game over, compiles rankings and emits results.
   */
  public triggerGameOver(): void {
    if (this.room.status === 'GAME_OVER') return;
    this.clearTurnTimer();
    this.clearAnimationTimer();
    this.isEvaluatingMove = false;
    this.room.endGame();

    // Sort players by score descending
    const sorted = [...this.room.players].sort((a, b) => b.score - a.score);
    const rankings = sorted.map((p, idx) => ({
      playerId: p.playerId,
      name: p.name,
      avatarId: p.avatarId,
      finalScore: p.score,
      rank: idx + 1
    }));

    const active = this.getActivePlayers();
    let winnerPlayerId = '';
    if (active.length === 1 && this.room.players.length >= 2) {
      winnerPlayerId = active[0].playerId;
    } else if (rankings.length > 0) {
      winnerPlayerId = rankings[0].playerId;
    }

    this.callbacks.onGameOver({
      winnerPlayerId,
      rankings
    });
  }

  /**
   * Constructs a full synchronized state for reconnecting clients.
   */
  public getSyncState(): GameSyncStatePayload {
    return {
      roomCode: this.room.roomCode,
      status: this.room.status,
      board: Match3Engine.cloneBoard(this.board),
      players: this.room.toDTO().players,
      activePlayerId: this.activePlayerId,
      round: this.round,
      turnExpiresAt: this.turnExpiresAt,
      turnDurationMs: this.turnDurationMs,
      serverTimestamp: Date.now(),
      settings: { ...this.room.settings }
    };
  }

  public destroy(): void {
    this.clearTurnTimer();
    this.clearAnimationTimer();
    this.isEvaluatingMove = false;
  }
}
