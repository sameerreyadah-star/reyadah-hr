import React from 'react';
import { ToastProvider } from './components/ui/Toast';
import ShiftRosterPage from './components/ShiftRoster/ShiftRosterPage';

export default function App() {
  return (
    <ToastProvider>
      <ShiftRosterPage />
    </ToastProvider>
  );
}