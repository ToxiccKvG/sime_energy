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
  "SHCB-1":"LUMIERE","SHBDUO-1":"LUMIERE","SHDM-2":"LUMIERE",
  "SBHT-003C":"CAPTEUR_ENV","S3SN-0U12A":"CAPTEUR_ENV","SHGS-1":"CAPTEUR_ENV",
  "SBDW-002C":"ETAT","SBBT-002C":"ETAT","SBMO-003Z":"ETAT","SHMOS-02":"ETAT","S3SW-001P8EU":"ETAT","LOQED":"ETAT",
};

function getFamily(type: string): DeviceFamily {
  if (!type) return "INCONNU";
  if (FAMILY_BY_TYPE[type]) return FAMILY_BY_TYPE[type];
  for (const [key, fam] of Object.entries(FAMILY_BY_TYPE)) {
    if (type.startsWith(key)) return fam;
  }
  return "INCONNU";
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

async function fetchDeviceMetadata(server: string, authKey: string): Promise<Record<string,Partial<Meta>>> {
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
    map[id] = { name:d.name??undefined, room:d.room_id?(rooms[d.room_id]??null):null, type:type||undefined, family:type?getFamily(type):undefined };
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

function resolveMeta(deviceId: string, api: Record<string,Partial<Meta>>, db: Record<string,Partial<Meta>>): Meta {
  const a=api[deviceId]??{}, d=db[deviceId]??{}, f=ID_FALLBACK[deviceId]??{type:"",name:deviceId,family:"INCONNU" as DeviceFamily};
  const type   = a.type||d.type||f.type||"";
  const name   = a.name||d.name||f.name||deviceId;
  const room   = a.room??d.room??null;
  const family = (a.family&&a.family!=="INCONNU")?a.family:(d.family&&d.family!=="INCONNU")?d.family:f.family!=="INCONNU"?f.family:getFamily(type);
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
      temperature:safeNum((s["temperature:0"] as any)?.tC,-40,85),
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
    };
  }
  console.warn(`[2PH inconnu] ${base.device_id} keys=${Object.keys(s).join(",")}`); return {...base,state:"offline"};
}

function extractEnergie1PH(base: Record<string,unknown>, s: Record<string,unknown>, last: {wh_tot:number|null}|undefined): Record<string,unknown> {
  const relays=s.relays as any[]|undefined;
  if (relays?.length) { const m=(s.meters as any[])?.[0]; return {...base,state:relays[0].ison?"on":"off",power_w:safeNum(m?.power,0,7500),voltage_v:safeNum(m?.voltage,0,500),wh_tot:safeCounter(safeNum(m?.total,0,1e9),last?.wh_tot)}; }
  const lights=s.lights as any[]|undefined;
  if (lights?.length) { const m=(s.meters as any[])?.[0]; return {...base,state:lights[0].ison?"on":"off",power_w:safeNum(m?.power,0,7500),wh_tot:safeCounter(safeNum(m?.total,0,1e9),last?.wh_tot)}; }
  const sw0=s["switch:0"] as any;
  if (sw0!==undefined) return {...base,state:sw0.output?"on":"off",power_w:safeNum(sw0.apower,0,7500),voltage_v:safeNum(sw0.voltage,0,500),current_a:safeNum(sw0.current,0,1000),wh_tot:safeCounter(safeNum(sw0.aenergy?.total,0,1e9),last?.wh_tot)};
  const pm0=s["pm1:0"] as any;
  if (pm0!==undefined) return {...base,state:"on",power_w:safeNum(pm0.apower,0,7500),voltage_v:safeNum(pm0.voltage,0,500),current_a:safeNum(pm0.current,0,1000),wh_tot:safeCounter(safeNum(pm0.aenergy?.total,0,1e9),last?.wh_tot)};
  console.warn(`[1PH inconnu] ${base.device_id} keys=${Object.keys(s).join(",")}`); return {...base,state:"offline"};
}

function extractLumiere(base: Record<string,unknown>, s: Record<string,unknown>): Record<string,unknown> {
  const lights=s.lights as any[]|undefined;
  if (lights?.length) { const m=(s.meters as any[])?.[0]; return {...base,state:lights[0].ison?"on":"off",power_w:safeNum(m?.power,0,1e5)}; }
  const relays=s.relays as any[]|undefined;
  if (relays?.length) { const m=(s.meters as any[])?.[0]; return {...base,state:relays[0].ison?"on":"off",power_w:safeNum(m?.power,0,1e5)}; }
  const l0=s["light:0"] as any;
  if (l0!==undefined) return {...base,state:l0.output?"on":"off"};
  return {...base};
}

function extractCapteurEnv(base: Record<string,unknown>, s: Record<string,unknown>): Record<string,unknown> {
  const tmp=s.tmp as any, hum=s.hum as any;
  if (tmp!==undefined||hum!==undefined) {
    const bat=(s["devicepower:0"] as any)?.battery??s.bat??{};
    return {...base,temperature:safeNum(typeof tmp==="object"?tmp?.tC:tmp,-40,85),humidity:safeNum(typeof hum==="object"?hum?.value:hum,0,100),battery_level:safeNum(bat?.percent??bat?.value,0,100)};
  }
  const t0=s["temperature:0"] as any, h0=s["humidity:0"] as any;
  if (t0!==undefined||h0!==undefined) {
    const bat=(s["devicepower:0"] as any)?.battery??{};
    return {...base,temperature:safeNum(t0?.tC,-40,85),humidity:safeNum(h0?.rh,0,100),battery_level:safeNum(bat?.percent,0,100)};
  }
  const gas=s["gas_sensor"] as any;
  if (gas!==undefined) return {...base,state:gas.alarm_state??null};
  console.warn(`[ENV inconnu] ${base.device_id}`); return {...base};
}

function extractEtat(base: Record<string,unknown>, s: Record<string,unknown>): Record<string,unknown> {
  const batPct=()=>safeNum(((s["devicepower:0"] as any)?.battery??s.bat as any)?.percent??(s.bat as any)?.value,0,100);
  const win0=s["window:0"] as any; if (win0!==undefined) return {...base,state:win0.open?"open":"closed",battery_level:batPct()};
  const inp0=s["input:0"] as any; if (inp0!==undefined) return {...base,state:inp0.state?"pressed":"released",battery_level:batPct()};
  const occup=s["occupancy:0"] as any; if (occup!==undefined) return {...base,state:occup.occupancy?"motion":"no_motion",battery_level:batPct()};
  const sensor=s["sensor"] as any??s["motion"] as any; if (sensor!==undefined) return {...base,state:(sensor.motion||sensor===true)?"motion":"no_motion",battery_level:batPct()};
  const sw0=s["switch:0"] as any; if (sw0!==undefined) return {...base,state:sw0.output?"on":"off"};
  const lock=s["lock"] as any??s["latch"] as any; if (lock!==undefined) return {...base,state:lock.locked?"locked":lock.open?"open":"closed"};
  console.warn(`[ETAT inconnu] ${base.device_id}`); return {...base};
}

function extractReading(deviceId: string, site: string, meta: Meta, s: Record<string,unknown>, last: {wh_tot:number|null}|undefined): Record<string,unknown> {
  const base={device_id:deviceId,site,name:meta.name,room:meta.room,device_type:meta.type,device_family:meta.family,ts:new Date().toISOString()};
  switch(meta.family) {
    case "ENERGIE_3PH": return extractEnergie3PH(base,s,last);
    case "ENERGIE_2PH": return extractEnergie2PH(base,s,last);
    case "ENERGIE_1PH": return extractEnergie1PH(base,s,last);
    case "LUMIERE":     return extractLumiere(base,s);
    case "CAPTEUR_ENV": return extractCapteurEnv(base,s);
    case "ETAT":        return extractEtat(base,s);
    default: console.warn(`[INCONNU] ${deviceId} type=${meta.type}`); return base;
  }
}

function extractChannelReading(deviceId: string, site: string, meta: Meta, parentStatus: Record<string,unknown>, ch: number, last: {wh_tot:number|null}|undefined): Record<string,unknown> {
  const base={device_id:deviceId,site,name:meta.name,room:meta.room,device_type:meta.type,device_family:meta.family,ts:new Date().toISOString()};
  const sw=parentStatus[`switch:${ch}`] as any;
  if(sw!==undefined) return {...base,state:sw.output?"on":"off",power_w:safeNum(sw.apower,0,7500),voltage_v:safeNum(sw.voltage,0,500),current_a:safeNum(sw.current,0,1000),wh_tot:safeCounter(safeNum(sw.aenergy?.total,0,1e9),last?.wh_tot)};
  const pm=parentStatus[`pm1:${ch}`] as any;
  if(pm!==undefined) return {...base,state:"on",power_w:safeNum(pm.apower,0,7500),voltage_v:safeNum(pm.voltage,0,500),current_a:safeNum(pm.current,0,1000),wh_tot:safeCounter(safeNum(pm.aenergy?.total,0,1e9),last?.wh_tot)};
  const relays=parentStatus.relays as any[]|undefined, meters=parentStatus.meters as any[]|undefined;
  if(relays&&relays.length>ch){const m=meters?.[ch]; return {...base,state:relays[ch].ison?"on":"off",power_w:safeNum(m?.power,0,7500),voltage_v:safeNum(m?.voltage,0,500),wh_tot:safeCounter(safeNum(m?.total,0,1e9),last?.wh_tot)};}
  const emeters=parentStatus.emeters as any[]|undefined;
  if(emeters&&emeters.length>ch){
    const e=emeters[ch]; const wh=safeNum(e.total,0,1e9);
    return {...base,state:"on",power_w:safeNum(e.power,-1e5,1e5),voltage_v:safeNum(e.voltage,0,500),current_a:safeNum(e.current,0,1000),p_a:safeNum(e.power,-1e5,1e5),v_a:safeNum(e.voltage,0,500),i_a:safeNum(e.current,0,1000),wh_tot:safeCounter(wh,last?.wh_tot)};
  }
  return {...base,state:"offline"};
}

async function pollAccount(account: Account, forceMetaRefresh: boolean): Promise<{inserted:number}> {
  const allStatus=await fetchAllStatus(account.server,account.auth_key);
  await delay(2000);
  let apiData: Record<string,Partial<Meta>>={};
  if (forceMetaRefresh) {
    try { apiData=await fetchDeviceMetadata(account.server,account.auth_key); console.log(`[${account.site}] meta API: ${Object.keys(apiData).length}`); }
    catch(e) { console.warn(`[${account.site}] meta API échouée: ${e}`); }
  }
  const [dbCache,lastCounters]=await Promise.all([getDbCache(account.site),getLastCounters(account.site)]);
  const rows: Record<string,unknown>[]=[];
  const processed=new Set<string>();

  for (const [deviceId,status] of Object.entries(allStatus)) {
    if (typeof status!=="object"||!status) continue;
    const meta=resolveMeta(deviceId,apiData,dbCache);
    rows.push(extractReading(deviceId,account.site,meta,status as any,lastCounters[deviceId]));
    processed.add(deviceId);
  }

  for (const [deviceId] of Object.entries(ID_FALLBACK)) {
    if (processed.has(deviceId)) continue;
    const match=deviceId.match(/^(.+)_(\d+)$/);
    if (!match) continue;
    const parentStatus=allStatus[match[1]] as Record<string,unknown>|undefined;
    if (!parentStatus) continue;
    const meta=resolveMeta(deviceId,apiData,dbCache);
    rows.push(extractChannelReading(deviceId,account.site,meta,parentStatus,parseInt(match[2]),lastCounters[deviceId]));
    processed.add(deviceId);
  }

  if (forceMetaRefresh) {
    for (const [deviceId,fallback] of Object.entries(ID_FALLBACK)) {
      if (processed.has(deviceId)) continue;
      if (fallback.site !== account.site) continue;
      rows.push({device_id:deviceId,site:account.site,name:fallback.name,room:null,device_type:fallback.type,device_family:fallback.family,ts:new Date().toISOString(),state:"offline"});
    }
  }

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
  // Seuls les appels avec le service_role JWT sont acceptés (appelé par pg_cron)
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token || token !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const accounts: Account[] = await loadAccounts();
    const now=new Date();
    const forceMetaRefresh=now.getMinutes()%10===0;
    const results=[];
    for (const account of accounts) {
      try {
        const result=await pollAccount(account,forceMetaRefresh);
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
