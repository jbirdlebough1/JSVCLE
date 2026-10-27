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
        
        let newSkId = 'sk_' + Date.now();
        window.Se.update(doc => {
            doc.sketches.push({
                id: newSkId,
                name: 'Extrude Test',
                seq: ++doc.seq,
                plane: { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] },
                pts: [
                    { id: 'p1', x: -15, y: -15 },
                    { id: 'p2', x: 15, y: -15 },
                    { id: 'p3', x: 15, y: 15 },
                    { id: 'p4', x: -15, y: 15 }
                ],
                ents: [
                    { id: 'e1', t: 'line', a: 'p1', b: 'p2' },
                    { id: 'e2', t: 'line', a: 'p2', b: 'p3' },
                    { id: 'e3', t: 'line', a: 'p3', b: 'p4' },
                    { id: 'e4', t: 'line', a: 'p4', b: 'p1' }
                ],
                hidden: false
            });
        }, 'Create sketch');
        
        app.enterSketch(newSkId);
        const inSketch = app.sketcher.active === newSkId;
        app.quickExtrude();
        
        // Check if command is extrude
        const cmdTitle = app.command ? app.command.title : null;
        const okBtn = document.getElementById('cmd-ok');
        if (okBtn) okBtn.click();
        
        return {
            inSketch,
            cmdTitle,
            bodiesCount: window.Se.doc.bodies.length
        };
    }""")
    print("Extrude test result:", res)
    page.wait_for_timeout(1000)
    final_bodies = page.evaluate("() => window.Se.doc.bodies.length")
    print("Final bodies:", final_bodies)
    browser.close()
