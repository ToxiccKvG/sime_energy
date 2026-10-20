import { nettoyerProjetsTest } from './outils'

// Avant et après toute la suite : supprime les projets « TEST-AUTO » (y compris ceux d'un run interrompu).
export default async function nettoyage() {
  await nettoyerProjetsTest()
}
