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
        await page.wait_for_timeout(3000)

        data = await page.evaluate("""() => {
            const app = window.app || window.xe;
            if (app.setMode) app.setMode('advanced');
            const btn = document.getElementById('ad-transform');
            return {
                hasTransformBtn: !!btn,
                transformOnClick: btn ? btn.onclick.toString().slice(0, 300) : null
            };
        }""")
        print("Transform info:", data)
        await browser.close()

asyncio.run(inspect())
