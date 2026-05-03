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
import ReviseTheory from './routes/ReviseTheory';
import ReviseTopic from './routes/ReviseTopic';
import ReviseToday from './routes/ReviseToday';
import MyDecks from './routes/MyDecks';
import DeckStudy from './routes/DeckStudy';
import DeckEditor from './routes/DeckEditor';
import Viewer from './routes/Viewer';
import Quiz from './routes/Quiz';
import QuizGame from './routes/QuizGame';
import QuizResults from './routes/QuizResults';
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
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
);
