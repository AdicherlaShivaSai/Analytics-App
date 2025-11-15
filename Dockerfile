# Base Image 
# Using an official Node.js image. 18-alpine is small and secure.
FROM node:18-alpine

# Environment Variables
ENV NODE_ENV=production

# Create and set the working directory inside the container
WORKDIR /app

# Dependencies
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy the rest of application code
COPY . .

# Expose the port the app runs on (must match your .env or default)
EXPOSE 3000

# Run Command 
CMD ["node", "index.js"]