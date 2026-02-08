# Use an official lightweight Python image
FROM python:3.9-slim

# Set the working directory inside the container
WORKDIR /app

# Copy requirement file first (for caching)
COPY requirements.txt .

# Install dependencies
# FIX: 'libgl1' and 'libglib2.0-0' are the modern replacements for OpenCV
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir -r requirements.txt

# Copy the rest of the app code
COPY . .

# Expose the port FastAPI runs on
EXPOSE 8000

# Command to run the app
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]