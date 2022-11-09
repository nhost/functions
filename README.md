# Nhost functions in Docker

## Features

- Hot reload of package.json, lock files, and the functions directory
- Accepts both Javascript and TypeScript
- Create a package.json file if missing
- Customisable custom package manager (pnpm by default)
- No need to add the Express dependency anymore

## Example

```sh
cd example
cp .env.example .env
# Full Nhost
docker-compose up

# Or only functions
docker-compose up functions traefik

```

## Create a new version

Create a GitHub release, with a new semver tag prefixed with `v`, for instance `v0.1.2`

## Note

I've added a package.json file to make my IDE happy when developing inside `server.ts`. Just note: The npm packages in `package.json` is **only** for development. You need to update the packages in `Dockerfile` for them to be used in the docker image.
