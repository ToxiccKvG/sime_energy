import { createRoot } from "react-dom/client";
import { StrictMode } from 'react';
import App from "./App.tsx";
import "./index.css";
import { AuthProvider } from '@/context/AuthContext';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <AuthProvider>
            <App />
        </AuthProvider>
    </StrictMode>
);
