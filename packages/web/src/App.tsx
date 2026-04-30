import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '@/components';
import {
  LoginPage,
  RegisterPage,
  ChatPage,
  ChatDetailPage,
  ContactsPage,
  ContactDetailPage,
  MomentsPage,
  ProfilePage,
} from '@/pages';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/chat" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route element={<AppLayout />}>
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/chat/:conv_id" element={<ChatDetailPage />} />
        <Route path="/contacts" element={<ContactsPage />} />
        <Route path="/contacts/:uid" element={<ContactDetailPage />} />
        <Route path="/moments" element={<MomentsPage />} />
        <Route path="/me" element={<ProfilePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/chat" replace />} />
    </Routes>
  );
}
