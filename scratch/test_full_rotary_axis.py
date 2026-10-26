import asyncio
from playwright.async_api import async_playwright

async def test_full_rotary_axis():
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

        # Enable Advanced mode and CLE tab
        await page.evaluate("""() => {
            if (window.app && window.app.setMode) window.app.setMode('advanced');
            const cleTab = document.getElementById('ws-cle');
            if (cleTab) cleTab.click();
        }""")
        await page.wait_for_timeout(1000)

        # 1. Test Hardware & Calculations (TwoTrees TTC6050 4th Axis Kit)
        res1 = await page.evaluate("""() => {
            const rot = window.CLE.rotary;
            const spd5 = rot.getStepsPerDegree();
            const zCenter = rot.getZCenter();
            const zBot = rot.getZBot();
            const zTop = rot.getZTop();
            
            // Test settable ratio (e.g. 4:1)
            rot.setGearRatio(4.0, 15, 60);
            const spd4 = rot.getStepsPerDegree();
            
            // Reset back to TwoTrees 5:1 (15mm/55mm)
            rot.setGearRatio(5.0, 15, 55);
            rot.setMountingPosition(250, 45, 20);
            
            return {
                gearRatio: rot.gearRatio,
                motorPulleyMm: rot.motorPulleyMm,
                chuckPulleyMm: rot.chuckPulleyMm,
                stepsPerDegree5: spd5,
                stepsPerDegree4: spd4,
                centerHeightMm: rot.centerHeightMm,
                centerY: rot.centerY,
                zCenter: zCenter,
                zBot: zBot,
                zTop: zTop,
                safetyLimit: rot.zSafetyLimit
            };
        }""")
        print("Test 1 (Hardware & Safety Boundaries):", res1)

        # 2. Test Toggle & Spoilboard Replacement
        res2 = await page.evaluate("""() => {
            const rot = window.CLE.rotary;
            const bed = window.CLE.bed;
            
            // Enable rotary
            rot.toggle(true);
            const slabVisible = bed.bedGroup.getObjectByName('CLE_Spoilboard_Slab')?.visible;
            const topPlaneVisible = bed.bedGroup.getObjectByName('CLE_Bed_Top_Plane')?.visible;
            const rotGroupVisible = rot.rotaryGroup ? rot.rotaryGroup.visible : false;
            
            return {
                rotaryEnabled: rot.enabled,
                spoilboardHidden: slabVisible === false && topPlaneVisible === false,
                rotaryGroupMounted: rotGroupVisible,
                workpieceZ: bed.workpieceZ
            };
        }""")
        print("Test 2 (Mounting & Spoilboard Replacement):", res2)

        # 3. Test Turning Mode (Lathe continuous rotation)
        res3 = await page.evaluate("""async () => {
            const rot = window.CLE.rotary;
            rot.startTurning(60); // 60 RPM = 360 deg/sec
            await new Promise(r => setTimeout(r, 200));
            const angleAfterTurning = rot.currentAngle;
            const isTurn = rot.isTurning;
            const rpm = rot.turningRPM;
            const degs = rot.turningDegPerSec;
            
            rot.stopTurning();
            return {
                isTurning: isTurn,
                stopped: !rot.isTurning,
                rpm: rpm,
                degPerSec: degs,
                angleRotated: angleAfterTurning > 0
            };
        }""")
        print("Test 3 (Turning Mode):", res3)

        # 4. Test Index Mode (Top-Down Multi-Sided Milling)
        res4 = await page.evaluate("""() => {
            const rot = window.CLE.rotary;
            rot.setIndexMode('4-sided');
            const angles = rot.getIndexAngles();
            
            const history = [];
            history.push(rot.currentAngle);
            rot.nextIndex();
            history.push(rot.currentAngle);
            rot.nextIndex();
            history.push(rot.currentAngle);
            rot.nextIndex();
            history.push(rot.currentAngle);
            rot.nextIndex();
            history.push(rot.currentAngle);
            
            return {
                indexMode: rot.indexMode,
                angles: angles,
                steppedAngles: history
            };
        }""")
        print("Test 4 (Index Mode):", res4)

        # 5. Test Rotary Slicing with Index Mode
        res5 = await page.evaluate("""async () => {
            const slicer = window.CLE.slicer;
            const rot = window.CLE.rotary;
            rot.setIndexMode('4-sided');
            
            await slicer.sliceModel({
                mode: 'rotary',
                layerHeight: 1.0,
                feedRate: 1800
            });
            
            const layers = slicer.slicedLayers;
            const gcode = slicer.rawGCode;
            
            return {
                numLayers: layers ? layers.length : 0,
                hasIndexedFacesInGCode: gcode ? gcode.includes('A-AXIS INDEXED FACE') : false,
                hasSafeRetractInGCode: gcode ? gcode.includes('Z80.10') || gcode.includes('Clearance retract') : false,
                hasFloorLimitInGCode: gcode ? (gcode.includes('Zbot') && !gcode.includes('Z35.')) : false
            };
        }""")
        print("Test 5 (Rotary Index Slicing):", res5)

        # 6. Test Rotary Setup Modal & Return to Design
        res6 = await page.evaluate("""() => {
            window.CLE.openModal('rotary');
            const modal = document.getElementById('cle-active-modal');
            const ratioIn = document.getElementById('rot-gear-ratio');
            const turnBtn = document.getElementById('rot-btn-turn-start');
            const returnBtn = document.getElementById('rot-btn-return');
            
            const modalRendered = !!modal && !!ratioIn && !!turnBtn;
            if (returnBtn) returnBtn.click();
            
            const modalClosed = !document.getElementById('cle-active-modal');
            const wsDesign = document.getElementById('ws-design');
            const designSelected = wsDesign ? wsDesign.getAttribute('aria-selected') === 'true' : false;
            
            return {
                modalRendered: modalRendered,
                modalClosed: modalClosed,
                designSelected: designSelected
            };
        }""")
        print("Test 6 (Modal & Return to Design):", res6)

        await browser.close()

asyncio.run(test_full_rotary_axis())
