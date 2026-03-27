import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { RenderErrorBoundary } from './components/scene/RenderErrorBoundary'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <RenderErrorBoundary label="app" fixed>
    <App />
  </RenderErrorBoundary>
)
