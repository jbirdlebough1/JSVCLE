const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Create mock DOM environment
const mockWindow = {
  document: {
    readyState: 'complete',
    addEventListener: () => {},
    createElement: (tag) => ({
      tagName: tag,
      style: {},
      classList: { add: () => {}, remove: () => {}, toggle: () => {} },
      appendChild: () => {},
      append: () => {},
      setAttribute: () => {},
      getAttribute: () => null,
      addEventListener: () => {},
      getContext: () => ({
        clearRect: () => {},
        fillText: () => {},
        strokeText: () => {},
        measureText: () => ({ width: 50 })
      })
    }),
    getElementById: (id) => null,
    querySelector: (sel) => null,
    querySelectorAll: (sel) => [],
    body: { appendChild: () => {}, classList: { add: () => {}, remove: () => {} } }
  },
  localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  },
  navigator: {},
  THREE: {
    Group: class { add() {} remove() {} },
    BoxGeometry: class {},
    EdgesGeometry: class {},
    RingGeometry: class {},
    ConeGeometry: class {},
    CylinderGeometry: class {},
    BufferGeometry: class { setAttribute() {} setFromPoints() { return this; } },
    Float32BufferAttribute: class {},
    BufferAttribute: class { setXYZ() {} },
    LineBasicMaterial: class {},
    LineDashedMaterial: class {},
    MeshStandardMaterial: class {},
    MeshBasicMaterial: class {},
    SpriteMaterial: class {},
    Sprite: class { position = { set: () => {} }; scale = { set: () => {} }; },
    Mesh: class { position = { set: () => {} }; add() {} },
    LineSegments: class { add() {} computeLineDistances() {} },
    Line: class { add() {} computeLineDistances() {} },
    CanvasTexture: class {},
    LinearFilter: 1006,
    DoubleSide: 2,
    Vector3: class { set() {} }
  },
  console: console,
  requestAnimationFrame: (cb) => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval
};
mockWindow.window = mockWindow;
mockWindow.self = mockWindow;

const context = vm.createContext(mockWindow);
const bundlePath = path.resolve(__dirname, '..', 'Dev', 'cle_tools', 'cle_bundle.js');
const bundleCode = fs.readFileSync(bundlePath, 'utf8');

try {
  vm.runInContext(bundleCode, context);
  console.log('Bundle executed in mock browser context!');
    console.log('window.CLE exists?', !!mockWindow.window.CLE);
    if (mockWindow.window.CLE) {
      console.log('CLE version:', mockWindow.window.CLE.version);
      console.log('CLE modules:', Object.keys(mockWindow.window.CLE));
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (e) {
    console.error('RUNTIME ERROR IN BUNDLE:', e);
    process.exit(1);
  }
