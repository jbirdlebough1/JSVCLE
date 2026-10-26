import asyncio
import json
from playwright.async_api import async_playwright

async def run_test():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--allow-file-access-from-files", "--disable-web-security"]
        )
        context = await browser.new_context()
        page = await context.new_page()
        
        page.on("console", lambda msg: print("BROWSER LOG:", msg.text))
        page.on("pageerror", lambda err: print("BROWSER ERROR:", err))

        # Navigate to CLEJS Dev via local file
        await page.goto("file:///D:/CLEJS/Dev/index.htm")
        await page.wait_for_timeout(3500)
        
        # Enable Advanced mode and click CLE tab
        await page.evaluate("""() => {
            if (window.app && window.app.setMode) window.app.setMode('advanced');
            const tab = document.getElementById('ws-cle');
            if (tab) tab.click();
        }""")
        await page.wait_for_timeout(2000)
        
        # Run Slicer with Lamination (30mm slabs, 4 dowel pins)
        result = await page.evaluate("""async () => {
            if (!window.CLE || !window.CLE.slicer) return { error: 'CLE.slicer not found' };
            const slicer = window.CLE.slicer;
            
            // Execute slicing with 30mm lamination
            await slicer.sliceModel({
                mode: 'cnc',
                layerHeight: 1.0,
                enableLamination: true,
                slabThickness: 30.0,
                dowelHolesEnabled: true,
                dowelDiameter: 8.0,
                dowelMargin: 20.0,
                dowelHoleCount: 4,
                toolMapping: {
                    drillingToolNumber: 2,
                    roughingToolNumber: 1,
                    finishingToolNumber: 3,
                    cutoutToolNumber: 1
                }
            });
            
            // Check laminatedParts
            const parts = slicer.laminatedParts.map(p => ({
                partNumber: p.partNumber,
                thickness: p.thickness,
                layerCount: p.layerCount,
                minZ: p.minZ,
                maxZ: p.maxZ,
                gcodeLength: p.gcode ? p.gcode.length : 0,
                hasOp1Dowel: p.gcode ? p.gcode.includes('OPERATION 1: Precision Registration Dowel Holes') : false,
                hasOp2Rough: p.gcode ? p.gcode.includes('OPERATION 2: Bulk Stock Roughing Passes') : false,
                hasOp3Finish: p.gcode ? p.gcode.includes('OPERATION 3: Smooth 3D Contour Finishing Passes') : false,
                hasOp4Cutout: p.gcode ? p.gcode.includes('OPERATION 4: Spoilboard Clean Perimeter Cutout') : false
            }));
            
            // Check visualizer group objects
            let dowelPinCount = 0;
            let jointPlaneCount = 0;
            if (slicer.visualizerGroup) {
                slicer.visualizerGroup.traverse(obj => {
                    if (obj.name && obj.name.startsWith('CLE_Dowel_Pin_')) dowelPinCount++;
                    if (obj.name && obj.name.startsWith('CLE_Part_Joint_')) jointPlaneCount++;
                });
            }
            
            // Test active part isolation
            slicer.setActivePart(0);
            const hudBarPresent = !!document.getElementById('cle-hud-part-bar');
            const partButtons = document.querySelectorAll('.cle-hud-part-btn').length;
            
            return {
                numLayers: slicer.slicedLayers.length,
                partCount: slicer.laminatedParts.length,
                parts,
                dowelPinCount,
                jointPlaneCount,
                dowelPoints: slicer.dowelPoints,
                hudBarPresent,
                partButtons
            };
        }""")
        
        print("TEST RESULT:")
        print(json.dumps(result, indent=2))
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run_test())
