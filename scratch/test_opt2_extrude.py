from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=["--allow-file-access-from-files", "--disable-web-security"]
    )
    page = browser.new_page()
    page.goto("file:///D:/CLEJS/Dev/index.htm")
    page.wait_for_timeout(3500)

    # Click CLE tab
    page.click("#ws-cle")
    page.wait_for_timeout(500)
    page.click("#cle-r-vellum")
    page.wait_for_timeout(1000)

    iframe_handle = page.query_selector("#cle-vellum-iframe")
    frame = iframe_handle.content_frame()

    # Add a rectangle
    frame.evaluate("""() => {
        const rect = {
            id: 'o_test_rect',
            type: 'path',
            closed: true,
            angle: 0,
            fill: '#38bdf8',
            stroke: '#0284c7',
            strokeWidth: 2,
            visible: true,
            segments: [
                { type: 'M', x: 50, y: 50 },
                { type: 'L', x: 150, y: 50 },
                { type: 'L', x: 150, y: 150 },
                { type: 'L', x: 50, y: 150 },
                { type: 'Z' }
            ]
        };
        state.objects.push(rect);
    }""")

    frame.click("#btnSaveToJS")
    page.wait_for_timeout(500)

    # Test Option 2: 3D Extruded Body
    frame.click("#optModeExtrude")
    page.wait_for_timeout(200)

    frame.click("#confirmJsModalBtn")
    page.wait_for_timeout(2000)

    res = page.evaluate("""() => {
        const doc = window.Se.doc;
        const app = window.app || window.xe;
        const body = doc.bodies[doc.bodies.length - 1];
        const tightBox = app.scene.bodyTightBox(body?.id);
        const bodyMesh = app.scene.views.get(body?.id)?.mesh;
        return {
            bodiesCount: doc.bodies.length,
            bodyNode: body ? body.node : null,
            hasMesh: !!bodyMesh,
            tightBox: tightBox ? { min: tightBox.min, max: tightBox.max } : null,
            activeWorkspace: document.querySelector('.wstabs button[aria-selected=\"true\"]')?.id,
            bedVisible: window.CLE?.bed?.visible
        };
    }""")
    print("Option 2 (Extrude) result:", res)

    browser.close()
