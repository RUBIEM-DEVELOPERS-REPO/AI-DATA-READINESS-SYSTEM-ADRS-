# Database Setup Guide

The AI Data Readiness System (ADRS) requires a PostgreSQL database to run locally. This guide provides instructions on how to set up the database using Docker based on the expected `.env` configuration.

## Prerequisites
- Docker (or Docker Desktop for Windows) installed and running.
- Node.js and npm installed.

## Option 1: Quick Start (Docker Run)

If you want to quickly spin up the database in the background without creating additional files, run the following command in your terminal:

```bash
docker run --name adrs-db -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=storage_db -p 5432:5432 -d postgres:15
```

## Option 2: Docker Compose (Recommended)

If you prefer using Docker Compose for easier management, you can create a `docker-compose.yml` file in the root of the `Data-Readiness-Hub` directory with the following content:



Then, start the database by running:

```bash
docker-compose up -d
```

## Applying the Database Schema

Once your PostgreSQL database container is up and running, you need to initialize it with the correct tables. 

Open your terminal, ensure you are in the `Data-Readiness-Hub` directory, and run the Drizzle push command:

```bash
npm run db:push
```

After doing this, your database will be fully initialized and ready to use for local development!
