// Underworld is online only (docs/design.md §11): sign in, then play on the server with everyone else.
import { OnlineGate } from './net/OnlineGate';

export default function App() {
  return <OnlineGate />;
}
