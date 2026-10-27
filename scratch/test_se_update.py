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
        
        const hasSe = !!(window.Se && window.Se.update);
        let sketchAdded = false;
        let viewHasSketch = false;
        
        if (hasSe) {
            let newSkId = 'sk_' + Date.now();
            window.Se.update(doc => {
                doc.sketches.push({
                    id: newSkId,
                    name: 'Vellum Vector Sketch',
                    seq: ++doc.seq,
                    plane: { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] },
                    pts: [
                        { id: 'p1', x: -20, y: -20 },
                        { id: 'p2', x: 20, y: -20 },
                        { id: 'p3', x: 20, y: 20 },
                        { id: 'p4', x: -20, y: 20 }
                    ],
                    ents: [
                        { id: 'e1', t: 'line', a: 'p1', b: 'p2' },
                        { id: 'e2', t: 'line', a: 'p2', b: 'p3' },
                        { id: 'e3', t: 'line', a: 'p3', b: 'p4' },
                        { id: 'e4', t: 'line', a: 'p4', b: 'p1' }
                    ],
                    hidden: false
                });
            }, 'Import Vellum Vector');
            sketchAdded = true;
            viewHasSketch = app.scene.sketchViews && app.scene.sketchViews.has(newSkId);
        }
        
        return {
            hasSe,
            sketchAdded,
            viewHasSketch,
            sketchesCount: window.Se ? window.Se.doc.sketches.length : 0
        };
    }""")
    print("Test Se.update result:", res)
    browser.close()

