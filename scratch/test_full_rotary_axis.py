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

        # 6. Test Rotary Setup Modal & Return to Design & Clamp to Ends
        res6 = await page.evaluate("""() => {
            window.CLE.openModal('rotary');
            const modal = document.getElementById('cle-active-modal');
            const ratioIn = document.getElementById('rot-gear-ratio');
            const turnBtn = document.getElementById('rot-btn-turn-start');
            const returnBtn = document.getElementById('rot-btn-return');
            const fitBtn = document.getElementById('rot-btn-fit-object');
            const inChuckX = document.getElementById('rot-chuck-x');
            const inTailX = document.getElementById('rot-tailstock-x');
            
            const modalRendered = !!modal && !!ratioIn && !!turnBtn && !!fitBtn && !!inChuckX && !!inTailX;

            // Test auto-clamp to object ends
            const rot = window.CLE.rotary;
            rot.fitToObject();
            const b = rot.getObjectBounds();
            const clampedMatch = (rot.chuckX === Math.round(b.minX)) && (rot.tailstockX === Math.round(b.maxX));
            const headX = rot.headstockGroup ? rot.headstockGroup.position.x : null;
            const tailX = rot.tailstockGroup ? rot.tailstockGroup.position.x : null;
            const assemblyAligned = (headX === rot.chuckX) && (tailX === rot.tailstockX);

            // Check no dummy orange cylinder exists
            const hasDummyCylinder = !!rot.cylinderMesh || !!(rot.rotaryGroup && rot.rotaryGroup.getObjectByName('CLE_Rotary_Stock_Cylinder'));

            // Check no dowel pins exist in visualizer in rotary mode
            const slicer = window.CLE.slicer;
            const hasDowelPins = !!(slicer.visualizerGroup && slicer.visualizerGroup.children.some(c => c.name && c.name.startsWith('CLE_Dowel_Pin')));

            if (returnBtn) returnBtn.click();
            
            const modalClosed = !document.getElementById('cle-active-modal');
            const wsDesign = document.getElementById('ws-design');
            const designSelected = wsDesign ? wsDesign.getAttribute('aria-selected') === 'true' : false;
            
            return {
                modalRendered: modalRendered,
                modalClosed: modalClosed,
                designSelected: designSelected,
                clampedMatch: clampedMatch,
                assemblyAligned: assemblyAligned,
                headX: headX,
                tailX: tailX,
                hasDummyCylinder: hasDummyCylinder,
                hasDowelPins: hasDowelPins
            };
        }""")
        print("Test 6 (Modal, Clamp & Clean Visuals):", res6)
        assert res6["modalRendered"], "Rotary modal must render all fields"
        assert res6["modalClosed"], "Rotary modal must close"
        assert res6["clampedMatch"], "Chuck and Opposing Center must clamp to object minX and maxX"
        assert res6["assemblyAligned"], "Headstock and Tailstock 3D positions must match clamped coordinates"
        assert not res6["hasDummyCylinder"], "No dummy orange cylinder must exist"
        assert not res6["hasDowelPins"], "No dowel registration pins must exist in rotary mode"

        # 7. Test Chuck Assembly Height (66mm), Centerline (45mm), and Max Material Clearances
        res7 = await page.evaluate("""() => {
            const rot = window.CLE.rotary;
            
            // Check chuck assembly height & centerline
            const chuckH = rot.chuckAssemblyHeightMm;
            const centerH = rot.centerHeightMm;
            const maxSafeDia = rot.getMaxStockDiameter(5.0);
            const absoluteMaxDia = rot.getMaxStockDiameter(0.0);

            // Test clearance check with small stock (shielded within 66mm chuck)
            const clr30 = rot.checkClearances(30.0);
            
            // Test clearance check with 70mm stock (extends above 66mm chuck, but clears bed)
            const clr70 = rot.checkClearances(70.0);
            
            // Test clearance check with 95mm stock (hits bed!)
            const clr95 = rot.checkClearances(95.0);

            // Test Ztop clears 66mm chuck height even with small stock
            rot.stockDiameter = 20.0;
            rot.zClearance = 10.0;
            const zTopSmall = rot.getZTop(); // must be at least 66.10 + 10 = 76.10mm

            // Test Ztop with large 70mm stock
            rot.stockDiameter = 70.0;
            const zTopLarge = rot.getZTop(); // 45.10 + 35 + 10 = 90.10mm

            return {
                chuckH: chuckH,
                centerH: centerH,
                maxSafeDia: maxSafeDia,
                absoluteMaxDia: absoluteMaxDia,
                clr30Status: clr30.status,
                clr70Status: clr70.status,
                clr95Status: clr95.status,
                zTopSmall: zTopSmall,
                zTopLarge: zTopLarge,
                clearsChuckOnSmall: zTopSmall >= 76.10,
                clearsStockOnLarge: zTopLarge >= 90.10
            };
        }""")
        print("Test 7 (Chuck Height & Material Clearances):", res7)
        assert res7["chuckH"] == 66.0, "TwoTrees chuck assembly must be 66mm tall"
        assert res7["centerH"] == 45.0, "A-axis centerline must be 45mm from bed"
        assert res7["maxSafeDia"] == 80.0, "Max safe stock diameter with 5mm bed margin must be 80mm"
        assert res7["absoluteMaxDia"] == 90.0, "Absolute max stock diameter to touch bed must be 90mm"
        assert res7["clr30Status"] == "shielded", "30mm stock must be shielded within 66mm chuck profile"
        assert res7["clr70Status"] == "notice", "70mm stock must notify that it extends above 66mm chuck"
        assert res7["clr95Status"] == "collision", "95mm stock must detect bed collision"
        assert res7["clearsChuckOnSmall"], "Retract plane on small stock must clear the 66mm chuck"
        assert res7["clearsStockOnLarge"], "Retract plane on large stock must clear the stock top"

        # 8. Test Center Point Tool & Chuck/Center Positioning on Object
        res8 = await page.evaluate("""() => {
            const rot = window.CLE.rotary;
            const bed = window.CLE.bed;

            // 1. Center Point Tool existence and toggling
            const initialToolVis = rot.centerPointVisible;
            rot.toggleCenterPointTool(false);
            const hiddenVis = rot.centerPointVisible;
            const groupHidden = rot.centerPointGroup ? !rot.centerPointGroup.visible : true;
            rot.toggleCenterPointTool(true);
            const restoredVis = rot.centerPointVisible;
            const groupVisible = rot.centerPointGroup ? rot.centerPointGroup.visible : false;

            // 2. Center Point 3D positions
            const chuckToolX = rot.chuckCenterTool ? rot.chuckCenterTool.position.x : null;
            const tailToolX = rot.tailstockCenterTool ? rot.tailstockCenterTool.position.x : null;

            // 3. Positioning on Object (centerOnObject & nudges)
            rot.centerOnObject();
            const b = rot.getObjectBounds();
            const objMidX = (b.minX + b.maxX) / 2;
            const spanAfterCenter = rot.tailstockX - rot.chuckX;
            const centerMidX = (rot.chuckX + rot.tailstockX) / 2;
            const isCenteredOnObj = Math.abs(centerMidX - objMidX) < 1.0;

            // Nudge chuck and center
            const oldChuck = rot.chuckX;
            rot.nudgeChuck(5);
            const nudgedChuck = (rot.chuckX === oldChuck + 5);

            const oldTail = rot.tailstockX;
            rot.nudgeTailstock(-5);
            const nudgedTail = (rot.tailstockX === oldTail - 5);

            // 4. Jog Toolhead to Center Point
            rot.jogToolToCenter('workpiece');
            const toolPos = bed ? { ...bed.lastPos } : null;
            const toolCenteredY = toolPos ? (toolPos.Y === rot.centerY) : false;

            return {
                initialToolVis: initialToolVis,
                hiddenVis: hiddenVis,
                groupHidden: groupHidden,
                restoredVis: restoredVis,
                groupVisible: groupVisible,
                chuckToolX: chuckToolX,
                tailToolX: tailToolX,
                isCenteredOnObj: isCenteredOnObj,
                nudgedChuck: nudgedChuck,
                nudgedTail: nudgedTail,
                toolPos: toolPos,
                toolCenteredY: toolCenteredY
            };
        }""")
        print("Test 8 (Center Point Tool & Object Positioning):", res8)
        assert res8["groupVisible"], "Center point tool group must be visible when toggled on"
        assert res8["groupHidden"], "Center point tool group must be hidden when toggled off"
        assert res8["isCenteredOnObj"], "centerOnObject() must center chuck & tailstock on CAD object midpoint"
        assert res8["nudgedChuck"], "nudgeChuck(5) must increment chuckX by 5mm"
        assert res8["nudgedTail"], "nudgeTailstock(-5) must decrement tailstockX by 5mm"
        assert res8["toolCenteredY"], "jogToolToCenter() must place toolhead exactly at centerY"

        await browser.close()

asyncio.run(test_full_rotary_axis())

