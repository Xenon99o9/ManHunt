# ManHunt — Cache-Cache GPS Grandeur Nature

**ManHunt** est une application mobile multijoueur temps réel basée sur la géolocalisation GPS, conçue pour organiser des parties de cache-cache géantes en extérieur.

<p align="center">
  <img src="./frontend/assets/logo.svg" width="160" alt="Logo ManHunt" />
</p>

---

## 📲 Téléchargements & Releases

| Plateforme | Version | Fichier d'installation |
| :--- | :--- | :--- |
| **Android** | `v1.0.0` | [Télécharger ManHunt-v1.0.0.apk](../../releases/download/v1.0.0/ManHunt-v1.0.0.apk) |
| **iOS** | `v1.0.0` | [Voir la Release v1.0.0 (TestFlight / IPA)](../../releases/tag/v1.0.0) |

> 📌 **Note d'installation Android :** Si vous téléchargez le fichier APK directement sur votre téléphone, autorisez l'installation d'applications issues de sources inconnues dans les paramètres de votre navigateur mobile.

---

## 🛠️ Générer les exécutions (Build Expo EAS)

Si vous souhaitez builder vous-même le fichier `.apk` pour Android ou `.ipa` pour iOS :

```bash
# 1. Se positionner dans le dossier frontend
cd frontend

# 2. Builder l'APK Android (Preview Distribution)
npx eas-cli build --platform android --profile preview

# 3. Tag de version Git v1.0.0
git tag -a v1.0.0 -m "Version v1.0.0 - Release initiale"
git push origin v1.0.0
```

---

## 📋 Règles du Jeu

1. **Rejoindre une partie :** Un hôte crée une Room et partage le code d'accès unique à 6 lettres (ex: `AMONGU`).
2. **Équipes :** Les joueurs choisissent leur rôle : **Chasseur** ou **Chassé**.
3. **Chrono de fuite (5 minutes d'avance) :**
   - Au lancement de la partie, les chassés disposent de 5 minutes d'avance pour s'éloigner et se cacher.
   - Pendant cette période, les chasseurs ont accès à un compte à rebours, mais la carte Google Maps leur est masquée.
4. **Révélation périodique (Toutes les 5 minutes) :**
   - Toutes les 5 minutes, le serveur backend récupère la position GPS exacte de tous les chassés.
   - Les coordonnées sont transmises en direct aux chasseurs et s'affichent sur la carte Google Maps.
5. **Suivi GPS en arrière-plan :**
   - L'application transmet la position même lorsque l'écran est verrouillé (`expo-location` + `TaskManager`).

---

## 🏗️ Architecture Technique

- **Backend (Python 3.11 / FastAPI) :**
  - **Stockage 100% RAM :** Aucune base de données. Toutes les rooms et positions sont stockées dans un dictionnaire Python en mémoire vive.
  - **Communication temps réel :** WebSockets natifs avec pings de maintien et reconnexion automatique.
  - **Boucle de jeu asynchrone (`asyncio`) :** Tâche d'arrière-plan autonome s'exécutant toutes les 5 minutes.
- **Frontend (React Native / Expo / TypeScript) :**
  - **Cartographie :** `react-native-maps` (Google Maps).
  - **GPS Arrière-plan :** `expo-location` et `TaskManager` configurés pour fonctionner écran verrouillé.

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
*Scannez le QR Code affiché dans le terminal avec l'application Expo Go (Android / iOS).*

---

## 🌐 Guide de Déploiement Backend

### Option A : Déploiement Gratuit sur Render.com

1. Créez un **Web Service** sur Render.com et connectez votre dépôt GitHub `manHunt`.
2. Sélectionnez le Runtime **Docker** (détecte automatiquement le `Dockerfile`).
3. Dans l'application mobile Expo, renseignez l'URL générée par Render (ex: `https://votre-app.onrender.com`).

---

### Option B : Déploiement sur Serveur Loué (VPS / GCP / Hetzner / OVH)

```bash
# 1. Installer Docker sur le serveur Linux
sudo apt update && sudo apt install -y docker.io git
sudo systemctl start docker && sudo systemctl enable docker

# 2. Cloner et builder le conteneur
git clone https://github.com/votre-compte/manHunt.git
cd manHunt/backend
docker build -t manhunt-backend .

# 3. Exécuter en arrière-plan
docker run -d --name manhunt-server -p 8000:8000 --restart always manhunt-backend
```

---

## 📂 Structure du Projet

```text
manHunt/
├── README.md                  # Documentation du projet et liens de téléchargement
├── .gitignore                 # Exclusion des fichiers temporaires/sensibles
├── backend/
│   ├── Dockerfile             # Configuration Docker pour déploiement
│   ├── requirements.txt       # Dépendances Python (FastAPI, Uvicorn, WebSockets)
│   └── app/
│       └── main.py            # API FastAPI, WebSockets & Boucle 5 min
└── frontend/
    ├── app.json               # Config Expo & Permissions GPS arrière-plan
    ├── package.json
    ├── App.tsx                # Entrée principale React Native
    └── src/
        ├── components/        # MapViewComponent et TimerDisplay
        ├── context/           # GameContext (Gestion d'état et WS)
        ├── screens/           # LobbyScreen et GameScreen
        └── services/          # TaskManager & Background Location
```
