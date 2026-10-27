from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=["--allow-file-access-from-files", "--disable-web-security"]
    )
    page = browser.new_page()
    page.goto("file:///D:/CLEJS/Dev/index.htm")
    page.wait_for_timeout(3500)

    # Set to Advanced mode & CLE
    page.evaluate("""() => {
        const app = window.app || window.xe;
        if (app && app.setMode) app.setMode('advanced');
    }""")
    page.wait_for_timeout(1000)

    # Open Calibration modal directly via window.CLE
    page.evaluate("""() => {
        window.CLE.openModal('calibration');
    }""")
    page.wait_for_timeout(500)

    # Check modal opened
    cal_modal = page.is_visible("#cle-active-modal")
    print("Calibration modal opened:", cal_modal)
    assert cal_modal, "Calibration modal did not open"

    # Test 1: Generate GCode and 3D Preview
    t1_res = page.evaluate("""() => {
        const cal = window.CLE ? window.CLE.calibration : null;
        if (!cal) return { error: "No calibration engine" };
        const gcode = cal.generateChassisSquarenessGCode();
        const preview = cal.previewChassisSquarenessTest();
        return {
            hasGCode: !!gcode,
            lineCount: gcode.split('\\n').length,
            hasPreviewMesh: !!preview,
            previewChildren: preview ? preview.children.length : 0
        };
    }""")
    print("Test 1 Result:", t1_res)
    assert t1_res["hasGCode"] and t1_res["hasPreviewMesh"], "Test 1 failed"

    # Switch to Tab 2
    page.click("#cle-cal-tab-btn-2")
    page.wait_for_timeout(500)
    tab2_vis = page.is_visible("#cle-cal-pane-2")
    print("Tab 2 visible:", tab2_vis)
    assert tab2_vis, "Tab 2 pane not visible"

    # Test 2: Generate GCode and 3D Preview
    t2_res = page.evaluate("""() => {
        const cal = window.CLE.calibration;
        const gcode = cal.generateQuadrant3DTestGCode({ quadrant: 'all' });
        const preview = cal.previewQuadrant3DTest({ quadrant: 'all' });
        return {
            hasGCode: !!gcode,
            lineCount: gcode.split('\\n').length,
            hasPreviewMesh: !!preview,
            previewChildren: preview ? preview.children.length : 0
        };
    }""")
    print("Test 2 Result:", t2_res)
    assert t2_res["hasGCode"] and t2_res["hasPreviewMesh"], "Test 2 failed"

    print("\nCalibration tests 1 & 2 fully verified!")
    browser.close()
