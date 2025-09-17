import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import AnomalyFeatures from './pages/AnomalyFeatures'; 
import Survey from './pages/Survey';
import SurveySubmit from './pages/SurveySubmit';
function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50 py-6">
        <Routes>
          <Route path="/" element={<AnomalyFeatures />} />
          <Route path="/survey" element={<Survey />} /> 
          <Route path="/survey-submit" element={<SurveySubmit />} />   
        </Routes>
      </div>
    </Router>
  );
}

export default App;