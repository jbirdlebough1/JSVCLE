from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--allow-file-access-from-files", "--disable-web-security"]
        )
        page = browser.new_page(viewport={"width": 1400, "height": 900})

        print("[TEST] Navigating to file:///D:/CLEJS/Dev/index.htm...")
        page.goto("file:///D:/CLEJS/Dev/index.htm")
        page.wait_for_timeout(3500)

        # Set to Advanced mode
        page.evaluate("""() => {
            const app = window.app || window.xe;
            if (app && app.setMode) app.setMode('advanced');
        }""")
        page.wait_for_timeout(1000)

        # 1. Switch to CLE tab
        print("[TEST] Switching to CLE tab...")
        page.click("#ws-cle")
        page.wait_for_timeout(1000)

        # 2. Add an imported photo to the workspace (as if transferred from Vellum)
        print("[TEST] Adding photo to workspace...")
        photo_info = page.evaluate("""() => {
            const testPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
            const skId = 'sk_user_photo_1';
            window.Se.update(doc => {
                doc.sketches.push({
                    id: skId,
                    name: 'Family Portrait Photo',
                    seq: ++doc.seq,
                    plane: { o: [300, 250, 20.10], x: [1, 0, 0], n: [0, 0, 1] },
                    pts: [],
                    ents: [],
                    image: {
                        src: testPng,
                        name: 'Family Portrait Photo',
                        w: 120,
                        h: 90,
                        cx: 0,
                        cy: 0,
                        rot: 0,
                        opacity: 0.8
                    },
                    hidden: false
                });
            }, 'Add User Photo');

            const app = window.app || window.xe;
            if (app.scene && app.scene.refresh) app.scene.refresh();
            if (app.vp && app.vp.request) app.vp.request();

            const objs = window.CLE?.bed?.getBedObjects() || [];
            return {
                objsCount: objs.length,
                foundPhoto: objs.find(o => o.id === skId)
            };
        }""")
        print("  [PHOTO ON BED]:", photo_info)
        assert photo_info["foundPhoto"] is not None, "Photo not recognized in bed objects!"
        assert photo_info["foundPhoto"]["isImage"] == True, "Photo object must be marked isImage!"

        # 3. Test Bed Object Selection & HUD
        print("[TEST] Selecting photo on bed...")
        hud_active = page.evaluate("""() => {
            window.CLE.bed.selectBedObject('photo', 'sk_user_photo_1');
            const hud = document.getElementById('cle-bed-pos-hud');
            return {
                hasHud: !!hud,
                xVal: document.getElementById('cle-hud-inp-x')?.value,
                yVal: document.getElementById('cle-hud-inp-y')?.value
            };
        }""")
        print("  [HUD ACTIVE]:", hud_active)
        assert hud_active["hasHud"] == True, "Bed Positioning HUD not mounted!"
        assert float(hud_active["xVal"]) == 300.0, f"Expected X=300, got {hud_active['xVal']}"
        assert float(hud_active["yVal"]) == 250.0, f"Expected Y=250, got {hud_active['yVal']}"
        print("  [OK] Photo selected and Bed HUD mounted.")

        # 4. Test Moving Object around Bed
        print("[TEST] Moving photo to (180, 220)...")
        page.evaluate("""() => {
            window.CLE.bed.moveBedObject('photo', 'sk_user_photo_1', 180.0, 220.0);
        }""")
        page.wait_for_timeout(500)

        moved_coords = page.evaluate("""() => {
            const sk = window.Se.doc.sketches.find(s => s.id === 'sk_user_photo_1');
            return {
                x: sk?.plane?.o?.[0],
                y: sk?.plane?.o?.[1],
                hudX: document.getElementById('cle-hud-inp-x')?.value,
                hudY: document.getElementById('cle-hud-inp-y')?.value
            };
        }""")
        print("  [MOVED COORDS]:", moved_coords)
        assert moved_coords["x"] == 180.0, f"Expected X=180, got {moved_coords['x']}"
        assert moved_coords["y"] == 220.0, f"Expected Y=220, got {moved_coords['y']}"
        assert float(moved_coords["hudX"]) == 180.0
        assert float(moved_coords["hudY"]) == 220.0
        print("  [OK] Object moved smoothly on bed and HUD synchronized!")

        # 5. Open Grayscale 3D Modal and verify Photo is auto-selected!
        print("[TEST] Opening Grayscale 3D modal...")
        page.click("#cle-r-grayscale")
        page.wait_for_timeout(1000)

        modal_state = page.evaluate("""() => {
            const selectEl = document.getElementById('cle-gray-source-select');
            const statusEl = document.getElementById('cle-gray-status');
            const wInp = document.getElementById('cle-gray-w');
            const hInp = document.getElementById('cle-gray-h');
            const slicer = window.CLE?.slicer;
            return {
                selectedValue: selectEl?.value,
                statusText: statusEl?.textContent,
                wVal: wInp?.value,
                hVal: hInp?.value
            };
        }""")
        print("  [GRAYSCALE MODAL AUTO-SELECT]:", modal_state)
        assert modal_state["selectedValue"] == 'sk_user_photo_1', f"Expected sk_user_photo_1, got {modal_state['selectedValue']}"
        assert float(modal_state["wVal"]) == 120.0, f"Expected W=120, got {modal_state['wVal']}"
        assert float(modal_state["hVal"]) == 90.0, f"Expected H=90, got {modal_state['hVal']}"
        print("  [OK] Workspace photo was automatically selected with matched dimensions!")

        # 6. Test 'Slice to Continuous Z' from the selected photo
        print("[TEST] Slicing selected photo to continuous Z...")
        page.click("#cle-gray-slice-run-btn")
        page.wait_for_timeout(2000)

        slice_result = page.evaluate("""() => {
            const slicer = window.CLE?.slicer;
            return {
                layerCount: slicer?.slicedLayers?.length || 0,
                hasGCode: !!slicer?.rawGCode && slicer.rawGCode.length > 50
            };
        }""")
        print("  [SLICE RESULT]:", slice_result)
        assert slice_result["layerCount"] > 0, "No layers sliced from photo!"
        assert slice_result["hasGCode"] == True, "G-code not generated from photo!"
        print("  [OK] Photo sliced to continuous Z successfully!")

        page.screenshot(path="scratch/select_and_move_verified.png")
        print("[TEST] All Bed Selection, Move & Individual Slicing tests PASSED! Screenshot saved.")
        browser.close()

if __name__ == "__main__":
    run()

