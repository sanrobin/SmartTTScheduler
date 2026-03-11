# Smart Classroom & Timetable Scheduler

Client-side web app for generating optimized college timetables using constraint-based scheduling.

## Static Hosting Ready (Neocities Compatible)

This project is fully static:

- No backend server
- No external database
- No paid APIs
- Data stored in browser `localStorage`

## Folder Structure

- index.html
- login.html
- dashboard.html
- scheduler.html
- css/style.css
- js/storage.js
- js/app.js
- js/scheduler.js
- data/sample-data.json

## Quick Start

1. Upload all files/folders to Neocities (or open locally).
2. Open `index.html`.
3. Login with demo credentials:
	- Admin: `admin / admin123`
	- Faculty: `alice / faculty123`
	- Viewer: `viewer / viewer123`

## How to Use

### 1) Admin Dashboard

Open **Admin Dashboard** to manage:

- Classrooms
- Subjects
- Faculty
- Batches/Sections
- Teaching assignments
- Classes per week
- Max classes per day
- Fixed slots (e.g., `Friday@14:00-15:00`)

All edits are saved in `localStorage`.

### 2) Generate Timetables

Open **Scheduler** page:

1. Set number of solutions.
2. Click **Generate Solutions**.
3. Choose one solution from dropdown.

Implemented constraints:

- Faculty conflict prevention
- Room conflict prevention
- Subject frequency (classes/week)
- Batch max classes/day
- Fixed slot compliance

If generation fails, the app shows failed constraints and suggested fixes.

### 3) Visualization Views

- Department/Batch timetable
- Faculty timetable
- Classroom timetable

### 4) Export

- Printable HTML
- Download JSON
- Download CSV

## Reset to Demo Data

Admin can click **Reset Demo Data** from dashboard to restore sample dataset.
