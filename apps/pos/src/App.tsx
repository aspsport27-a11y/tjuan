import { Navigate, Route, Routes } from 'react-router-dom';
import Login from './pages/Login';
import Tables from './pages/Tables';
import Order from './pages/Order';
import RequireAuth from './components/RequireAuth';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/tables"
        element={
          <RequireAuth>
            <Tables />
          </RequireAuth>
        }
      />
      <Route
        path="/order/:sessionId"
        element={
          <RequireAuth>
            <Order />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/tables" replace />} />
    </Routes>
  );
}
