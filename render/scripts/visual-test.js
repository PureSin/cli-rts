
import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURE_PATH = path.resolve(__dirname, '../../capture/examples/game-state.example.json');
const GOLDEN_DIR = path.resolve(__dirname, '../tests/golden');
const GOLDEN_IMAGE = path.resolve(GOLDEN_DIR, 'example-state.png');
const DIFF_IMAGE = path.resolve(GOLDEN_DIR, 'diff.png');
const CURRENT_IMAGE = path.resolve(GOLDEN_DIR, 'current.png');

async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
    console.log('Starting visual regression test...');

    // 1. Start Vite dev server with fixture
    const viteProcess = spawn('npm', ['run', 'dev:fixture', '--', FIXTURE_PATH], {
        cwd: path.resolve(__dirname, '../'),
        stdio: 'pipe',
        shell: true
    });

    let serverUrl = '';
    const serverReady = new Promise((resolve) => {
        viteProcess.stdout.on('data', (data) => {
            const output = data.toString();
            // console.log('[Vite]', output);
            if (output.includes('Local:')) {
                const match = output.match(/http:\/\/localhost:\d+/);
                if (match) {
                    serverUrl = match[0];
                    resolve();
                }
            }
        });
    });

    try {
        console.log('Waiting for Vite server...');
        await serverReady;
        console.log(`Server ready at ${serverUrl}`);

        // 2. Launch Puppeteer
        const browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        // Set viewport to match map size + UI space
        await page.setViewport({ width: 1200, height: 1000 });

        console.log('Navigating to page...');
        await page.goto(serverUrl, { waitUntil: 'networkidle0' });

        // Wait for canvas and initial render
        await page.waitForSelector('canvas');

        // Wait a bit for everything to settle (sprites loading, etc.)
        await wait(2000);

        console.log('Taking screenshot...');
        const screenshotBuffer = await page.screenshot({ fullPage: true });

        // Save current for inspection
        fs.writeFileSync(CURRENT_IMAGE, screenshotBuffer);

        // 3. Compare with Golden
        if (!fs.existsSync(GOLDEN_IMAGE)) {
            console.log('Golden image not found. Creating new golden image.');
            fs.writeFileSync(GOLDEN_IMAGE, screenshotBuffer);
            console.log(`Saved baseline to ${GOLDEN_IMAGE}`);
        }

        console.log('Comparing against golden image...');
        const img1 = PNG.sync.read(fs.readFileSync(GOLDEN_IMAGE));

        // Wrap in Buffer.from() to ensure it's a Node Buffer
        const img2 = PNG.sync.read(Buffer.from(screenshotBuffer));

        const { width, height } = img1;
        const diff = new PNG({ width, height });

        const numDiffPixels = pixelmatch(
            img1.data,
            img2.data,
            diff.data,
            width,
            height,
            { threshold: 0.1 }
        );

        if (numDiffPixels > 0) {
            fs.writeFileSync(DIFF_IMAGE, PNG.sync.write(diff));
            console.error(`Visual regression failed: ${numDiffPixels} pixels differ.`);
            console.error(`Diff saved to ${DIFF_IMAGE}`);
            process.exit(1);
        } else {
            console.log('Visual regression passed: No differences found.');
            process.exit(0);
        }

        await browser.close();

    } catch (error) {
        console.error('Test failed:', error);
        process.exit(1);
    } finally {
        viteProcess.kill();
    }
}

run();
