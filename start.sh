#!/bin/sh
# * Set the default package manager to use if cannot be guessed from lock files
echo "defaultAgent=$PACKAGE_MANAGER" > ~/.nirc


# * Look for the package.json file.
# * If not found, create it in the "functions" directory.
if [ -f "./functions/package.json" ]; then
    # * ./functions/package.json exists
    FUNCTIONS_WORKING_DIR=./functions
    FUNCTIONS_RELATIVE_PATH=.
else
    # * ./functions/package.json DOES NOT exist
    if [ -f "./package.json" ]; then
        # * ./package.json exists
        FUNCTIONS_WORKING_DIR=.
        FUNCTIONS_RELATIVE_PATH=./functions
    else
        # * ./package.json DOES NOT exist"
        mkdir -p functions
        cd functions
        npm init -y 1> /dev/null
        cd ..
        FUNCTIONS_WORKING_DIR=./functions
        FUNCTIONS_RELATIVE_PATH=.
    fi
fi

# if neither package-lock.json nor yarn.lock exists nor pnpm-lock.yaml, error
if [ ! -f "$FUNCTIONS_WORKING_DIR/package-lock.json" ] && [ ! -f "$FUNCTIONS_WORKING_DIR/yarn.lock" ] && [ ! -f "$FUNCTIONS_WORKING_DIR/pnpm-lock.yaml" ]; then
    echo "No lock file found. Please commit your lock file for npm, yarn, or pnpm"
    exit 1
fi

# * Create a default tsconfig.json file in the functions' working directory.
cp -n $SERVER_PATH/tsconfig.json $FUNCTIONS_WORKING_DIR/tsconfig.json

# * Validate dependencies for minification compatibility
echo "Validating dependencies for minification compatibility..."
CURRENT_DIR=$(pwd)

# Set SERVER_PATH if not already set (for local testing)
if [ -z "$SERVER_PATH" ]; then
    SERVER_PATH="$CURRENT_DIR"
fi

# Only run validation if the validation script exists and we have a package.json
if [ -f "$SERVER_PATH/validate-minification.js" ] && [ -f "$FUNCTIONS_WORKING_DIR/package.json" ]; then
    cd $FUNCTIONS_WORKING_DIR
    if node "$SERVER_PATH/validate-minification.js"; then
        echo "✅ Dependency validation passed"
    else
        echo "⚠️  Dependency validation found potential issues (see output above)"
        echo "   Functions will still start, but some dependencies may not work properly in production"
    fi
    cd "$CURRENT_DIR"
else
    echo "Skipping dependency validation (validation script or package.json not found)"
fi

# * Start nodemon that listens to package.json and lock files and run npm/pnpm/yarn install,
# * Then run another nodemon that listens to the functions directory and run the server
FUNCTIONS_WORKING_DIR=$FUNCTIONS_WORKING_DIR \
FUNCTIONS_RELATIVE_PATH=$FUNCTIONS_RELATIVE_PATH \
nodemon --config $SERVER_PATH/nodemon.json $FUNCTIONS_WORKING_DIR/package.json
