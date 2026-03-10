"""
Configuration centralisée du logging pour l'application.
"""

import logging
import sys
from datetime import datetime

def setup_logging(level=logging.INFO):
    """
    Configure le logging pour l'application.
    
    Args:
        level: Niveau de logging (DEBUG, INFO, WARNING, ERROR)
    """
    
    # Format des logs
    log_format = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    date_format = "%Y-%m-%d %H:%M:%S"
    
    # Configuration du logging
    logging.basicConfig(
        level=level,
        format=log_format,
        datefmt=date_format,
        handlers=[
            logging.StreamHandler(sys.stdout),  # Console
            # logging.FileHandler(f"logs/app_{datetime.now().strftime('%Y%m%d')}.log", mode='a')  # Fichier
        ]
    )
    
    # Configuration spécifique pour les modules
    loggers_config = {
        'app.api.V1.proccesing': logging.INFO,
        'app.core.llm': logging.INFO,
        'app.core.utils': logging.INFO,
        'uvicorn': logging.WARNING,
        'fastapi': logging.WARNING,
        'httpx': logging.WARNING,
    }
    
    for logger_name, logger_level in loggers_config.items():
        logger = logging.getLogger(logger_name)
        logger.setLevel(logger_level)
    
    # Créer le dossier logs s'il n'existe pas
    import os
    os.makedirs("logs", exist_ok=True)
    
    # Log de démarrage
    logger = logging.getLogger(__name__)
    logger.info(" Configuration du logging initialisée")
    logger.info(f" Niveau de logging: {logging.getLevelName(level)}")
    logger.info(f" Logs sauvegardés dans: logs/app_{datetime.now().strftime('%Y%m%d')}.log")

if __name__ == "__main__":
    setup_logging(logging.DEBUG)
