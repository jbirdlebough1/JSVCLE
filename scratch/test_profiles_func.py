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
        // Look at an existing sample or create a sketch with a box
        const skId = 'sk_test_profiles';
        const pts = [
            { id: 'p1', x: -20, y: -20 },
            { id: 'p2', x: 20, y: -20 },
            { id: 'p3', x: 20, y: 20 },
            { id: 'p4', x: -20, y: 20 }
        ];
        const ents = [
            { id: 'e1', t: 'line', a: 'p1', b: 'p2' },
            { id: 'e2', t: 'line', a: 'p2', b: 'p3' },
            { id: 'e3', t: 'line', a: 'p3', b: 'p4' },
            { id: 'e4', t: 'line', a: 'p4', b: 'p1' }
        ];
        const sk = {
            id: skId,
            name: 'TestSk',
            seq: 1,
            plane: { o: [300, 250, 20.1], x: [1, 0, 0], n: [0, 0, 1] },
            pts,
            ents
        };

        // Find the profile detector function (which was minified to Ei or similar)
        // Let's inspect window.Ei or search for function that takes sketch and returns profiles
        let detectedProfiles = null;
        for (let k of Object.keys(window)) {
            if (typeof window[k] === 'function') {
                try {
                    const r = window[k](sk);
                    if (Array.isArray(r) && r.length > 0 && r[0].poly) {
                        detectedProfiles = { funcName: k, profiles: r };
                        break;
                    }
                } catch(e) {}
            }
        }

        return {
            detectedProfiles
        };
    }""")
    print("Detected profiles function:", res)
    browser.close()

