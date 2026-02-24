import { Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
import HblUnifiedCardCheckout from './HblUnifiedCardCheckout';

const SummaryPage = () => (
  <div style={{ padding: '2rem', textAlign: 'center' }}>
    <h1>Payment Summary</h1>
    <p>Your payment process has been completed or cancelled.</p>
    <button onClick={() => window.location.href = '/'}>Go Back to Checkout</button>
  </div>
);

function App() {
  return (
    <Routes>
      <Route path="/" element={<HblUnifiedCardCheckout />} />
      <Route path="/summary-page" element={<SummaryPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
