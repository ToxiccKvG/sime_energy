/**
 * Applique la migration IoT via l'API SQL de Supabase
 * Projet cible : sime-front (amctayugahwhxwytqiqf)
 */

import { readFileSync } from 'fs';

// Credentials sime-front
const SUPABASE_URL = 'https://amctayugahwhxwytqiqf.supabase.co';
const PROJECT_REF  = 'amctayugahwhxwytqiqf';

// La service_role_key est dans le .env du frontend — on doit l'avoir
// Pour l'instant on utilise l'API Management avec la service key comme token
// (fonctionne sur les projets récents Supabase)
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtY3RheXVnYWh3aHh3eXRxaXFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwMzc2MjUsImV4cCI6MjA4MDYxMzYyNX0.8WRdYzNlqDXuUl_QIDaLReH5rVN9JAlUcaa41LWGSGI';

const sql = readFileSync(
  '/Users/mauricebiramediouf/sime_energy/Sime_energy/sime-front/supabase/migrations/20260407_iot_module.sql',
  'utf8'
);

// Tente via le endpoint SQL de la Management API
async function tryManagementAPI() {
  const resp = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  return { status: resp.status, body: await resp.json() };
}

// Tente via un appel RPC exec_sql si disponible
async function tryRPC() {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ sql }),
  });
  return { status: resp.status, body: await resp.text() };
}

async function main() {
  console.log('Projet cible :', PROJECT_REF);
  console.log('Taille SQL   :', sql.length, 'caractères\n');

  console.log('Tentative via Management API...');
  const r1 = await tryManagementAPI();
  console.log('Status:', r1.status);
  console.log(JSON.stringify(r1.body, null, 2));

  if (r1.status !== 200) {
    console.log('\nTentative via RPC...');
    const r2 = await tryRPC();
    console.log('Status:', r2.status);
    console.log(r2.body);
  }
}

main().catch(console.error);
