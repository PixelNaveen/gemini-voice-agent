import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// F-35: a global `unhandledrejection` / `error` swallow used to filter out anything mentioning
// "WebSocket" or "vite". That was not only hiding HMR noise - it was hiding the failure of the
// call itself. The agent's live socket is a WebSocket, so a relay that refused the handshake, a
// rejected token, or a socket that died mid-call produced a console error that this handler
// silenced. The operator saw a call that had silently failed.
//
// The suppression is gone. HMR is configured in `vite.config.ts` and reports its own problems
// through Vite's own overlay, so nothing needed to be hidden here.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
