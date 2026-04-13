// Jest module mock: SVG files are bundled as data-URI strings at build time.
// Return a stub string so imports succeed and truthy checks pass in tests.
const fileMock = 'test-file-stub';
export default fileMock;
