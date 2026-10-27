from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=["--allow-file-access-from-files", "--disable-web-security"]
    )
    page = browser.new_page()
    page.goto("file:///D:/CLEJS/Dev/index.htm")
    page.wait_for_timeout(3500)

    # 1. Verify Topbar buttons exist
    btns = page.evaluate("""() => {
        return {
            hasNew: !!document.getElementById('btn-new-project'),
            hasSave: !!document.getElementById('btn-save-project'),
            hasSaveAs: !!document.getElementById('btn-save-as-project'),
            menuNew: !!document.querySelector('#menu-export [data-act="new"]'),
            menuSave: !!document.querySelector('#menu-export [data-act="save"]'),
            menuSaveAs: !!document.querySelector('#menu-export [data-act="saveas"]')
        };
    }""")
    print("Buttons check:", btns)
    assert btns["hasNew"] and btns["hasSave"] and btns["hasSaveAs"], "Missing topbar buttons"
    assert btns["menuNew"] and btns["menuSave"] and btns["menuSaveAs"], "Missing menu buttons"

    # 2. Test Vellum Export at Bed Center (300, 250, 20.10)
    export_res = page.evaluate("""() => {
        // Clear previous bodies/sketches
        if (window.CLE && window.CLE.newProject) {
            window.CLE.newProject(true); // force new project
        }

        // Send a vector rectangle export from Vellum
        const rectSvg = '<svg width=\"50\" height=\"50\"><rect x=\"0\" y=\"0\" width=\"50\" height=\"50\" fill=\"#38bdf8\"/></svg>';
        const payload = {
            type: 'CLE_VELLUM_EXPORT',
            name: 'BedCenterBox',
            mode: 'extrude',
            thickness: 10,
            plane: 'XY',
            svg: rectSvg,
            objects: [{
                name: 'BedCenterBox',
                type: 'path',
                segments: [
                    { type: 'M', x: -25, y: -25 },
                    { type: 'L', x: 25, y: -25 },
                    { type: 'L', x: 25, y: 25 },
                    { type: 'L', x: -25, y: 25 },
                    { type: 'Z' }
                ]
            }],
            images: []
        };

        window.CLE.vellum.handleExport(payload);

        const doc = window.Se ? window.Se.doc : null;
        const sk = doc && doc.sketches ? doc.sketches[doc.sketches.length - 1] : null;
        const body = doc && doc.bodies ? doc.bodies[doc.bodies.length - 1] : null;

        return {
            skOrigin: sk ? sk.plane.o : null,
            bodyDist: body ? body.node.dist : null,
            bodyCount: doc.bodies.length,
            sketchCount: doc.sketches.length
        };
    }""")
    print("Export result:", export_res)
    assert export_res["skOrigin"] == [300, 250, 20.10], f"Expected [300, 250, 20.10], got {export_res['skOrigin']}"
    assert export_res["bodyCount"] == 1, "Body should have been created"

    # Wait for kernel extrusion mesh to compute
    page.wait_for_timeout(1000)
    box_res = page.evaluate("""() => {
        const doc = window.Se.doc;
        const body = doc.bodies[doc.bodies.length - 1];
        const app = window.app || window.xe;
        const tightBox = app.scene.bodyTightBox(body.id);
        if (!tightBox) return { hasMesh: false };
        const center = new window.THREE.Vector3();
        tightBox.getCenter(center);
        return {
            hasMesh: true,
            min: [tightBox.min.x, tightBox.min.y, tightBox.min.z],
            max: [tightBox.max.x, tightBox.max.y, tightBox.max.z],
            center: [center.x, center.y, center.z]
        };
    }""")
    print("3D Body Bounding Box at Bed Center:", box_res)
    assert box_res["hasMesh"], "Kernel mesh not generated"
    assert abs(box_res["center"][0] - 300) < 0.1, f"Center X expected 300, got {box_res['center'][0]}"
    assert abs(box_res["center"][1] - 250) < 0.1, f"Center Y expected 250, got {box_res['center'][1]}"
    assert abs(box_res["center"][2] - 25.10) < 0.1, f"Center Z expected 25.10, got {box_res['center'][2]}"

    # 3. Test New Project Button clears workspace
    new_res = page.evaluate("""() => {
        // Trigger New Project
        window.CLE.newProject(true);
        const doc = window.Se.doc;
        return {
            bodyCount: doc.bodies.length,
            sketchCount: doc.sketches.length,
            docName: doc.name
        };
    }""")
    print("New Project clear result:", new_res)
    assert new_res["bodyCount"] == 0, "Bodies not cleared"
    assert new_res["sketchCount"] == 0, "Sketches not cleared"

    # 4. Test Save & Save As
    save_res = page.evaluate("""async () => {
        // Create a dummy sketch to save
        window.Se.update(d => {
            d.sketches.push({ id: 'sk_test', name: 'Test', plane: { o:[0,0,0], x:[1,0,0], n:[0,0,1] }, pts:[], ents:[] });
            d.name = 'InitialProject';
        }, 'add test');

        await window.CLE.saveProject();
        const verAfterSave = window.Se.doc.ver || 1;

        // Now Save As
        await window.CLE.saveProjectAs('MyRenamedProject');
        const nameAfterSaveAs = window.Se.doc.name;

        return {
            verAfterSave,
            nameAfterSaveAs
        };
    }""")
    print("Save / Save As result:", save_res)
    assert save_res["nameAfterSaveAs"] == "MyRenamedProject", "Doc name not updated on Save As"

    print("\nALL VERIFICATION CHECKS PASSED PERFECTLY!")
    browser.close()

