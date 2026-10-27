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

        # 2. Check Grayscale 3D button in ribbon
        print("[TEST] Checking for '#cle-r-grayscale' ribbon button...")
        gray_btn = page.wait_for_selector("#cle-r-grayscale", timeout=5000)
        assert gray_btn is not None, "Ribbon button '#cle-r-grayscale' not found!"
        print("  [OK] Ribbon button '#cle-r-grayscale' exists.")

        # 3. Click '#cle-r-grayscale' to open modal
        print("[TEST] Clicking '#cle-r-grayscale' to open modal...")
        gray_btn.click()
        page.wait_for_timeout(1000)

        modal = page.wait_for_selector("#cle-active-modal", timeout=5000)
        assert modal is not None, "Active modal not found!"

        # Check that Grayscale tab and panel are active
        gray_panel = page.wait_for_selector("#cle-slicer-panel-gray", timeout=5000)
        is_visible = gray_panel.is_visible()
        assert is_visible, "Grayscale panel should be visible when opened via #cle-r-grayscale!"
        print("  [OK] Grayscale panel is visible.")

        # Check preview canvas
        canvas = page.wait_for_selector("#cle-gray-preview-canvas", timeout=5000)
        assert canvas is not None, "Preview canvas not found!"
        print("  [OK] Preview canvas rendered.")

        # 4. Test Tab Switching to CAD slicer and back
        print("[TEST] Testing tab switching...")
        page.click("#cle-slicer-tab-cad")
        page.wait_for_timeout(400)
        cad_visible = page.is_visible("#cle-slicer-panel-cad")
        gray_visible = page.is_visible("#cle-slicer-panel-gray")
        assert cad_visible and not gray_visible, "CAD panel should be visible, Gray hidden!"

        page.click("#cle-slicer-tab-gray")
        page.wait_for_timeout(400)
        cad_visible = page.is_visible("#cle-slicer-panel-cad")
        gray_visible = page.is_visible("#cle-slicer-panel-gray")
        assert gray_visible and not cad_visible, "Gray panel should be visible, CAD hidden!"
        print("  [OK] Tab switching works smoothly.")

        # 5. Test 'Create 3D Object in Workspace'
        print("[TEST] Testing 'Create 3D Object in Workspace' button...")
        create_btn = page.wait_for_selector("#cle-gray-create-3d-btn", timeout=5000)
        create_btn.click()
        page.wait_for_timeout(2000)

        # Verify modal closed
        modal_closed = not page.is_visible("#cle-active-modal")
        assert modal_closed, "Modal should close after creating 3D object!"
        print("  [OK] Modal closed.")

        # Verify 3D relief mesh created in scene at bed center
        mesh_info = page.evaluate('''() => {
            const slicer = window.CLE?.slicer;
            const mesh = slicer?.reliefMesh;
            if (!mesh) return null;
            return {
                name: mesh.name,
                position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
                vertexCount: mesh.geometry.attributes.position.count,
                indexCount: mesh.geometry.index.count
            };
        }''')
        print("  [RELIEF MESH INFO]:", mesh_info)
        assert mesh_info is not None, "Relief mesh not found on slicer!"
        assert mesh_info["position"]["x"] == 300.0, f"Expected X=300, got {mesh_info['position']['x']}"
        assert mesh_info["position"]["y"] == 250.0, f"Expected Y=250, got {mesh_info['position']['y']}"
        assert abs(mesh_info["position"]["z"] - 20.10) < 0.01, f"Expected Z=20.10, got {mesh_info['position']['z']}"
        assert mesh_info["vertexCount"] > 1000, f"Expected >1000 vertices, got {mesh_info['vertexCount']}"
        print("  [OK] 3D Relief mesh generated at bed center (300, 250, 20.10) with solid geometry!")

        # 6. Test 'Slice to Continuous Z'
        print("[TEST] Re-opening modal and testing 'Slice to Continuous Z'...")
        page.click("#ws-cle")
        page.wait_for_timeout(500)
        page.click("#cle-r-grayscale")
        page.wait_for_timeout(1000)

        slice_btn = page.wait_for_selector("#cle-gray-slice-run-btn", timeout=5000)
        slice_btn.click()
        page.wait_for_timeout(2000)

        # Check slices in scene and HUD mounted
        slice_info = page.evaluate('''() => {
            const slicer = window.CLE?.slicer;
            return {
                layerCount: slicer?.slicedLayers?.length || 0,
                hasGCode: !!slicer?.rawGCode && slicer.rawGCode.length > 50,
                gcodePreview: slicer?.rawGCode?.split('\\n').slice(0, 5).join('; ')
            };
        }''')
        print("  [SLICE INFO]:", slice_info)
        assert slice_info["layerCount"] > 0, "No slices generated!"
        assert slice_info["hasGCode"], "No G-code generated!"

        hud = page.wait_for_selector("#cle-slicer-hud", timeout=5000)
        assert hud is not None, "Slicer HUD not mounted!"
        print("  [OK] Continuous Z slices generated, G-code built, and HUD mounted!")

        page.screenshot(path="scratch/grayscale_relief_verified.png")
        print("[TEST] All Grayscale 3D tests PASSED! Screenshot saved to scratch/grayscale_relief_verified.png")
        browser.close()

if __name__ == "__main__":
    run()
