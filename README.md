# Intelligence Cubed Homepage

A modern, responsive homepage for Intelligence Cubed built with Node.js, Vite, and modern web technologies. Features a clean white and gray design theme with light purple accent colors.

## 🚀 Features

- **Modern Tech Stack**: Built with Node.js, Vite, and Express.js
- **Clean Design**: Modern interface with white/gray theme and light purple (#8B7CF6) primary colors
- **Responsive Layout**: Works seamlessly on desktop, tablet, and mobile devices
- **Interactive Elements**: 
  - Hover tooltips on the Auto button (positioned inside textbox at bottom-left)
  - Clickable suggestion items
  - Navigation menu with active states
  - Search functionality
- **Modern Typography**: Uses Inter font family for a professional look
- **Development Tools**: ESLint, Prettier, and hot reload for development

## 📋 Prerequisites

- **Node.js** (version 14 or higher)
- **npm** or **yarn** package manager

## 🛠 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd intelligence-cubed-homepage
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

## 🚦 Development

### Server Startup

The application requires both a **backend server** and a **frontend server** to run:

#### 1. Start Backend Server (Required)
```bash
# Set environment variables (optional, can also be set in config.js)
export ALLOYDB_PUBLIC_IP=35.239.188.129
export PORT=3001

# Start the backend server
npm start
# or
node serve.js
```

The backend server runs on `http://localhost:3001` and provides:
- API endpoints for chat completions
- User agent management (Firestore)
- RAG file processing (AlloyDB)
- File uploads to Google Cloud Storage

#### 2. Start Frontend Server (Required)
```bash
npm run dev
# or
yarn dev
```

The frontend server runs on `http://localhost:3002` and:
- Serves the web application
- Proxies `/api/*` requests to the backend on port 3001
- Provides hot reload for development

#### Quick Start (Both Servers)
```bash
# Terminal 1: Backend
ALLOYDB_PUBLIC_IP=35.239.188.129 PORT=3001 node serve.js

# Terminal 2: Frontend
npm run dev
```

Then open `http://localhost:3002` in your browser.

### Environment Variables

Optional environment variables (can also be set in `config.js`):
- `ALLOYDB_PUBLIC_IP` - AlloyDB public IP for RAG knowledge chunks
- `PORT` - Backend server port (default: 3001)
- `GEMINI_API_KEY` - Gemini API key for user agents
- `GOOGLE_APPLICATION_CREDENTIALS` - Path to Google Cloud service account key

### Build for Production
```bash
npm run build
# or
yarn build
```

### Preview Production Build
```bash
npm run preview
# or
yarn preview
```

### Start Production Server
```bash
npm start
# or
yarn start
```

## 🧹 Code Quality

### Lint Code
```bash
npm run lint
# or
yarn lint
```

### Format Code
```bash
npm run format
# or
yarn format
```

## 📁 Project Structure

```
intelligence-cubed-homepage/
├── public/
│   ├── index.html                    # Main HTML file
│   └── svg/I3 logo.svg              # Logo file
├── src/
│   ├── styles.css                    # CSS styling
│   └── script.js                     # JavaScript functionality
├── server.js                         # Express.js production server
├── vite.config.js                    # Vite configuration
├── package.json                      # Node.js dependencies and scripts
├── .eslintrc.js                      # ESLint configuration
├── .prettierrc                       # Prettier configuration
└── README.md                         # This file
```

## 🎯 Navigation Menu

The header includes the following navigation items:
- **Chats** (active by default)
- **Modelverse** 
- **Benchmark**
- **Canvas**
- **Workflows**
- **MyCart**
- **My Account** (right-aligned)

## ⭐ Main Features

### Central Terminal
- **Title**: "Intelligence Cubed Terminal"
- **Subtitle**: "Use the most suitable, practical, and specific model to get answers."
- **Search Input**: "Ask AI anything" placeholder with Auto button inside at bottom-left
- **Auto Button**: Shows tooltip on hover explaining the model selection process

### Auto Button Tooltip
When hovering over the Auto button, it displays:
"The system is analyzing hundreds of models in Intelligence Cubed's Modelverse to find the most suitable one to answer your question."

### Suggestion Cards
Pre-populated suggestion cards for common queries related to cryptocurrency and market analysis.

## 🎨 Customization

### Logo Replacement
Replace `svg/I3 logo.svg` with your actual logo file and update the src attribute in the HTML files.

### Color Customization
The primary color (#8B7CF6 - light purple) can be modified in `src/styles.css`. Search for this hex code to update all instances.

## 🌐 API Endpoints

The Express.js backend server provides the following endpoints:

### Core Endpoints
- `GET /api/health` - Health check endpoint
- `POST /api/chat/completions` - Chat completions (supports user agents with RAG)
- `POST /api/embeddings` - Generate embeddings for text

### User Agents
- `GET /api/user-agents` - List all user agents
- `GET /api/user-agents/:name` - Get specific user agent by name

### Personal Co-Creation (RAG System)
- `GET /api/personal-agent/models` - List personal agent models
- `POST /api/personal-agent/models` - Create new model
- `PATCH /api/personal-agent/models/:modelId` - Update model
- `DELETE /api/personal-agent/models/:modelId` - Delete model
- `POST /api/personal-agent/files/upload` - Upload file for RAG processing
- `POST /api/process-rag-file` - Process uploaded file (extract, chunk, embed, store)
- `GET /api/personal-agent/files` - List files for a model
- `DELETE /api/personal-agent/files/:fileId` - Delete file

### Models
- `GET /api/models` - List available models
- `GET /api/models/stats` - Get model statistics

## 🖥 Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## ☁️ Deploy to Google Cloud Run

### Prerequisites

1. **Google Cloud Account** with billing enabled
2. **Google Cloud CLI** installed ([Download here](https://cloud.google.com/sdk/docs/install))

### Step-by-Step Deployment

#### 1. Install Google Cloud CLI

**Windows (PowerShell as Administrator):**
```powershell
(New-Object Net.WebClient).DownloadFile("https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe", "$env:Temp\GoogleCloudSDKInstaller.exe")
& $env:Temp\GoogleCloudSDKInstaller.exe
```

**macOS:**
```bash
brew install --cask google-cloud-sdk
```

**Linux:**
```bash
curl https://sdk.cloud.google.com | bash
```

#### 2. Initialize and Authenticate

```bash
# Log in to Google Cloud
gcloud auth login

# Set your project (create one at https://console.cloud.google.com if needed)
gcloud config set project YOUR_PROJECT_ID

# Enable required APIs
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable artifactregistry.googleapis.com
```

#### 3. Build the Frontend

```bash
# Install dependencies
npm install

# Build the production bundle (important!)
npm run build
```

#### 4. Deploy to Cloud Run

```bash
gcloud run deploy i3-app \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --quiet
```

The deployment will:
- Build a Docker image using the `Dockerfile`
- Push it to Google Container Registry
- Deploy to Cloud Run

After deployment, you'll see a URL like:
```
Service URL: https://i3-app-XXXX.us-central1.run.app
```

### Important Notes

1. **Always run `npm run build` before deploying** - This creates the bundled `dist/` folder that gets served in production.

2. **WalletConnect Domain Whitelist** - If using WalletConnect, add your deployed domain to the allowed domains at [WalletConnect Cloud](https://cloud.walletconnect.com).

3. **Environment Variables** - The `Dockerfile` sets `NODE_ENV=production` automatically.

### Updating the Deployment

To deploy updates:

```bash
# Rebuild frontend
npm run build

# Redeploy
gcloud run deploy i3-app --source . --region us-central1 --allow-unauthenticated --quiet
```

### Troubleshooting

**"Permission denied" errors:**
```bash
# Get your project number
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format='value(projectNumber)')

# Grant necessary permissions
gcloud projects add-iam-policy-binding $(gcloud config get-value project) \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/storage.objectViewer"

gcloud projects add-iam-policy-binding $(gcloud config get-value project) \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/logging.logWriter"
```

**"gcloud not found" after installation:**
- Restart your terminal/PowerShell
- Or run: `$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")`

## 📄 License

MIT License - see LICENSE file for details. 