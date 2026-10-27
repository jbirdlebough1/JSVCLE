from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=["--allow-file-access-from-files", "--disable-web-security"]
    )
    page = browser.new_page()
    page.goto("file:///D:/CLEJS/Dev/index.htm")
    page.wait_for_timeout(3500)

    res = page.evaluate("""() => {
        const app = window.app || window.xe;
        app.setMode('advanced');
        const doc = app.scene.doc;
        
        const skId = 's_test_' + Date.now();
        const sk = {
            id: skId,
            name: 'Vellum Test Sketch',
            seq: ++doc.seq,
            plane: { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] },
            pts: [
                { id: 'p1', x: -25, y: -25 },
                { id: 'p2', x: 25, y: -25 },
                { id: 'p3', x: 25, y: 25 },
                { id: 'p4', x: -25, y: 25 }
            ],
            ents: [
                { id: 'e1', t: 'line', a: 'p1', b: 'p2' },
                { id: 'e2', t: 'line', a: 'p2', b: 'p3' },
                { id: 'e3', t: 'line', a: 'p3', b: 'p4' },
                { id: 'e4', t: 'line', a: 'p4', b: 'p1' }
            ],
            hidden: false
        };
        doc.sketches.push(sk);
        app.scene.refresh();
        if (app.refreshUI) app.refreshUI('change');
        
        return {
            sketchesCount: doc.sketches.length,
            viewHasSketch: app.scene.sketchViews && app.scene.sketchViews.has(skId)
        };
    }""")
    print("Add sketch result:", res)
    browser.close()
