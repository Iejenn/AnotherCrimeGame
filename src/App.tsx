// Underworld is online only (docs/design.md §11): sign in, then play on the server with everyone else.
import { OnlineGate } from './net/OnlineGate';
import { useUpdateCheck } from './useUpdateCheck';

export default function App() {
  const outdated = useUpdateCheck();
  return (
    <>
      <OnlineGate />
      {outdated && (
        <div className="update-banner" role="status">
          A new version of Underworld is out. Updating…
        </div>
      )}
    </>
  );
}
