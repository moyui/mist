#!/usr/bin/env node

/**
 * Service Manager - Start/Stop test services
 */

import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { sleep, waitFor, logInfo, logSuccess, logError, logWarning } from './utils.mjs';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const projectRoot = path.resolve(__dirname, '../../..');

export class ServiceManager {
  constructor() {
    this.processes = [];
    this.projectRoot = projectRoot;
  }

  /**
   * Check if a command exists
   */
  commandExists(cmd) {
    try {
      execSync(`which ${cmd}`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a port is in use
   */
  isPortInUse(port) {
    try {
      execSync(`lsof -i :${port} -t`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Wait for a port to be open
   */
  async waitForPort(port, name, timeout = 30000) {
    logInfo(`Waiting for ${name} on port ${port}...`);
    try {
      await waitFor(
        () => this.isPortInUse(port),
        timeout,
        500
      );
      logSuccess(`${name} is ready on port ${port}`);
      return true;
    } catch (error) {
      throw new Error(`${name} failed to start on port ${port}`);
    }
  }

  /**
   * Start AKTools Python server
   */
  async startAKTools() {
    logInfo('Starting AKTools...');

    // Check Python
    if (!this.commandExists('python3')) {
      throw new Error('Python3 not found. Please install Python3.');
    }

    // Check if AKTools is already running
    if (this.isPortInUse(8080)) {
      logWarning('AKTools is already running on port 8080');
      return;
    }

    // Check if virtual environment exists
    const venvPath = path.join(this.projectRoot, 'python-env');
    let pythonCmd = 'python3';

    if (fs.existsSync(venvPath)) {
      const isDarwin = process.platform === 'darwin';
      const activatePath = isDarwin
        ? path.join(venvPath, 'bin', 'activate')
        : path.join(venvPath, 'Scripts', 'activate');

      if (fs.existsSync(activatePath)) {
        pythonCmd = path.join(isDarwin ? venvPath + '/bin/python' : venvPath + '\\Scripts\\python.exe');
      }
    }

    // Start AKTools
    const logPath = path.join(this.projectRoot, 'test-results/latest/logs/aktools.log');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });

    const logStream = fs.createWriteStream(logPath, { flags: 'a' });

    const proc = spawn(pythonCmd, ['-m', 'aktools'], {
      cwd: this.projectRoot,
      stdio: ['ignore', logStream, logStream],
      detached: true
    });

    this.processes.push({ name: 'AKTools', process: proc, port: 8080 });
    proc.unref();

    await this.waitForPort(8080, 'AKTools');
  }

  /**
   * Start mist application
   */
  async startMistApp() {
    logInfo('Starting mist application...');

    if (this.isPortInUse(8001)) {
      logWarning('mist is already running on port 8001');
      return;
    }

    const logPath = path.join(this.projectRoot, 'test-results/latest/logs/mist.log');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });

    const logStream = fs.createWriteStream(logPath, { flags: 'a' });

    const proc = spawn('pnpm', ['run', 'start:dev:mist'], {
      cwd: this.projectRoot,
      stdio: ['ignore', logStream, logStream],
      shell: true,
      detached: true
    });

    this.processes.push({ name: 'mist', process: proc, port: 8001 });
    proc.unref();

    await this.waitForPort(8001, 'mist');
  }

  /**
   * Start mcp-server
   */
  async startMCPServer() {
    logInfo('Starting mcp-server...');

    if (this.isPortInUse(8009)) {
      logWarning('mcp-server is already running on port 8009');
      return;
    }

    const logPath = path.join(this.projectRoot, 'test-results/latest/logs/mcp-server.log');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });

    const logStream = fs.createWriteStream(logPath, { flags: 'a' });

    const proc = spawn('pnpm', ['run', 'start:dev:mcp-server'], {
      cwd: this.projectRoot,
      stdio: ['ignore', logStream, logStream],
      shell: true,
      detached: true
    });

    this.processes.push({ name: 'mcp-server', process: proc, port: 8009 });
    proc.unref();

    await this.waitForPort(8009, 'mcp-server');
  }

  /**
   * Stop all services
   */
  async stopAll() {
    logInfo('Stopping all services...');

    for (const svc of this.processes) {
      try {
        // Kill by port
        if (this.isPortInUse(svc.port)) {
          try {
            const pid = execSync(`lsof -ti :${svc.port}`, { stdio: 'pipe' }).toString().trim();
            if (pid) {
              execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
              logSuccess(`Stopped ${svc.name} (PID: ${pid})`);
            }
          } catch (error) {
            logWarning(`Failed to stop ${svc.name}:`, error.message);
          }
        }
      } catch (error) {
        logError(`Error stopping ${svc.name}:`, error.message);
      }
    }

    this.processes = [];
  }
}
