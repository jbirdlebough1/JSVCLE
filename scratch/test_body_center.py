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
        
        const cx = 300, cy = 250, cz = 20.10;
        let skId = 'sk_center_' + Date.now();
        let bodyId = 'b_center_' + Date.now();
        
        window.Se.update(doc => {
            doc.sketches.push({
                id: skId,
                name: 'Center Bed Sketch',
                seq: ++doc.seq,
                plane: { o: [cx, cy, cz], x: [1, 0, 0], n: [0, 0, 1] },
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
            });
            
            doc.bodies.push({
                id: bodyId,
                name: 'Center Bed Body',
                seq: ++doc.seq,
                color: '#38bdf8',
                hole: false,
                hidden: false,
                m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
                node: {
                    t: 'extrude',
                    sketch: skId,
                    profiles: [{ key: 'p0', pt: [0, 0] }],
                    dist: 10.0,
                    mode: 'one',
                    dist2: 0,
                    mods: []
                }
            });
        }, 'Create body at bed center');
        
        app.scene.refresh();
        const view = app.scene.views.get(bodyId);
        let meshWorldPos = null;
        let bbox = null;
        if (view && view.mesh) {
            view.mesh.updateMatrixWorld(true);
            const p = new window.THREE.Vector3();
            view.mesh.getWorldPosition(p);
            meshWorldPos = { x: p.x, y: p.y, z: p.z };
            const b = new window.THREE.Box3().setFromObject(view.mesh);
            bbox = {
                min: { x: b.min.x, y: b.min.y, z: b.min.z },
                max: { x: b.max.x, y: b.max.y, z: b.max.z },
                center: { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2, z: (b.min.z + b.max.z) / 2 }
            };
        }
        
        return {
            hasMesh: !!(view && view.mesh)
        };
    }""")
    page.wait_for_timeout(1200)
    res2 = page.evaluate("""() => {
        const app = window.app || window.xe;
        const bodyId = window.Se.doc.bodies[0].id;
        const view = app.scene.views.get(bodyId);
        let bbox = null;
        if (view && view.mesh) {
            view.mesh.updateMatrixWorld(true);
            const b = new window.THREE.Box3().setFromObject(view.mesh);
            bbox = {
                min: { x: b.min.x, y: b.min.y, z: b.min.z },
                max: { x: b.max.x, y: b.max.y, z: b.max.z },
                center: { x: +( (b.min.x + b.max.x) / 2 ).toFixed(1), y: +( (b.min.y + b.max.y) / 2 ).toFixed(1), z: +( (b.min.z + b.max.z) / 2 ).toFixed(1) }
            };
        }
        return { hasMesh: !!(view && view.mesh), bbox };
    }""")
    print("Body Bed Center Result after wait:", res2)
    browser.close()
