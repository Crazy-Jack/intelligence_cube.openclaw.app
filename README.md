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

### Personal Agent (RAG System)
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

## 📄 License

MIT License - see LICENSE file for details. 