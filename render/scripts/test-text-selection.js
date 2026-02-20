/**
 * Smoke test: verify that map region labels are selectable.
 *
 * Starts the Vite dev server with the example fixture, navigates to the page,
 * programmatically selects text inside an overlay label via the Selection API,
 * and confirms a non-empty string is returned. Also saves a screenshot.
 */

import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(__dirname, '../../capture/examples/game-state.example.json');
const SCREENSHOT_PATH = path.resolve(__dirname, '../tests/golden/text-selection-test.png');

// Use the Playwright-managed Chromium that is already downloaded on this machine
const CHROMIUM_PATH = '/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome';

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
    console.log('Starting text-selection smoke test...');

    const viteProcess = spawn('npm', ['run', 'dev:fixture', '--', FIXTURE_PATH], {
        cwd: path.resolve(__dirname, '../'),
        stdio: 'pipe',
        shell: true,
    });

    let serverUrl = '';
    const serverReady = new Promise((resolve, reject) => {
        const onData = (data) => {
            const output = data.toString();
            const match = output.match(/http:\/\/localhost:\d+/);
            if (match) { serverUrl = match[0]; resolve(); }
        };
        viteProcess.stdout.on('data', onData);
        viteProcess.stderr.on('data', onData);
        setTimeout(() => reject(new Error('Timed out waiting for Vite server')), 30000);
    });

    let browser;
    try {
        console.log('Waiting for Vite server...');
        await serverReady;
        console.log(`Server ready at ${serverUrl}`);

        browser = await puppeteer.launch({
            headless: 'new',
            executablePath: CHROMIUM_PATH,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1200, height: 1000 });

        console.log('Navigating to page...');
        // 'networkidle0' hangs because the page polls the game daemon;
        // use 'domcontentloaded' and wait for the canvas to appear instead.
        await page.goto(serverUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForSelector('canvas', { timeout: 15000 });
        await wait(3000); // let PixiJS init and overlay labels render

        // --- Text selection test ---
        const result = await page.evaluate(() => {
            // MapOverlay labels have pointer-events:auto set directly on them.
            // Browsers normalize "pointer-events:auto" → "pointer-events: auto" (adds a space),
            // so check the computed style property instead of a substring match on cssText.
            const gameDiv = document.getElementById('game');
            if (!gameDiv) return { error: 'no #game div' };

            const selectable = Array.from(
                gameDiv.querySelectorAll('div')
            ).filter(el => el.style.pointerEvents === 'auto' && el.textContent.trim().length > 0);

            if (!selectable.length) {
                return {
                    error: 'no elements with pointer-events:auto found in #game',
                    html: gameDiv.innerHTML.slice(0, 800),
                };
            }

            // Use the Selection API to select the first label's text
            const target = selectable[0];
            const range = document.createRange();
            range.selectNodeContents(target);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);

            return {
                selected: sel.toString(),
                elementText: target.textContent.trim(),
                elementCount: selectable.length,
            };
        });

        console.log('\n--- Selection test result ---');
        let passed = false;
        if (result.error) {
            console.error('FAIL:', result.error);
            if (result.html) console.error('Overlay HTML snippet:\n', result.html);
        } else {
            console.log(`Found ${result.elementCount} selectable element(s)`);
            console.log(`Element text  : "${result.elementText}"`);
            console.log(`Selected text : "${result.selected}"`);
            passed = result.selected.trim().length > 0;
            console.log(passed ? '\nPASS: text is selectable' : '\nFAIL: selection was empty');
        }

        // Screenshot with the text selection highlighted
        fs.mkdirSync(path.dirname(SCREENSHOT_PATH), { recursive: true });
        await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
        console.log(`\nScreenshot saved to ${SCREENSHOT_PATH}`);

        process.exitCode = passed ? 0 : 1;

    } catch (err) {
        console.error('Test error:', err);
        process.exitCode = 1;
    } finally {
        if (browser) await browser.close();
        viteProcess.kill();
    }
}

run();
