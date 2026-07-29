import { Navigate, Route, Routes } from 'react-router-dom';
import Login from './pages/Login';
import Categories from './pages/Categories';
import MenuItems from './pages/MenuItems';
import Ingredients from './pages/Ingredients';
import Users from './pages/Users';
import Outlets from './pages/Outlets';
import Expenses from './pages/Expenses';
import Procurement from './pages/Procurement';
import Shifts from './pages/Shifts';
import DailyReport from './pages/DailyReport';
import ProductReport from './pages/ProductReport';
import FinancialReport from './pages/FinancialReport';
import ChangePassword from './pages/ChangePassword';
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
      <Route
        path="/users"
        element={
          <RequireAuth>
            <Users />
          </RequireAuth>
        }
      />
      <Route
        path="/outlets"
        element={
          <RequireAuth>
            <Outlets />
          </RequireAuth>
        }
      />
      <Route
        path="/procurement"
        element={
          <RequireAuth>
            <Procurement />
          </RequireAuth>
        }
      />
      <Route
        path="/expenses"
        element={
          <RequireAuth>
            <Expenses />
          </RequireAuth>
        }
      />
      <Route
        path="/shifts"
        element={
          <RequireAuth>
            <Shifts />
          </RequireAuth>
        }
      />
      <Route
        path="/daily-report"
        element={
          <RequireAuth>
            <DailyReport />
          </RequireAuth>
        }
      />
      <Route
        path="/product-report"
        element={
          <RequireAuth>
            <ProductReport />
          </RequireAuth>
        }
      />
      <Route
        path="/financial-report"
        element={
          <RequireAuth>
            <FinancialReport />
          </RequireAuth>
        }
      />
      <Route
        path="/change-password"
        element={
          <RequireAuth>
            <ChangePassword />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/categories" replace />} />
    </Routes>
  );
}
