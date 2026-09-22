import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthGuard } from './components/AuthGuard';
import { Login } from './pages/Login';
import DocsPortal from './components/DocsPortal';
import { ForcePasswordChangeModal } from './components/ForcePasswordChangeModal';

export default function App() {
  return (
    <BrowserRouter>
      <ForcePasswordChangeModal />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<AuthGuard />}>
          <Route path="/" element={<DocsPortal />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
