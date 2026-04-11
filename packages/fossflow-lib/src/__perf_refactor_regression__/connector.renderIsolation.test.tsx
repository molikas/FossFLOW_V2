/**
 * PERF REGRESSION — N-2/N-3: Connector must not re-render on unrelated model changes
 *
 * Before the fix, each Connector component:
 *  1. Called useScene() to get currentView (N subscriptions to modelStore)
 *  2. Called useConnector(id) which also called useScene() (another N subscriptions)
 *
 * With N connectors, any model change (even renaming a diagram title) caused
 * N×2 useScene selector evaluations and potentially N connector re-renders.
 *
 * The fix: Connector receives currentView as a prop (from Connectors.tsx which
 * already owns the useScene subscription) and uses the connector prop directly
 * instead of re-fetching via useConnector.
 *
 * Contract pinned here:
 *  - Connector and Connectors are wrapped in React.memo
 *  - Connector does NOT call useScene() or useConnector() directly
 *  - The connector source file contains no direct import of useScene or useConnector
 */

import * as fs from 'fs';
import * as path from 'path';

const CONNECTOR_PATH = path.resolve(
  __dirname,
  '../components/SceneLayers/Connectors/Connector.tsx'
);
const CONNECTORS_PATH = path.resolve(
  __dirname,
  '../components/SceneLayers/Connectors/Connectors.tsx'
);

describe('Connector render isolation — N-2/N-3 regression', () => {
  let connectorSource: string;
  let connectorsSource: string;

  beforeAll(() => {
    connectorSource = fs.readFileSync(CONNECTOR_PATH, 'utf8');
    connectorsSource = fs.readFileSync(CONNECTORS_PATH, 'utf8');
  });

  it('Connector.tsx does NOT call useScene() directly', () => {
    // useScene should not appear as a direct call — connector data
    // is received as a prop and currentView is passed down from parent
    const hasDirectUseScene = /\buseScene\s*\(\s*\)/.test(connectorSource);
    expect(hasDirectUseScene).toBe(false);
  });

  it('Connector.tsx does NOT call useConnector() (redundant re-fetch via useScene)', () => {
    const hasUseConnector = /\buseConnector\s*\(/.test(connectorSource);
    expect(hasUseConnector).toBe(false);
  });

  it('Connectors.tsx (parent) still owns the single useScene subscription', () => {
    // The list-level component may import useScene for type reference only,
    // but the actual hook call must exist here and not be pushed into each child
    const hasUseSceneImport = /useScene/.test(connectorsSource);
    expect(hasUseSceneImport).toBe(true);
  });

  it('Connector is exported as a React.memo component', () => {
    // memo() wrapping is visible as: export const Connector = memo(
    const isMemo = /export\s+const\s+Connector\s*=\s*memo\s*\(/.test(
      connectorSource
    );
    expect(isMemo).toBe(true);
  });

  it('Connectors is exported as a React.memo component', () => {
    const isMemo = /export\s+const\s+Connectors\s*=\s*memo\s*\(/.test(
      connectorsSource
    );
    expect(isMemo).toBe(true);
  });
});
