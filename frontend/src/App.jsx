import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import RequireAuth from './components/RequireAuth';
import { Login, Register } from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import { Clients, ClientDetail } from './pages/Clients';
import { People, Person } from './pages/People';
import Admin from './pages/Admin';
import { Settings, Status, NotFound } from './pages/Account';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="status" element={<Status />} />
        <Route index element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="projects" element={<RequireAuth><Projects /></RequireAuth>} />
        <Route path="projects/:id" element={<RequireAuth><ProjectDetail /></RequireAuth>} />
        <Route path="clients" element={<RequireAuth><Clients /></RequireAuth>} />
        <Route path="clients/:slug" element={<RequireAuth><ClientDetail /></RequireAuth>} />
        <Route path="people" element={<RequireAuth><People /></RequireAuth>} />
        <Route path="people/:id" element={<RequireAuth><Person /></RequireAuth>} />
        <Route path="settings" element={<RequireAuth><Settings /></RequireAuth>} />
        <Route path="admin" element={<RequireAuth roles={['admin']}><Admin /></RequireAuth>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
