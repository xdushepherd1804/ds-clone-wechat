import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout, ProtectedRoute } from '@/components';
import {
  LoginPage,
  RegisterPage,
  ChatPage,
  ChatDetailPage,
  ContactsPage,
  ContactDetailPage,
  MomentsPage,
  MomentPublishPage,
  ProfilePage,
  MonitorPage,
  GroupChatPage,
  GroupSettingsPage,
  QrCodePage,
} from '@/pages';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/chat" replace />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/chat/:conv_id" element={<ChatDetailPage />} />
          <Route path="/chat/group/:group_id" element={<GroupChatPage />} />
          <Route path="/chat/group/:group_id/settings" element={<GroupSettingsPage />} />
          <Route path="/contacts" element={<ContactsPage />} />
          <Route path="/contacts/:uid" element={<ContactDetailPage />} />
          <Route path="/moments" element={<MomentsPage />} />
          <Route path="/moments/new" element={<MomentPublishPage />} />
          <Route path="/me" element={<ProfilePage />} />
          <Route path="/monitor" element={<MonitorPage />} />
          <Route path="/qrcode" element={<QrCodePage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
