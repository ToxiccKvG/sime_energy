import { createRoot } from "react-dom/client";
import { StrictMode } from 'react';
import App from "./App.tsx";
import "./index.css";
import "@/lib/display-preferences"; // applique la taille du texte choisie avant le premier rendu
import { AuthProvider } from '@/context/AuthContext';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <AuthProvider>
            <App />
        </AuthProvider>
    </StrictMode>
);
