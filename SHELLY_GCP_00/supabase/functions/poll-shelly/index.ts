/**
 * Edge Function : poll-shelly
 * Fix : device_type vide → mapping device_id direct comme fallback garanti
 * Table cible : shelly_cl
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface Account { site: string; auth_key: string; server: string; }
type DeviceFamily = "ENERGIE_3PH" | "ENERGIE_2PH" | "ENERGIE_1PH" | "LUMIERE" | "CAPTEUR_ENV" | "ETAT" | "INCONNU";
type Meta = { name: string; room: string | null; type: string; family: DeviceFamily; };

const FAMILY_BY_TYPE: Record<string, DeviceFamily> = {
  "SHEM-3":"ENERGIE_3PH","SPEM-003CEBEU":"ENERGIE_3PH","SPEM-003CEBEU400":"ENERGIE_3PH",
  "SHEM":"ENERGIE_2PH","SPEM-002CEBEU50":"ENERGIE_2PH",
  "SNPL-00112EU":"ENERGIE_1PH","SNPM-001PCEU16":"ENERGIE_1PH","S3PM-001PCEU16":"ENERGIE_1PH",
  "S3PL-00112EU":"ENERGIE_1PH","S4PL-00416EU":"ENERGIE_1PH","SPSW-104PE16EU":"ENERGIE_1PH","S3PB-O3AR000001":"ENERGIE_1PH",
  "S3PL-30110EU":"ENERGIE_1PH",
  "SHCB-1":"LUMIERE","SHBDUO-1":"LUMIERE","SHDM-2":"LUMIERE",
  "SBHT-003C":"CAPTEUR_ENV","S3SN-0U12A":"CAPTEUR_ENV","S3SN-0U53X":"CAPTEUR_ENV","SHGS-1":"CAPTEUR_ENV","SBWS-90CM":"CAPTEUR_ENV",
  // Gen1 : ces capteurs remontent une température (`tmp`) au même titre qu'un H&T.
  "SHHT-1":"CAPTEUR_ENV","SHWT-1":"CAPTEUR_ENV",
  "SBDW-002C":"ETAT","SBBT-002C":"ETAT","SBMO-003Z":"ETAT","SHMOS-02":"ETAT","S3SW-001P8EU":"ETAT","LOQED":"ETAT",
  "SNSN-0031Z":"ETAT","SHSM-01":"ETAT",
};

function getFamilyStatic(type: string): DeviceFamily {
  if (!type) return "INCONNU";
  if (FAMILY_BY_TYPE[type]) return FAMILY_BY_TYPE[type];
  for (const [key, fam] of Object.entries(FAMILY_BY_TYPE)) {
    if (type.startsWith(key)) return fam;
  }
  return "INCONNU";
}

// ── Config dynamique (tables shelly_device_types / shelly_device_channels) ──
// Remplace progressivement FAMILY_BY_TYPE / ID_FALLBACK : chargée une fois par
// invocation (cache mémoire best-effort, une Edge Function peut être froide à
// chaque appel donc on ne peut jamais supposer le cache présent).
type ChannelLabel = { parent: string; ch: number; name: string; site: string };

let deviceTypeCache: { exact: Record<string, DeviceFamily>; prefix: [string, DeviceFamily][]; loadedAt: number } | null = null;
let channelCache: { data: Record<string, ChannelLabel>; loadedAt: number } | null = null;
const CONFIG_TTL_MS = 5 * 60 * 1000;

async function loadDeviceTypeFamilies(): Promise<{ exact: Record<string, DeviceFamily>; prefix: [string, DeviceFamily][] }> {
  if (deviceTypeCache && Date.now() - deviceTypeCache.loadedAt < CONFIG_TTL_MS) {
    return { exact: deviceTypeCache.exact, prefix: deviceTypeCache.prefix };
  }
  try {
    const { data, error } = await supabase.from("shelly_device_types").select("device_type,device_family,match_prefix");
    if (error) throw error;
    const exact: Record<string, DeviceFamily> = {};
    const prefix: [string, DeviceFamily][] = [];
    for (const row of data ?? []) {
      exact[row.device_type] = row.device_family as DeviceFamily;
      if (row.match_prefix) prefix.push([row.device_type, row.device_family as DeviceFamily]);
    }
    deviceTypeCache = { exact, prefix, loadedAt: Date.now() };
    return { exact, prefix };
  } catch (e) {
    console.warn(`[shelly_device_types] chargement échoué, repli sur cache/statique: ${e}`);
    return deviceTypeCache ? { exact: deviceTypeCache.exact, prefix: deviceTypeCache.prefix } : { exact: {}, prefix: [] };
  }
}

function idFallbackChannels(): Record<string, ChannelLabel> {
  const map: Record<string, ChannelLabel> = {};
  for (const [deviceId, fallback] of Object.entries(ID_FALLBACK)) {
    const match = deviceId.match(/^(.+)_(\d+)$/);
    if (!match) continue;
    map[deviceId] = { parent: match[1], ch: parseInt(match[2]), name: fallback.name, site: fallback.site };
  }
  return map;
}

async function loadChannelLabels(): Promise<Record<string, ChannelLabel>> {
  if (channelCache && Date.now() - channelCache.loadedAt < CONFIG_TTL_MS) return channelCache.data;
  try {
    const { data, error } = await supabase.from("shelly_device_channels").select("parent_device_id,channel_number,channel_name,site");
    if (error) throw error;
    const map: Record<string, ChannelLabel> = { ...idFallbackChannels() };
    for (const row of data ?? []) {
      map[`${row.parent_device_id}_${row.channel_number}`] = { parent: row.parent_device_id, ch: row.channel_number, name: row.channel_name, site: row.site };
    }
    channelCache = { data: map, loadedAt: Date.now() };
    return map;
  } catch (e) {
    console.warn(`[shelly_device_channels] chargement échoué, repli sur cache/statique: ${e}`);
    return channelCache?.data ?? idFallbackChannels();
  }
}

function getFamilyDynamic(type: string, exact: Record<string, DeviceFamily>, prefix: [string, DeviceFamily][]): DeviceFamily {
  if (!type) return "INCONNU";
  if (exact[type]) return exact[type];
  for (const [key, fam] of prefix) { if (type.startsWith(key)) return fam; }
  return getFamilyStatic(type); // filet de sécurité phase A — supprimé en phase B
}

const ID_FALLBACK: Record<string, { type: string; name: string; family: DeviceFamily; site: string }> = {
  // Compte 1 — Ma Maison
  "XB137192911224369":{type:"SBHT-003C",name:"BLU H&T_Chambre",family:"CAPTEUR_ENV",site:"Ma Maison"},
  "XB137192911234820":{type:"SBHT-003C",name:"BLU H&T_Salon",family:"CAPTEUR_ENV",site:"Ma Maison"},
  "XB137192911238428":{type:"SBHT-003C",name:"BLU H&T_Terrasse Ext. NordEst",family:"CAPTEUR_ENV",site:"Ma Maison"},
  "XB159066633771102":{type:"SBBT-002C",name:"Blu Button Red",family:"ETAT",site:"Ma Maison"},
  "XB137192908721858":{type:"SBHT-003C",name:"Blu H&T_Balcon SudEst",family:"CAPTEUR_ENV",site:"Ma Maison"},
  "XB66172393105902":{type:"SBMO-003Z",name:"Blu Motion_Détecteur mouvement",family:"ETAT",site:"Ma Maison"},
  "54320453f8c4":{type:"S3PM-001PCEU16",name:"Box Wifi",family:"ENERGIE_1PH",site:"Ma Maison"},
  "b0b21c1a6dcc":{type:"SNPL-00112EU",name:"Clim Salon",family:"ENERGIE_1PH",site:"Ma Maison"},
  "d4d4daf38108":{type:"SNPL-00112EU",name:"Clim_Bureau",family:"ENERGIE_1PH",site:"Ma Maison"},
  "543204ba0ad4":{type:"SNPM-001PCEU16",name:"Congélateur Beko A+",family:"ENERGIE_1PH",site:"Ma Maison"},
  "3c6105f63e1f":{type:"SHGS-1",name:"Détecteur de Gaz",family:"CAPTEUR_ENV",site:"Ma Maison"},
  "c45bbee265f5":{type:"SHEM",name:"EM-SENELEC",family:"ENERGIE_2PH",site:"Ma Maison"},
  "c45bbee265f5_1":{type:"SHEM",name:"ECL hall-séjour-cuisine",family:"ENERGIE_2PH",site:"Ma Maison"},
  "543204adae34":{type:"SNPM-001PCEU16",name:"Frigo Beko A+",family:"ENERGIE_1PH",site:"Ma Maison"},
  "34b7da8cdbf8":{type:"S3SN-0U12A",name:"Gen3_H&T",family:"CAPTEUR_ENV",site:"Ma Maison"},
  "08f9e0702184":{type:"SHCB-1",name:"Lampe Chevet_Chambre",family:"LUMIERE",site:"Ma Maison"},
  "08f9e06a8b59":{type:"SHCB-1",name:"Lampe Salon",family:"LUMIERE",site:"Ma Maison"},
  "08f9e070240a":{type:"SHCB-1",name:"Lampe Salle de bain",family:"LUMIERE",site:"Ma Maison"},
  "98cdac2d299d":{type:"SHBDUO-1",name:"Lampe_Bureau",family:"LUMIERE",site:"Ma Maison"},
  "485519ee0d24":{type:"SHCB-1",name:"Lampe_Cuisine",family:"LUMIERE",site:"Ma Maison"},
  "08f9e07023fe":{type:"SHCB-1",name:"Lampe_Hall",family:"LUMIERE",site:"Ma Maison"},
  "34945479cd39":{type:"SHBDUO-1",name:"Lampe_Toilette Bureau",family:"LUMIERE",site:"Ma Maison"},
  "b0b21c1ad428":{type:"SNPL-00112EU",name:"Machine à laver",family:"ENERGIE_1PH",site:"Ma Maison"},
  "64b7080d0a40":{type:"SNPL-00112EU",name:"Micro-onde",family:"ENERGIE_1PH",site:"Ma Maison"},
  "2c1165cb07e7":{type:"SHMOS-02",name:"Motion 2_Détecteur mouvement",family:"ETAT",site:"Ma Maison"},
  "XM194070326663736V0001A9000003":{type:"S3PB-O3AR000001",name:"Ogemray Chauffe eau",family:"ENERGIE_1PH",site:"Ma Maison"},
  "543204412b0c":{type:"S3SW-001P8EU",name:"PC_Informatique",family:"ETAT",site:"Ma Maison"},
  "XB154411473774089":{type:"SBDW-002C",name:"PORTE BUREAU",family:"ETAT",site:"Ma Maison"},
  "XLQq6M4NeBGdBpyv8jAbVxk":{type:"LOQED",name:"Porte d'entrée",family:"ETAT",site:"Ma Maison"},
  "XB14224779725912":{type:"SBDW-002C",name:"Porte d'entrée principale",family:"ETAT",site:"Ma Maison"},
  "b0b21c195c18":{type:"SNPL-00112EU",name:"Télévision",family:"ENERGIE_1PH",site:"Ma Maison"},
  "b0b21c194194":{type:"SNPL-00112EU",name:"Ventilo Air Flux 40W_Chambre",family:"ENERGIE_1PH",site:"Ma Maison"},
  // Compte 2 — Académie CER2E
  "206ef102b9c4":{type:"S4PL-00416EU",name:"1) Box Wifi",family:"ENERGIE_1PH",site:"Académie CER2E"},
  "34987a68c520":{type:"SPSW-104PE16EU",name:"1) Prise 1",family:"ENERGIE_1PH",site:"Académie CER2E"},
  "34987a68c520_1":{type:"SPSW-104PE16EU",name:"2) Prise 2",family:"ENERGIE_1PH",site:"Académie CER2E"},
  "206ef102b9c4_1":{type:"S4PL-00416EU",name:"2) Télé",family:"ENERGIE_1PH",site:"Académie CER2E"},
  "34987a68c520_2":{type:"SPSW-104PE16EU",name:"3) Prise 3",family:"ENERGIE_1PH",site:"Académie CER2E"},
  "206ef102b9c4_2":{type:"S4PL-00416EU",name:"3) Woyofal",family:"ENERGIE_1PH",site:"Académie CER2E"},
  "206ef102b9c4_3":{type:"S4PL-00416EU",name:"4) Caméra",family:"ENERGIE_1PH",site:"Académie CER2E"},
  "34987a68c520_3":{type:"SPSW-104PE16EU",name:"4) Prise 4",family:"ENERGIE_1PH",site:"Académie CER2E"},
  "08f9e0ea7d94":{type:"SPEM-003CEBEU",name:"Cafétéria_TD RDC",family:"ENERGIE_3PH",site:"Académie CER2E"},
  "08f9e051dfa2":{type:"SHEM-3",name:"Charges_TD niveau 2",family:"ENERGIE_3PH",site:"Académie CER2E"},
  "XB61819871591476":{type:"SBDW-002C",name:"Detecteur ouverture porte",family:"ETAT",site:"Académie CER2E"},
  "XB106582486828237":{type:"SBDW-002C",name:"Détecteur Ouverture porte",family:"ETAT",site:"Académie CER2E"},
  "54320452d75c":{type:"S3PM-001PCEU16",name:"Frigo Cuisine",family:"ENERGIE_1PH",site:"Académie CER2E"},
  "XB137192906331245":{type:"SBHT-003C",name:"HT Bureau CER2E",family:"CAPTEUR_ENV",site:"Académie CER2E"},
  "ecda3bc4efb4":{type:"S3SW-001P8EU",name:"Lampe Bureau",family:"ETAT",site:"Académie CER2E"},
  "34945479ca1a":{type:"SHBDUO-1",name:"Lampe Shelly",family:"LUMIERE",site:"Académie CER2E"},
  "08f9e0e8d774":{type:"SPEM-003CEBEU400",name:"M1_SENELEC",family:"ENERGIE_3PH",site:"Académie CER2E"},
  "483fdac3b59d":{type:"SHEM-3",name:"M2_SELECTEUR PV/SENELEC",family:"ENERGIE_3PH",site:"Académie CER2E"},
  "483fdac3d79c":{type:"SHEM-3",name:"M3_CHARGE_CONSOMMATION",family:"ENERGIE_3PH",site:"Académie CER2E"},
  "08f9e0e4d080":{type:"SPEM-002CEBEU50",name:"M4_Groupe électrogène",family:"ENERGIE_2PH",site:"Académie CER2E"},
  "08f9e0e4d080_1":{type:"SPEM-002CEBEU50",name:"M4_Groupe électrogène (canal 2)",family:"ENERGIE_2PH",site:"Académie CER2E"},
  "8cbfea9705f4":{type:"S3PL-00112EU",name:"PC INFORMATIQUE",family:"ENERGIE_1PH",site:"Académie CER2E"},
  "08f9e047b1b2":{type:"SHEM-3",name:"PV_BUILDING COMMUNAL",family:"ENERGIE_3PH",site:"Académie CER2E"},
  "ecda3bc06554":{type:"S3SW-001P8EU",name:"Simple Allumage",family:"ETAT",site:"Académie CER2E"},
  "08f9e0e82db0":{type:"SPEM-003CEBEU",name:"TGBT_EPT Thiès",family:"ENERGIE_3PH",site:"Académie CER2E"},
  "c8c9a325a225":{type:"SHDM-2",name:"Variateur",family:"LUMIERE",site:"Académie CER2E"},
  "543204ba4b18":{type:"SNPM-001PCEU16",name:"Ventilo à partir du 04/12/2025",family:"ENERGIE_1PH",site:"Académie CER2E"},
  "34b7da8a47a0":{type:"S3PM-001PCEU16",name:"Éclairage Disjoncteur 1",family:"ENERGIE_1PH",site:"Académie CER2E"},
  "34b7da8a4aa0":{type:"S3PM-001PCEU16",name:"Éclairage Disjoncteur 2",family:"ENERGIE_1PH",site:"Académie CER2E"},
  "1720017229409":{type:"INCONNU",name:"Appareil inconnu (fantôme)",family:"ETAT",site:"Académie CER2E"},
  // Compte 3 — Donsin (PV), devices déplacés depuis Académie CER2E le 2026-07-09
  "XB61819871591478":{type:"SBDW-002C",name:"Capteur d'ouverture de portes",family:"ETAT",site:"Donsin"},
  "XB211299189491624":{type:"SBWS-90CM",name:"Station météo_Donsin",family:"CAPTEUR_ENV",site:"Donsin"},
  "5432045b35d0":{type:"S3SN-0U12A",name:"Shelly H&T_Donsin",family:"CAPTEUR_ENV",site:"Donsin"},
  "0892724e2c28":{type:"S3PL-30110EU",name:"Shelly Plug M_Donsin",family:"ENERGIE_1PH",site:"Donsin"},
  "9070694642a8":{type:"S3PL-30110EU",name:"PC2_TBEA_DONSIN",family:"ENERGIE_1PH",site:"Donsin"},
  "9070694605f4":{type:"S3SN-0U53X",name:"The pill by Shelly",family:"CAPTEUR_ENV",site:"Donsin"},
};

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

function safeNum(val: unknown, min: number, max: number): number | null {
  if (val == null) return null;
  const n = Number(val);
  if (!isFinite(n) || n < min || n > max) { if (isFinite(n)) console.warn(`[sanity] ${n} hors [${min},${max}]`); return null; }
  return Math.round(n * 10000) / 10000;
}

function safeCounter(current: number | null, previous: number | null | undefined): number | null {
  if (current == null) return null;
  if (previous == null) return current;
  const delta = current - previous;
  if (delta < -1000) { console.warn(`[reset] ${current} < ${previous}`); return current; }
  if (delta > 10000) { console.warn(`[spike] delta=${delta} Wh`); return null; }
  return current;
}

// Shelly ne fournit pas de "ressenti" — calculé ici (indice de chaleur NOAA
// pour T>=27°C+humide, refroidissement éolien pour T<=10°C+vent, sinon = T).
function computeFeelsLike(tempC: number | null, humidityPct: number | null, windKmh: number | null): number | null {
  if (tempC == null) return null;
  if (tempC <= 10 && windKmh != null && windKmh > 4.8) {
    const v16 = Math.pow(windKmh, 0.16);
    return Math.round((13.12 + 0.6215*tempC - 11.37*v16 + 0.3965*tempC*v16) * 10) / 10;
  }
  if (tempC >= 27 && humidityPct != null && humidityPct >= 40) {
    const T=tempC, R=humidityPct;
    const hi = -8.784695 + 1.61139411*T + 2.338549*R - 0.14611605*T*R - 0.012308094*T*T
             - 0.016424828*R*R + 0.002211732*T*T*R + 0.00072546*T*R*R - 0.000003582*T*T*R*R;
    return Math.round(hi * 10) / 10;
  }
  return tempC;
}

async function shellyPost(server: string, authKey: string, path: string, extra: Record<string,string>={}) {
  const body = new URLSearchParams({ auth_key: authKey, ...extra });
  const resp = await fetch(`${server}${path}`, { method:"POST", body });
  if (!resp.ok) throw new Error(`Shelly API ${resp.status} ${path}`);
  return resp.json();
}

async function fetchAllStatus(server: string, authKey: string): Promise<Record<string,unknown>> {
  const data = await shellyPost(server, authKey, "/device/all_status", { show_info:"1" });
  return data?.data?.devices_status ?? {};
}

async function fetchDeviceMetadata(server: string, authKey: string, exact: Record<string,DeviceFamily>, prefix: [string,DeviceFamily][]): Promise<Record<string,Partial<Meta>>> {
  const roomData = await shellyPost(server, authKey, "/interface/room/list");
  const rooms: Record<number,string> = {};
  for (const [,r] of Object.entries(roomData?.data?.rooms ?? {})) { const ro = r as any; rooms[ro.id]=ro.name; }
  await delay(2000);
  const devData = await shellyPost(server, authKey, "/interface/device/list");
  if (!devData?.isok) return {};
  const map: Record<string,Partial<Meta>> = {};
  for (const [id,info] of Object.entries(devData?.data?.devices ?? {})) {
    if (typeof info!=="object"||!info) continue;
    const d = info as any;
    const type = d.type ?? d.app ?? "";
    map[id] = { name:d.name??undefined, room:d.room_id?(rooms[d.room_id]??null):null, type:type||undefined, family:type?getFamilyDynamic(type,exact,prefix):undefined };
  }
  return map;
}

async function getDbCache(site: string): Promise<Record<string,Partial<Meta>>> {
  const {data} = await supabase.from("shelly_cl").select("device_id,name,room,device_type,device_family").eq("site",site).not("name","is",null).order("ts",{ascending:false}).limit(500);
  const cache: Record<string,Partial<Meta>> = {};
  for (const row of data??[]) {
    if (!cache[row.device_id]) cache[row.device_id]={name:row.name!==row.device_id?row.name:undefined,room:row.room,type:row.device_type||undefined,family:row.device_family as DeviceFamily||undefined};
  }
  return cache;
}

function resolveMeta(
  deviceId: string,
  api: Record<string,Partial<Meta>>,
  db: Record<string,Partial<Meta>>,
  channels: Record<string,ChannelLabel>,
  exact: Record<string,DeviceFamily>,
  prefix: [string,DeviceFamily][],
): Meta {
  const chan = channels[deviceId];
  const baseId = chan ? chan.parent : deviceId;
  const a=api[deviceId]??api[baseId]??{}, d=db[deviceId]??{}, f=ID_FALLBACK[deviceId]??{type:"",name:deviceId,family:"INCONNU" as DeviceFamily};
  const type   = a.type||d.type||f.type||"";
  const name   = chan?.name||a.name||d.name||f.name||deviceId;
  const room   = a.room??d.room??null;
  const family = (a.family&&a.family!=="INCONNU")?a.family:(d.family&&d.family!=="INCONNU")?d.family:f.family!=="INCONNU"?f.family:getFamilyDynamic(type,exact,prefix);
  return {type,name,room,family};
}

async function getLastCounters(site: string): Promise<Record<string,{wh_tot:number|null}>> {
  const {data} = await supabase.from("shelly_cl").select("device_id,wh_tot").eq("site",site).order("ts",{ascending:false}).limit(300);
  const map: Record<string,{wh_tot:number|null}> = {};
  for (const row of data??[]) { if (!(row.device_id in map)) map[row.device_id]={wh_tot:row.wh_tot}; }
  return map;
}

function extractEnergie3PH(base: Record<string,unknown>, s: Record<string,unknown>, last: {wh_tot:number|null}|undefined): Record<string,unknown> {
  const emeters = s.emeters as any[]|undefined;
  if (emeters && emeters.length>=3) {
    const [a,b,c]=emeters;
    const wh_a=safeNum(a.total,0,1e9), wh_b=safeNum(b.total,0,1e9), wh_c=safeNum(c.total,0,1e9);
    const wh_tot=wh_a!=null&&wh_b!=null&&wh_c!=null?wh_a+wh_b+wh_c:null;
    const wh_ra=safeNum(a.total_returned,0,1e9), wh_rb=safeNum(b.total_returned,0,1e9), wh_rc=safeNum(c.total_returned,0,1e9);
    const wh_rtot=wh_ra!=null&&wh_rb!=null&&wh_rc!=null?wh_ra+wh_rb+wh_rc:null;
    return {...base,state:"on",
      power_w:safeNum((a.power??0)+(b.power??0)+(c.power??0),-1e5,1e5),voltage_v:safeNum(a.voltage,0,500),current_a:safeNum(a.current,0,1000),
      p_a:safeNum(a.power,-1e5,1e5),p_b:safeNum(b.power,-1e5,1e5),p_c:safeNum(c.power,-1e5,1e5),
      v_a:safeNum(a.voltage,0,500),v_b:safeNum(b.voltage,0,500),v_c:safeNum(c.voltage,0,500),
      i_a:safeNum(a.current,0,1000),i_b:safeNum(b.current,0,1000),i_c:safeNum(c.current,0,1000),
      wh_a:safeCounter(wh_a,null),wh_b:safeCounter(wh_b,null),wh_c:safeCounter(wh_c,null),wh_tot:safeCounter(wh_tot,last?.wh_tot),
      wh_ra:safeCounter(wh_ra,null),wh_rb:safeCounter(wh_rb,null),wh_rc:safeCounter(wh_rc,null),wh_rtot:safeCounter(wh_rtot,null),
    };
  }
  const em0=s["em:0"] as any;
  if (em0) {
    const emd=(s["emdata:0"] as any)??{};
    const wh_a=safeNum(emd.a_total_act_energy,0,1e9),wh_b=safeNum(emd.b_total_act_energy,0,1e9),wh_c=safeNum(emd.c_total_act_energy,0,1e9),wh_tot=safeNum(emd.total_act,0,1e9);
    const wh_ra=safeNum(emd.a_total_ret_energy,0,1e9),wh_rb=safeNum(emd.b_total_ret_energy,0,1e9),wh_rc=safeNum(emd.c_total_ret_energy,0,1e9);
    const wh_rtot=safeNum(emd.total_ret,0,1e9)??((wh_ra??0)+(wh_rb??0)+(wh_rc??0));
    return {...base,state:"on",
      power_w:safeNum(em0.total_act_power,-1e5,1e5),voltage_v:safeNum(em0.a_voltage,0,500),current_a:safeNum(em0.a_current,0,1000),
      p_a:safeNum(em0.a_act_power,-1e5,1e5),p_b:safeNum(em0.b_act_power,-1e5,1e5),p_c:safeNum(em0.c_act_power,-1e5,1e5),
      v_a:safeNum(em0.a_voltage,0,500),v_b:safeNum(em0.b_voltage,0,500),v_c:safeNum(em0.c_voltage,0,500),
      i_a:safeNum(em0.a_current,0,1000),i_b:safeNum(em0.b_current,0,1000),i_c:safeNum(em0.c_current,0,1000),
      wh_a:safeCounter(wh_a,null),wh_b:safeCounter(wh_b,null),wh_c:safeCounter(wh_c,null),wh_tot:safeCounter(wh_tot,last?.wh_tot),
      wh_ra:safeCounter(wh_ra,null),wh_rb:safeCounter(wh_rb,null),wh_rc:safeCounter(wh_rc,null),wh_rtot:safeCounter(wh_rtot,null),
      // `temperature:0` sur un compteur, c'est la température de son BOÎTIER,
      // pas celle du local : elle ne va que dans device_temp_c. Écrite aussi
      // dans `temperature`, elle polluait la colonne d'ambiance (Arrivée
      // générale Donsin : 57,9 °C de moyenne, 71,4 °C au pic), déclenchait des
      // alertes « température critique » permanentes et rendait ces compteurs
      // éligibles à la carte « Capteurs environnementaux ».
      device_temp_c:safeNum((s["temperature:0"] as any)?.tC,-40,150),frequency_hz:safeNum(em0.freq,40,70),signal_rssi:(s.wifi as any)?.rssi!=null?Math.round((s.wifi as any).rssi):null,
    };
  }
  console.warn(`[3PH inconnu] ${base.device_id}`); return {...base,state:"offline"};
}

function extractEnergie2PH(base: Record<string,unknown>, s: Record<string,unknown>, last: {wh_tot:number|null}|undefined): Record<string,unknown> {
  const emeters=s.emeters as any[]|undefined;
  if (emeters && emeters.length>=2) {
    const [a,b]=emeters;
    const wh_a=safeNum(a.total,0,1e9),wh_b=safeNum(b.total,0,1e9);
    const wh_tot=wh_a!=null&&wh_b!=null?wh_a+wh_b:null;
    return {...base,state:"on",
      power_w:safeNum((a.power??0)+(b.power??0),-1e5,1e5),voltage_v:safeNum(a.voltage,0,500),current_a:safeNum(a.current,0,1000),
      p_a:safeNum(a.power,-1e5,1e5),p_b:safeNum(b.power,-1e5,1e5),v_a:safeNum(a.voltage,0,500),v_b:safeNum(b.voltage,0,500),i_a:safeNum(a.current,0,1000),i_b:safeNum(b.current,0,1000),
      wh_a:safeCounter(wh_a,null),wh_b:safeCounter(wh_b,null),wh_tot:safeCounter(wh_tot,last?.wh_tot),
    };
  }
  const em0=s["em:0"] as any;
  if (em0) {
    const emd=(s["emdata:0"] as any)??{};
    const wh_a=safeNum(emd.a_total_act_energy??em0.a_total_act_energy,0,1e9);
    const wh_b=safeNum(emd.b_total_act_energy??em0.b_total_act_energy,0,1e9);
    const wh_tot=safeNum(emd.total_act??em0.total_act_energy??(wh_a!=null&&wh_b!=null?wh_a+wh_b:null),0,1e9);
    return {...base,state:"on",
      power_w:safeNum(em0.total_act_power,-1e5,1e5),voltage_v:safeNum(em0.a_voltage,0,500),current_a:safeNum(em0.a_current,0,1000),
      p_a:safeNum(em0.a_act_power,-1e5,1e5),p_b:safeNum(em0.b_act_power,-1e5,1e5),v_a:safeNum(em0.a_voltage,0,500),v_b:safeNum(em0.b_voltage,0,500),i_a:safeNum(em0.a_current,0,1000),i_b:safeNum(em0.b_current,0,1000),
      wh_a:safeCounter(wh_a,null),wh_b:safeCounter(wh_b,null),wh_tot:safeCounter(wh_tot,last?.wh_tot),
      frequency_hz:safeNum(em0.freq,40,70),signal_rssi:(s.wifi as any)?.rssi!=null?Math.round((s.wifi as any).rssi):null,
    };
  }
  console.warn(`[2PH inconnu] ${base.device_id} keys=${Object.keys(s).join(",")}`); return {...base,state:"offline"};
}

function extractEnergie1PH(base: Record<string,unknown>, s: Record<string,unknown>, last: {wh_tot:number|null}|undefined): Record<string,unknown> {
  const rssi=(s.wifi as any)?.rssi; const diag={signal_rssi:rssi!=null?Math.round(rssi):null};
  const relays=s.relays as any[]|undefined;
  if (relays?.length) { const m=(s.meters as any[])?.[0]; return {...base,state:relays[0].ison?"on":"off",power_w:safeNum(m?.power,0,7500),voltage_v:safeNum(m?.voltage,0,500),wh_tot:safeCounter(safeNum(m?.total,0,1e9),last?.wh_tot),...diag}; }
  const lights=s.lights as any[]|undefined;
  if (lights?.length) { const m=(s.meters as any[])?.[0]; return {...base,state:lights[0].ison?"on":"off",power_w:safeNum(m?.power,0,7500),wh_tot:safeCounter(safeNum(m?.total,0,1e9),last?.wh_tot),...diag}; }
  const sw0=s["switch:0"] as any;
  if (sw0!==undefined) return {...base,state:sw0.output?"on":"off",power_w:safeNum(sw0.apower,0,7500),voltage_v:safeNum(sw0.voltage,0,500),current_a:safeNum(sw0.current,0,1000),wh_tot:safeCounter(safeNum(sw0.aenergy?.total,0,1e9),last?.wh_tot),wh_rtot:safeCounter(safeNum(sw0.ret_aenergy?.total,0,1e9),null),device_temp_c:safeNum(sw0.temperature?.tC,-40,150),frequency_hz:safeNum(sw0.freq,40,70),...diag};
  const pm0=s["pm1:0"] as any;
  if (pm0!==undefined) return {...base,state:"on",power_w:safeNum(pm0.apower,0,7500),voltage_v:safeNum(pm0.voltage,0,500),current_a:safeNum(pm0.current,0,1000),wh_tot:safeCounter(safeNum(pm0.aenergy?.total,0,1e9),last?.wh_tot),wh_rtot:safeCounter(safeNum(pm0.ret_aenergy?.total,0,1e9),null),device_temp_c:safeNum(pm0.temperature?.tC,-40,150),...diag};
  console.warn(`[1PH inconnu] ${base.device_id} keys=${Object.keys(s).join(",")}`); return {...base,state:"offline"};
}

function extractLumiere(base: Record<string,unknown>, s: Record<string,unknown>): Record<string,unknown> {
  const rssi=(s.wifi as any)?.rssi; const diag={signal_rssi:rssi!=null?Math.round(rssi):null};
  const lights=s.lights as any[]|undefined;
  if (lights?.length) { const m=(s.meters as any[])?.[0]; return {...base,state:lights[0].ison?"on":"off",power_w:safeNum(m?.power,0,1e5),...diag}; }
  const relays=s.relays as any[]|undefined;
  if (relays?.length) { const m=(s.meters as any[])?.[0]; return {...base,state:relays[0].ison?"on":"off",power_w:safeNum(m?.power,0,1e5),...diag}; }
  const l0=s["light:0"] as any;
  if (l0!==undefined) return {...base,state:l0.output?"on":"off",...diag};
  return {...base};
}

// ── Métadonnées de mesure, communes à toutes les familles ───────────────────
//
//  `/device/all_status` accompagne chaque appareil de champs que l'on jetait :
//   - `_updated`  : horodatage réel (UTC) du dernier relevé remonté au cloud.
//     Indispensable pour les capteurs qui dorment : un H&T Gen3 se réveille
//     toutes les 2 h (`sys.wakeup_period` = 7200 s) mais on l'écrit avec
//     ts = now() à chaque minute → 120 lignes identiques et l'heure réelle de
//     la mesure perdue. `measured_at` distingue « nouvelle mesure » de « même
//     mesure relue ».
//   - `_dev_info.online` / `cloud.connected` : l'appareil répond-il vraiment
//     (un appareil injoignable n'écrit plus aucune ligne — voir la note sur les
//     anciennes lignes de remplacement `state='offline'` dans pollAccount).
//   - version de firmware et drapeau batterie faible.
function extractDeviceMeta(s: Record<string,unknown>): Record<string,unknown> {
  const info = s._dev_info as any;
  const upd  = typeof s._updated === "string" ? s._updated : null;
  // Format Shelly : "2026-08-28 13:35:26", en UTC (vérifié contre sys.unixtime).
  const measuredAt = upd ? new Date(`${upd.replace(" ","T")}Z`) : null;
  const bat = (s["devicepower:0"] as any)?.battery ?? (s.bat as any) ?? {};
  const online = info?.online ?? (s.cloud as any)?.connected ?? (s.wifi_sta as any)?.connected ?? null;
  return {
    measured_at:      measuredAt && !isNaN(measuredAt.getTime()) ? measuredAt.toISOString() : null,
    online:           typeof online === "boolean" ? online : null,
    firmware_version: (s["fwversion:0"] as any)?.version ?? (s.fw_info as any)?.fw ?? null,
    battery_low:      typeof bat?.low === "boolean" ? bat.low : null,
  };
}

// ── Grandeurs physiques, quel que soit le firmware ──────────────────────────
//
//  Gen2+/BLU exposent des composants (`temperature:0.tC`, `humidity:0.rh`,
//  `illuminance:0.lux`, `devicepower:0.battery`), Gen1 met tout à la racine
//  (`tmp`, `hum`, `lux`, `bat`) avec des formes variables selon le modèle :
//  `tmp` vaut {value,units} sur un SHMOS-02, {value,tC,tF} sur un SHWT-1.
//  On lisait uniquement `tmp.tC` → la température des détecteurs Gen1 était
//  perdue (détecteur d'eau Académie CER2E : 31 °C jamais stockés).
function extractSensorValues(s: Record<string,unknown>): Record<string,unknown> {
  const tmp = s.tmp as any, hum = s.hum as any, lux = s.lux as any;
  const bat = (s["devicepower:0"] as any)?.battery ?? (s.bat as any) ?? {};
  const rssi = (s.reporter as any)?.rssi ?? (s.wifi as any)?.rssi ?? (s.wifi_sta as any)?.rssi;

  // `is_valid: false` = mesure non fiable côté capteur, on ne la stocke pas.
  const gen1 = (v: any, field: string): unknown =>
    v == null || v?.is_valid === false ? null : (typeof v === "object" ? v[field] ?? v.value : v);

  const temperature = safeNum(
    (s["temperature:0"] as any)?.tC ?? gen1(tmp, "tC"), -40, 85);
  const humidity = safeNum(
    (s["humidity:0"] as any)?.rh ?? gen1(hum, "rh"), 0, 100);

  const illumination = (s["illuminance:0"] as any)?.illumination ?? (lux as any)?.illumination;

  return {
    temperature,
    humidity,
    illuminance_lux:   safeNum((s["illuminance:0"] as any)?.lux ?? gen1(lux, "lux"), 0, 200000),
    // Shelly renvoie parfois une chaîne vide quand il n'a pas encore qualifié
    // la luminosité : on ne stocke que les libellés réels.
    illumination:      typeof illumination === "string" && illumination !== "" ? illumination : null,
    battery_level:     safeNum(bat?.percent ?? bat?.value, 0, 100),
    battery_voltage_v: safeNum(bat?.V ?? bat?.voltage, 0, 10),
    signal_rssi:       rssi != null ? Math.round(rssi) : null,
  };
}

function extractWeatherExtras(s: Record<string,unknown>, temperature: number|null, humidity: number|null): Record<string,unknown> {
  const uv=(s["UV:0"] as any)?.value, lux=(s["illuminance:0"] as any)?.lux;
  const windAvg=(s["speed:0"] as any)?.value, windGust=(s["speed:1"] as any)?.value, windDir=(s["direction:0"] as any)?.value;
  const pressure=(s["pressure:0"] as any)?.value, precip=(s["precipitation:0"] as any)?.value, dewpoint=(s["dewpoint:0"] as any)?.value;
  const pressureSlope=(s["pressure_slope:0"] as any)?.value, moistureAlarm=(s["moisture_alarm:0"] as any)?.value;
  const hasWeather = uv!=null||lux!=null||windAvg!=null||pressure!=null;
  if (!hasWeather) return {};
  const windKmh = windAvg!=null ? windAvg*3.6 : null; // Shelly renvoie m/s
  return {
    uv_index:safeNum(uv,0,20), illuminance_lux:safeNum(lux,0,200000),
    wind_speed_ms:safeNum(windAvg,0,150), wind_gust_ms:safeNum(windGust,0,150), wind_direction_deg:safeNum(windDir,0,360),
    pressure_hpa:safeNum(pressure,800,1100), precipitation_mm:safeNum(precip,0,1000), dewpoint_c:safeNum(dewpoint,-40,85),
    feels_like_c:computeFeelsLike(temperature,humidity,windKmh),
    pressure_slope:pressureSlope!=null?String(pressureSlope):null,
    moisture_alarm:typeof moistureAlarm==="boolean"?moistureAlarm:null,
  };
}

// État d'alarme des capteurs de sécurité (fumée, eau, gaz) — partagé entre les
// familles CAPTEUR_ENV et ETAT, la frontière dépendant du modèle.
function extractAlarmState(s: Record<string,unknown>): string | null {
  const gas=s["gas_sensor"] as any;      if (gas!==undefined)   return gas.alarm_state??null;
  const smoke=s["smoke:0"] as any;       if (smoke!==undefined) return smoke.alarm?"alarm":"ok";
  const flood=s["flood"];                if (flood!==undefined) return flood?"flood":"dry";
  const rain=s["rain_sensor"];           if (rain!==undefined)  return rain?"rain":"dry";
  return null;
}

function extractCapteurEnv(base: Record<string,unknown>, s: Record<string,unknown>): Record<string,unknown> {
  const values = extractSensorValues(s);
  const temperature = values.temperature as number|null;
  const humidity    = values.humidity as number|null;
  const alarm       = extractAlarmState(s);
  if (temperature==null && humidity==null && alarm==null) {
    console.warn(`[ENV inconnu] ${base.device_id}`); return {...base,...values};
  }
  // Un capteur d'eau/fumée remonte à la fois une alarme et une température :
  // les deux sont conservées, on ne choisit plus l'une au détriment de l'autre.
  return {...base,...values,...(alarm!=null?{state:alarm}:{}),
    ...extractWeatherExtras(s,temperature,humidity)};
}

function extractEtat(base: Record<string,unknown>, s: Record<string,unknown>): Record<string,unknown> {
  // Les capteurs d'état embarquent aussi des grandeurs physiques (le détecteur
  // de mouvement SHMOS-02 mesure température et luminosité) : on les collecte
  // systématiquement, en plus de l'état lui-même.
  const values = extractSensorValues(s);
  const state = (): string|null => {
    const win0=s["window:0"] as any;    if (win0!==undefined)  return win0.open?"open":"closed";
    const inp0=s["input:0"] as any;     if (inp0!==undefined)  return inp0.state?"pressed":"released";
    const occup=s["occupancy:0"] as any;if (occup!==undefined) return occup.occupancy?"motion":"no_motion";
    // BLU Motion (SBMO-003Z) : composant `motion:0`, jamais reconnu jusqu'ici —
    // l'appareil n'écrivait aucun champ exploitable.
    const mo0=s["motion:0"] as any;     if (mo0!==undefined)   return mo0.motion?"motion":"no_motion";
    const sensor=s["sensor"] as any??s["motion"] as any;
    if (sensor!==undefined) {
      if (sensor.motion===true||sensor===true) return "motion";
      // Distincte du mouvement : une vibration n'atteste pas une présence.
      if (sensor.vibration===true) return "vibration";
      return "no_motion";
    }
    const lock=s["lock"] as any??s["latch"] as any;
    if (lock!==undefined) return lock.locked?"locked":lock.open?"open":"closed";
    // Serrure LOQED : état à la racine du status, hors composants Shelly.
    if (typeof s.bolt_state === "string") return s.bolt_state;
    return extractAlarmState(s);
  };
  const sw0=s["switch:0"] as any;
  // Sur un relais, `temperature:0` est la température interne du boîtier et non
  // une mesure d'ambiance : elle va dans device_temp_c, jamais dans temperature.
  if (sw0!==undefined) return {...base,...values,temperature:null,state:sw0.output?"on":"off",
    device_temp_c:safeNum(sw0.temperature?.tC ?? (s["temperature:0"] as any)?.tC,-40,150)};
  const st = state();
  const tilt = safeNum((s["tilt:0"] as any)?.angle,-180,180);
  const sensor = s["sensor"] as any;
  // `sensor.timestamp` = epoch (s) du dernier événement vu par le capteur. Il
  // peut remonter à plusieurs semaines alors que l'appareil émet toujours :
  // c'est ce qui distingue « rien ne bouge » de « le capteur ne répond plus ».
  const evenement = typeof sensor?.timestamp === "number" && sensor.timestamp > 1_500_000_000
    && sensor.timestamp < Date.now()/1000 + 86400
    ? new Date(sensor.timestamp*1000).toISOString() : null;
  if (st==null && tilt==null) { console.warn(`[ETAT inconnu] ${base.device_id}`); return {...base,...values}; }
  return {...base,...values,state:st,tilt_angle:tilt,
    vibration: typeof sensor?.vibration === "boolean" ? sensor.vibration : null,
    last_event_at: evenement,
    battery_level:values.battery_level ?? safeNum(s.battery_percentage,0,100)};
}

function extractReading(deviceId: string, site: string, meta: Meta, s: Record<string,unknown>, last: {wh_tot:number|null}|undefined): Record<string,unknown> {
  const base={device_id:deviceId,site,name:meta.name,room:meta.room,device_type:meta.type,device_family:meta.family,ts:new Date().toISOString(),
    ...extractDeviceMeta(s)};
  switch(meta.family) {
    case "ENERGIE_3PH": return extractEnergie3PH(base,s,last);
    case "ENERGIE_2PH": return extractEnergie2PH(base,s,last);
    case "ENERGIE_1PH": return extractEnergie1PH(base,s,last);
    case "LUMIERE":     return extractLumiere(base,s);
    case "CAPTEUR_ENV": return extractCapteurEnv(base,s);
    case "ETAT":        return extractEtat(base,s);
    // Type non encore classé (table shelly_device_types) : on conserve malgré
    // tout les grandeurs reconnaissables plutôt que d'écrire une ligne vide.
    default: console.warn(`[INCONNU] ${deviceId} type=${meta.type}`);
      return {...base,...extractSensorValues(s),state:extractAlarmState(s)};
  }
}

function extractChannelReading(deviceId: string, site: string, meta: Meta, parentStatus: Record<string,unknown>, ch: number, last: {wh_tot:number|null}|undefined): Record<string,unknown> {
  const base={device_id:deviceId,site,name:meta.name,room:meta.room,device_type:meta.type,device_family:meta.family,ts:new Date().toISOString(),
    ...extractDeviceMeta(parentStatus)};
  const rssi=(parentStatus.wifi as any)?.rssi; const diag={signal_rssi:rssi!=null?Math.round(rssi):null};
  const sw=parentStatus[`switch:${ch}`] as any;
  if(sw!==undefined) return {...base,state:sw.output?"on":"off",power_w:safeNum(sw.apower,0,7500),voltage_v:safeNum(sw.voltage,0,500),current_a:safeNum(sw.current,0,1000),wh_tot:safeCounter(safeNum(sw.aenergy?.total,0,1e9),last?.wh_tot),wh_rtot:safeCounter(safeNum(sw.ret_aenergy?.total,0,1e9),null),device_temp_c:safeNum(sw.temperature?.tC,-40,150),frequency_hz:safeNum(sw.freq,40,70),...diag};
  const pm=parentStatus[`pm1:${ch}`] as any;
  if(pm!==undefined) return {...base,state:"on",power_w:safeNum(pm.apower,0,7500),voltage_v:safeNum(pm.voltage,0,500),current_a:safeNum(pm.current,0,1000),wh_tot:safeCounter(safeNum(pm.aenergy?.total,0,1e9),last?.wh_tot),wh_rtot:safeCounter(safeNum(pm.ret_aenergy?.total,0,1e9),null),device_temp_c:safeNum(pm.temperature?.tC,-40,150),...diag};
  const relays=parentStatus.relays as any[]|undefined, meters=parentStatus.meters as any[]|undefined;
  if(relays&&relays.length>ch){const m=meters?.[ch]; return {...base,state:relays[ch].ison?"on":"off",power_w:safeNum(m?.power,0,7500),voltage_v:safeNum(m?.voltage,0,500),wh_tot:safeCounter(safeNum(m?.total,0,1e9),last?.wh_tot)};}
  const emeters=parentStatus.emeters as any[]|undefined;
  if(emeters&&emeters.length>ch){
    const e=emeters[ch]; const wh=safeNum(e.total,0,1e9);
    return {...base,state:"on",power_w:safeNum(e.power,-1e5,1e5),voltage_v:safeNum(e.voltage,0,500),current_a:safeNum(e.current,0,1000),p_a:safeNum(e.power,-1e5,1e5),v_a:safeNum(e.voltage,0,500),i_a:safeNum(e.current,0,1000),wh_tot:safeCounter(wh,last?.wh_tot)};
  }
  return {...base,state:"offline"};
}

async function pollAccount(
  account: Account,
  forceMetaRefresh: boolean,
  channels: Record<string,ChannelLabel>,
  exact: Record<string,DeviceFamily>,
  prefix: [string,DeviceFamily][],
): Promise<{inserted:number}> {
  const allStatus=await fetchAllStatus(account.server,account.auth_key);
  await delay(2000);
  let apiData: Record<string,Partial<Meta>>={};
  if (forceMetaRefresh) {
    try { apiData=await fetchDeviceMetadata(account.server,account.auth_key,exact,prefix); console.log(`[${account.site}] meta API: ${Object.keys(apiData).length}`); }
    catch(e) { console.warn(`[${account.site}] meta API échouée: ${e}`); }
  }
  const [dbCache,lastCounters]=await Promise.all([getDbCache(account.site),getLastCounters(account.site)]);
  const rows: Record<string,unknown>[]=[];
  const processed=new Set<string>();

  for (const [deviceId,status] of Object.entries(allStatus)) {
    if (typeof status!=="object"||!status) continue;
    const meta=resolveMeta(deviceId,apiData,dbCache,channels,exact,prefix);
    rows.push(extractReading(deviceId,account.site,meta,status as any,lastCounters[deviceId]));
    processed.add(deviceId);
  }

  for (const [virtualId,chan] of Object.entries(channels)) {
    if (processed.has(virtualId)) continue;
    const parentStatus=allStatus[chan.parent] as Record<string,unknown>|undefined;
    if (!parentStatus) continue;
    const meta=resolveMeta(virtualId,apiData,dbCache,channels,exact,prefix);
    rows.push(extractChannelReading(virtualId,account.site,meta,parentStatus,chan.ch,lastCounters[virtualId]));
    processed.add(virtualId);
  }

  // NOTE — plus de lignes `state='offline'` de remplacement.
  //
  // Ce bloc insérait, tous les 10 min (forceMetaRefresh), une ligne vide pour
  // chaque appareil d'ID_FALLBACK n'ayant pas répondu. Trois problèmes :
  //
  //  1. Un appareil définitivement retiré (ex. les compteurs FOUTA POIDS LOURDS,
  //     débranchés le 2026-08-01) continuait d'écrire 144 lignes/jour sans
  //     aucune mesure, indéfiniment.
  //  2. Le front ne s'en sert pas : le statut hors-ligne se déduit de l'ABSENCE
  //     de relevé récent (`computeAlerts` : « device dans le catalogue mais pas
  //     dans le snapshot 5min », et StatusGridCard : `if (!r) status='offline'`).
  //     Pire, une ligne de remplacement fait apparaître l'appareil dans le
  //     snapshot : il était alors classé « Veille » au lieu de « Hors-ligne ».
  //  3. Ces lignes rendaient tout appareil mort éternellement « vu aujourd'hui »,
  //     déjouant le filtre de fraîcheur de shelly_devices_catalog.
  //
  // Seule la statistique `nb_offline` de shelly_cl_journalier s'appuyait encore
  // dessus ; elle vaudra désormais 0.

  if (rows.length>0) {
    const {error}=await supabase.from("shelly_cl").insert(rows);
    if (error) throw new Error(`[${account.site}] ${error.message}`);
    console.log(`[${account.site}] ${rows.length} lignes insérées`);
  }
  return {inserted:rows.length};
}

async function loadAccounts(): Promise<Account[]> {
  // Priorité : table shelly_accounts (gérée depuis la plateforme)
  const { data, error } = await supabase
    .from("shelly_accounts")
    .select("site, auth_key, server_url")
    .eq("actif", true);

  if (!error && data && data.length > 0) {
    return data.map((r: { site: string; auth_key: string; server_url: string }) => ({
      site: r.site,
      auth_key: r.auth_key,
      server: r.server_url,
    }));
  }

  // Fallback : variable d'environnement (rétrocompatibilité)
  const raw = Deno.env.get("SHELLY_ACCOUNTS");
  if (raw) return JSON.parse(raw);

  throw new Error("Aucun compte Shelly trouvé (table shelly_accounts vide et SHELLY_ACCOUNTS absent)");
}

async function writePollStatus(site: string, status: "ok" | "error", errorMsg?: string) {
  await supabase
    .from("shelly_accounts")
    .update({
      last_poll_at:     new Date().toISOString(),
      last_poll_status: status,
      last_error_msg:   errorMsg ?? null,
    })
    .eq("site", site);
}

Deno.serve(async (req: Request) => {
  // Déployé avec --no-verify-jwt : le cron pg_cron peut appeler sans JWT valide.
  // La sécurité des données est assurée par RLS sur shelly_cl (lecture = authenticated).
  // Écriture par service_role dans le client Supabase ci-dessus → bypass RLS OK.
  let forceOverride = false;
  try { const body = await req.json(); forceOverride = body?.forceMetaRefresh === true; } catch { /* body vide (cron) */ }
  try {
    const accounts: Account[] = await loadAccounts();
    const { exact, prefix } = await loadDeviceTypeFamilies();
    const channels = await loadChannelLabels();
    const now=new Date();
    const forceMetaRefresh=forceOverride || now.getMinutes()%10===0;
    const results=[];
    for (const account of accounts) {
      try {
        const result=await pollAccount(account,forceMetaRefresh,channels,exact,prefix);
        await writePollStatus(account.site, "ok");
        results.push({site:account.site,...result});
      } catch(accountErr) {
        const msg = String(accountErr);
        console.error(`[${account.site}] poll error:`, msg);
        await writePollStatus(account.site, "error", msg);
        results.push({site:account.site, error: msg});
      }
      await delay(3000);
    }
    return new Response(JSON.stringify({ok:true,results,ts:now.toISOString()}),{headers:{"Content-Type":"application/json"}});
  } catch(err) {
    console.error(err);
    return new Response(JSON.stringify({ok:false,error:String(err)}),{status:500,headers:{"Content-Type":"application/json"}});
  }
});
