# 🇮🇳 BharatPay - Digital Payment App

BharatPay is a full-stack digital payment simulation inspired by Google Pay. It features a modern glassmorphic UI, biometric authentication simulations, and real-time transaction processing.

## 🚀 Features
- **Secure Authentication**: PIN-based login with biometric security mandatory for signup.
- **Peer-to-Peer Payments**: Send money to other users via phone or UPI ID.
- **Bank Linking**: Link multiple bank accounts and check balances.
- **Bill Payments**: Recharge mobile plans and pay utility bills.
- **Transaction History**: Track all your spending and earnings in one place.
- **Rewards System**: Earn scratch cards and cashback on every transaction.

## 🛠️ Tech Stack
- **Frontend**: Vanilla HTML5, CSS3 (Glassmorphism), JavaScript (ES6+)
- **Backend**: Node.js, Express.js
- **Database**: MongoDB Atlas
- **Security**: Fingerprint/FaceID API (WebAuthn), Environment variables for sensitive data.

---

## 🌍 Deployment Guide

### 1. Backend (Render)
1. Create a new **Web Service** on [Render](https://render.com).
2. Connect your GitHub repository.
3. **Build Command**: `cd backend && npm install`
4. **Start Command**: `node backend/server.js`
5. **Environment Variables**:
   - `MONGODB_URI`: Your MongoDB Atlas connection string.
   - `PORT`: `3000` (Render will override this, which is fine).

### 2. Frontend (Vercel)
1. Create a new project on [Vercel](https://vercel.com).
2. Connect your GitHub repository.
3. **Framework Preset**: Other (or skip).
4. **Root Directory**: `frontend`
5. **Build Command**: (Leave empty)
6. **Output Directory**: `.` (current directory)

---

## 🛠️ Local Development
1. Clone the repository.
2. Install dependencies: `cd backend && npm install`.
3. Create a `.env` file in the `backend` folder and add your `MONGODB_URI`.
4. Start the server: `node backend/server.js`.
5. Open `frontend/index.html` in your browser.

## 🎯 Objective
This project implements real-world fintech concepts including atomic transactions, balance consistency, and secure authentication flows.

---
*Created with ❤️ by Priya Mondal*
