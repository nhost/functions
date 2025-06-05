#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Validation script to check if user's installed dependencies contain files
 * that may prevent minification. Uses same logic as start.sh to find the
 * correct package.json file in user's mounted functions folder.
 */

function findUserPackageJson() {
  // Use same logic as start.sh to find the correct package.json
  if (fs.existsSync('./functions/package.json')) {
    // ./functions/package.json exists
    return {
      workingDir: './functions',
      packageJsonPath: './functions/package.json',
      nodeModulesPath: './functions/node_modules'
    };
  } else if (fs.existsSync('./package.json')) {
    // ./package.json exists (but not ./functions/package.json)
    return {
      workingDir: '.',
      packageJsonPath: './package.json',
      nodeModulesPath: './node_modules'
    };
  } else {
    // No package.json found
    return null;
  }
}

function checkNodeModulesForNonMinifiableFiles() {
  const userPaths = findUserPackageJson();
  
  if (!userPaths) {
    console.log('No package.json found in user functions');
    return true;
  }

  if (!fs.existsSync(userPaths.nodeModulesPath)) {
    console.log('No node_modules directory found. Run npm/yarn/pnpm install first.');
    return true;
  }

  const packageJson = JSON.parse(fs.readFileSync(userPaths.packageJsonPath, 'utf8'));
  const prodDependencies = packageJson.dependencies || {};
  
  if (Object.keys(prodDependencies).length === 0) {
    console.log('✅ No production dependencies to validate');
    return true;
  }

  console.log(`🔍 Validating ${Object.keys(prodDependencies).length} production dependencies for minification compatibility...`);
  console.log(`📁 Working directory: ${userPaths.workingDir}`);

  const issues = [];

  for (const depName of Object.keys(prodDependencies)) {
    const depPath = path.join(userPaths.nodeModulesPath, depName);
    
    if (!fs.existsSync(depPath)) {
      console.log(`  ⚠️  ${depName} not found in node_modules (may need installation)`);
      continue;
    }

    console.log(`  Checking ${depName}...`);
    
    const depIssues = checkDependencyFiles(depPath, depName);
    if (depIssues.length > 0) {
      issues.push({ name: depName, issues: depIssues });
    }
  }

  if (issues.length > 0) {
    console.log('\n❌ Found dependencies with potential minification issues:');
    issues.forEach(({ name, issues }) => {
      console.log(`\n  📦 ${name}:`);
      issues.forEach(issue => console.log(`    - ${issue}`));
    });
    
    console.log('\n💡 These files may prevent proper minification in serverless environments.');
    console.log('   Consider finding pure JavaScript alternatives or ensure your deployment');
    console.log('   platform can handle these file types.');
    
    return false;
  }

  console.log('\n✅ All production dependencies appear minification-friendly');
  return true;
}

function checkDependencyFiles(depPath, depName) {
  const issues = [];
  
  try {
    // Check for common non-minifiable file patterns
    const problematicPatterns = [
      { pattern: /\.node$/, description: 'native binary files (.node)' },
      { pattern: /\.exe$/, description: 'executable files (.exe)' },
      { pattern: /\.dll$/, description: 'dynamic library files (.dll)' },
      { pattern: /\.so(\.\d+)*$/, description: 'shared object files (.so)' },
      { pattern: /\.dylib$/, description: 'dynamic library files (.dylib)' },
      { pattern: /\.wasm$/, description: 'WebAssembly files (.wasm)' },
      { pattern: /\.bin$/, description: 'binary files (.bin)' },
      { pattern: /^binding\.gyp$/, description: 'native build configuration (binding.gyp)' },
      { pattern: /\.a$/, description: 'static library files (.a)' },
      { pattern: /\.lib$/, description: 'library files (.lib)' }
    ];

    // Check package.json for problematic configurations
    const packageJsonPath = path.join(depPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const depPackageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        
        if (depPackageJson.scripts?.install) {
          issues.push('has install script (may download binaries at runtime)');
        }
        
        if (depPackageJson.scripts?.postinstall) {
          issues.push('has postinstall script (may download binaries at runtime)');
        }

        if (depPackageJson.gypfile || depPackageJson.binding) {
          issues.push('has native binding configuration');
        }

        // Check for OS/CPU restrictions (often indicates native code)
        if (depPackageJson.os && depPackageJson.os.length > 0) {
          issues.push('has OS restrictions (likely contains native code)');
        }

        if (depPackageJson.cpu && depPackageJson.cpu.length > 0) {
          issues.push('has CPU architecture restrictions (likely contains native code)');
        }
      } catch (e) {
        // Ignore JSON parse errors
      }
    }

    // Recursively scan for problematic files (limited depth for performance)
    scanDirectory(depPath, problematicPatterns, issues, 0, 3);

    // Check for common directories that suggest native content
    const problematicDirs = [
      'build/Release',
      'build/Debug', 
      'prebuilds',
      'bin',
      'vendor',
      'lib-cov'
    ];
    
    problematicDirs.forEach(dir => {
      if (fs.existsSync(path.join(depPath, dir))) {
        issues.push(`contains ${dir} directory (likely contains binaries)`);
      }
    });

    // Check for common native dependency patterns in the package name
    const nativeNamePatterns = [
      'fsevents', 'esbuild', 'swc', 'sharp', 'canvas', 'sqlite3', 
      'bcrypt', 'argon2', 'node-sass', 'fibers', 'grpc', 'node-gyp'
    ];
    
    if (nativeNamePatterns.some(pattern => depName.toLowerCase().includes(pattern))) {
      issues.push('package name suggests native dependencies');
    }

  } catch (error) {
    // If we can't read the dependency, it's probably fine
  }

  return [...new Set(issues)]; // Remove duplicates
}

function scanDirectory(dirPath, patterns, issues, currentDepth, maxDepth) {
  if (currentDepth >= maxDepth) {
    return;
  }

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (issues.length > 10) break; // Limit issues per dependency for readability
      
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        // Skip certain directories to improve performance
        if ([
          'node_modules', 'test', 'tests', '__tests__', 'spec', 'docs', 
          'examples', 'example', '.git', '.github', 'coverage'
        ].includes(entry.name) || entry.name.startsWith('.')) {
          continue;
        }
        scanDirectory(fullPath, patterns, issues, currentDepth + 1, maxDepth);
      } else if (entry.isFile()) {
        // Check file against patterns
        for (const { pattern, description } of patterns) {
          if (pattern.test(entry.name)) {
            const issueText = `contains ${description}`;
            if (!issues.includes(issueText)) {
              issues.push(issueText);
            }
            break; // Only report each type once per dependency
          }
        }
      }
    }
  } catch (error) {
    // If we can't read a directory, skip it silently
  }
}

// Run validation if script is executed directly
if (require.main === module) {
  console.log('🔍 Nhost Functions - Dependency Minification Validator');
  console.log('   Checking user dependencies for minification compatibility...\n');
  
  const success = checkNodeModulesForNonMinifiableFiles();
  
  if (!success) {
    console.log('\n⚠️  Some dependencies may cause issues in serverless environments.');
    console.log('   This validation helps identify potential deployment problems.');
  }
  
  process.exit(success ? 0 : 1);
}

module.exports = {
  checkNodeModulesForNonMinifiableFiles,
  checkDependencyFiles,
  findUserPackageJson
};