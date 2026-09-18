import { BrowserContext, Page, expect } from '@playwright/test';
import { Coordinate, Tile } from '../../../src/shared/types';

export class BotClient {
  public name: string;
  public avatarId: string;
  public page: Page;
  public context: BrowserContext;

  constructor(name: string, avatarId: string, page: Page, context: BrowserContext) {
    this.name = name;
    this.avatarId = avatarId;
    this.page = page;
    this.context = context;
  }

  public async navigateTo(url: string): Promise<void> {
    this.page.on('console', (msg) => console.log(`[Browser ${this.name}] ${msg.type()}: ${msg.text()}`));
    this.page.on('pageerror', (err) => console.error(`[Browser ${this.name} ERROR]`, err));
    await this.page.goto(url);
    await this.page.waitForSelector('#app', { state: 'visible' });
    await this.page.waitForFunction(
      () => typeof (window as any).__MATCH_POP__ !== 'undefined',
      null,
      { timeout: 15000 }
    );
  }

  public async selectAvatar(avatarId: string): Promise<void> {
    this.avatarId = avatarId;
    const optionSelector = `.avatar-option[data-avatar="${avatarId}"]`;
    if (await this.page.isVisible(optionSelector)) {
      await this.page.click(optionSelector);
    }
  }

  public async createRoom(): Promise<string> {
    await this.page.fill('#player-name-input', this.name);
    await this.selectAvatar(this.avatarId);
    await this.page.click('#btn-create-room');

    await this.page.waitForSelector('#lobby-waiting-card', { state: 'visible', timeout: 15000 });
    await this.page.waitForFunction(() => {
      const el = document.getElementById('waiting-room-code');
      return el && el.textContent && el.textContent.trim() !== '-----' && el.textContent.trim().length >= 4;
    }, null, { timeout: 15000 });

    const code = await this.page.evaluate(() => (window as any).__MATCH_POP__.getRoomCode());
    expect(code).toBeTruthy();
    return code;
  }

  public async joinRoom(roomCode: string): Promise<void> {
    await this.page.fill('#player-name-input', this.name);
    await this.selectAvatar(this.avatarId);

    // Make sure join form row is visible
    const joinRowVisible = await this.page.isVisible('#join-form-row');
    if (!joinRowVisible) {
      await this.page.click('#btn-join-room-prompt');
    }
    await this.page.waitForSelector('#join-form-row', { state: 'visible' });
    await this.page.fill('#room-code-input', roomCode);
    await this.page.click('#btn-submit-join');

    await this.page.waitForSelector('#lobby-waiting-card', { state: 'visible', timeout: 15000 });
    await this.page.waitForFunction(
      (expectedCode) => {
        const el = document.getElementById('waiting-room-code');
        return el && el.textContent && el.textContent.trim().toUpperCase() === expectedCode.toUpperCase();
      },
      roomCode,
      { timeout: 15000 }
    );
  }

  public async setReady(): Promise<void> {
    await this.page.click('#btn-toggle-ready');
    // Verify button state has changed to cancel or ready badge is visible
    await this.page.waitForFunction(() => {
      const btn = document.getElementById('btn-toggle-ready');
      return btn && btn.textContent && btn.textContent.includes('Ready!');
    }, null, { timeout: 10000 });
  }

  public async startGame(): Promise<void> {
    await this.page.waitForFunction(() => {
      const btn = document.getElementById('btn-start-game') as HTMLButtonElement;
      return btn && !btn.disabled;
    }, null, { timeout: 15000 });
    await this.page.click('#btn-start-game');
  }

  public async waitForGameState(state: 'LOBBY' | 'IN_GAME' | 'GAME_OVER', timeoutMs = 20000): Promise<void> {
    await this.page.waitForFunction(
      (expected) => (window as any).__MATCH_POP__?.getGameState() === expected,
      state,
      { timeout: timeoutMs }
    );
  }

  public async getBoardHash(): Promise<string> {
    return await this.page.evaluate(() => (window as any).__MATCH_POP__.getBoardHash());
  }

  public async getBoardState(): Promise<Tile[][]> {
    return await this.page.evaluate(() => (window as any).__MATCH_POP__.getBoardState());
  }

  public async getActiveSlot(): Promise<number> {
    return await this.page.evaluate(() => (window as any).__MATCH_POP__.getActiveSlot());
  }

  public async getActivePlayerId(): Promise<string> {
    return await this.page.evaluate(() => (window as any).__MATCH_POP__.getActivePlayerId());
  }

  public async getScores(): Promise<Record<string, number>> {
    return await this.page.evaluate(() => (window as any).__MATCH_POP__.getScores());
  }

  public async getTurnRemainingSeconds(): Promise<number> {
    return await this.page.evaluate(() => (window as any).__MATCH_POP__.getTurnRemainingSeconds());
  }

  public async isSettled(): Promise<boolean> {
    return await this.page.evaluate(() => {
      const api = (window as any).__MATCH_POP__;
      return api && typeof api.isSettled === 'function' ? api.isSettled() : true;
    });
  }

  public async simulateSwap(from: Coordinate, to: Coordinate): Promise<boolean> {
    return await this.page.evaluate(
      ({ f, t }) => (window as any).__MATCH_POP__.simulateSwap(f, t),
      { f: from, t: to }
    );
  }

  public async getCellPixelCenter(coord: Coordinate): Promise<{ x: number; y: number }> {
    return await this.page.evaluate(({ r, c }) => {
      const canvas = document.getElementById('interactive-canvas') as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      const cssWidth = canvas.clientWidth;
      const cssHeight = canvas.clientHeight;
      const availableSize = Math.min(cssWidth - 16, cssHeight - 16, 540);
      const cellSize = Math.floor(availableSize / 9);
      const boardPixelWidth = cellSize * 9;
      const boardPixelHeight = cellSize * 9;
      const boardOffsetX = Math.floor((cssWidth - boardPixelWidth) / 2);
      const boardOffsetY = Math.floor((cssHeight - boardPixelHeight) / 2);
      return {
        x: rect.left + boardOffsetX + c * cellSize + cellSize / 2,
        y: rect.top + boardOffsetY + r * cellSize + cellSize / 2
      };
    }, { r: coord.row, c: coord.col });
  }

  public async dragSwap(from: Coordinate, to: Coordinate): Promise<void> {
    const p1 = await this.getCellPixelCenter(from);
    const p2 = await this.getCellPixelCenter(to);
    await this.page.mouse.move(p1.x, p1.y);
    await this.page.mouse.down();
    await this.page.mouse.move(p2.x, p2.y, { steps: 8 });
    await this.page.mouse.up();
  }

  public async waitForCascadeSettled(timeoutMs = 15000): Promise<void> {
    await this.page.waitForFunction(
      () => {
        const api = (window as any).__MATCH_POP__;
        return api && typeof api.isSettled === 'function' ? api.isSettled() : true;
      },
      null,
      { timeout: timeoutMs }
    );
  }

  public async getSessionCredentials(): Promise<{ sessionToken: string | null; roomCode: string | null }> {
    return await this.page.evaluate(() => ({
      sessionToken: localStorage.getItem('matchpop_session_token'),
      roomCode: localStorage.getItem('matchpop_last_room')
    }));
  }
}
