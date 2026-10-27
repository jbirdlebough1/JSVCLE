from playwright.sync_api import sync_playwright

def test_png_transfer():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--allow-file-access-from-files", "--disable-web-security"]
        )
        page = browser.new_page()
        page.goto("file:///D:/CLEJS/Dev/index.htm")
        page.wait_for_timeout(3500)

        # Switch to Advanced mode
        page.evaluate("""() => {
            if (window.app && window.app.setMode) window.app.setMode('advanced');
        }""")
        page.wait_for_timeout(1000)

        # 1x1 test png
        sample_png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

        res = page.evaluate("""(pngSrc) => {
            const bridge = window.CLE.vellum;
            const initCount = window.Se.doc.sketches.length;

            // Simulate Vellum exporting an image object
            bridge.handleExport({
                type: 'CLE_VELLUM_EXPORT',
                format: 'svg',
                svg: '<svg></svg>',
                objects: [{
                    type: 'image',
                    visible: true,
                    src: pngSrc,
                    x: 0,
                    y: 0,
                    w: 250,
                    h: 180,
                    angle: 0
                }],
                images: [{
                    src: pngSrc,
                    x: 0,
                    y: 0,
                    w: 250,
                    h: 180,
                    angle: 0
                }],
                mode: 'image',
                thickness: 5.0,
                plane: 'XY',
                name: 'My Vellum PNG'
            });

            const newCount = window.Se.doc.sketches.length;
            const lastSketch = window.Se.doc.sketches[newCount - 1];
            const inActiveSketch = window.app.sketcher ? (window.app.sketcher.active === lastSketch.id) : false;

            return {
                added: newCount > initCount,
                sketchName: lastSketch.name,
                hasImage: !!(lastSketch.image),
                imageSrc: lastSketch.image ? lastSketch.image.src.slice(0, 30) : null,
                imgW: lastSketch.image ? lastSketch.image.w : 0,
                imgH: lastSketch.image ? lastSketch.image.h : 0,
                inActiveSketch: inActiveSketch,
                isOpen: bridge.isOpen
            };
        }""", sample_png)

        print("Test PNG Transfer Result:", res)
        assert res["added"], "Sketch should be added"
        assert res["hasImage"], "Image must be attached to sketch"
        assert res["inActiveSketch"], "User should be entered into the sketch"
        assert not res["isOpen"], "Modal must close"
        print("ALL PNG TRANSFER CHECKS PASSED!")
        browser.close()

if __name__ == "__main__":
    test_png_transfer()
