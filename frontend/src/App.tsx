import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppLayout } from '@/layouts/AppLayout';
import Analytics from '@/pages/Analytics';
import Approvals from '@/pages/Approvals';
import AuditLogs from '@/pages/AuditLogs';
import Dashboard from '@/pages/Dashboard';
import Login from '@/pages/Login';
import Merchants from '@/pages/Merchants';
import PaypalCancel from '@/pages/PaypalCancel';
import PaypalReturn from '@/pages/PaypalReturn';
import Policies from '@/pages/Policies';
import PurchaseRequests from '@/pages/PurchaseRequests';
import Register from '@/pages/Register';
import Risk from '@/pages/Risk';
import Settings from '@/pages/Settings';
import Transactions from '@/pages/Transactions';
import AgentWallet from '@/pages/AgentWallet';
import Agents from '@/pages/Agents';
import WalletReturn from '@/pages/WalletReturn';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="purchase-requests" element={<PurchaseRequests />} />
          <Route path="approvals" element={<Approvals />} />
          <Route path="policies" element={<Policies />} />
          <Route path="risk" element={<Risk />} />
          <Route path="merchants" element={<Merchants />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="audit-logs" element={<AuditLogs />} />
          <Route path="paypal/return" element={<PaypalReturn />} />
          <Route path="paypal/cancel" element={<PaypalCancel />} />
          <Route path="wallet" element={<AgentWallet />} />
          <Route path="agents" element={<Agents />} />
          <Route path="wallet/return" element={<WalletReturn />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
