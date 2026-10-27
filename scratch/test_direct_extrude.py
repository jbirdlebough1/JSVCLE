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
        
        let skId = 'sk_' + Date.now();
        let bodyId = 'b_' + Date.now();
        
        window.Se.update(doc => {
            const sk = {
                id: skId,
                name: 'Direct Extrude Sketch',
                seq: ++doc.seq,
                plane: { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] },
                pts: [
                    { id: 'p1', x: -30, y: -20 },
                    { id: 'p2', x: 30, y: -20 },
                    { id: 'p3', x: 30, y: 20 },
                    { id: 'p4', x: -30, y: 20 }
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
            
            // Build body directly
            doc.bodies.push({
                id: bodyId,
                name: 'Vellum 3D Body',
                seq: ++doc.seq,
                color: '#38bdf8',
                hole: false,
                hidden: false,
                m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
                node: {
                    t: 'extrude',
                    sketch: skId,
                    profiles: [{ key: 'p0', pt: [0, 0] }],
                    dist: 15.0,
                    mode: 'one',
                    dist2: 0,
                    mods: []
                }
            });
        }, 'Direct Extrude Test');
        
        return {
            bodiesCount: window.Se.doc.bodies.length,
            hasView: app.scene.views.has(bodyId)
        };
    }""")
    print("Direct extrude result:", res)
    page.wait_for_timeout(1000)
    has_mesh = page.evaluate("""(bodyId) => {
        const app = window.app || window.xe;
        const view = app.scene.views.get(window.Se.doc.bodies[0].id);
        return !!(view && (view.mesh || view.data));
    }""")
    print("Has mesh in 3D scene:", has_mesh)
    browser.close()
