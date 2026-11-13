# 🏃 ManHunt — Cache-Cache GPS Grandeur Nature 🎯

**ManHunt** est une application mobile multijoueur temps réel basée sur la géolocalisation GPS, conçue pour organiser des parties de cache-cache géantes en extérieur.

![Logo ManHunt](./frontend/assets/logo.svg)

---

## 📜 Règles du Jeu

1. **Rejoindre une partie :** Un hôte crée une Room et partage un code unique à 4 caractères.
2. **Équipes :** Les joueurs choisissent leur rôle : **Chasseurs (🎯)** ou **Chassés (🏃)**.
3. **Chrono de fuite (5 minutes d'avance) :**
   - Au lancement de la partie, les chassés disposent de 5 minutes pour s'éloigner et se cacher.
   - Pendant cette période, les chasseurs ont accès à un chronomètre de compte à rebours, mais **la carte Google Maps leur est verrouillée**.
4. **Révélation périodique (Toutes les 5 minutes) :**
   - Toutes les 5 minutes exactes, le serveur backend capture la position GPS actuelle de tous les chassés.
   - Les coordonnées sont transmises en direct aux chasseurs et s'affichent sous forme de repères interactifs sur Google Maps.
5. **Suivi GPS en arrière-plan :**
   - Même lorsque le téléphone est verrouillé ou dans la poche, l'application transmet la position grâce aux services en arrière-plan Android / iOS (`expo-location` + `TaskManager`).

---

## 🛠️ Architecture Technique

- **Backend (Python 3.11 / FastAPI) :**
  - **Stockage 100% RAM :** Aucune base de données SQL/NoSQL. Toutes les rooms et positions sont stockées dans un dictionnaire Python en mémoire vive.
  - **Communication temps réel :** WebSockets natifs avec gestionnaires de reconnexion auto et pings de maintien.
  - **Boucle de jeu asynchrone (`asyncio`) :** Tâche d'arrière-plan autonome gérant le timer de 5 min et le déclenchement des révélations GPS.
- **Frontend (React Native / Expo / TypeScript) :**
  - **Cartographie :** `react-native-maps` (Google Maps).
  - **GPS Arrière-plan :** `expo-location` et `TaskManager` configurés pour fonctionner avec l'écran verrouillé.

---

## 🚀 Démarrage Rapide en Local

### 1. Démarrer le Backend FastAPI

```bash
cd backend

# Créer et activer l'environnement virtuel (optionnel)
python3 -m venv venv
source venv/bin/activate  # Sur Windows: venv\Scripts\activate

# Installer les dépendances
pip install -r requirements.txt

# Lancer le serveur uvicorn
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
*(Le backend sera accessible sur `http://localhost:8000` et les WebSockets sur `ws://localhost:8000/ws/...`)*

### 2. Démarrer le Frontend Expo

```bash
cd frontend

# Installer les dépendances Node.js
npm install

# Lancer Expo Dev Server
npx expo start
```
*Scannez le QR Code affiché dans le terminal avec l'application **Expo Go** (Android / iOS).*

---

## 🌐 Guide de Déploiement

### Option A : Déploiement sur un Serveur Loué (VPS / GCP / Hetzner / OVH)

#### 1. Installer Docker sur le serveur Linux
```bash
sudo apt update && sudo apt install -y docker.io git
sudo systemctl start docker
sudo systemctl enable docker
```

#### 2. Récupérer le code et builder le conteneur Docker
```bash
git clone https://github.com/votre-compte/manHunt.git
cd manHunt/backend

# Builder l'image Docker
docker build -t manhunt-backend .

# Exécuter le conteneur en arrière-plan (redémarrage auto)
docker run -d \
  --name manhunt-server \
  -p 8000:8000 \
  --restart always \
  manhunt-backend
```

#### 3. Ouvrir le port 8000 sur le pare-feu du serveur
- **UFW (Ubuntu) :** `sudo ufw allow 8000/tcp`
- **GCP / AWS / Cloud Provider :** Ajoutez une règle de pare-feu entrante autorisant le port TCP `8000`.

Dans l'application mobile, renseignez : `ws://<IP_DE_VOTRE_SERVEUR>:8000`

---

### Option B : Déploiement Gratuite sur Render.com (Render Free Tier)

[Render.com](https://render.com/) permet d'héberger le backend FastAPI gratuitement en quelques clics.

#### Étapes de configuration sur Render :

1. Connectez-vous sur [Render.com](https://render.com/) et cliquez sur **New +** > **Web Service**.
2. Connectez votre dépôt GitHub `manHunt`.
3. Remplissez les informations de déploiement :
   - **Name :** `manhunt-backend`
   - **Region :** Choisissez la région la plus proche de chez vous (ex: Frankfurt / Oregon).
   - **Language / Environment :** `Docker` (Render utilisera automatiquement le [Dockerfile](file:///home/xenon99o9/Documents/projects/manHunt/backend/Dockerfile)).
   - **Instance Type :** `Free` ($0/month).
4. Cliquez sur **Create Web Service**.

#### Important pour les WebSockets sur Render :
Render génère une URL HTTPS sécurisée (ex: `https://manhunt-backend.onrender.com`). 
Dans l'application mobile Expo, vous devez spécifier le protocole sécurisé **`wss://`** :
```text
wss://manhunt-backend.onrender.com
```

> **Note sur le plan gratuit Render :** Les services gratuits s'endorment après 15 minutes d'inactivité. La première connexion lors du lancement d'une partie peut prendre 30 secondes le temps que le serveur se réveille.

---

## 📂 Structure des Fichiers du Projet

```text
manHunt/
├── README.md                  # Ce guide explicatif
├── .gitignore                 # Exclusion des fichiers sensibles / temporaires
├── backend/
│   ├── Dockerfile             # Configuration Docker
│   ├── requirements.txt       # Dépendances Python
│   └── app/
│       ├── main.py            # API FastAPI & Routes WebSockets
│       ├── models.py          # Modèles Pydantic (Player, Room, Role)
│       ├── state.py           # Stockage RAM en mémoire vive
│       ├── websocket_manager.py # Gestion des connexions actives
│       └── game_loop.py       # Boucle de jeu (Timer 5 min & Reveal)
└── frontend/
    ├── app.json               # Config Expo (Permissions GPS arrière-plan)
    ├── package.json
    ├── App.tsx                # Entrée React Native
    └── assets/
        ├── logo.svg           # Logo vectoriel ManHunt
        ├── icon.png           # Icône mobile
        └── splash.png         # Écran de chargement
```
