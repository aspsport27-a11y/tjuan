import { Navigate, Route, Routes } from 'react-router-dom';
import Login from './pages/Login';
import Categories from './pages/Categories';
import MenuItems from './pages/MenuItems';
import Ingredients from './pages/Ingredients';
import RequireAuth from './components/RequireAuth';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/categories"
        element={
          <RequireAuth>
            <Categories />
          </RequireAuth>
        }
      />
      <Route
        path="/menu-items"
        element={
          <RequireAuth>
            <MenuItems />
          </RequireAuth>
        }
      />
      <Route
        path="/ingredients"
        element={
          <RequireAuth>
            <Ingredients />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/categories" replace />} />
    </Routes>
  );
}
