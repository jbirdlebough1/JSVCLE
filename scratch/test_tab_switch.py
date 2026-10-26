import asyncio
from playwright.async_api import async_playwright

async def inspect():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--allow-file-access-from-files", "--disable-web-security"]
        )
        page = await browser.new_page()
        await page.goto("file:///D:/CLEJS/Dev/index.htm")
        await page.wait_for_timeout(3500)

        data = await page.evaluate("""() => {
            const app = window.app || window.xe;
            if (app.setMode) app.setMode('advanced');
            const wsDesign = document.getElementById('ws-design');
            const wsCle = document.getElementById('ws-cle');
            
            // Click ws-cle
            if (wsCle) wsCle.click();
            const cleActive = wsCle ? wsCle.getAttribute('aria-selected') : null;
            
            // Click ws-design
            if (wsDesign) wsDesign.click();
            const designActive = wsDesign ? wsDesign.getAttribute('aria-selected') : null;
            
            return {
                cleActive: cleActive,
                designActive: designActive
            };
        }""")
        print("Tab switching test:", data)
        await browser.close()

asyncio.run(inspect())

