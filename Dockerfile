FROM node:14-alpine

# * Same version as in Watchtower
ARG EXPRESS_VERSION=4.18.1
ENV EXPRESS_VERSION $EXPRESS_VERSION

# * path to the server files
ARG SERVER_PATH=/opt/server
ENV SERVER_PATH=$SERVER_PATH

# * Required to access to the globally installed modules
ENV NODE_PATH=/usr/local/lib/node_modules

# * Add path to the stored pnpm packages
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PATH:$PNPM_HOME

# * Directory where the Nhost project is located
ENV NHOST_PROJECT_PATH=/opt/project

# * Default package manager
ENV PACKAGE_MANAGER=pnpm

# install dependencies
RUN apk update && apk upgrade && \
    apk add --no-cache git openssh

# * Install packages that are required for this docker image to run
RUN npm install -g pnpm express@$EXPRESS_VERSION morgan tsx @antfu/ni chokidar dotenv

# * The pnpm store should be mounted in the same volume as node_modules (requires hard links)
# * See https://pnpm.io/6.x/npmrc#store-dir
RUN pnpm config set store-dir $NHOST_PROJECT_PATH/node_modules/.pnpm-store

# * Copy server files
COPY start.ts server.ts $SERVER_PATH/

# * Change working directory to the Nhost project directory
WORKDIR $NHOST_PROJECT_PATH
CMD tsx $SERVER_PATH/start.ts
