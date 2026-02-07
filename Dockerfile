# Build backend
FROM python:3.10-slim

WORKDIR /app

# Install dependencies
RUN pip install fastapi uvicorn python-dotenv openai twilio

# Copy server
COPY server.py .

# Expose port
EXPOSE 8000

# Run
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
