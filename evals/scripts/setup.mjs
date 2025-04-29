#!/usr/bin/env node
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { execa } from "execa"
import chalk from "chalk"
import prompts from "prompts"

// --- Constants ---
const REQUIRED_NODE_VERSION = "20.18.1"
const ASDF_NODEJS_VERSION = REQUIRED_NODE_VERSION
const ASDF_PYTHON_VERSION = "3.13.2"
const ASDF_GOLANG_VERSION = "1.24.2"
const ASDF_RUST_VERSION = "1.85.1"
const JAVA_VERSION_CHECK = "17" // Check for major version 17

const VSCODE_EXTENSIONS = [
	"golang.go",
	"dbaeumer.vscode-eslint",
	"redhat.java",
	"ms-python.python",
	"rust-lang.rust-analyzer",
	"rooveterinaryinc.roo-cline",
]

const EVALS_REPO_URL = "https://github.com/cte/evals.git"
// ROOT_DIR is the current evals directory where this script is running from
const ROOT_DIR = path.resolve(process.cwd(), "..") // evals/ directory
// The target path for the external evals repo should be at the same level as Roo-Code
const EVALS_REPO_CLONE_TARGET_PATH = path.resolve(ROOT_DIR, "..", "..", "evals")

// --- Types ---
/** @typedef {'nodejs' | 'python' | 'golang' | 'rust' | 'java' | 'uv'} LanguageKey */
/** @typedef {{ name: LanguageKey, checkCmd: string, checkArgs: string[], versionCheck?: (output: string) => boolean, asdfPlugin?: string, asdfVersion?: string, installGuide: string, requires?: LanguageKey[] }} Dependency */

// --- Logging Helpers ---
const logInfo = (message) => console.log(chalk.blue(`💡 ${message}`))
const logSuccess = (message) => console.log(chalk.green(`✅ ${message}`))
const logWarning = (message) => console.log(chalk.yellow(`⚠️ ${message}`))
const logError = (message) => console.error(chalk.red(`🚨 ${message}`))
const logStep = (message) => console.log(chalk.cyan(`\n👉 ${message}`))
const logGuide = (message) => console.log(chalk.magenta(`🔗 ${message}`))

// --- Command Helpers ---
async function commandExists(command) {
	const checkCmd = os.platform() === "win32" ? "where" : "which"
	try {
		// Add shell: true for Windows 'where' compatibility if needed, though execa might handle it.
		await execa(checkCmd, [command], { stdio: "ignore", shell: os.platform() === "win32" })
		return true
	} catch (e) {
		// On Windows, 'where' might return exit code 1 if not found, execa might throw.
		// Also check if the error indicates command not found explicitly if possible.
		return false
	}
}

async function runCommand(command, args = [], options = {}) {
	logInfo(`Running: ${command} ${args.join(" ")} ${options.cwd ? `in ${options.cwd}` : ""}`)
	try {
		// Use pipe for potentially interactive scripts like brew install
		const defaultOptions = options.stdio === "pipe" ? {} : { stdio: "inherit" }
		const result = await execa(command, args, { ...defaultOptions, ...options })
		if (result.failed || result.exitCode !== 0) {
			throw new Error(`Command failed with exit code ${result.exitCode}: ${command} ${args.join(" ")}`)
		}
		return result
	} catch (error) {
		logError(`Error running command: ${command} ${args.join(" ")}`)
		if (error.stderr) console.error(chalk.red(error.stderr))
		if (error.stdout) console.error(chalk.red(error.stdout))
		throw error
	}
}

async function getCommandOutput(command, args = [], options = {}) {
	try {
		const { stdout } = await execa(command, args, { stdio: "pipe", ...options })
		return stdout.trim()
	} catch (error) {
		return null // Failure is often expected during checks
	}
}

// --- Dependency Check/Install Helpers ---

let _brewPrefix = null // Cache brew prefix
async function getBrewPrefix() {
	if (_brewPrefix === null && os.platform() === "darwin") {
		_brewPrefix = await getCommandOutput("brew", ["--prefix"]).catch(() => null)
	}
	return _brewPrefix
}

async function checkBrew() {
	if (os.platform() !== "darwin") return false
	logStep("Checking for Homebrew...")
	if (!(await commandExists("brew"))) {
		logWarning("Homebrew not found.")
		const { installBrew } = await prompts({
			type: "confirm",
			name: "installBrew",
			message: "Homebrew (https://brew.sh) is required on macOS. Install it?",
			initial: true,
		})
		if (installBrew === undefined) throw new Error("Prompt cancelled")
		if (installBrew) {
			logInfo("Installing Homebrew...")
			try {
				// This command requires interaction / sudo password
				await runCommand(
					"/bin/bash",
					["-c", "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"],
					{ stdio: "inherit" }, // Inherit stdio for interactive install
				)
				logSuccess("Homebrew installation process initiated.")
				logWarning(
					"Homebrew installation might require manual steps or password input. Please follow the prompts.",
				)
				logWarning(
					"After Homebrew is installed, please ensure it's added to your PATH (check ~/.zprofile or ~/.bash_profile) and restart your terminal before running this script again.",
				)
			} catch (err) {
				logError(`Homebrew installation failed. Please install it manually from https://brew.sh`)
			}
			process.exit(1) // Exit for user to complete setup
		} else {
			logError("Homebrew is required on macOS to proceed.")
			process.exit(1)
		}
	}
	const brewVersion = await getCommandOutput("brew", ["--version"])
	logSuccess(`Homebrew found (${brewVersion?.split("\n")[0] ?? "version unknown"})`)
	return true
}

async function checkAsdf(hasBrew) {
	logStep("Checking for asdf...")
	if (await commandExists("asdf")) {
		const asdfVersion = await getCommandOutput("asdf", ["--version"])
		logSuccess(`asdf found (${asdfVersion ?? "version unknown"})`)
		return true
	}

	logWarning("asdf version manager not found.")
	if (hasBrew) {
		const { installAsdf } = await prompts({
			type: "confirm",
			name: "installAsdf",
			message: "asdf (https://asdf-vm.com) is recommended for managing tool versions. Install it via Homebrew?",
			initial: true,
		})
		if (installAsdf === undefined) throw new Error("Prompt cancelled")
		if (installAsdf) {
			await runCommand("brew", ["install", "asdf"])
			const brewPrefix = await getBrewPrefix()
			const asdfScriptPath = brewPrefix ? path.join(brewPrefix, "opt", "asdf", "libexec", "asdf.sh") : null
			logWarning(
				`asdf installed. Please add 'source "${asdfScriptPath || "$(brew --prefix asdf)/libexec/asdf.sh"}"' to your shell config (e.g., ~/.zshrc or ~/.bashrc) and restart your terminal before running this script again.`,
			)
			process.exit(1) // Exit for user to configure shell
		}
	} else if (os.platform() === "linux") {
		logInfo("You can install asdf via git: https://asdf-vm.com/guide/getting-started.html#_2-download-asdf")
	} else {
		logInfo("asdf installation guide: https://asdf-vm.com/guide/getting-started.html")
	}
	logInfo("Skipping asdf usage for now. Will try direct installations/checks if needed.")
	return false
}

async function checkNvm() {
	logStep("Checking for nvm...")
	// Basic check - nvm is usually a shell function, harder to detect reliably from Node.js
	const nvmDir = process.env.NVM_DIR
	const nvmShExists = nvmDir && (await fs.access(path.join(nvmDir, "nvm.sh")).then(() => true).catch(() => false))

	if (nvmShExists) {
		logSuccess("nvm detected (basic check).")
		return true
	} else {
		logInfo("nvm not detected.")
		return false
	}
}

async function checkConda() {
	logStep("Checking for Conda...")
	if (await commandExists("conda")) {
		const condaVersion = await getCommandOutput("conda", ["--version"])
		logSuccess(`Conda found (${condaVersion ?? "version unknown"})`)
		return true
	} else {
		logInfo("Conda not detected.")
		return false
	}
}

// Note: This function assumes setup.sh has already ensured a compatible Node version is running *this script*.
// It does NOT re-check the version here.
async function checkPnpm() {
	logStep("Checking for pnpm...")
	if (!(await commandExists("pnpm"))) {
		logWarning("pnpm not found.")
		const { installPnpm } = await prompts({
			type: "confirm",
			name: "installPnpm",
			message: "pnpm is required. Install it globally using npm? (npm install -g pnpm)",
			initial: true,
		})
		if (installPnpm === undefined) throw new Error("Prompt cancelled")
		if (installPnpm) {
			await runCommand("npm", ["install", "-g", "pnpm"])
			logSuccess("pnpm installed globally.")
		} else {
			logError("pnpm is required to continue.")
			process.exit(1)
		}
	} else {
		const pnpmVersion = await getCommandOutput("pnpm", ["--version"])
		logSuccess(`pnpm found (${pnpmVersion})`)
	}
}

async function checkGh(hasBrew) {
	logStep("Checking for GitHub CLI ('gh')...")
	let ghExists = false;
	if (!(await commandExists("gh"))) {
		logWarning("GitHub CLI ('gh') not found.")
		let installed = false
		if (hasBrew) {
			const { installGh } = await prompts({
				type: "confirm",
				name: "installGh",
				message: "GitHub CLI is recommended for managing the evals repo. Install it via Homebrew?",
				initial: true,
			})
			if (installGh === undefined) throw new Error("Prompt cancelled")
			if (installGh) {
				await runCommand("brew", ["install", "gh"])
				logSuccess("GitHub CLI installed via Homebrew.")
				installed = true
				ghExists = true;
			}
		}
		// TODO: Add check for Linux package managers? (apt, yum) - More complex
		// TODO: Add check for Windows package managers? (winget, choco) - More complex
		if (!installed) {
			logInfo("Please install GitHub CLI manually if you want to fork/submit results easily.")
			logGuide("GitHub CLI: https://cli.github.com/")
		}
	} else {
		const ghVersion = await getCommandOutput("gh", ["--version"])
		logSuccess(`GitHub CLI found (${ghVersion?.split("\n")[0] ?? "version unknown"})`)
		ghExists = true;
	}

	// Check auth status if gh exists
	if (await commandExists("gh")) {
		const authStatus = await getCommandOutput("gh", ["auth", "status"], { reject: false }) // Don't throw if not logged in
		if (authStatus && authStatus.includes("Logged in to github.com")) {
			logSuccess("GitHub CLI is authenticated.")
		} else {
			logWarning("GitHub CLI is not authenticated. You might need to run 'gh auth login'.")
		}
	}
	
	return ghExists;
}

/** @type {Record<LanguageKey, Dependency>} */
const LANG_DEPENDENCIES = {
	nodejs: { // Keep nodejs check here for completeness, though setup.sh handles initial check
		name: "nodejs",
		checkCmd: "node",
		checkArgs: ["--version"],
		versionCheck: (v) => v.startsWith(`v${REQUIRED_NODE_VERSION}`),
		asdfPlugin: "nodejs",
		asdfVersion: ASDF_NODEJS_VERSION,
		installGuide: "https://nodejs.org/",
	},
	python: {
		name: "python",
		checkCmd: "python3", // Prefer python3
		checkArgs: ["--version"],
		versionCheck: (v) => {
		          // Python version output format: "Python 3.13.2"
		          const match = v.match(/Python (\d+\.\d+\.\d+)/);
		          if (!match) return false;
		          
		          // Compare versions to accept equal or newer versions
		          const installedVersion = match[1].split('.').map(Number);
		          const requiredVersion = ASDF_PYTHON_VERSION.split('.').map(Number);
		          
		          // Compare major version
		          if (installedVersion[0] > requiredVersion[0]) return true;
		          if (installedVersion[0] < requiredVersion[0]) return false;
		          
		          // Compare minor version
		          if (installedVersion[1] > requiredVersion[1]) return true;
		          if (installedVersion[1] < requiredVersion[1]) return false;
		          
		          // Compare patch version
		          return installedVersion[2] >= requiredVersion[2];
		      },
		asdfPlugin: "python",
		asdfVersion: ASDF_PYTHON_VERSION,
		installGuide: "https://www.python.org/downloads/",
		requires: ["uv"],
	},
	golang: {
		name: "golang",
		checkCmd: "go",
		checkArgs: ["version"],
		// Check if output contains 'go<version>' like 'go version go1.24.2 darwin/arm64'
		versionCheck: (v) => {
		          // go version output format: "go version go1.24.2 darwin/arm64"
		          const match = v.match(/go version go(\d+\.\d+\.\d+)/);
		          if (!match) return false;
		          
		          // Compare versions to accept equal or newer versions
		          const installedVersion = match[1].split('.').map(Number);
		          const requiredVersion = ASDF_GOLANG_VERSION.split('.').map(Number);
		          
		          // Compare major version
		          if (installedVersion[0] > requiredVersion[0]) return true;
		          if (installedVersion[0] < requiredVersion[0]) return false;
		          
		          // Compare minor version
		          if (installedVersion[1] > requiredVersion[1]) return true;
		          if (installedVersion[1] < requiredVersion[1]) return false;
		          
		          // Compare patch version
		          return installedVersion[2] >= requiredVersion[2];
		      },
		asdfPlugin: "golang",
		asdfVersion: ASDF_GOLANG_VERSION,
		installGuide: "https://go.dev/doc/install",
	},
	rust: {
		name: "rust",
		checkCmd: "rustc",
		checkArgs: ["--version"],
		versionCheck: (v) => {
		          // rustc version output format: "rustc 1.85.1 (5b914ab35 2024-05-09)"
		          const match = v.match(/rustc (\d+\.\d+\.\d+)/);
		          if (!match) return false;
		          
		          // Compare versions to accept equal or newer versions
		          const installedVersion = match[1].split('.').map(Number);
		          const requiredVersion = ASDF_RUST_VERSION.split('.').map(Number);
		          
		          // Compare major version
		          if (installedVersion[0] > requiredVersion[0]) return true;
		          if (installedVersion[0] < requiredVersion[0]) return false;
		          
		          // Compare minor version
		          if (installedVersion[1] > requiredVersion[1]) return true;
		          if (installedVersion[1] < requiredVersion[1]) return false;
		          
		          // Compare patch version
		          return installedVersion[2] >= requiredVersion[2];
		      },
		asdfPlugin: "rust",
		asdfVersion: ASDF_RUST_VERSION,
		installGuide: "https://www.rust-lang.org/tools/install",
	},
	java: {
		name: "java",
		checkCmd: "javac",
		checkArgs: ["-version"], // Note: javac outputs to stderr
		versionCheck: (v) => {
		          // javac version output format: "javac 17.0.9" or similar
		          const match = v.match(/javac (\d+)(?:\.(\d+)(?:\.(\d+))?)?/);
		          if (!match) return false;
		          
		          // Extract major version (we only care about major for Java)
		          const majorVersion = parseInt(match[1], 10);
		          const requiredMajor = parseInt(JAVA_VERSION_CHECK, 10);
		          
		          // Accept equal or newer major versions
		          return majorVersion >= requiredMajor;
		      },
		asdfPlugin: "java", // asdf java is complex, prefer brew/manual
		asdfVersion: "", // Not using asdf version directly
		installGuide: "https://www.java.com/en/download/help/download_options.html",
	},
	uv: {
		// Special case, required by python
		name: "uv",
		checkCmd: "uv",
		checkArgs: ["--version"],
		asdfPlugin: "", // Not typically managed by asdf directly
		asdfVersion: "",
		installGuide: "https://github.com/astral-sh/uv",
	},
}

/** @param {LanguageKey[]} languages */
async function checkLanguages(languages, hasAsdf, hasBrew, hasConda) {
	const requiredLangs = new Set(languages)
	// Add requirements like 'uv' for 'python'
	languages.forEach((lang) => {
		LANG_DEPENDENCIES[lang]?.requires?.forEach((req) => requiredLangs.add(req))
	})

	for (const lang of Array.from(requiredLangs)) {
		// Skip nodejs check here as setup.sh handles it
		if (lang === 'nodejs') continue;

		const dep = LANG_DEPENDENCIES[lang]
		if (!dep) continue

		logStep(`Checking for ${dep.name}...`)
		let versionOutput = await getCommandOutput(dep.checkCmd, dep.checkArgs, { reject: false })
		// javac -version outputs to stderr
		if (lang === "java" && !versionOutput) {
			try {
				const { stderr } = await execa(dep.checkCmd, dep.checkArgs, { reject: false })
				versionOutput = stderr.trim()
			} catch {
				/* ignore */
			}
		}

		let versionCorrect = false
		if (versionOutput) {
			versionCorrect = dep.versionCheck ? dep.versionCheck(versionOutput) : true
			if (versionCorrect) {
				logSuccess(`${dep.name} found (${versionOutput.split("\n")[0]})`)
			} else {
				logWarning(`Incorrect ${dep.name} version found (${versionOutput.split("\n")[0]})`)
			}
		} else {
			logWarning(`${dep.name} not found.`)
		}

		if (!versionCorrect) {
			let installed = false
			let managedBy = null // Track how it was installed/found

			// --- Attempt Installation/Guidance ---

			// 1. Conda (for Python - Highest Priority if available)
			if (lang === "python" && hasConda) {
				logInfo("Checking Conda environments for suitable Python...")
				let condaPythonVersion = await getCommandOutput("python", ["--version"]) // Check current activated python
				if (condaPythonVersion && dep.versionCheck(condaPythonVersion)) {
					logSuccess(`Found suitable Python in current environment (${condaPythonVersion}).`)
					installed = true // Already correct in current env
					managedBy = "conda"
				} else {
					// Check base env if current isn't right
					condaPythonVersion = await getCommandOutput("conda", ["run", "-n", "base", "python", "--version"]).catch(
						() => null,
					)
					if (condaPythonVersion && dep.versionCheck(condaPythonVersion)) {
						logSuccess(`Found suitable Python in Conda base environment (${condaPythonVersion}).`)
						logWarning("You might need to activate the Conda base environment ('conda activate base') for the evals to run correctly.")
						installed = true // Found, but user needs to manage activation
						managedBy = "conda"
					} else {
						const { installConda } = await prompts({
							type: "confirm",
							name: "installConda",
							message: `Python ${ASDF_PYTHON_VERSION} not found or incorrect in current/base Conda env. Install it using 'conda install python=${ASDF_PYTHON_VERSION}'?`,
							initial: true,
						})
						if (installConda === undefined) throw new Error("Prompt cancelled")
						if (installConda) {
							try {
								// Install into the currently active environment or base
								await runCommand("conda", ["install", `python=${ASDF_PYTHON_VERSION}`, "-y"])
								logSuccess(`Python ${ASDF_PYTHON_VERSION} installed via Conda into the current environment.`)
								// Re-check the current environment
								const newVersion = await getCommandOutput("python", ["--version"])
								if (newVersion && dep.versionCheck(newVersion)) {
									logSuccess(`Python version is now correct (${newVersion}).`)
									installed = true
									managedBy = "conda"
								} else {
									logError("Conda installation seemed successful, but the version is still incorrect. Please check your Conda environment.")
								}
							} catch (condaError) {
								logError(`Conda installation failed: ${condaError.message}`)
							}
						}
					}
				}
			}

			// 2. ASDF (If Conda wasn't used/applicable or failed)
			if (!installed && hasAsdf && dep.asdfPlugin && dep.asdfVersion) {
				const { useAsdf } = await prompts({
					type: "confirm",
					name: "useAsdf",
					message: `Use asdf to install ${dep.name} ${dep.asdfVersion}?`,
					initial: true,
				})
				if (useAsdf === undefined) throw new Error("Prompt cancelled")
				if (useAsdf) {
					try {
						await runCommand("asdf", ["plugin", "add", dep.asdfPlugin])
					} catch {
						/* plugin already added */
					}
					await runCommand("asdf", ["install", dep.asdfPlugin, dep.asdfVersion])
					// Use 'asdf local' if .tool-versions exists, otherwise 'global'
					const toolVersionsPath = path.join(ROOT_DIR, ".tool-versions") // Check in evals dir
					const asdfScope = await fs.access(toolVersionsPath).then(() => "local").catch(() => "global")
					// Use 'asdf set <scope>' to modify the config file
					// Use correct asdf command syntax: 'asdf global <plugin> <version>' or 'asdf local <plugin> <version>'
					await runCommand("asdf", [asdfScope, dep.asdfPlugin, dep.asdfVersion])
					logSuccess(`${dep.name} ${dep.asdfVersion} installed and set via asdf (${asdfScope}).`)
					installed = true
					managedBy = "asdf"
				}
			}

			// 3. Homebrew (Platform/Language Specific Fallbacks - macOS)
			if (!installed && lang === "java" && hasBrew) {
				const { installJava } = await prompts({
					type: "confirm",
					name: "installJava",
					message: `Install OpenJDK ${JAVA_VERSION_CHECK} via Homebrew?`,
					initial: true,
				})
				if (installJava === undefined) throw new Error("Prompt cancelled")
				if (installJava) {
					await runCommand("brew", ["install", `openjdk@${JAVA_VERSION_CHECK}`])
					const javaHome = await getCommandOutput("brew", ["--prefix", `openjdk@${JAVA_VERSION_CHECK}`])
					logWarning(
						`Java ${JAVA_VERSION_CHECK} installed. You might need to add it to your PATH or set JAVA_HOME. Example: export PATH="${javaHome}/bin:$PATH"`,
					)
					installed = true // Assume installed, user needs to fix PATH
					managedBy = "brew"
				}
			} else if (!installed && lang === "uv" && hasBrew) {
				const { installUv } = await prompts({
					type: "confirm",
					name: "installUv",
					message: `Install uv (Python package manager) via Homebrew?`,
					initial: true,
				})
				if (installUv === undefined) throw new Error("Prompt cancelled")
				if (installUv) {
					await runCommand("brew", ["install", "uv"])
					logSuccess("uv installed via Homebrew.")
					installed = true
					managedBy = "brew"
				}
			}

			// 4. Other package managers (Linux/Windows) or pip (for uv)
			if (!installed && lang === "uv" && os.platform() !== "darwin") {
				// uv on Linux/Windows (assuming Python/pip is available)
				const { installUv } = await prompts({
					type: "confirm",
					name: "installUv",
					message: `Install uv (Python package manager) via pipx or pip? (Requires Python/pip)`,
					initial: true,
				})
				if (installUv === undefined) throw new Error("Prompt cancelled")
				if (installUv) {
					let pipxExists = await commandExists("pipx")
					let pipCmd = (await commandExists("pip3")) ? "pip3" : (await commandExists("pip")) ? "pip" : null

					if (pipxExists) {
						try {
							await runCommand("pipx", ["install", "uv"])
							logSuccess("uv installed via pipx.")
							installed = true
							managedBy = "pipx"
						} catch (pipxError) {
							logWarning(`pipx install uv failed: ${pipxError.message}. Trying pip...`)
							pipxExists = false // Don't try pipx again if it failed once
						}
					}

					if (!installed && pipCmd) {
						try {
							await runCommand(pipCmd, ["install", "--user", "uv"]) // Use --user for safety
							logSuccess(`uv installed via ${pipCmd}.`)
							logWarning("Ensure the pip user binary directory is in your PATH.")
							installed = true
							managedBy = pipCmd
						} catch (pipError) {
							logError(`Failed to install uv via ${pipCmd}: ${pipError.message}`)
						}
					} else if (!installed && !pipxExists && !pipCmd) {
						logError("Cannot install uv automatically. Please install pipx or ensure pip/pip3 is available.")
					}
				}
			}
			// TODO: Add similar fallbacks for Go, Rust, Java on Linux/Windows using apt/yum/winget/choco if desired

			// 5. Manual Installation Guidance
			if (!installed) {
				logError(
					`${dep.name} (version check: ${dep.versionCheck ? `~${dep.asdfVersion || JAVA_VERSION_CHECK}` : "any"}) is required.`,
				)
				logGuide(`Please install manually: ${dep.installGuide}`)
				process.exit(1)
			}

			// Re-check version if installed by this script (except for conda/nvm where user manages activation)
			if (installed && managedBy !== "conda" && managedBy !== "nvm") {
				versionOutput = await getCommandOutput(dep.checkCmd, dep.checkArgs, { reject: false })
				if (lang === "java" && !versionOutput) {
					// Recheck stderr for java
					try {
						const { stderr } = await execa(dep.checkCmd, dep.checkArgs, { reject: false })
						versionOutput = stderr.trim()
					} catch {
						/* ignore */
					}
				}
				if (versionOutput && (!dep.versionCheck || dep.versionCheck(versionOutput))) {
					logSuccess(`Successfully installed/verified ${dep.name}.`)
				} else {
					logError(
						`Installation of ${dep.name} seemed successful, but the command is still not found or version is incorrect. Please check your PATH or restart your terminal.`,
					)
					process.exit(1)
				}
			} else if (installed && (managedBy === "conda" || managedBy === "nvm")) {
                // If managed by conda/nvm, re-check might still fail if not activated in *this* shell
                // We already warned the user, so just proceed cautiously.
                logSuccess(`Successfully installed ${dep.name} via ${managedBy}. Ensure the correct environment/version is active.`);
            }
		}
	}
}

async function checkRepo(hasGh) {
	logStep("Checking for evals repository...")
	
	// Log the target path for debugging
	logInfo(`Checking for external evals repository at path: ${EVALS_REPO_CLONE_TARGET_PATH}`)
	logInfo(`This is different from the current evals directory: ${ROOT_DIR}`)
	
	let repoExists = false
	try {
		await fs.access(EVALS_REPO_CLONE_TARGET_PATH)
		
		// Additional check to verify it's actually a git repository
		try {
			await runCommand("git", ["rev-parse", "--is-inside-work-tree"], {
				cwd: EVALS_REPO_CLONE_TARGET_PATH,
				stdio: "pipe"
			})
			repoExists = true
			logSuccess(`External evals repository found at ${EVALS_REPO_CLONE_TARGET_PATH}`)
		} catch (gitError) {
			logWarning(`Directory exists at ${EVALS_REPO_CLONE_TARGET_PATH} but doesn't appear to be a git repository.`)
			repoExists = false
		}
	} catch {
		logWarning(`External evals repository not found at ${EVALS_REPO_CLONE_TARGET_PATH}.`)
		repoExists = false
	}
	
	if (!repoExists) {
		const parentDir = path.dirname(EVALS_REPO_CLONE_TARGET_PATH)
		logInfo(`Will clone to parent directory: ${parentDir}`)
		
		// Ensure parent directory exists
		try {
			await fs.mkdir(parentDir, { recursive: true })
			logInfo(`Created parent directory: ${parentDir}`)
		} catch (mkdirError) {
			logError(`Failed to create parent directory: ${mkdirError.message}`)
		}
		
		let cloned = false
		if (hasGh && (await commandExists("gh"))) {
			const { forkRepo } = await prompts({
				type: "confirm",
				name: "forkRepo",
				message: "Do you want to fork the cte/evals repository using GitHub CLI? (Recommended for submitting results)",
				initial: true,
			})
			if (forkRepo === undefined) throw new Error("Prompt cancelled")
			if (forkRepo) {
				try {
					// Use --clone=true and then cd to the parent dir and clone to the right location
					await runCommand("gh", ["repo", "fork", "cte/evals", "--clone=true"], { cwd: parentDir })
					
					// Check if the default clone location exists (usually in current directory as 'evals')
					const defaultClonePath = path.join(parentDir, "evals")
					try {
						await fs.access(defaultClonePath)
						
						// If it exists and is different from our target path, move it
						if (defaultClonePath !== EVALS_REPO_CLONE_TARGET_PATH) {
							logInfo(`Moving repository from default location ${defaultClonePath} to ${EVALS_REPO_CLONE_TARGET_PATH}`)
							await fs.rename(defaultClonePath, EVALS_REPO_CLONE_TARGET_PATH)
						}
					} catch (accessError) {
						logWarning(`Default clone path not found at ${defaultClonePath}: ${accessError.message}`)
					}
					
					logSuccess(`Forked and cloned evals repository to ${EVALS_REPO_CLONE_TARGET_PATH}`)
					cloned = true
				} catch (forkError) {
					logError(`GitHub CLI fork/clone failed: ${forkError.message}`)
					logWarning("Attempting a read-only clone instead...")
				}
			}
		}
		
		if (!cloned) {
			const { cloneRepo } = await prompts({
				type: "confirm",
				name: "cloneRepo",
				message: `Clone the read-only repository from ${EVALS_REPO_URL}?`,
				initial: true,
			})
			if (cloneRepo === undefined) throw new Error("Prompt cancelled")
			if (cloneRepo) {
				try {
					await runCommand("git", ["clone", EVALS_REPO_URL, EVALS_REPO_CLONE_TARGET_PATH])
					logSuccess(`Cloned evals repository to ${EVALS_REPO_CLONE_TARGET_PATH}`)
					cloned = true
					
					// Verify the clone was successful
					try {
						await fs.access(path.join(EVALS_REPO_CLONE_TARGET_PATH, ".git"))
						logSuccess("Repository clone verified successfully.")
					} catch (verifyError) {
						logError(`Repository appears to be cloned but .git directory not found: ${verifyError.message}`)
					}
				} catch (cloneError) {
					logError(`Git clone failed: ${cloneError.message}`)
					process.exit(1)
				}
			} else {
				logError("Evals repository is required to run evaluations.")
				process.exit(1)
			}
		}
	}
}

async function checkEnvFile() {
	logStep("Setting up .env file...")
	const envPath = path.resolve(ROOT_DIR, ".env")
	const envSamplePath = path.resolve(ROOT_DIR, ".env.sample")
	let openRouterKey = process.env.OPENROUTER_API_KEY || null

	try {
		const envContent = await fs.readFile(envPath, "utf-8")
		logSuccess(".env file already exists.")
		const match = envContent.match(/^OPENROUTER_API_KEY=(.*)/m) // Use multiline flag
		if (match && match[1]) {
			openRouterKey = match[1].trim()
			if (openRouterKey) {
				logSuccess("Found OPENROUTER_API_KEY in .env file.")
			} else {
				logWarning("OPENROUTER_API_KEY is present but empty in .env file.")
			}
		} else {
			logWarning("OPENROUTER_API_KEY not found in .env file.")
		}
	} catch (err) {
        if (err.code === 'ENOENT') {
            logInfo(".env file not found, copying from .env.sample...")
            try {
                await fs.copyFile(envSamplePath, envPath)
                logSuccess("Copied .env.sample to .env.")
            } catch (copyError) {
                logError(`Failed to copy .env.sample: ${copyError}`)
                process.exit(1)
            }
        } else {
            logError(`Error reading .env file: ${err.message}`)
            // Decide if this is fatal or just a warning
        }
	}

	while (!openRouterKey) {
		const { apiKey } = await prompts({
			type: "password", // Use password type to hide input
			name: "apiKey",
			message: "Enter your OpenRouter API key (sk-or-v1-...):",
		})
		if (apiKey === undefined) throw new Error("Prompt cancelled") // Handle cancellation

		if (apiKey && apiKey.startsWith("sk-or-v1-")) {
			logInfo("🔑 Validating API key...")
			try {
				// Simple validation check
				const response = await fetch("https://openrouter.ai/api/v1/auth/key", {
					headers: { Authorization: `Bearer ${apiKey}` },
				})
				if (!response.ok) throw new Error(`Validation failed: ${response.statusText} (${response.status})`)
				const result = await response.json()
				if (!result?.data) throw new Error("Invalid key format in response.")

				openRouterKey = apiKey
				logSuccess("OpenRouter API key is valid.")
				// Append if key wasn't found initially, otherwise, this might duplicate.
				// A more robust approach would parse/modify the .env content if it exists.
				try {
					await fs.appendFile(envPath, `\nOPENROUTER_API_KEY=${openRouterKey}\n`)
					logSuccess("Added OPENROUTER_API_KEY to .env file.")
				} catch (appendError) {
					logError(`Failed to append API key to .env file: ${appendError.message}`)
					logWarning("Please add the key manually.")
				}
			} catch (validationError) {
				logError(`API key validation failed: ${validationError.message}. Please try again.`)
			}
		} else if (apiKey) {
			logWarning("Invalid API key format. It should start with 'sk-or-v1-'.")
		} else {
			// User likely cancelled the prompt by entering nothing
			logError("OpenRouter API key is required to run evaluations.")
			process.exit(1)
		}
	}
}

async function buildExtension() {
	logStep("Building Roo Code extension...")
	const rootRepoDir = path.resolve(ROOT_DIR, "..") // Assumes evals is sibling to main repo dir
	try {
		await runCommand("npm", ["run", "install-extension", "--", "--silent", "--no-audit"], { cwd: rootRepoDir })
		await runCommand("npm", ["run", "install-webview", "--", "--silent", "--no-audit"], { cwd: rootRepoDir })
		await runCommand("npm", ["run", "install-e2e", "--", "--silent", "--no-audit"], { cwd: rootRepoDir })
		const vsixDest = path.join(rootRepoDir, "bin", "roo-code-latest.vsix")
		// Ensure bin directory exists
		await fs.mkdir(path.dirname(vsixDest), { recursive: true });
		await runCommand("npx", ["vsce", "package", "--out", vsixDest], { cwd: rootRepoDir })
		logSuccess(`Extension built: ${vsixDest}`)
		return vsixDest
	} catch (error) {
		logError(`Failed to build extension: ${error.message}`)
		return null
	}
}

async function installVsix(vsixPath) {
	logStep(`Installing Roo Code extension from ${vsixPath}...`)
	try {
		// Just run the VS Code CLI directly
		await runCommand("code", ["--install-extension", vsixPath, "--force"])
		logSuccess("Roo Code extension installed/updated.")
	} catch (error) {
		logWarning(`Failed to install VS Code extension: ${error.message}. Please install manually if needed.`)
	}
}

// --- Main Setup Function ---
async function main() {
	// Handle prompt cancellations gracefully
	prompts.override({ aborted: true }) // Ensure cancellation throws
	process.on("SIGINT", () => {
		logError("\nOperation cancelled by user (SIGINT).")
		process.exit(130) // Standard exit code for Ctrl+C
	})

	logStep("Starting Roo Code Evals Setup...")

	// Check OS
	const platform = os.platform()
	logInfo(`Detected Platform: ${platform}`)
	if (platform !== "darwin" && platform !== "linux" && platform !== "win32") {
		logError(`Unsupported platform: ${platform}. Only macOS, Linux, and Windows are currently supported.`)
		process.exit(1)
	}

	// --- Dependency Checks & Installation ---
	// Note: Node.js check is now handled by setup.sh bootstrapper
	const hasBrew = await checkBrew() // Check brew first on macOS
	const hasAsdf = await checkAsdf(hasBrew) // Check asdf (might install via brew)
	const hasNvm = await checkNvm() // Check nvm (Node check removed from here)
	const hasConda = await checkConda() // Check conda

	// Check VS Code CLI
	logStep("Checking for VS Code CLI ('code')...")
	if (!(await commandExists("code"))) {
		logError(
			"VS Code CLI ('code') not found in PATH. Please install it from VS Code (Command Palette: 'Shell Command: Install code command in PATH').",
		)
		process.exit(1)
	} else {
		const vscodeVersion = await getCommandOutput("code", ["--version"])
		logSuccess(`VS Code CLI found (${vscodeVersion?.split("\n")[0] ?? "version unknown"})`)
	}

	// Check pnpm (Requires Node.js to be correctly set up first by setup.sh)
	await checkPnpm()

	// --- Language Selection ---
	logStep("Select Eval Languages")
	const { selectedLangs } = await prompts({
		type: "multiselect",
		name: "selectedLangs",
		message: "Which languages do you want to run evals for?",
		choices: Object.values(LANG_DEPENDENCIES)
			.filter((dep) => dep.name !== "uv" && dep.name !== "nodejs") // Exclude uv & nodejs from direct selection
			.map((dep) => ({ title: dep.name, value: dep.name, selected: true })),
		hint: "- Space to select. Return to submit",
	})

	if (selectedLangs === undefined) throw new Error("Prompt cancelled") // Handle cancellation
	if (!selectedLangs || selectedLangs.length === 0) {
		logError("No languages selected. Exiting.")
		process.exit(0)
	}
	logInfo(`Selected languages: ${selectedLangs.join(", ")}`)

	// Check selected language dependencies
	await checkLanguages(selectedLangs, hasAsdf, hasBrew, hasConda)

	// Check GitHub CLI
	const hasGh = await checkGh(hasBrew)

	// --- Project Setup ---
	logStep("Running pnpm install in evals directory...")
	await runCommand("pnpm", ["install", "--silent"], { cwd: ROOT_DIR })
	logSuccess("Dependencies installed.")

	await checkRepo(hasGh)

	await checkEnvFile()

	logStep("Syncing database...")
	try {
		await runCommand("pnpm", ["--filter", "@evals/db", "db:push"], { cwd: ROOT_DIR })
		await runCommand("pnpm", ["--filter", "@evals/db", "db:enable-wal"], { cwd: ROOT_DIR })
		logSuccess("Database synced.")
	} catch (dbError) {
		logError(`Database sync failed: ${dbError}`)
		// Don't exit, maybe user can fix manually
	}

	// --- VS Code Extension ---
	logStep("Checking Roo Code VS Code Extension...")
	const vsixPath = path.resolve(ROOT_DIR, "..", "bin", "roo-code-latest.vsix")
	let vsixExists = await fs.access(vsixPath).then(() => true).catch(() => false)

	if (!vsixExists) {
		logWarning("Roo Code extension build (roo-code-latest.vsix) not found.")
		const { buildExt } = await prompts({
			type: "confirm",
			name: "buildExt",
			message: "Build the Roo Code extension now?",
			initial: true,
		})
		if (buildExt === undefined) throw new Error("Prompt cancelled") // Handle cancellation
		if (buildExt) {
			const builtPath = await buildExtension()
			if (builtPath) {
				await installVsix(builtPath)
			}
		} else {
			logWarning("Skipping extension build. Ensure it's built and installed manually if needed.")
		}
	} else {
		const { installExt } = await prompts({
			type: "confirm",
			name: "installExt",
			message: `Found existing extension build (${path.basename(vsixPath)}). Install/Update it?`,
			initial: true,
		})
		if (installExt === undefined) throw new Error("Prompt cancelled") // Handle cancellation
		if (installExt) {
			await installVsix(vsixPath)
		}
	}

	logStep("Installing other required VS Code extensions...")
	for (const ext of VSCODE_EXTENSIONS) {
		try {
			// Force install ensures we have the latest version
			// Note: This may show Node.js deprecation warnings about uncaught N-API exceptions
			// These warnings are harmless and can be ignored
			await runCommand("code", ["--install-extension", ext, "--force"])
			logSuccess(`Installed/Updated VS Code extension: ${ext}`)
		} catch (error) {
			logWarning(`Failed to install VS Code extension: ${ext}. Please install manually.`)
		}
	}

	logSuccess("\n🚀 Setup complete!")

	// --- Start Web App ---
	const { startWeb } = await prompts({
		type: "confirm",
		name: "startWeb",
		message: "Start the Evals Web UI now? (Runs 'pnpm web')",
		initial: true,
	})
	if (startWeb === undefined) throw new Error("Prompt cancelled") // Handle cancellation

	if (startWeb) {
		logInfo("Starting the web UI... Press Ctrl+C to stop it.")
		// Don't await this, let it run in the background
		runCommand("pnpm", ["web"], { cwd: ROOT_DIR, stdio: "inherit" }).catch((err) => {
			logError(`Failed to start web UI: ${err.message}`)
		})
	} else {
		logInfo("You can start the web UI later by running 'pnpm web' in the evals directory.")
	}
}

main().catch((error) => {
	logError("Setup failed:")
	// Avoid printing the whole error object if it's just a prompts cancellation
	if (error && typeof error === "object" && error.message?.includes("cancelled")) {
		logError("Operation cancelled by user.")
	} else {
		console.error(error)
	}
	process.exit(1)
})