import React from 'react';
import ReactDOM from 'react-dom/client';
import { MotionConfig } from 'motion/react';

import App from './App';
import './styles.css';
import './landing.css';
import './catalog.css';
import './research.css';

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        {/* "user": every Motion animation follows the OS reduced-motion setting */}
        <MotionConfig reducedMotion="user">
            <App />
        </MotionConfig>
    </React.StrictMode>
);
