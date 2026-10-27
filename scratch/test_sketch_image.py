from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=["--allow-file-access-from-files", "--disable-web-security"]
    )
    page = browser.new_page()
    page.goto("file:///D:/CLEJS/Dev/index.htm")
    page.wait_for_timeout(3500)

    # Tiny 1x1 red PNG data URL for testing
    sample_png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

    res = page.evaluate("""(pngSrc) => {
        const app = window.app || window.xe;
        app.setMode('advanced');
        
        let skId = 'sk_img_' + Date.now();
        window.Se.update(doc => {
            doc.sketches.push({
                id: skId,
                name: 'PNG Reference Image',
                seq: ++doc.seq,
                plane: { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] },
                pts: [],
                ents: [],
                image: {
                    src: pngSrc,
                    name: 'Test Image',
                    w: 120,
                    h: 80,
                    cx: 0,
                    cy: 0,
                    rot: 0,
                    opacity: 0.75
                },
                hidden: false
            });
        }, 'Import Image');
        
        app.scene.refresh();
        app.vp.request();
        
        const skView = app.scene.sketchViews ? app.scene.sketchViews.get(skId) : null;
        return {
            hasSketch: !!skView,
            sketchesCount: window.Se.doc.sketches.length
        };
    }""", sample_png)

    print("Result of adding image to sketch:", res)
    browser.close()
