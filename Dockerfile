#####################################################################
# Multi-stage Dockerfile for ffmpeg-api
#
# - Builder stage installs Node dependencies
# - Final stage uses jrottenberg/ffmpeg as base and adds Node runtime
#   Copies node_modules and app source from builder to final
# - Adds a simple HEALTHCHECK that queries /endpoints
#####################################################################

###########################
# Builder: install deps
###########################
FROM node:18-alpine AS builder

WORKDIR /usr/src/app

# Copy package.json and package-lock if present
COPY src/package.json ./package.json
COPY src/package-lock.json ./package-lock.json

# Install production deps
RUN npm ci --only=production

###########################
# Final: runtime with ffmpeg
###########################
FROM jrottenberg/ffmpeg:4.2-alpine311

# Install node runtime and curl for healthcheck
RUN apk add --no-cache nodejs npm curl

# Create non-root user
RUN adduser -D -h /home/ffmpegapi ffmpegapi
WORKDIR /home/ffmpegapi

# Copy node modules from builder
COPY --from=builder /usr/src/app/node_modules ./node_modules

# Copy app source
COPY src/ .

# Ensure ownership
RUN chown -R ffmpegapi:ffmpegapi /home/ffmpegapi

USER ffmpegapi

EXPOSE 3000

# Lightweight healthcheck using curl against /endpoints
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD curl -f http://127.0.0.1:3000/endpoints || exit 1

CMD [ "node", "app.js" ]
#####################################################################
#
# Dockerfile — runtime image for ffmpeg-api
#
# Uses jrottenberg's ffmpeg image as base (keeps a rich ffmpeg build with codecs)
# and installs Node.js so we can run the Node app directly. This avoids building
# a pkg binary and potential ABI compatibility problems.
#
#####################################################################

FROM jrottenberg/ffmpeg:4.2-alpine311

# Install node and npm
RUN apk add --no-cache nodejs npm

# Create a non-root user and workdir
RUN adduser -D -h /home/ffmpegapi ffmpegapi
WORKDIR /home/ffmpegapi

# Copy package.json first to leverage Docker layer caching for npm install
COPY src/package.json ./package.json

# Install production dependencies
RUN npm ci --only=production

# Copy application source
COPY src/ ./

# Ensure correct ownership
RUN chown -R ffmpegapi:ffmpegapi /home/ffmpegapi

USER ffmpegapi

EXPOSE 3000

CMD [ "node", "app.js" ]
#####################################################################
#
# A Docker image to convert audio and video for web using web API
#
#   with
#     - FFMPEG (built)
#     - NodeJS
#     - fluent-ffmpeg
#
#   For more on Fluent-FFMPEG, see 
#
#            https://github.com/fluent-ffmpeg/node-fluent-ffmpeg
#
# Original image and FFMPEG API by Paul Visco
# https://github.com/surebert/docker-ffmpeg-service
#
#####################################################################

FROM node:18.14-alpine3.16 as build

RUN apk add --no-cache git

# install pkg
RUN npm install -g pkg

ENV PKG_CACHE_PATH /usr/cache

WORKDIR /usr/src/app

# Bundle app source
COPY ./src .
RUN npm install

# Create single binary file
RUN pkg --targets node18-alpine-x64 /usr/src/app/package.json


FROM jrottenberg/ffmpeg:4.2-alpine311

# Create user and change workdir
RUN adduser --disabled-password --home /home/ffmpgapi ffmpgapi
WORKDIR /home/ffmpgapi

# Copy files from build stage
COPY --from=build /usr/src/app/ffmpegapi .
COPY --from=build /usr/src/app/index.md .
RUN chown ffmpgapi:ffmpgapi * && chmod 755 ffmpegapi

EXPOSE 3000

# Change user
USER ffmpgapi

ENTRYPOINT []
CMD [ "./ffmpegapi" ]

