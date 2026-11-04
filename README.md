# Paisa

A small, private, local-first monthly finance tracker. It uses Python's standard library for the local server and SQLite, so no Node.js installation or third-party packages are required.

## Requirements

- Python 3.11 or newer. The supported runtime is recorded in `pyproject.toml`.
- A modern web browser.
- No third-party Python packages, Node.js, or npm packages are required.

If Python is missing, install it from the [official Python downloads page](https://www.python.org/downloads/) first. `requirements.txt` is kept for package tracking; it currently has no packages to install.

## Start the app

On Windows, double-click `run.bat`, or open PowerShell in this folder and run:

```powershell
python server.py
```

There are no third-party Python dependencies, so `pip install -r requirements.txt` is not needed.

Then open <http://127.0.0.1:8765>. Keep the server window open while using the app.

The SQLite database is created at `data/finance.db` the first time the server starts. It stays in this project folder. Back up that file to preserve your data. CSV export downloads the selected month's entries.

## Features

- Monthly dashboard for income, net expenses, a single monthly spending budget, and savings targets
- Signed expenses, so reimbursements reduce category spending
- Persistent categories, with safe removal from active use when the current month's category total is zero; history remains available
- One global bank-statement checkpoint
- Local SQLite persistence and CSV export
- Separate frontend modules for API access, formatting, rendering, and interactions

## Data and privacy

The local server binds to `127.0.0.1`, so the app is intended for use on this computer. No account or cloud service is involved. The Google Fonts stylesheet is an optional visual enhancement; the page has local system font fallbacks.
