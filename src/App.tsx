import { Routes, Route, Navigate } from 'react-router-dom'
import HomePage from './pages/HomePage'
import StudioPage from './pages/StudioPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/studio/:projectId" element={<StudioPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
