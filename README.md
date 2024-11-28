# MoroStick Backend

A robust backend service for WhatsApp sticker creation and management, built with Express.js and TypeScript.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5.4-blue.svg)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-4.19.2-lightgrey.svg)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/Mongoose-8.5.2-green.svg)](https://mongoosejs.com/)
[![Sharp](https://img.shields.io/badge/Sharp-0.33.5-yellow.svg)](https://sharp.pixelplumbing.com/)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

## 🚀 Features

### Core Functionality

- Complete WhatsApp sticker pack creation and management
- WebP conversion and optimization
- Sticker size and format validation
- Pack tray icon customization
- Analytics and trending packs

### Authentication & Security

- JWT-based authentication
- Social login (Google, Facebook)
- OTP verification system
- Rate limiting
- Request sanitization

### Media Handling

- CloudFlare R2 storage integration
- Image processing and optimization
- Format conversion
- Size validation

### User Management

- Profile management
- Sticker collection system
- Pack sharing capabilities
- Usage analytics

## 🛠 Tech Stack

### Core

- **Runtime**: Node.js
- **Language**: TypeScript 5.5.4
- **Framework**: Express.js 4.19.2
- **Database**: MongoDB with Mongoose 8.5.2

### Storage & Media

- **Cloud Storage**: CloudFlare R2
- **Image Processing**: Sharp 0.33.5
- **Video Processing**: Fluent-ffmpeg

### Authentication & Security

- **JWT**: jsonwebtoken
- **Encryption**: bcrypt
- **Security Headers**: helmet
- **Input Validation**: express-validator
- **Sanitization**: mongo-sanitize

### Utils & Others

- **Email**: nodemailer
- **File Upload**: multer
- **Logging**: morgan
- **OAuth**: passport, google-auth-library

## ⚙️ Environment Variables

```env
# Server Settings
PORT=3000
BASE_URL=http://localhost:3000
API_PREFIX=/api/v1

# App Settings
APP_VERSION=1.0.0
APP_NAME=MoroStick
ISSUER=MoroStick
AUDIENCE=MoroStickUsers
NODE_ENV=development
ACCOUNT_RECOVERY_PERIOD=15

# Database Settings
MONGODB_URL=mongodb://localhost:27017/morostick
MORGAN=dev

# JWT Settings
ACCESS_TOKEN_SECRET=your_access_token_secret
ACCESS_TOKEN_EXPIRES_IN=10m
REFRESH_TOKEN_SECRET=your_refresh_token_secret
REFRESH_TOKEN_EXPIRES_IN=30d
JWT_ALGORITHM=HS256

# Email Settings
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your_email
EMAIL_PASS=your_email_password

# Rate Limit Settings
RATE_LIMIT_WINDOW_MS=15
RATE_LIMIT_MAX=10
BCRYPT_ROUNDS=10

# OAuth Settings
GOOGLE_MOBILE_CLIENT_ID=your_google_client_id
FACEBOOK_MOBILE_APP_ID=your_facebook_app_id
FACEBOOK_MOBILE_APP_SECRET=your_facebook_app_secret

# OTP Settings
OTP_EXPIRATION=10
OTP_LENGTH=6
OTP_MAX_ATTEMPTS=3
OTP_ALLOWED_RESEND_INTERVAL=1

# CloudFlare R2 Settings
CLOUDFLARE_R2_TOKEN_VALUE=your_token
CLOUDFLARE_R2_ACCESS_KEY_ID=your_access_key
CLOUDFLARE_R2_SECRET_ACCESS_KEY=your_secret_key
CLOUDFLARE_R2_BUCKET_NAME=your_bucket
CLOUDFLARE_R2_ENDPOINT=your_endpoint
CLOUDFLARE_R2_PUBLIC_URL=your_public_url
```

## 🚦 Getting Started

1. **Clone the repository**

```bash
git clone https://github.com/yourusername/morostick-backend.git
cd morostick-backend
```

2. **Install dependencies**

```bash
npm install
```

3. **Set up environment variables**

- Copy `.env.example` to `.env`
- Fill in all required variables

4. **Start development server**

```bash
npm run dev
```

5. **Build for production**

```bash
npm run build
```

## 📚 API Endpoints

### Authentication

```
POST /api/v1/auth/register - Register new user
POST /api/v1/auth/login - Login user
POST /api/v1/auth/refresh - Refresh access token
POST /api/v1/auth/google - Google OAuth login
POST /api/v1/auth/facebook - Facebook OAuth login
```

### Sticker Packs

```
POST /api/v1/packs - Create new pack
GET /api/v1/packs - List all packs
GET /api/v1/packs/:id - Get pack details
PUT /api/v1/packs/:id - Update pack
DELETE /api/v1/packs/:id - Delete pack
```

### Stickers

```
POST /api/v1/packs/:id/stickers - Add sticker to pack
DELETE /api/v1/packs/:id/stickers/:stickerId - Remove sticker
PUT /api/v1/packs/:id/stickers/:stickerId - Update sticker
```

## 🔒 Security Features

- JWT token authentication
- Request rate limiting
- Input sanitization
- MongoDB injection prevention
- Security headers with Helmet
- CORS configuration
- Password hashing
- OTP verification

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- --grep "Auth"
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is [ISC](LICENSE) licensed.

## 👨‍💻 Author

**Badr Karrachai**

- [GitHub](https://github.com/badrkarrachai)
- [LinkedIn](https://www.linkedin.com/in/badr-karrachai/)

---

Made with ❤️ for MoroStick
