# OpenBinder - Personal Bookmark Manager

A modern, privacy-focused Progressive Web App (PWA) for organizing and managing your bookmarks with cloud synchronization.

## ✨ Features

### Core Functionality
- **📁 Folder Organization**: Create and manage custom folders to organize your bookmarks
- **🔐 Secure Authentication**: Google Sign-in integration for secure access
- **📦 Archive System**: Archive bookmarks for better organization
- **🔄 Cloud Sync**: All data synchronized across devices via Firebase
- **📱 Responsive Design**: Works seamlessly on desktop, tablet, and mobile

### Advanced Features
- **📤 Share Target**: Receive shared URLs directly from other apps
- **🎨 Rich Previews**: Built-in preview support for YouTube, Instagram, and Imgur links
- **💾 Backup & Restore**: Export and import your bookmark data as JSON
- **⚡ PWA Ready**: Install as a standalone app with offline capabilities
- **🎯 Smart Icons**: Automatic favicon detection for bookmarked sites

## 🚀 Quick Start

### Prerequisites
- A modern web browser with PWA support
- Google account for authentication
- Firebase project (for cloud features)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd openbinder
   ```

2. **Set up Firebase**
   - Create a new Firebase project at [Firebase Console](https://console.firebase.google.com/)
   - Enable Authentication with Google Sign-in
   - Enable Firestore Database
   - Copy your Firebase config and create `public/config.js`

3. **Configure Firebase**
   Create `public/config.js` with your Firebase configuration:
   ```javascript
   window.projectConfig = {
     apiKey: "your-api-key",
     authDomain: "your-project.firebaseapp.com",
     projectId: "your-project-id",
     storageBucket: "your-project.appspot.com",
     messagingSenderId: "your-sender-id",
     appId: "your-app-id"
   };
   ```

4. **Run locally**
   ```bash
   # Using Python (recommended)
   python -m http.server 8000

   # Or using Node.js
   npx http-server public -p 8000

   # Or using PHP
   php -S localhost:8000 -t public
   ```

5. **Open in browser**
   Navigate to `http://localhost:8000`

### PWA Installation
- Click the "Install" button in your browser's address bar
- Or use the browser menu: "Install OpenBinder"
- The app will be available as a standalone application

## 📖 Usage

### Getting Started
1. **Sign In**: Click "Sign in with Google" to authenticate
2. **Create Folders**: Use the "+" button to create new bookmark folders
3. **Add Bookmarks**: Click "Add" to open the bookmark creation form
4. **Organize**: Drag and drop bookmarks between folders or use the archive feature

### Adding Bookmarks
- **Manual Entry**: Use the "Add" button and fill in the form
- **Share Target**: Share URLs from other apps directly to OpenBinder
- **Quick Add**: Paste URLs directly into the bookmark form

### Managing Bookmarks
- **Archive**: Move bookmarks to archive for better organization
- **Delete**: Remove bookmarks permanently (with confirmation)
- **Preview**: Click on bookmarks to see rich previews
- **Edit**: Modify bookmark details anytime

### Backup & Restore
- **Backup**: Export all your data as a JSON file
- **Restore**: Import previously exported backup files
- **Cross-device**: Transfer bookmarks between devices
