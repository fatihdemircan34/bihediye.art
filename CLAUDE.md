# bihediye.art - AI-Powered Gift Service

A TypeScript-based service that creates personalized music and video gifts using artificial intelligence.

## Project Overview

bihediye.art is a gift service platform that leverages AI to generate custom music and videos for special occasions. Users can create unique, personalized gifts by providing details about the recipient and occasion, and the AI will generate tailored multimedia content.

## Tech Stack

- **Language**: TypeScript
- **Runtime**: Node.js
- **AI Integration**: Multiple AI services for music and video generation
- **Package Manager**: npm

## Project Structure

```
bihediye.art/
├── src/
│   ├── services/          # AI service integrations
│   │   ├── music/         # Music generation services
│   │   └── video/         # Video generation services
│   ├── api/               # API endpoints
│   ├── models/            # Data models and types
│   ├── utils/             # Utility functions
│   └── config/            # Configuration files
├── tests/                 # Test files
├── dist/                  # Compiled JavaScript output
└── package.json
```

## Features (Planned)

- 🎵 AI-generated personalized music
- 🎬 AI-generated personalized videos
- 🎁 Custom gift packaging options
- 📧 Email delivery system
- 💳 Payment integration
- 🌐 Web interface for gift creation

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- API keys for AI services

### Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env .env
# Edit .env with your API keys

# Build the project
npm run build

# Run in development mode
npm run dev

# Run in production
npm start
```

### Environment Variables

Create a `.env` file with the following variables:

```env
# AI Service API Keys
MUSIC_AI_API_KEY=your_music_ai_key
VIDEO_AI_API_KEY=your_video_ai_key

# Database
DATABASE_URL=your_database_url

# Server
PORT=3000
NODE_ENV=development

# Payment
PAYMENT_API_KEY=your_payment_key

# Email
SMTP_HOST=your_smtp_host
SMTP_PORT=587
SMTP_USER=your_email
SMTP_PASS=your_password
```

## Development

### Scripts

```bash
# Development with hot reload
npm run dev

# Build TypeScript
npm run build

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

### TypeScript Configuration

The project uses strict TypeScript configuration for type safety. See `tsconfig.json` for details.

## API Endpoints (Planned)

### Music Generation
- `POST /api/music/generate` - Generate personalized music
- `GET /api/music/:id` - Get generated music details
- `GET /api/music/:id/download` - Download music file

### Video Generation
- `POST /api/video/generate` - Generate personalized video
- `GET /api/video/:id` - Get video generation status
- `GET /api/video/:id/download` - Download video file

### Orders
- `POST /api/orders` - Create new gift order
- `GET /api/orders/:id` - Get order details
- `PATCH /api/orders/:id` - Update order status

## AI Services Integration

### Music Generation
- Integration with AI music generation APIs
- Support for different music styles and moods
- Custom lyric generation based on user input

### Video Generation
- Integration with AI video generation APIs
- Template-based video creation
- Custom scene composition

## Contributing

This is a private project. For development guidelines and contribution rules, please contact the project maintainer.

## License

Proprietary - All rights reserved

## Contact

For questions or support, please contact the development team.

---

**Note**: This is an active development project. Features and documentation are subject to change.
