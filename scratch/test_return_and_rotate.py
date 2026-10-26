import asyncio
from playwright.async_api import async_playwright

async def test_return_and_rotation():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--allow-file-access-from-files", "--disable-web-security"]
        )
        page = await browser.new_page()
        page.on("console", lambda msg: print("BROWSER LOG:", msg.text))
        page.on("pageerror", lambda err: print("BROWSER ERROR:", err))

        await page.goto("file:///D:/CLEJS/Dev/index.htm")
        await page.wait_for_timeout(3500)

        # 1. Switch to Advanced mode and CLE tab
        await page.evaluate("""() => {
            if (window.app && window.app.setMode) window.app.setMode('advanced');
            const cleTab = document.getElementById('ws-cle');
            if (cleTab) cleTab.click();
        }""")
        await page.wait_for_timeout(1000)

        # 2. Verify Return button in CLE ribbon
        resRibbon = await page.evaluate("""() => {
            const btn = document.getElementById('cle-r-return-design');
            if (!btn) return { hasBtn: false };
            btn.click();
            const wsDesign = document.getElementById('ws-design');
            return {
                hasBtn: true,
                designSelected: wsDesign ? wsDesign.getAttribute('aria-selected') === 'true' : false
            };
        }""")
        print("Test 1 (Ribbon Return button):", resRibbon)

        # 3. Test Slicer HUD Return button and Rotate A button
        await page.evaluate("""async () => {
            const cleTab = document.getElementById('ws-cle');
            if (cleTab) cleTab.click();
            await window.CLE.slicer.sliceModel();
        }""")
        await page.wait_for_timeout(1000)

        resHUD = await page.evaluate("""() => {
            const hud = document.getElementById('cle-slicer-hud');
            const returnBtn = document.getElementById('cle-hud-return');
            const rotABtn = document.getElementById('cle-hud-rot-a');
            return {
                hudVisible: hud ? hud.style.display !== 'none' : false,
                hasReturnBtn: !!returnBtn,
                hasRotABtn: !!rotABtn
            };
        }""")
        print("Test 2 (HUD Return and Rot A buttons exist):", resHUD)

        # Click HUD Return button and verify back to Design
        resHUDClick = await page.evaluate("""() => {
            const returnBtn = document.getElementById('cle-hud-return');
            if (returnBtn) returnBtn.click();
            const wsDesign = document.getElementById('ws-design');
            const hud = document.getElementById('cle-slicer-hud');
            return {
                designSelected: wsDesign ? wsDesign.getAttribute('aria-selected') === 'true' : false,
                hudHidden: hud ? hud.style.display === 'none' : true,
                visualizerCleared: !window.CLE.slicer.visualizerGroup
            };
        }""")
        print("Test 3 (HUD Return clicked):", resHUDClick)

        # 4. Test rotateWorkpiece('X', 90)
        resRotate = await page.evaluate("""() => {
            if (!window.CLE.bed) return { error: 'no bed' };
            window.CLE.bed.rotateWorkpiece('X', 90);
            return {
                success: true,
                workpieceZ: window.CLE.bed.workpieceZ
            };
        }""")
        print("Test 4 (rotateWorkpiece):", resRotate)

        # 5. Test Slicer modal Return button
        resModal = await page.evaluate("""() => {
            window.CLE.openModal('slicer');
            const btn = document.getElementById('slice-return-btn');
            if (!btn) return { hasBtn: false };
            btn.click();
            const modal = document.getElementById('cle-active-modal');
            const wsDesign = document.getElementById('ws-design');
            return {
                hasBtn: true,
                modalClosed: !modal,
                designSelected: wsDesign ? wsDesign.getAttribute('aria-selected') === 'true' : false
            };
        }""")
        print("Test 5 (Modal Return to Design):", resModal)

        await browser.close()

asyncio.run(test_return_and_rotation())

