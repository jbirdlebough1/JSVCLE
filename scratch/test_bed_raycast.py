from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=["--allow-file-access-from-files", "--disable-web-security"]
    )
    page = browser.new_page(viewport={"width": 1400, "height": 900})
    page.goto("file:///D:/CLEJS/Dev/index.htm")
    page.wait_for_timeout(3500)

    # 1. Add a sample sketch with image and a sample 3D body
    res = page.evaluate("""() => {
        const app = window.app || window.xe;
        app.setMode('advanced');

        // Tiny 2x2 test PNG
        const testPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

        let skId = 'sk_test_photo';
        window.Se.update(doc => {
            // Add sketch with image at bed center (300, 250, 20.10)
            doc.sketches.push({
                id: skId,
                name: 'Vellum Photo Test',
                seq: ++doc.seq,
                plane: { o: [300, 250, 20.10], x: [1, 0, 0], n: [0, 0, 1] },
                pts: [],
                ents: [],
                image: {
                    src: testPng,
                    name: 'Vellum Photo Test',
                    w: 100,
                    h: 80,
                    cx: 0,
                    cy: 0,
                    rot: 0,
                    opacity: 0.8
                },
                hidden: false
            });
        }, 'Add Test Photo');

        app.scene.refresh();
        app.vp.request();

        const skView = app.scene.sketchViews ? app.scene.sketchViews.get(skId) : null;
        const group = skView ? skView.group : null;
        
        let childrenCount = group ? group.children.length : 0;
        let imgChild = group ? group.children.find(c => c.isMesh) : null;

        return {
            hasSketchView: !!skView,
            childrenCount,
            hasImgMesh: !!imgChild,
            meshPosition: imgChild ? { x: group.position.x, y: group.position.y, z: group.position.z } : null
        };
    }""")

    print("[TEST RESULT]:", res)
    browser.close()
