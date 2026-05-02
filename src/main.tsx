import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import './index.css';
import { bootstrapTheme } from './lib/theme';
import App from './App';

bootstrapTheme();
import Home from './routes/Home';
import Docs from './routes/Docs';
import Agent from './routes/Agent';
import Revise from './routes/Revise';
import ReviseTopic from './routes/ReviseTopic';
import ReviseToday from './routes/ReviseToday';
import Viewer from './routes/Viewer';
import Login from './routes/Login';
import Profile from './routes/Profile';
import { AuthProvider } from './lib/AuthContext';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Home /> },
      { path: 'docs', element: <Docs /> },
      { path: 'agent', element: <Agent /> },
      { path: 'revise', element: <Revise /> },
      { path: 'revise/today', element: <ReviseToday /> },
      { path: 'revise/:topicId', element: <ReviseTopic /> },
      { path: 'viewer', element: <Viewer /> },
      { path: 'login', element: <Login /> },
      { path: 'profile', element: <Profile /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
);
