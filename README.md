# WanaShip-Backend

![github-icon](https://github.com/user-attachments/assets/9e3ef174-0b83-4d34-9c0f-33477d8a298c)

WanaShip-Backend is the server-side component of the WanaShip application, a modern shipping and parcel management system. This Node.js backend provides robust APIs for user management, parcel tracking, and shipping operations.

[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.19.2-lightgrey.svg)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/Mongoose-8.5.2-green.svg)](https://mongoosejs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5.4-blue.svg)](https://www.typescriptlang.org/)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

## 🚀 Features

- **User Authentication**: Secure login and registration system with JWT
- **Parcel Management**: Create, update, and track parcels
- **Address Management**: Manage shipping and receiving addresses
- **Media Handling**: Upload and manage images for parcels and user profiles
- **OAuth Integration**: Sign in with Google and Discord
- **Role-Based Access Control**: Differentiate between user types (e.g., customers, admins)

## 🛠 Tech Stack

- **Node.js**: Runtime environment
- **Express.js**: Web application framework
- **MongoDB**: Database
- **Mongoose**: ODM for MongoDB
- **TypeScript**: Programming language
- **JWT**: Authentication
- **Multer**: File upload handling
- **Cloudinary**: Cloud storage for media files

## 🏗 Project Structure

Our backend follows a modular and organized structure to ensure scalability and maintainability:

- **config/**: Contains configuration files for the application, including environment variables, database connections, and third-party service setups.
- **controllers/**: Houses the logic for handling HTTP requests. Controllers act as an intermediary between the routes and services, processing incoming requests and sending responses.
- **interfaces/**: Defines TypeScript interfaces used throughout the application, ensuring type safety and code consistency.
- **middleware/**: Contains Express middleware functions that process requests before they reach the route handlers. This includes authentication checks, error handling, and request parsing.
- **models/**: Defines the data models and schemas for the application, typically representing database collections or tables.
- **routes/**: Defines the API endpoints and maps them to the appropriate controller functions. This directory organizes the routing structure of the application.
- **services/**: Contains the core business logic of the application. Services handle complex operations, data processing, and interactions with external APIs or databases.
- **utils/**: Hosts utility functions and helper modules that are used across the application, such as data validation, formatting, or custom error classes.
- **app.ts**: The main entry point of the application, where the Express app is initialized and configured.

This structure promotes separation of concerns, making the codebase easier to navigate, test, and maintain as the project grows.

## 🚦 Getting Started

1. **Clone the repository**
   git clone https://github.com/badrkarrachai/WanaShip-Backend.git

2. **Install dependencies**
   cd WanaShip-Backend
   npm install

3. **Set up environment variables**
   Create a `.env` file in the root directory and add the following:

- PORT: `3000`
- BASE_URL: `http://localhost:3000`
- API_PREFIX: `/wanaship/dev`
- APP_VERSION: `1.0.0`
- APP_NAME: `WanaShip`
- ISSUER: `B&H`
- AUDIENCE: `WanaShipUsers`
- MONGODB_URL: `mongodb://localhost:27017/wanaship_db`
- MORGAN: `dev`
- NODE_ENV: `development`
- ACCESS_TOKEN_SECRET: `YOUR_JWT_ACCESS_TOKEN_SECRET`
- REFRESH_TOKEN_SECRET: `YOUR_JWT_REFRESH_TOKEN_SECRET`
- ACCESS_TOKEN_EXPIRES_IN: `10 (10 minutes)`
- REFRESH_TOKEN_EXPIRES_IN `30 (30 days)`
- OTP_EXPIRATION: `10 (10 minutes)`
- EMAIL_HOST: `smtp.gmail.com`
- EMAIL_PORT: `587`
- EMAIL_SECURE: `false`
- EMAIL_USER: `YOUR_EMAIL`
- EMAIL_PASS: `YOUR_EMAIL_PASSWORD`
- RATE_LIMIT_WINDOW_MS: `15`
- RATE_LIMIT_MAX: `10`
- BCRYPT_ROUNDS: `10`
- ACCOUNT_RECOVERY_PERIOD: `15 (15 days)`
- GOOGLE_CLIENT_ID: `YOUR_GOOGLE_CLIENT_ID`
- GOOGLE_CLIENT_SECRET: `YOUR_GOOGLE_CLIENT_SECRET`
- DISCORD_CLIENT_ID: `YOUR_DISCORD_CLIENT_ID`
- DISCORD_CLIENT_SECRET: `YOUR_DISCORD_CLIENT_SECRET`

4. **Run the application**
   npm run dev

## 📚 API Documentation

(Include links to your API documentation or describe key endpoints here)

## 🧪 Testing

Run the test suite with:
npm test

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/badrkarrachai/WanaShip-Backend/issues).

## 📝 License

This project is [MIT](LICENSE) licensed.

## 👨‍💻 Author

**Badr Karrachai**

- [GitHub](https://github.com/badrkarrachai)
- [LinkedIn](https://www.linkedin.com/in/badr-karrachai/)

---

Made with ❤️ for WanaShip
