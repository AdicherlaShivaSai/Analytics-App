# Website Analytics API

This is a scalable backend API for a Website Analytics application, built with Node.js, Express, and PostgreSQL. It allows clients to register their websites, obtain an API key, and send detailed analytics events (clicks, visits, referrer data, etc.) for aggregation and reporting.

**Live Deployment URL:** [https://analytics-app-nmox.onrender.com/api/health](https://analytics-app-nmox.onrender.com/api/health)

---

### 🚨 **Deployment & Testing Note**

**1. Google Security Warning (False Positive):**
Because this app is hosted on Render's free tier, Google's Safe Browsing will flag the login URL as "dangerous." This is a false positive.

**To test the Google login, please follow these steps:**
1.  Visit: `https://analytics-app-nmox.onrender.com/api/auth/google`
2.  On the red warning screen, click **"Details"**.
3.  Click **"Visit this unsafe site"** to proceed.

**2. Testing Authenticated Routes (Postman):**
To test routes like `POST /api/auth/register`, you must first log in with Google in your browser. Then, copy the `connect.sid` cookie from your browser's dev tools and add it to Postman as a `Cookie` header:
* **Key:** `Cookie`
* **Value:** `connect.sid=...your-copied-cookie-value...`

---

## 🚀 Features

* **API Key Management:** Secure developer sign-up using Google OAuth. Developers can register their apps to generate, retrieve, and revoke API keys.
* **Event Data Collection:** A high-performance `POST /api/analytics/collect` endpoint for ingesting analytics events.
* **Analytics & Reporting:** Aggregation endpoints (`/event-summary`, `/user-stats`) to provide insights into collected data.
* **Caching:** Implements Redis to cache frequent analytics queries for faster response times.
* **Security & Scalability:** Uses rate limiting to prevent abuse and is containerized with Docker for predictable, scalable deployment.

---

## 💻 Tech Stack

* **Backend:** Node.js, Express.js
* **Database:** PostgreSQL (using Neon)
* **Caching:** Redis (using Render)
* **Authentication:** Google OAuth 2.0 (via `passport.js`), API Keys (via custom middleware)
* **Deployment:** Docker, Render

---

## ⚙️ How to Run Locally

1.  **Clone the Repository**
    ```bash
    git clone [https://github.com/YOUR_USERNAME/YOUR_REPO_NAME](https://github.com/YOUR_USERNAME/YOUR_REPO_NAME)
    cd YOUR_REPO_NAME
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Set Up Environment Variables**
    Create a `.env` file in the root directory and add the following variables.

    ```ini
    # Server Configuration
    PORT=3000
    
    # Neon PostgreSQL Database
    DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"
    
    # Google OAuth Credentials
    GOOGLE_CLIENT_ID="YOUR_GOOGLE_CLIENT_ID"
    GOOGLE_CLIENT_SECRET="YOUR_GOOGLE_CLIENT_SECRET"
    
    # Session Secret
    SESSION_SECRET="a_very_strong_and_random_secret_key"
    
    # Redis
    REDIS_URL="rediss://user:password@host:port"
    ```

4.  **Set Up Database**
    * Log in to your Neon account and create a new project.
    * Get the `DATABASE_URL` and add it to your `.env` file.
    * In the Neon "SQL Editor", run the `CREATE TABLE` scripts (found in the `db.js` file or project setup) to create the `users`, `applications`, `api_keys`, and `events` tables and their indexes.

5.  **Run the Application**
    ```bash
    npm run dev
    ```
    The server will start on `http://localhost:3000`.

---

## 📖 API Endpoints

### API Key Management (Developer Auth)
*Requires Google OAuth session*

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/auth/google` | Initiates Google OAuth login. |
| `GET` | `/api/auth/google/callback` | Callback URL for Google. |
| `POST` | `/api/auth/register` | Registers a new app and generates an API key. |
| `GET` | `/api/auth/api-key` | Retrieves a list of the user's registered apps. |
| `POST` | `/api/auth/revoke` | Revokes an existing API key. |

### Event Data Collection
*Requires `x-api-key` header*

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/analytics/collect` | Submits a new analytics event. |

### Analytics & Reporting
*Requires Google OAuth session*

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/auth/event-summary` | Retrieves an aggregated summary of events. |
| `GET` | `/api/auth/user-stats` | Returns stats for a specific user ID. |
| `GET` | `/api/health` | Health check endpoint. |

---

## 🧠 Challenges and Solutions

* **Challenge:** Securely and quickly authenticating high-volume event collection.
    * **Solution:** I implemented two auth systems. For developers, `passport.js` with Google OAuth manages sessions. For the `/collect` endpoint, a custom middleware validates an `x-api-key` header. To ensure speed, the API key is hashed using the fast `SHA256` algorithm (not slow `bcrypt`) and results are cached in memory to avoid DB lookups on every request.

* **Challenge:** Designing an efficient database schema for analytics queries.
    * **Solution:** The schema is normalized with `applications` and `users`. The main `events` table includes indexes on `(app_id, timestamp DESC)`, `(event_name)`, and `(user_id)` to dramatically speed up common filtering and aggregation queries for reporting.

* **Challenge:** Rate limiting failed on production (Render) due to proxy.
    * **Solution:** The `express-rate-limit` library couldn't find the real user IP. This was solved by adding `app.set('trust proxy', 1);` to the `index.js` file, which tells Express to trust the `X-Forwarded-For` header set by Render's proxy.