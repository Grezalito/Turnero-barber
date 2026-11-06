import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { BookingStatusPage, matchBookingRoute } from './components/BookingStatusPage';
import './index.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch(() => {
        // Registro de Service Worker para PWA / TWA
      });
  });
}

// Ruta pública de la reserva (/reserva/:id?ref=...): pantalla liviana, independiente del resto de la app.
const bookingSlotId = matchBookingRoute(window.location.pathname);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {bookingSlotId ? (
      <BookingStatusPage
        slotId={bookingSlotId}
        refToken={new URLSearchParams(window.location.search).get('ref')}
      />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
