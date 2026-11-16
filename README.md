# Sahana message website + private visitor dashboard

## Features
- Public message page at `/`.
- Anonymous event tracking: `visit`, `message_open`, `instagram_click`.
- Private dashboard at `/admin`, protected by HTTP Basic Authentication.
- Stores event type and timestamp only; no visitor name, IP address, or precise location.
- The public page discloses anonymous activity recording.

## Deploy with Render
1. Push all files to a GitHub repository. `package.json`, `server.js`, and `public/` must be at the repository root.
2. Create a Render PostgreSQL database and copy its **Internal Database URL**.
3. Create a Render Web Service connected to the repository.
4. Build command: `npm install`; Start command: `npm start`.
5. Set environment variables on the Web Service:
   - `DATABASE_URL` = Render PostgreSQL Internal Database URL
   - `ADMIN_USER` = your chosen dashboard username (default `nikhil`)
   - `ADMIN_PASSWORD` = a long, unique password
6. Deploy. Share the Render URL ending in `/` as the public website.
7. Open the same domain ending in `/admin` for the private dashboard. Your browser will prompt for the username and password.

Never put database URLs or admin passwords in frontend files or GitHub. Use HTTPS. This source is not a live deployment; tracking begins only after hosting and database configuration. Activity is anonymous and cannot confirm that a visitor is Sahana.
