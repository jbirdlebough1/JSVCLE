from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=["--allow-file-access-from-files", "--disable-web-security"]
    )
    page = browser.new_page()
    page.goto("file:///D:/CLEJS/Dev/index.htm")
    page.wait_for_timeout(3500)

    # Set to Advanced mode
    page.evaluate("""() => {
        const app = window.app || window.xe;
        if (app && app.setMode) app.setMode('advanced');
    }""")
    page.wait_for_timeout(1000)

    # -------------------------------------------------------------
    # TEST 1: Option 1 - 2D Editable Sketch
    # -------------------------------------------------------------
    print("\n--- TESTING OPTION 1: 2D Editable Sketch ---")
    page.click("#ws-cle")
    page.wait_for_timeout(500)
    page.click("#cle-r-vellum")
    page.wait_for_timeout(1200)

    iframe_handle = page.query_selector("#cle-vellum-iframe")
    frame = iframe_handle.content_frame()

    # Add a rectangle to Vellum
    frame.evaluate("""() => {
        const vState = window.Vellum ? window.Vellum.state : null;
        if (!vState) throw new Error("window.Vellum not found");
        vState.objects = [{
            id: 'o_sketch_rect',
            type: 'path',
            closed: true,
            angle: 0,
            fill: '#38bdf8',
            stroke: '#0284c7',
            strokeWidth: 2,
            visible: true,
            segments: [
                { type: 'M', x: 20, y: 20 },
                { type: 'L', x: 80, y: 20 },
                { type: 'L', x: 80, y: 80 },
                { type: 'L', x: 20, y: 80 },
                { type: 'Z' }
            ]
        }];
    }""")

    # Open modal in Vellum
    frame.click("#btnSaveToJS")
    page.wait_for_timeout(400)
    frame.click("#optModeSketch")
    page.wait_for_timeout(200)
    frame.click("#confirmJsModalBtn")
    page.wait_for_timeout(1500)

    res1 = page.evaluate("""() => {
        const doc = window.Se.doc;
        const app = window.app || window.xe;
        const modal = document.getElementById('cle-vellum-modal');
        const lastSk = doc.sketches[doc.sketches.length - 1];
        return {
            modalHidden: modal.style.display === 'none',
            activeWorkspace: document.querySelector('.wstabs button[aria-selected="true"]')?.id,
            sketchesCount: doc.sketches.length,
            skOrigin: lastSk ? lastSk.plane.o : null,
            inSketchEditor: !!app.sketcher?.active
        };
    }""")
    print("Option 1 Result:", res1)
    assert res1["modalHidden"], "Vellum modal did not close"
    assert res1["sketchesCount"] >= 1, "Sketch was not added"
    assert res1["skOrigin"] == [300, 250, 20.1], f"Expected [300, 250, 20.1], got {res1['skOrigin']}"
    assert not res1["inSketchEditor"], "Should not be trapped in 2D sketcher; should be on 3D bed!"
    assert res1["activeWorkspace"] == "ws-cle", f"Should return to ws-cle, got {res1['activeWorkspace']}"

    # -------------------------------------------------------------
    # TEST 2: Option 2 - 3D Extruded Body
    # -------------------------------------------------------------
    print("\n--- TESTING OPTION 2: 3D Extruded Body ---")
    page.click("#cle-r-vellum")
    page.wait_for_timeout(1000)

    frame.evaluate("""() => {
        const vState = window.Vellum.state;
        vState.objects = [{
            id: 'o_solid_box',
            type: 'path',
            closed: true,
            angle: 0,
            fill: '#f59e0b',
            stroke: '#d97706',
            strokeWidth: 2,
            visible: true,
            segments: [
                { type: 'M', x: 0, y: 0 },
                { type: 'L', x: 60, y: 0 },
                { type: 'L', x: 60, y: 60 },
                { type: 'L', x: 0, y: 60 },
                { type: 'Z' }
            ]
        }];
    }""")

    frame.click("#btnSaveToJS")
    page.wait_for_timeout(400)
    frame.click("#optModeExtrude")
    page.wait_for_timeout(200)
    frame.click("#confirmJsModalBtn")
    page.wait_for_timeout(2000)

    res2 = page.evaluate("""() => {
        const doc = window.Se.doc;
        const app = window.app || window.xe;
        const modal = document.getElementById('cle-vellum-modal');
        const lastBody = doc.bodies[doc.bodies.length - 1];
        const lastSk = doc.sketches[doc.sketches.length - 1];
        const tightBox = lastBody ? app.scene.bodyTightBox(lastBody.id) : null;
        return {
            modalHidden: modal.style.display === 'none',
            activeWorkspace: document.querySelector('.wstabs button[aria-selected="true"]')?.id,
            bodiesCount: doc.bodies.length,
            bodyName: lastBody ? lastBody.name : null,
            bodyDist: lastBody ? lastBody.node.dist : null,
            bodyProfiles: lastBody ? lastBody.node.profiles : null,
            hasMesh: !!tightBox,
            center: tightBox ? [
                (tightBox.min.x + tightBox.max.x) / 2,
                (tightBox.min.y + tightBox.max.y) / 2,
                (tightBox.min.z + tightBox.max.z) / 2
            ] : null
        };
    }""")
    print("Option 2 Result:", res2)
    assert res2["modalHidden"], "Vellum modal did not close"
    assert res2["bodiesCount"] >= 1, "3D Body was not added"
    assert res2["bodyDist"] == 5.0, "Thickness should be 5.0"
    assert res2["hasMesh"], "3D Body Mesh was not generated by kernel"
    assert abs(res2["center"][0] - 300) < 0.1, f"Expected Center X 300, got {res2['center'][0]}"
    assert abs(res2["center"][1] - 250) < 0.1, f"Expected Center Y 250, got {res2['center'][1]}"
    assert abs(res2["center"][2] - 22.6) < 0.1, f"Expected Center Z ~22.6, got {res2['center'][2]}"

    # -------------------------------------------------------------
    # TEST 3: Option 3 - Raster Picture / Trace Reference
    # -------------------------------------------------------------
    print("\n--- TESTING OPTION 3: Raster Picture / Trace Reference ---")
    page.click("#cle-r-vellum")
    page.wait_for_timeout(1000)

    frame.evaluate("""() => {
        const vState = window.Vellum.state;
        const dummyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        vState.objects = [{
            id: 'o_picture_1',
            type: 'image',
            x: 50,
            y: 50,
            w: 120,
            h: 80,
            angle: 0,
            src: dummyPng,
            opacity: 0.85,
            visible: true
        }];
    }""")

    frame.click("#btnSaveToJS")
    page.wait_for_timeout(400)
    frame.click("#optModeImage")
    page.wait_for_timeout(200)
    frame.click("#confirmJsModalBtn")
    page.wait_for_timeout(1500)

    res3 = page.evaluate("""() => {
        const doc = window.Se.doc;
        const modal = document.getElementById('cle-vellum-modal');
        const lastSk = doc.sketches[doc.sketches.length - 1];
        return {
            modalHidden: modal.style.display === 'none',
            activeWorkspace: document.querySelector('.wstabs button[aria-selected="true"]')?.id,
            hasImage: !!lastSk?.image,
            imageWidth: lastSk?.image?.w,
            imageHeight: lastSk?.image?.h,
            imageCenter: [lastSk?.image?.cx, lastSk?.image?.cy],
            skOrigin: lastSk ? lastSk.plane.o : null
        };
    }""")
    print("Option 3 Result:", res3)
    assert res3["modalHidden"], "Vellum modal did not close"
    assert res3["hasImage"], "Sketch does not have image attached"
    assert res3["skOrigin"] == [300, 250, 20.1], f"Expected origin [300, 250, 20.1], got {res3['skOrigin']}"
    assert res3["imageCenter"] == [0, 0], f"Image offset should be centered (0,0), got {res3['imageCenter']}"

    print("\n========================================================")
    print("SUCCESS: ALL 3 VELLUM EXPORT OPTIONS VERIFIED ON 3D BED!")
    print("========================================================")
    browser.close()

