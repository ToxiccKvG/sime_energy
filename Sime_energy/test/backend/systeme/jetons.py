"""Jetons de test pour les tests de sécurité."""
import time


def signer_jeton(user_id: str, expire_dans: int = 3600, secret: str = "secret-de-test") -> str:
    """Jeton au format Supabase mais signé avec une clé quelconque : Supabase Auth doit le refuser."""
    from jose import jwt
    maintenant = int(time.time())
    return jwt.encode(
        {"sub": user_id, "aud": "authenticated", "role": "authenticated",
         "iat": maintenant, "exp": maintenant + expire_dans},
        secret, algorithm="HS256",
    )
