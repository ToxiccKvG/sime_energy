import { createRoot } from "react-dom/client";
import { StrictMode } from 'react';
import App from "./App.tsx";
import "./index.css";
import "@/lib/display-preferences"; // applique la taille du texte choisie avant le premier rendu
import { AuthProvider } from '@/context/AuthContext';

// Après un déploiement, un onglet resté ouvert peut demander une page dont le
// fichier JS a changé de nom (hash) et n'existe plus : on recharge pour récupérer
// la nouvelle version. Au plus une fois par minute, pour ne jamais boucler si le
// serveur est réellement injoignable (l'erreur suit alors son cours normal).
window.addEventListener('vite:preloadError', (event) => {
    const CLE = 'simee:rechargement-apres-deploiement';
    let dernier = 0;
    try { dernier = Number(sessionStorage.getItem(CLE)) || 0; } catch { /* stockage indisponible */ }
    if (Date.now() - dernier < 60_000) return;
    try { sessionStorage.setItem(CLE, String(Date.now())); } catch { /* stockage indisponible */ }
    event.preventDefault();
    window.location.reload();
});

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <AuthProvider>
            <App />
        </AuthProvider>
    </StrictMode>
);
