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
        const cx = 300, cy = 250, cz = 20.10;
        const skId = 'sk_test_ei';
        
        // A box from -50 to +50
        const pts = [
            { id: 'p_1', x: -50, y: 50 },
            { id: 'p_2', x: 50, y: 50 },
            { id: 'p_3', x: 50, y: -50 },
            { id: 'p_4', x: -50, y: -50 }
        ];
        const ents = [
            { id: 'e_1', t: 'line', a: 'p_1', b: 'p_2' },
            { id: 'e_2', t: 'line', a: 'p_2', b: 'p_3' },
            { id: 'e_3', t: 'line', a: 'p_3', b: 'p_4' },
            { id: 'e_4', t: 'line', a: 'p_4', b: 'p_1' }
        ];
        const sk = {
            id: skId,
            name: 'Box',
            plane: { o: [cx, cy, cz], x: [1, 0, 0], n: [0, 0, 1] },
            pts,
            ents
        };

        // Find Ei or get profiles
        // Let's see how JumpStart finds profiles:
        // In Dev/index.htm, is Ei accessible via any object?
        const app = window.app || window.xe;
        return {
            hasEi: typeof window.Ei,
            kernelProfiles: typeof app.kernel?.profiles,
            sceneProfiles: typeof app.scene?.profiles
        };
    }""")
    print("Profile access:", res)
    browser.close()

