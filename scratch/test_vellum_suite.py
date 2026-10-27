import sys
from playwright.sync_api import sync_playwright

def test_vellum_suite():
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
        }""")
        page.wait_for_timeout(1000)

        # 1. Check CLE and Vellum bridge initialization
        has_bridge = page.evaluate("() => !!(window.CLE && window.CLE.vellum)")
        assert has_bridge, "window.CLE.vellum must be initialized"
        print("[TEST 1/6] CLE Vellum Bridge initialized: PASSED")

        # 2. Check wstabs has Vector Studio tab
        tab_text = page.evaluate("""() => {
            const tab = document.getElementById('ws-vellum');
            return tab ? tab.textContent : null;
        }""")
        assert tab_text == "Vector Studio", f"Expected 'Vector Studio', got {tab_text}"
        print("[TEST 2/6] Workspace tab 'Vector Studio' present in wstabs: PASSED")

        # 3. Test opening Vellum modal via tab click
        page.click("#ws-vellum")
        page.wait_for_timeout(1500)
        modal_visible = page.is_visible("#cle-vellum-modal")
        assert modal_visible, "#cle-vellum-modal should be visible after clicking ws-vellum tab"
        print("[TEST 3/6] Vellum modal opens on tab click: PASSED")

        # 4. Test iframe loaded Vellum app
        iframe_title = page.evaluate("""() => {
            const iframe = document.getElementById('cle-vellum-iframe');
            return (iframe && iframe.contentDocument) ? iframe.contentDocument.title : null;
        }""")
        print(f"Iframe document title: {iframe_title}")
        assert iframe_title and "Vellum" in iframe_title, f"Vellum app failed to load in iframe: {iframe_title}"
        print("[TEST 4/6] Vellum Studio loaded in iframe: PASSED")

        # 5. Test Option A: 2D Sketch Import Bridge
        res_a = page.evaluate("""() => {
            const bridge = window.CLE.vellum;
            const initialSketches = window.Se.doc.sketches.length;

            // Simulate Vellum exporting a closed polygon (40x30mm rectangle)
            const sampleSegments = [
                { type: 'M', x: -20, y: -15 },
                { type: 'L', x: 20, y: -15 },
                { type: 'L', x: 20, y: 15 },
                { type: 'L', x: -20, y: 15 },
                { type: 'Z' }
            ];

            bridge.handleExport({
                type: 'CLE_VELLUM_EXPORT',
                format: 'svg',
                svg: '<svg><rect x="-20" y="-15" width="40" height="30"/></svg>',
                objects: [{ visible: true, segments: sampleSegments }],
                mode: 'sketch',
                thickness: 5.0,
                plane: 'XY',
                name: 'Vellum Test Rect'
            });

            const newSketches = window.Se.doc.sketches.length;
            const lastSketch = window.Se.doc.sketches[newSketches - 1];

            return {
                added: newSketches > initialSketches,
                name: lastSketch.name,
                ptsCount: lastSketch.pts.length,
                entsCount: lastSketch.ents.length,
                isOpen: bridge.isOpen
            };
        }""")
        assert res_a["added"], "Sketch should be added to doc.sketches"
        assert res_a["entsCount"] == 4, f"Expected 4 line entities for rectangle, got {res_a['entsCount']}"
        assert not res_a["isOpen"], "Vellum modal should auto-close after export"
        print(f"[TEST 5/6] Option A (2D Sketch Import): PASSED - {res_a['entsCount']} entities, {res_a['ptsCount']} pts")

        # 6. Test Option B: Direct 3D Extruded Body Creation
        res_b = page.evaluate("""() => {
            const bridge = window.CLE.vellum;
            const initialBodies = window.Se.doc.bodies.length;

            const sampleHexSegments = [
                { type: 'M', x: 0, y: 25 },
                { type: 'L', x: 21.65, y: 12.5 },
                { type: 'L', x: 21.65, y: -12.5 },
                { type: 'L', x: 0, y: -25 },
                { type: 'L', x: -21.65, y: -12.5 },
                { type: 'L', x: -21.65, y: 12.5 },
                { type: 'Z' }
            ];

            bridge.handleExport({
                type: 'CLE_VELLUM_EXPORT',
                format: 'svg',
                svg: '<svg></svg>',
                objects: [{ visible: true, segments: sampleHexSegments }],
                mode: 'extrude',
                thickness: 12.5,
                plane: 'XY',
                name: 'Vellum Hex Solid'
            });

            const newBodies = window.Se.doc.bodies.length;
            const lastBody = window.Se.doc.bodies[newBodies - 1];

            return {
                added: newBodies > initialBodies,
                name: lastBody.name,
                dist: lastBody.node.dist,
                isExtrude: lastBody.node.t === 'extrude',
                bodyId: lastBody.id
            };
        }""")
        assert res_b["added"], "Body should be added to doc.bodies"
        assert res_b["isExtrude"], "Body node must be of type 'extrude'"
        assert res_b["dist"] == 12.5, f"Expected 12.5mm extrusion thickness, got {res_b['dist']}"
        print(f"[TEST 6/6] Option B (Direct 3D Extrusion): PASSED - Body '{res_b['name']}', dist={res_b['dist']}mm")

        # Verify 3D mesh built in JumpStart viewport
        page.wait_for_timeout(1000)
        has_mesh = page.evaluate("""(bodyId) => {
            const app = window.app || window.xe;
            const view = app.scene.views.get(bodyId);
            return !!(view && (view.mesh || view.data));
        }""", res_b["bodyId"])
        assert has_mesh, "3D Mesh must be built in Three.js viewport scene"
        print("[VERIFICATION] Three.js solid mesh built successfully: PASSED")

        browser.close()
        print("\n==========================================")
        print(" ALL 6 VELLUM INTEGRATION TESTS PASSED!   ")
        print("==========================================")

if __name__ == "__main__":
    test_vellum_suite()
