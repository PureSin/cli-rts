/**
 * Puppeteer test: action text rendering and hover tooltip
 *
 * Test 1 — Label shows action text while unit has a currentAction
 * Test 2 — Hover tooltip shows action text while currentAction is set
 * Test 3 — Hover tooltip shows LAST action after currentAction is cleared
 */

import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURE_PATH = path.resolve(__dirname, '../../capture/examples/game-state.example.json');

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ ${message}`);
    failed++;
  }
}

async function run() {
  console.log('Starting action text tests...\n');

  const viteProcess = spawn('npm', ['run', 'dev:fixture', '--', FIXTURE_PATH], {
    cwd: path.resolve(__dirname, '../'),
    stdio: 'pipe',
    shell: true,
  });

  let serverUrl = '';
  const serverReady = new Promise((resolve, reject) => {
    viteProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Local:')) {
        const match = output.match(/http:\/\/localhost:\d+/);
        if (match) { serverUrl = match[0]; resolve(); }
      }
    });
    viteProcess.stderr.on('data', (data) => {
      // Vite prints its URL to stderr on some versions
      const output = data.toString();
      if (output.includes('Local:')) {
        const match = output.match(/http:\/\/localhost:\d+/);
        if (match) { serverUrl = match[0]; resolve(); }
      }
    });
    setTimeout(() => reject(new Error('Vite server did not start in time')), 30000);
  });

  try {
    await serverReady;
    console.log(`Server ready at ${serverUrl}\n`);

    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 1000 });
    // Capture page console and errors for debugging
    page.on('console', msg => {
      if (msg.type() === 'error') console.error('  [page error]', msg.text());
    });
    page.on('pageerror', err => console.error('  [page uncaught]', err.message));

    await page.goto(serverUrl, { waitUntil: 'networkidle0' });
    await page.waitForSelector('canvas');
    await wait(2000); // let game loop wire hover handlers

    // Dump DOM state to diagnose missing elements
    const domDump = await page.evaluate(() => {
      const game = document.getElementById('game');
      const ui = document.getElementById('ui-overlay');
      return {
        gameChildren: game ? game.children.length : -1,
        gameHTML: game ? game.innerHTML.slice(0, 400) : 'missing',
        uiChildren: ui ? ui.children.length : -1,
        hasLabelOverlay: !!document.querySelector('[data-testid="unit-label-overlay"]'),
        hasTooltip: !!document.querySelector('[data-testid="commander-tooltip"]'),
        bodyChildCount: document.body.children.length,
      };
    });
    console.log('  [DOM dump]', JSON.stringify(domDump, null, 2));

    // Derive expected text from the fixture so the test stays in sync
    const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
    const player = Object.values(fixture.players)[0];
    const action = player.commander.currentAction;
    const expectedLabelText  = `${action.toolName}: ${action.target.split('/').pop()}`;
    const expectedTooltipText = action.description || expectedLabelText;

    // ── Test 1: label shows action text ──────────────────────────────────────
    console.log('Test 1: label shows action text while currentAction is set');
    const labelText = await page.evaluate(() => {
      const overlay = document.querySelector('[data-testid="unit-label-overlay"]');
      if (!overlay) return null;
      return Array.from(overlay.querySelectorAll('[data-unit-id]'))
        .map(el => el.textContent)
        .join('|');
    });
    assert(labelText !== null, 'unit-label-overlay exists');
    assert(labelText && labelText.includes('Bash:'), `label contains "Bash:" — got: "${labelText}"`);

    // ── Test 2: tooltip shows action text on hover ───────────────────────────
    console.log('\nTest 2: tooltip shows action text while currentAction is set');

    // Dispatch mouseenter directly on the commander label element
    await page.evaluate(() => {
      const overlay = document.querySelector('[data-testid="unit-label-overlay"]');
      const label = overlay && overlay.querySelector('[data-unit-id]');
      if (label) {
        label.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, clientX: 400, clientY: 300 }));
      }
    });
    await wait(100);

    const tooltipEl = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="commander-tooltip"]');
      return el ? { display: el.style.display, text: el.textContent } : null;
    });
    assert(tooltipEl !== null, 'commander-tooltip element exists');
    assert(tooltipEl && tooltipEl.display !== 'none', 'tooltip is visible on mouseenter');
    assert(tooltipEl && tooltipEl.text.includes('WORKING ON'), 'tooltip has WORKING ON section');
    assert(
      tooltipEl && tooltipEl.text.includes('Bash:'),
      `tooltip shows action — got: "${tooltipEl?.text?.slice(0, 120)}"`,
    );

    // dismiss tooltip
    await page.evaluate(() => {
      const overlay = document.querySelector('[data-testid="unit-label-overlay"]');
      const label = overlay && overlay.querySelector('[data-unit-id]');
      if (label) label.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    });
    await wait(100);

    // ── Test 3: tooltip shows last action after currentAction clears ──────────
    console.log('\nTest 3: tooltip shows last action after currentAction becomes null');

    // Build a state snapshot identical to the fixture but with currentAction cleared
    const clearedState = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
    const playerId = Object.keys(clearedState.players)[0];
    clearedState.players[playerId].commander.currentAction = null;
    clearedState.players[playerId].commander.status = 'idle';

    await page.evaluate((state) => {
      if (window.__rts_applyState) window.__rts_applyState(state);
    }, clearedState);
    await wait(300); // let syncUnits + game loop frame run

    // label should no longer show action text
    const labelAfterClear = await page.evaluate(() => {
      const overlay = document.querySelector('[data-testid="unit-label-overlay"]');
      if (!overlay) return null;
      return Array.from(overlay.querySelectorAll('[data-unit-id]'))
        .map(el => el.textContent)
        .join('|');
    });
    assert(
      !labelAfterClear || !labelAfterClear.includes('Bash:'),
      `label no longer shows action text after clear — got: "${labelAfterClear}"`,
    );

    // tooltip should still show the last (now cleared) action on hover
    await page.evaluate(() => {
      const overlay = document.querySelector('[data-testid="unit-label-overlay"]');
      const label = overlay && overlay.querySelector('[data-unit-id]');
      if (label) {
        label.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, clientX: 400, clientY: 300 }));
      }
    });
    await wait(100);

    const tooltipAfterClear = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="commander-tooltip"]');
      return el ? { display: el.style.display, text: el.textContent } : null;
    });
    assert(tooltipAfterClear && tooltipAfterClear.display !== 'none', 'tooltip visible after clear');
    assert(
      tooltipAfterClear && tooltipAfterClear.text.includes('Bash:'),
      `tooltip still shows last action ("Bash:") — got: "${tooltipAfterClear?.text?.slice(0, 120)}"`,
    );
    assert(
      tooltipAfterClear && !tooltipAfterClear.text.match(/WORKING ON\s*—/),
      'tooltip does not show "—" placeholder when last action is available',
    );

    await browser.close();

    console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('\nTest error:', err);
    process.exit(1);
  } finally {
    viteProcess.kill();
  }
}

run();
