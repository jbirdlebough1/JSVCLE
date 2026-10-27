import sys
from playwright.sync_api import sync_playwright

def test_calibration():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--allow-file-access-from-files", "--disable-web-security"]
        )
        context = browser.new_context()
        page = context.new_page()

        page.on("console", lambda msg: print(f"BROWSER LOG: {msg.text}"))
        page.on("pageerror", lambda err: print(f"BROWSER ERROR: {err}"))

        page.goto("file:///D:/CLEJS/Dev/index.htm")
        page.wait_for_timeout(3500)

        # Enable Advanced mode and CLE tab
        page.evaluate("""() => {
            if (window.app && window.app.setMode) window.app.setMode('advanced');
            const cleTab = document.getElementById('ws-cle');
            if (cleTab) cleTab.click();
        }""")
        page.wait_for_timeout(1000)

        # 1. Verify CLE is loaded and calibration engine initialized
        cle_ready = page.evaluate("() => !!(window.CLE && window.CLE.calibration)")
        assert cle_ready, "window.CLE.calibration must be initialized"
        print("[TEST 1/6] CLE and CLECalibrationEngine ready: PASSED")

        # 2. Test 1 G-Code Generation & Spec Validation
        t1_data = page.evaluate("""() => {
            const cal = window.CLE.calibration;
            const limits = cal.getMachineLimits();
            const gcode = cal.generateChassisSquarenessGCode({
                feed: 1800,
                plungeFeed: 300,
                spindleRPM: 12000,
                cutDepthZ: -0.20
            });
            return {
                limits,
                gcodeLen: gcode.length,
                hasDiag1: gcode.includes('OPERATION 1: Full-Bed Diagonal 1'),
                hasDiag2: gcode.includes('OPERATION 2: Full-Bed Diagonal 2'),
                hasSquares: gcode.includes('5 Concentric Squares'),
                hasTangentCircles: gcode.includes('Tangent Inscribed Circle'),
                hasArcG2: gcode.includes('G2 X'),
                numSquaresCount: (gcode.match(/=== Square #/g) || []).length,
                minX: limits.minX,
                maxX: limits.maxX,
                minY: limits.minY,
                maxY: limits.maxY,
                cx: limits.centerX,
                cy: limits.centerY
            };
        }""")
        print("[TEST 2/6] Test 1 G-Code Verification:", t1_data)
        assert t1_data['minX'] == 5.0, "minX must be 5.0mm"
        assert t1_data['minY'] == 5.0, "minY must be 5.0mm"
        assert t1_data['maxX'] == t1_data['limits']['travelX'] - 5.0, "maxX must be travelX - 5.0mm"
        assert t1_data['maxY'] == t1_data['limits']['travelY'] - 5.0, "maxY must be travelY - 5.0mm"
        assert t1_data['hasDiag1'] and t1_data['hasDiag2'], "Both diagonals must be generated"
        assert t1_data['numSquaresCount'] == 5, "Must generate exactly 5 concentric squares"
        assert t1_data['hasTangentCircles'] and t1_data['hasArcG2'], "Tangent circles with G2 arcs must be generated"

        # 3. Test 1 3D Preview Mounting
        t1_preview = page.evaluate("""() => {
            const cal = window.CLE.calibration;
            cal.previewChassisSquarenessTest();
            const grp = cal.previewGroup;
            return {
                mounted: !!grp,
                name: grp ? grp.name : null,
                childrenCount: grp ? grp.children.length : 0,
                hasDiagonals: grp ? grp.children.some(c => c.isLine && !c.isLineLoop) : false,
                hasSquares: grp ? grp.children.some(c => c.isLineLoop) : false
            };
        }""")
        print("[TEST 3/6] Test 1 3D Viewport Preview:", t1_preview)
        assert t1_preview['mounted'], "Test 1 previewGroup must be mounted"
        assert t1_preview['name'] == 'CLE_Calibration_Test_1_Preview'
        assert t1_preview['hasDiagonals'] and t1_preview['hasSquares']

        # 4. Test 2 G-Code Generation & Spec Validation (120x120mm Stock, 40mm Stack, 4 Quadrants)
        t2_data = page.evaluate("""() => {
            const cal = window.CLE.calibration;
            const gcodeAll = cal.generateQuadrant3DTestGCode({ quadrant: 'all', zInc: 0.10, xyStep: 1.0 });
            return {
                gcodeLen: gcodeAll.length,
                has120Stock: gcodeAll.includes('120mm x 120mm x 20mm'),
                has40Stack: gcodeAll.includes('Total Stack: 40mm'),
                hasClampAlert: gcodeAll.includes('Must be securely clamped!'),
                hasQ1ConeHole: gcodeAll.includes('QUADRANT 1: Inverted Stepped Cone Hole'),
                hasQ2SquareHole: gcodeAll.includes('QUADRANT 2: Inverted Stepped Square Hole'),
                hasQ3RaisedCone: gcodeAll.includes('QUADRANT 3: Raised Cone on 4mm ZFloor'),
                hasQ4RaisedPyramid: gcodeAll.includes('QUADRANT 4: Raised 4-Sided Square Pyramid on 4mm ZFloor'),
                hasFloorZ16: gcodeAll.includes('Z=-16.000'),
                hasPeakZ2: gcodeAll.includes('Z=-2.000'),
                q1Passes: (gcodeAll.match(/Q1 Pass/g) || []).length,
                q2Passes: (gcodeAll.match(/Q2 Pass/g) || []).length,
                q3Passes: (gcodeAll.match(/Q3 Hogging Pass/g) || []).length,
                q4Passes: (gcodeAll.match(/Q4 Hogging Pass/g) || []).length
            };
        }""")
        print("[TEST 4/6] Test 2 G-Code Verification:", t2_data)
        assert t2_data['has120Stock'] and t2_data['has40Stack'], "Workpiece must specify 120x120x20mm with 40mm total stack"
        assert t2_data['hasClampAlert'], "Must include secure clamping reminder"
        assert t2_data['hasQ1ConeHole'] and t2_data['hasQ2SquareHole'], "Q1 stepped cone and Q2 stepped square holes must be generated"
        assert t2_data['hasQ3RaisedCone'] and t2_data['hasQ4RaisedPyramid'], "Q3 raised cone and Q4 raised pyramid must be generated"
        assert t2_data['hasFloorZ16'] and t2_data['hasPeakZ2'], "Must reference 4mm floor (Z=-16) and 18mm peak (Z=-2)"
        assert t2_data['q1Passes'] >= 100, "Q1 must have 0.1mm Z depth passes"

        # 5. Test 2 3D Preview Mounting (Stock, Clamps, 4 Quadrants)
        t2_preview = page.evaluate("""() => {
            const cal = window.CLE.calibration;
            cal.previewQuadrant3DTest({ quadrant: 'all' });
            const grp = cal.previewGroup;
            return {
                mounted: !!grp,
                name: grp ? grp.name : null,
                childrenCount: grp ? grp.children.length : 0,
                hasStockMesh: grp ? grp.children.some(c => c.isMesh && c.geometry.type === 'BoxGeometry') : false,
                hasConeRelief: grp ? grp.children.some(c => c.isMesh && c.geometry.type === 'ConeGeometry') : false
            };
        }""")
        print("[TEST 5/6] Test 2 3D Viewport Preview:", t2_preview)
        assert t2_preview['mounted'], "Test 2 previewGroup must be mounted"
        assert t2_preview['name'] == 'CLE_Calibration_Test_2_Preview'
        assert t2_preview['hasStockMesh'], "Must render 3D workpiece stock"
        assert t2_preview['hasConeRelief'], "Must render 3D raised cone"

        # 6. Test Calibration Modal in UI
        modal_data = page.evaluate("""() => {
            window.CLE.openModal('calibration');
            const modal = document.getElementById('cle-active-modal');
            const tab1 = document.getElementById('cle-cal-tab-btn-1');
            const tab2 = document.getElementById('cle-cal-tab-btn-2');
            const pane1 = document.getElementById('cle-cal-pane-1');
            const pane2 = document.getElementById('cle-cal-pane-2');

            const initialPane1Vis = pane1 && pane1.style.display !== 'none';

            // Switch to Tab 2
            if (tab2) tab2.click();
            const pane2VisAfterClick = pane2 && pane2.style.display !== 'none';
            const pane1VisAfterClick = pane1 && pane1.style.display === 'none';

            // Switch back to Tab 1
            if (tab1) tab1.click();
            const pane1VisRestored = pane1 && pane1.style.display !== 'none';

            window.CLE.closeModal();
            return {
                modalRendered: !!modal,
                hasTab1: !!tab1,
                hasTab2: !!tab2,
                initialPane1Vis,
                pane2VisAfterClick,
                pane1VisAfterClick,
                pane1VisRestored
            };
        }""")
        print("[TEST 6/6] Calibration Modal UI Interaction:", modal_data)
        assert modal_data['modalRendered'], "Modal must render in DOM"
        assert modal_data['hasTab1'] and modal_data['hasTab2'], "Tabs 1 & 2 must be present"
        assert modal_data['initialPane1Vis'], "Pane 1 must be active initially"
        assert modal_data['pane2VisAfterClick'], "Pane 2 must be active after click"
        assert modal_data['pane1VisRestored'], "Pane 1 must restore after clicking Tab 1"

        print("\n==========================================")
        print("   ALL CALIBRATION TESTS PASSED (6/6)    ")
        print("==========================================")
        browser.close()

if __name__ == '__main__':
    test_calibration()
