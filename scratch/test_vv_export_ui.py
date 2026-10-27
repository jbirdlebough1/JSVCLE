from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=["--allow-file-access-from-files", "--disable-web-security"]
    )
    page = browser.new_page()
    page.goto("file:///D:/CLEJS/Dev/index.htm")
    page.wait_for_timeout(3500)

    # Switch to Advanced mode if in beginner mode
    page.evaluate("""() => {
        const app = window.app || window.xe;
        if (app && app.setMode) app.setMode('advanced');
    }""")
    page.wait_for_timeout(1000)

    # Now wstabs should be present
    wstabs = page.evaluate("""() => {
        return Array.from(document.querySelectorAll('.wstabs button')).map(b => ({ id: b.id, text: b.textContent }));
    }""")
    print("wstabs found:", wstabs)

    # Click CLE tab
    page.click("#ws-cle")
    page.wait_for_timeout(500)

    # Click Vector Studio
    page.click("#cle-r-vellum")
    page.wait_for_timeout(1000)

    iframe_handle = page.query_selector("#cle-vellum-iframe")
    frame = iframe_handle.content_frame()
    print("Vellum loaded in iframe:", bool(frame))

    # Add a rectangle to Vellum state.objects
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

    # 1. Open Modal
    frame.click("#btnSaveToJS")
    page.wait_for_timeout(500)
    print("Modal is visible:", frame.is_visible("#jsExportModal"))

    # Test Option 2: 3D Extruded Body
    frame.click("#optModeExtrude")
    page.wait_for_timeout(200)

    frame.click("#confirmJsModalBtn")
    page.wait_for_timeout(1500)

    # Check parent
    res = page.evaluate("""() => {
        const modal = document.getElementById('cle-vellum-modal');
        const doc = window.Se.doc;
        const app = window.app || window.xe;
        const lastBody = doc.bodies[doc.bodies.length - 1];
        const lastSketch = doc.sketches[doc.sketches.length - 1];
        return {
            modalDisplay: modal.style.display,
            activeWorkspace: document.querySelector('.wstabs button[aria-selected=\"true\"]')?.id,
            bodiesCount: doc.bodies.length,
            sketchesCount: doc.sketches.length,
            lastBody: lastBody ? { id: lastBody.id, name: lastBody.name, node: lastBody.node } : null,
            lastSketch: lastSketch ? { id: lastSketch.id, name: lastSketch.name, plane: lastSketch.plane } : null,
            sketcherActive: !!app.sketcher?.active,
            sceneMeshCount: app.scene.views.size
        };
    }""")
    print("Result after Option 2:", res)

    browser.close()
