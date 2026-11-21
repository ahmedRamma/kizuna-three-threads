# Kizuna · Batterie virtuelle d'eau

Hackathon Kizuna (Tunisie / Japon). Thème : eau, énergie et agriculture comme un seul système.

## Problème
Pendant une canicule, le réseau électrique coupe, les pompes s'arrêtent, les robinets sèchent et les agriculteurs perdent leur eau.

## Idée
Les cuves de toutes les fermes d'une zone forment une **batterie virtuelle d'eau**. Elle ne stocke pas de l'électricité, elle stocke du service : de l'eau prête à servir pendant une coupure.

- Autonomie de la zone en heures, avec 30 % de réserve minimale
- Risque de coupure (chaleur, coupures annoncées, signalements, heures de pointe)
- Décision de pompage : remplir avant la coupure, pas après
- Entraide entre voisins (don, jamais vente)
- Priorités quand l'énergie de secours est limitée : eau potable et bétail d'abord
- Alertes WhatsApp et SMS
- Analyse mensuelle de l'électricité et de l'eau, anomalies (fuite de nuit, saut de consommation) et conseils
- Rapport d'impact : avec et sans plateforme

## Lancer
```
pip install -r requirements.txt
python -m uvicorn backend.main:app --port 8000
```
Ouvrir http://localhost:8000. Tests : `python -m pytest`.

## Structure
- `simulator/` scénario de canicule sur 72 h, 8 fermes
- `backend/engine.py` risque, autonomie, décisions, entraide, anomalies
- `backend/main.py` API FastAPI (`/api/simulation`, `/api/analysis`, `/api/ingest`)
- `app/` tableau de bord web
- `firmware/esp32_node/` code ESP32 optionnel qui envoie le niveau de cuve à `/api/ingest`
- `docs/screens/` captures d'écran

## Résultat de la simulation
Même canicule et mêmes coupures : environ 89 % d'eau manquante en moins avec la plateforme. Le cas sans plateforme est une pompe qui démarre sous 30 % de remplissage. Ce sont des résultats de simulation, pas des mesures réelles.

## Matériel (optionnel)
ESP32, capteur ultrason étanche, débitmètre YF-S201, INA219, relais, mini pompe DC, mini panneau solaire.
