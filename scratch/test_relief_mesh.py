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
        const THREE = window.THREE;
        if (!THREE) return { error: "No THREE" };

        // Test creating a 3D relief mesh
        const cols = 40, rows = 40;
        const width = 100, height = 80, depth = 6, base = 2;
        const geom = new THREE.PlaneGeometry(width, height, cols - 1, rows - 1);
        const pos = geom.attributes.position;

        // Displace Z based on dummy gradient
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const y = pos.getY(i);
            const r = Math.sqrt(x*x + y*y) / (width/2);
            const z = base + (1 - Math.min(1, r)) * depth;
            pos.setZ(i, z);
        }
        geom.computeVertexNormals();

        const mat = new THREE.MeshStandardMaterial({ color: 0xd4a373, roughness: 0.5, metalness: 0.1 });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(300, 250, 20.10);

        const app = window.app || window.xe;
        const scene = app.vp?.scene || app.vp?.world;
        scene.add(mesh);

        return {
            created: true,
            vertexCount: pos.count,
            meshPosition: [mesh.position.x, mesh.position.y, mesh.position.z]
        };
    }""")
    print("Relief mesh test:", res)
    browser.close()

