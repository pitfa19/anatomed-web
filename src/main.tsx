import { StrictMode, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import './index.css';
import { bootstrapTheme } from './lib/theme';
import { bootstrapLang, LangProvider } from './lib/i18n';
import App from './App';

bootstrapTheme();
bootstrapLang();
// Home stays eager (it's the entry route — no extra round-trip on first
// paint). Every other route is code-split so the landing page no longer
// ships the agent's markdown stack, the viewer's three.js, the PDF code,
// the quiz, etc. They load on navigation (Suspense fallback in App.tsx).
import Home from './routes/Home';
const Docs = lazy(() => import('./routes/Docs'));
const Agent = lazy(() => import('./routes/Agent'));
const Revise = lazy(() => import('./routes/Revise'));
const ReviseTheory = lazy(() => import('./routes/ReviseTheory'));
const ReviseTopic = lazy(() => import('./routes/ReviseTopic'));
const ReviseToday = lazy(() => import('./routes/ReviseToday'));
const MyDecks = lazy(() => import('./routes/MyDecks'));
const DeckStudy = lazy(() => import('./routes/DeckStudy'));
const DeckEditor = lazy(() => import('./routes/DeckEditor'));
const Viewer = lazy(() => import('./routes/Viewer'));
const Quiz = lazy(() => import('./routes/Quiz'));
const QuizGame = lazy(() => import('./routes/QuizGame'));
const QuizResults = lazy(() => import('./routes/QuizResults'));
const Login = lazy(() => import('./routes/Login'));
const Profile = lazy(() => import('./routes/Profile'));
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
      { path: 'revise/teorija', element: <ReviseTheory /> },
      { path: 'revise/praksa', element: <Quiz /> },
      { path: 'revise/praksa/play', element: <QuizGame /> },
      { path: 'revise/praksa/results', element: <QuizResults /> },
      { path: 'revise/today', element: <ReviseToday /> },
      { path: 'revise/my-decks', element: <MyDecks /> },
      { path: 'revise/deck/:deckId', element: <DeckStudy /> },
      { path: 'revise/deck/:deckId/edit', element: <DeckEditor /> },
      { path: 'revise/:topicId', element: <ReviseTopic /> },
      { path: 'viewer', element: <Viewer /> },
      { path: 'quiz', element: <Navigate to="/revise/praksa" replace /> },
      { path: 'quiz/play', element: <Navigate to="/revise/praksa/play" replace /> },
      { path: 'quiz/results', element: <Navigate to="/revise/praksa/results" replace /> },
      { path: 'login', element: <Login /> },
      { path: 'profile', element: <Profile /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LangProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </LangProvider>
  </StrictMode>,
);
