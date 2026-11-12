# Inventory Management System

A beginner-friendly full-stack inventory management application for Task 04.

## Technology
- Frontend: React + Vite
- Backend: Node.js + Express
- Database and authentication: Supabase (PostgreSQL + Supabase Auth)

## Requirements
Install these on your computer:
- Node.js LTS: https://nodejs.org/
- Visual Studio Code: https://code.visualstudio.com/

## 1. Open the project
1. Extract this ZIP file.
2. Open VS Code.
3. Select **File → Open Folder** and choose `inventory-management-system`.

## 2. Create a Supabase project
1. Visit https://supabase.com/ and create a free project.
2. Open **Project Settings → API**.
3. Copy the Project URL and `anon` public key.
4. Copy the `service_role` key only into the backend `.env` file. Never put it in frontend code or GitHub.

## 3. Create the database tables
In Supabase, open **SQL Editor → New query**.
Copy and run the complete contents of `database/schema.sql`.

## 4. Configure environment variables
Create `frontend/.env` using `frontend/.env.example`.
Create `backend/.env` using `backend/.env.example`.

Fill in your Supabase URL and keys.

## 5. Install dependencies
Open two terminals in VS Code.

Terminal 1:
```bash
cd backend
npm install
```

Terminal 2:
```bash
cd frontend
npm install
```

## 6. Run the application
Terminal 1:
```bash
npm run dev
```

Terminal 2:
```bash
npm run dev
```

Open the frontend URL shown by Vite, normally http://localhost:5173.

Backend health check: http://localhost:5000/api/health

## Notes
- Register a user through the app. Supabase may ask you to verify your email, depending on your Auth settings.
- The backend checks the signed-in user's access token before allowing product operations.
- The backend uses the service-role key only on the server. Keep `.env` files private.
- Do not commit `.env` files. `.gitignore` excludes them.
- This is a starter project. Test authentication, CRUD, validation, and deployment before submitting.
