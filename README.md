# LeadFlow

LeadFlow is a single-screen lead management app built for the PravarAI AI-Smart Fullstack Intern assessment. It helps a sales representative track leads, record conversations, and manage follow-up reminders.

## Features

- View leads with their company, status, latest discussion, and follow-up date.
- Search by lead name or company.
- Filter leads by status: New, Contacted, Qualified, Proposal Sent, Won, or Lost.
- Prioritize leads with follow-ups due today.
- Highlight overdue follow-ups.
- Open a lead profile and view its discussion history, newest first.
- Add discussion notes with an optional follow-up date and time.
- Update a lead’s status from its profile.
- Add leads with a required name and optional company and phone number.
- Persist leads and discussions in MongoDB.
- Seed six sample leads when the database is empty.

## Technology

| Part | Technology |
|---|---|
| Frontend | Next.js 14, React 18, TypeScript |
| Backend | FastAPI, Pydantic, Motor |
| Database | MongoDB 7 |
| Local services | Docker Compose |

## Project structure

    LeadFlow/
    ├── backend/
    │   └── app/
    │       ├── main.py       # FastAPI routes and database operations
    │       └── seed.py       # Sample-data helper
    ├── frontend/
    │   └── app/
    │       ├── page.tsx      # Lead dashboard and profile dialogs
    │       ├── layout.tsx    # Root layout and page metadata
    │       └── globals.css   # Application styles
    ├── .env.example          # Example environment settings
    ├── docker-compose.yml
    └── README.md

## Requirements

To run the application with Docker:

- Docker Desktop or Docker Engine with Docker Compose

To run the services separately:

- Node.js 20 or later
- Python 3.12 or later
- MongoDB 7

## Run with Docker Compose

Clone the repository and start the application:

    git clone https://github.com/triveninelakurthi9/LeadFlow.git
    cd LeadFlow
    docker compose up --build

The services are available at:

- **Frontend:** http://localhost:3000
- **API documentation:** http://localhost:8000/docs
- **Health check:** http://localhost:8000/health

Stop the services with:

    docker compose down

MongoDB data is stored in a Docker volume and remains available after stopping the services.

## Run without Docker

Start MongoDB locally, then start the backend and frontend in separate terminals.

### Backend

From the repository root:

    cd backend
    python -m venv .venv

Activate the virtual environment.

Windows PowerShell:

    .venv\Scripts\Activate.ps1

macOS or Linux:

    source .venv/bin/activate

Install dependencies and start the API:

    pip install -r requirements.txt
    uvicorn app.main:app --reload --port 8000

By default, the backend connects to `mongodb://localhost:27017` and uses the `leadflow` database.

### Frontend

In a second terminal, from the repository root:

    cd frontend
    npm install

Set the API URL and start the development server.

Windows PowerShell:

    $env:NEXT_PUBLIC_API_URL="http://localhost:8000"
    npm run dev

macOS or Linux:

    export NEXT_PUBLIC_API_URL="http://localhost:8000"
    npm run dev

Open http://localhost:3000.

## Configuration

| Variable | Used by | Default | Description |
|---|---|---|---|
| `MONGO_URL` | Backend | `mongodb://localhost:27017` | MongoDB connection string |
| `DB_NAME` | Backend | `leadflow` | MongoDB database name |
| `SEED_ON_START` | Backend | `true` | Add sample data when the leads collection is empty |
| `CORS_ORIGINS` | Backend | `http://localhost:3000` | Comma-separated list of allowed frontend origins |
| `NEXT_PUBLIC_API_URL` | Frontend | `http://localhost:8000` | API base URL used by the browser |

See [`.env.example`](.env.example) for example settings. Do not commit real credentials or secrets.

## API

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Check API and database connectivity |
| `GET` | `/api/leads` | List leads; accepts optional `status` and `search` query parameters |
| `POST` | `/api/leads` | Create a lead |
| `GET` | `/api/leads/{id}` | Retrieve one lead |
| `PATCH` | `/api/leads/{id}` | Update lead fields or status |
| `GET` | `/api/leads/{id}/discussions` | Retrieve a lead’s discussion history |
| `POST` | `/api/leads/{id}/discussions` | Add a discussion and optional follow-up |

The API returns `404` when a requested lead does not exist, `400` for invalid status updates, and `422` for invalid request data. Successful creation requests return `201 Created`.

Interactive API documentation is available at http://localhost:8000/docs.

## Data behavior

- Timestamps are stored in UTC and displayed in the viewer’s local timezone.
- Discussion history is returned newest first.
- Saving a discussion updates the lead’s latest discussion summary.
- A follow-up date changes when a new discussion includes one. Leaving the follow-up field blank does not clear an existing reminder.
- Sample leads and discussions are seeded at startup when seeding is enabled and the leads collection is empty.
- Authentication and multi-user permissions are outside the scope of this assessment.

## AI assistance

AI tools were used to assist with parts of the implementation and documentation. The generated suggestions were reviewed and adapted for this project.

## License

This project was created for assessment purposes.
