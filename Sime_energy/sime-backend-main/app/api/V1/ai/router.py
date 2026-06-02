import os
import json
import requests
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions"

SYSTEM_PROMPT = """Tu es un expert en audit énergétique au Sénégal, certifié CER2E (Centre de Ressources sur les Énergies Renouvelables et l'Efficacité Énergétique).
Tu analyses des données d'audits énergétiques pour des bâtiments industriels et de services en Afrique de l'Ouest.

Contexte local :
- Réseau SENELEC : 230V / 50Hz, tarification par tranches, pointes en saison chaude
- Climat Dakar : chaud et humide, seuil de confort thermique ~24°C, pas de chauffage nécessaire
- Priorités efficacité énergétique : éclairage LED, climatisation efficiente, variateurs de fréquence, compensation cos φ
- Unités : kWh, kW, kVA, FCFA (franc CFA)

Tu dois analyser les données JSON fournies et produire un rapport de synthèse professionnel en FRANÇAIS.
Réponds UNIQUEMENT avec un objet JSON valide (sans markdown, sans explication) ayant exactement ces 6 champs :
{
  "observations_generales": "...",
  "inventaire": "...",
  "mesures": "...",
  "facturation": "...",
  "recommandations": "...",
  "conclusions": "..."
}

Si des données sont absentes pour une section, indique-le clairement et fournis une analyse partielle.
Sois précis, chiffré quand possible, et orienté actions concrètes."""


class SynthesizeRequest(BaseModel):
    context: str


class SynthesisResult(BaseModel):
    observations_generales: str
    inventaire: str
    mesures: str
    facturation: str
    recommandations: str
    conclusions: str


@router.post("/synthesize-audit", response_model=SynthesisResult)
def synthesize_audit(body: SynthesizeRequest):
    api_key = os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="DEEPSEEK_API_KEY not configured on server")

    payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"Voici les données complètes de l'audit énergétique à analyser :\n\n{body.context}\n\nGénère le rapport de synthèse structuré en JSON.",
            },
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.3,
        "max_tokens": 4096,
    }

    try:
        response = requests.post(
            DEEPSEEK_API_URL,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            json=payload,
            timeout=120,
        )
        response.raise_for_status()
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="DeepSeek API timeout")
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=502, detail=f"DeepSeek API error: {str(e)}")

    data = response.json()
    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")

    if not content:
        raise HTTPException(status_code=502, detail="Empty response from DeepSeek")

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="Invalid JSON from DeepSeek")

    required_keys = ["observations_generales", "inventaire", "mesures", "facturation", "recommandations", "conclusions"]
    for key in required_keys:
        if not isinstance(parsed.get(key), str):
            parsed[key] = ""

    return SynthesisResult(**parsed)


# ─── Benjamin — Chatbot conversationnel ──────────────────────────────────────

BENJAMIN_SYSTEM_PROMPT = """Tu es Benjamin, assistant expert en audit énergétique pour la plateforme SIMEE (CER2E, Sénégal).
Réponds TOUJOURS en français. Sois concis, précis, orienté actions concrètes.
Tu connais parfaitement :
- Le réseau SENELEC : 230V / 50Hz, tarification BT/MT/HTB, relevés, facturation FCFA
- L'efficacité énergétique en Afrique de l'Ouest : éclairage LED, climatisation (COP, BTU), moteurs (cos φ, variateurs)
- Les indicateurs : kWh/an, kW, kVA, facteur de charge, facteur d'utilisation, déséquilibre réseau
- La plateforme SIMEE : modules Inventaire, Mesures, Facturation, Rapports, Audits
- Les normes et bonnes pratiques locales (CER2E, ISO 50001)
Si l'utilisateur parle d'un audit spécifique, utilise ses données pour personnaliser ta réponse.
Limite tes réponses à l'essentiel — pas de blabla, pas de répétition."""


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    context: Optional[str] = None


@router.post("/chat")
def chat_with_benjamin(body: ChatRequest):
    api_key = os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="DEEPSEEK_API_KEY not configured on server")

    system_content = BENJAMIN_SYSTEM_PROMPT
    if body.context:
        system_content += f"\n\nDonnées disponibles dans SIMEE :\n{body.context}"

    messages = [{"role": "system", "content": system_content}] + [
        {"role": m.role, "content": m.content} for m in body.messages
    ]

    def generate():
        try:
            with requests.post(
                DEEPSEEK_API_URL,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}",
                },
                json={
                    "model": "deepseek-chat",
                    "messages": messages,
                    "stream": True,
                    "temperature": 0.6,
                    "max_tokens": 2048,
                },
                stream=True,
                timeout=120,
            ) as r:
                r.raise_for_status()
                for chunk in r.iter_content(chunk_size=None):
                    if chunk:
                        yield chunk
        except requests.exceptions.Timeout:
            yield b'data: {"error": "timeout"}\n\n'
        except requests.exceptions.RequestException as e:
            yield f'data: {{"error": "{str(e)}"}}\n\n'.encode()

    return StreamingResponse(generate(), media_type="text/event-stream")
