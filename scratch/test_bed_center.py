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
        
        // Bed center
        const cx = 300, cy = 250, cz = 20.10;
        
        let skId = 'sk_center_' + Date.now();
        window.Se.update(doc => {
            doc.sketches.push({
                id: skId,
                name: 'Center Bed Test',
                seq: ++doc.seq,
                plane: { o: [cx, cy, cz], x: [1, 0, 0], n: [0, 0, 1] },
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
        }, 'Create sketch at bed center');
        
        app.scene.refresh();
        const skView = app.scene.sketchViews.get(skId);
        let worldPos = null;
        if (skView && skView.group) {
            skView.group.updateMatrixWorld(true);
            const p = new window.THREE.Vector3();
            skView.group.getWorldPosition(p);
            worldPos = { x: p.x, y: p.y, z: p.z };
        }
        
        return {
            hasView: !!skView,
            worldPos
        };
    }""")
    print("Bed Center Test Result:", res)
    browser.close()

